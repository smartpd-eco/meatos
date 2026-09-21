using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Ports;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

namespace Meatos.PosAgent
{
    internal sealed class DeliveryAutoCapture : IDisposable
    {
        private static readonly Regex OrderRegex = new Regex(
            @"(?:주문\s*번호|접수\s*번호)\s*[:#]?\s*([A-Z0-9가-힣-]{3,40})",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex AmountRegex = new Regex(
            @"(?:상품\s*금액|주문\s*금액|결제\s*금액|총\s*액|합\s*계)[^0-9]{0,20}([0-9][0-9,]{2,})\s*원?",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex BarcodeRegex = new Regex(
            @"(?<!\d)(2\d{12})(?!\d)", RegexOptions.Compiled);
        private static readonly Regex ProductNameRegex = new Regex(
            @"(?:품\s*명|상품\s*명|품\s*목)\s*[:：]?\s*([가-힣A-Za-z0-9][가-힣A-Za-z0-9 ()/_-]{1,50})",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex WeightRegex = new Regex(
            @"(?:중\s*량|무\s*게)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)\s*(kg|g)",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex UnitPriceRegex = new Regex(
            @"(?:단\s*가|kg\s*단가)\s*[:：]?\s*([0-9][0-9,]*)\s*원?",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex LabelAmountRegex = new Regex(
            @"(?:금\s*액|판매\s*가|가\s*격|합\s*계)\s*[:：]?\s*([0-9][0-9,]*)\s*원?",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private readonly Config config;
        private readonly Action<string> log;
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private readonly object stateLock = new object();
        private readonly MemoryStream receiptBuffer = new MemoryStream();
        private readonly MemoryStream labelBuffer = new MemoryStream();
        private readonly Timer receiptIdleTimer;
        private readonly Timer labelIdleTimer;
        private readonly Timer finalizeTimer;
        private SerialPort receiptPort;
        private SerialPort labelPort;
        private string activeOrderId;
        private string activeExternalOrderId;
        private DateTime lastLabelAtUtc;
        private string lastLabelCode;
        private DateTime lastLabelCodeAtUtc;
        private bool disposed;

        public DeliveryAutoCapture(Config config, Action<string> logger)
        {
            this.config = config;
            log = logger;
            receiptIdleTimer = new Timer(delegate { FlushReceipt(); }, null, Timeout.Infinite, Timeout.Infinite);
            labelIdleTimer = new Timer(delegate { FlushLabel(); }, null, Timeout.Infinite, Timeout.Infinite);
            finalizeTimer = new Timer(delegate { FinalizeIfIdle(); }, null, 10000, 10000);
        }

        public void Start()
        {
            if (!config.DeliveryAutoCaptureEnabled)
            {
                log("DELIVERY_CAPTURE_DISABLED");
                return;
            }
            receiptPort = OpenPort(config.CoupangReceiptPort, OnReceiptBytes);
            labelPort = OpenPort(config.ScaleLabelPort, OnLabelBytes);
            log("DELIVERY_CAPTURE_STARTED shadow=" + config.DeliveryShadowMode
                + " receiptPort=" + SafePort(config.CoupangReceiptPort)
                + " labelPort=" + SafePort(config.ScaleLabelPort));
        }

        public bool IsDeliveryBarcode(string code)
        {
            return config.DeliveryAutoCaptureEnabled
                && !String.IsNullOrEmpty(config.DeliveryBarcodePrefix)
                && code.StartsWith(config.DeliveryBarcodePrefix, StringComparison.Ordinal)
                && BarcodeRegex.IsMatch(code);
        }

        public void CaptureKeyboardLabel(string code)
        {
            var signal = new LabelSignal { Barcode = code, ParserVersion = "barcode-only-v1" };
            ThreadPool.QueueUserWorkItem(delegate { CaptureLabel(signal, "FIXED_SCANNER"); });
        }

        internal static bool TryParseReceipt(byte[] raw, out string orderId, out decimal amount)
        {
            orderId = null;
            amount = 0;
            if (raw == null || raw.Length == 0) return false;
            string text;
            try { text = Encoding.GetEncoding(949).GetString(raw); }
            catch { text = Encoding.UTF8.GetString(raw); }
            text = StripPrinterControls(text);
            Match orderMatch = OrderRegex.Match(text);
            Match amountMatch = AmountRegex.Match(text);
            if (!orderMatch.Success || !amountMatch.Success) return false;
            decimal parsed;
            if (!Decimal.TryParse(amountMatch.Groups[1].Value.Replace(",", ""),
                NumberStyles.Number, CultureInfo.InvariantCulture, out parsed) || parsed <= 0) return false;
            orderId = orderMatch.Groups[1].Value.Trim();
            amount = Decimal.Round(parsed, 2);
            return true;
        }

        private SerialPort OpenPort(string portName, SerialDataReceivedEventHandler handler)
        {
            if (String.IsNullOrWhiteSpace(portName)) return null;
            try
            {
                var port = new SerialPort(portName.Trim().ToUpperInvariant(), config.DeliverySerialBaud, Parity.None, 8, StopBits.One);
                port.Handshake = Handshake.None;
                port.ReadTimeout = 500;
                port.DataReceived += handler;
                port.Open();
                return port;
            }
            catch (Exception ex)
            {
                log("DELIVERY_PORT_FAILED port=" + SafePort(portName) + " reason=" + ex.GetType().Name);
                return null;
            }
        }

        private void OnReceiptBytes(object sender, SerialDataReceivedEventArgs args)
        {
            try
            {
                var port = (SerialPort)sender;
                int count = port.BytesToRead;
                if (count <= 0) return;
                var bytes = new byte[count];
                port.Read(bytes, 0, count);
                lock (stateLock)
                {
                    receiptBuffer.Write(bytes, 0, bytes.Length);
                    if (receiptBuffer.Length > 65536) receiptBuffer.SetLength(0);
                }
                receiptIdleTimer.Change(900, Timeout.Infinite);
            }
            catch (Exception ex) { log("DELIVERY_RECEIPT_READ_FAILED reason=" + ex.GetType().Name); }
        }

        private void OnLabelBytes(object sender, SerialDataReceivedEventArgs args)
        {
            try
            {
                var port = (SerialPort)sender;
                int count = port.BytesToRead;
                if (count <= 0) return;
                var bytes = new byte[count];
                port.Read(bytes, 0, count);
                lock (stateLock)
                {
                    labelBuffer.Write(bytes, 0, bytes.Length);
                    if (labelBuffer.Length > 65536) labelBuffer.SetLength(0);
                }
                labelIdleTimer.Change(600, Timeout.Infinite);
            }
            catch (Exception ex) { log("DELIVERY_LABEL_READ_FAILED reason=" + ex.GetType().Name); }
        }

        private void FlushLabel()
        {
            byte[] raw;
            lock (stateLock)
            {
                if (labelBuffer.Length == 0) return;
                raw = labelBuffer.ToArray();
                labelBuffer.SetLength(0);
            }
            LabelSignal signal;
            if (!TryParseLabelSignal(raw, out signal))
            {
                log("DELIVERY_LABEL_REVIEW hash=" + Hash(raw) + " reason=BARCODE_NOT_FOUND");
                return;
            }
            signal.FormatHash = Hash(raw);
            ThreadPool.QueueUserWorkItem(delegate { CaptureLabel(signal, "SERIAL_LABEL_SIGNAL"); });
        }

        internal static bool TryParseLabelSignal(byte[] raw, out LabelSignal signal)
        {
            signal = null;
            if (raw == null || raw.Length == 0) return false;
            string text;
            try { text = Encoding.GetEncoding(949).GetString(raw); }
            catch { text = Encoding.UTF8.GetString(raw); }
            text = StripPrinterControls(text);
            Match barcode = BarcodeRegex.Match(text);
            if (!barcode.Success) return false;
            signal = new LabelSignal
            {
                Barcode = barcode.Groups[1].Value,
                RawProductName = MatchText(ProductNameRegex, text),
                PrintedWeight = MatchWeight(text),
                PrintedUnitPrice = MatchDecimal(UnitPriceRegex, text),
                PrintedAmount = MatchDecimal(LabelAmountRegex, text),
                ParserVersion = "label-signal-v1"
            };
            return true;
        }

        private void FlushReceipt()
        {
            byte[] raw;
            lock (stateLock)
            {
                if (receiptBuffer.Length == 0) return;
                raw = receiptBuffer.ToArray();
                receiptBuffer.SetLength(0);
            }
            string orderId;
            decimal amount;
            if (!TryParseReceipt(raw, out orderId, out amount))
            {
                log("DELIVERY_RECEIPT_REVIEW hash=" + Hash(raw) + " reason=PARSE_FAILED");
                return;
            }
            try
            {
                string priorOrder;
                lock (stateLock) priorOrder = activeOrderId;
                if (!String.IsNullOrEmpty(priorOrder)) FinalizeOrder(priorOrder, "NEXT_RECEIPT");

                var payload = BasePayload();
                payload["p_external_order_id"] = orderId;
                payload["p_order_amount"] = amount;
                payload["p_event_hash"] = Hash(raw);
                payload["p_captured_at"] = DateTime.UtcNow.ToString("o");
                payload["p_shadow_mode"] = config.DeliveryShadowMode;
                Dictionary<string, object> body = PostRpc("capture_delivery_order_agent", payload);
                if (!IsOk(body))
                {
                    log("DELIVERY_ORDER_FAILED orderHash=" + HashText(orderId) + " reason=" + Error(body));
                    return;
                }
                lock (stateLock)
                {
                    activeOrderId = Convert.ToString(body["orderId"]);
                    activeExternalOrderId = orderId;
                    lastLabelAtUtc = DateTime.UtcNow;
                }
                log("DELIVERY_ORDER_CAPTURED orderHash=" + HashText(orderId) + " shadow=" + config.DeliveryShadowMode);
            }
            catch (Exception ex) { log("DELIVERY_ORDER_FAILED orderHash=" + HashText(orderId) + " reason=" + ex.GetType().Name); }
        }

        private void CaptureLabel(LabelSignal signal, string source)
        {
            string barcode = signal.Barcode;
            string orderId;
            lock (stateLock)
            {
                orderId = activeOrderId;
                if (barcode == lastLabelCode && (DateTime.UtcNow - lastLabelCodeAtUtc).TotalSeconds < 2)
                {
                    log("DELIVERY_LABEL_SKIPPED reason=RAPID_DUPLICATE");
                    return;
                }
                lastLabelCode = barcode;
                lastLabelCodeAtUtc = DateTime.UtcNow;
            }
            if (String.IsNullOrEmpty(orderId))
            {
                log("DELIVERY_LABEL_REVIEW barcodeHash=" + HashText(barcode) + " reason=OPEN_ORDER_NOT_FOUND");
                return;
            }
            try
            {
                var payload = BasePayload();
                payload["p_order_id"] = orderId;
                payload["p_barcode"] = barcode;
                string capturedAt = DateTime.UtcNow.ToString("o");
                payload["p_event_hash"] = HashText(orderId + "|" + barcode + "|" + capturedAt);
                payload["p_captured_at"] = capturedAt;
                payload["p_raw_product_name"] = EmptyToNull(signal.RawProductName);
                payload["p_printed_weight"] = signal.PrintedWeight;
                payload["p_printed_unit_price"] = signal.PrintedUnitPrice;
                payload["p_printed_amount"] = signal.PrintedAmount;
                payload["p_raw_format_hash"] = EmptyToNull(signal.FormatHash);
                payload["p_parser_version"] = signal.ParserVersion;
                Dictionary<string, object> body = PostRpc("capture_delivery_label_signal_agent", payload);
                if (!IsOk(body))
                {
                    log("DELIVERY_LABEL_FAILED barcodeHash=" + HashText(barcode) + " source=" + source + " reason=" + Error(body));
                    return;
                }
                lock (stateLock) lastLabelAtUtc = DateTime.UtcNow;
                log("DELIVERY_LABEL_CAPTURED barcodeHash=" + HashText(barcode) + " source=" + source + " shadow=" + config.DeliveryShadowMode);
            }
            catch (Exception ex) { log("DELIVERY_LABEL_FAILED barcodeHash=" + HashText(barcode) + " reason=" + ex.GetType().Name); }
        }

        private void FinalizeIfIdle()
        {
            string orderId;
            DateTime last;
            lock (stateLock) { orderId = activeOrderId; last = lastLabelAtUtc; }
            if (String.IsNullOrEmpty(orderId) || last == default(DateTime)) return;
            if ((DateTime.UtcNow - last).TotalSeconds < config.DeliveryFinalizeIdleSeconds) return;
            FinalizeOrder(orderId, "IDLE");
        }

        private void FinalizeOrder(string orderId, string reason)
        {
            try
            {
                var payload = BasePayload();
                payload["p_order_id"] = orderId;
                payload["p_event_hash"] = HashText(orderId + "|FINALIZE");
                payload["p_finalized_at"] = DateTime.UtcNow.ToString("o");
                Dictionary<string, object> body = PostRpc("finalize_delivery_order_agent", payload);
                if (!IsOk(body))
                {
                    log("DELIVERY_FINALIZE_REVIEW orderHash=" + HashText(activeExternalOrderId) + " reason=" + Error(body));
                    return;
                }
                log("DELIVERY_FINALIZED orderHash=" + HashText(activeExternalOrderId) + " trigger=" + reason + " shadow=" + config.DeliveryShadowMode);
                lock (stateLock) { activeOrderId = null; activeExternalOrderId = null; lastLabelAtUtc = default(DateTime); }
            }
            catch (Exception ex) { log("DELIVERY_FINALIZE_FAILED reason=" + ex.GetType().Name); }
        }

        private Dictionary<string, object> BasePayload()
        {
            return new Dictionary<string, object> { { "p_agent_token", config.AgentKey } };
        }

        private Dictionary<string, object> PostRpc(string name, Dictionary<string, object> payload)
        {
            string url = config.RpcUrl.Substring(0, config.RpcUrl.LastIndexOf("/rpc/", StringComparison.OrdinalIgnoreCase) + 5) + name;
            byte[] bytes = Encoding.UTF8.GetBytes(json.Serialize(payload));
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "POST";
            request.ContentType = "application/json";
            request.Timeout = 15000;
            request.ReadWriteTimeout = 15000;
            request.Headers["apikey"] = config.AnonKey;
            request.Headers["Authorization"] = "Bearer " + config.AnonKey;
            using (Stream stream = request.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                return json.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
        }

        private static bool IsOk(Dictionary<string, object> body)
        {
            return body != null && body.ContainsKey("ok") && Convert.ToBoolean(body["ok"]);
        }

        private static string Error(Dictionary<string, object> body)
        {
            return body != null && body.ContainsKey("error") ? Convert.ToString(body["error"]) : "SERVER_ERROR";
        }

        private static string StripPrinterControls(string value)
        {
            return Regex.Replace(value, @"[\x00-\x08\x0B\x0C\x0E-\x1F]", " ");
        }

        private static string MatchText(Regex pattern, string value)
        {
            Match match = pattern.Match(value);
            return match.Success ? match.Groups[1].Value.Trim() : null;
        }

        private static decimal? MatchDecimal(Regex pattern, string value)
        {
            Match match = pattern.Match(value);
            decimal parsed;
            if (!match.Success || !Decimal.TryParse(match.Groups[1].Value.Replace(",", ""),
                NumberStyles.Number, CultureInfo.InvariantCulture, out parsed)) return null;
            return parsed;
        }

        private static decimal? MatchWeight(string value)
        {
            Match match = WeightRegex.Match(value);
            decimal parsed;
            if (!match.Success || !Decimal.TryParse(match.Groups[1].Value,
                NumberStyles.Number, CultureInfo.InvariantCulture, out parsed)) return null;
            return match.Groups[2].Value.Equals("g", StringComparison.OrdinalIgnoreCase)
                ? Decimal.Round(parsed / 1000m, 3)
                : Decimal.Round(parsed, 3);
        }

        private static object EmptyToNull(string value)
        {
            return String.IsNullOrWhiteSpace(value) ? null : (object)value;
        }

        private static string Hash(byte[] value)
        {
            using (SHA256 sha = SHA256.Create())
            {
                byte[] result = sha.ComputeHash(value);
                var text = new StringBuilder(result.Length * 2);
                foreach (byte item in result) text.Append(item.ToString("x2"));
                return text.ToString();
            }
        }

        private static string HashText(string value)
        {
            return Hash(Encoding.UTF8.GetBytes(value ?? ""));
        }

        private static string SafePort(string value)
        {
            return String.IsNullOrWhiteSpace(value) ? "NONE" : value.Trim().ToUpperInvariant();
        }

        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            receiptIdleTimer.Dispose();
            labelIdleTimer.Dispose();
            finalizeTimer.Dispose();
            if (receiptPort != null) { try { receiptPort.Close(); } catch { } receiptPort.Dispose(); }
            if (labelPort != null) { try { labelPort.Close(); } catch { } labelPort.Dispose(); }
        }
    }

    internal sealed class LabelSignal
    {
        public string Barcode;
        public string RawProductName;
        public decimal? PrintedWeight;
        public decimal? PrintedUnitPrice;
        public decimal? PrintedAmount;
        public string FormatHash;
        public string ParserVersion;
    }
}
