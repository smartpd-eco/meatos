using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Meatos.PosAgent
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            // 중복 실행 방지: 이미 실행 중이면 바로 종료(여러 번 실행돼도 하나만 유지)
            bool createdNew;
            var singleton = new System.Threading.Mutex(true, "MEATOS_POS_AGENT_SINGLETON", out createdNew);
            if (!createdNew) return;
            // .NET 기본은 TLS1.0/1.1이라 TLS1.2 전용 서버(Supabase)에 "SSL/TLS 보안 채널을 만들 수 없습니다"로 실패한다. TLS1.0/1.1/1.2 모두 허용.
            try { ServicePointManager.SecurityProtocol = (SecurityProtocolType)(192 | 768 | 3072); } catch { }
            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new AgentContext());
            }
            finally { GC.KeepAlive(singleton); }
        }
    }

    internal sealed class AgentContext : ApplicationContext
    {
        private const int WhKeyboardLl = 13;
        private const int WmKeyDown = 0x0100;
        private const int WmSysKeyDown = 0x0104;
        private const int KeyGapResetMs = 500;    // 키 사이 간격이 이보다 크면 새 입력으로 간주(기존 250 → 완화)
        private const int MaxAssembleMs = 3000;   // 한 코드 조립 최대 시간(기존 1500 → 완화)
        private const int IdleFlushMs = 120;       // Enter가 없어도 이 시간 멈추면 버퍼를 자동 전송
        private const string AgentVersion = "2026-09-08-remote-health";
        private readonly string appDir;
        private readonly string logDir;
        private readonly string logFile;
        private readonly NotifyIcon tray;
        private readonly StringBuilder input = new StringBuilder();
        private readonly object inputLock = new object();
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private readonly Config config;
        private DeliveryAutoCapture deliveryCapture;
        private HookProc hookProc;
        private IntPtr hookId = IntPtr.Zero;
        private System.Windows.Forms.Timer flushTimer;
        private System.Windows.Forms.Timer watchdogTimer;
        private int watchdogTicks;
        private Microsoft.Win32.PowerModeChangedEventHandler powerHandler;
        private Microsoft.Win32.SessionSwitchEventHandler sessionHandler;
        private long firstKeyAt;
        private long lastKeyAt;
        private string lastCode = "";
        private long lastSentAt;
        private int successCount;
        private string lastError = "";

        public AgentContext()
        {
            appDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MEATOS", "POS Agent");
            logDir = Path.Combine(appDir, "logs");
            logFile = Path.Combine(logDir, "pos-agent.log");
            Directory.CreateDirectory(logDir);
            config = Config.Load(Path.Combine(appDir, "agent.config"));

            tray = new NotifyIcon();
            tray.Icon = System.Drawing.SystemIcons.Application;
            tray.Text = "MEATOS POS Agent";
            tray.Visible = true;
            var menu = new ContextMenuStrip();
            menu.Items.Add("연결 상태 확인", null, delegate { TestConnection(true); });
            menu.Items.Add("로그 폴더 열기", null, delegate { Process.Start(logDir); });
            menu.Items.Add("-");
            menu.Items.Add("종료", null, delegate { ExitThread(); });
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { TestConnection(true); };

            if (config == null)
            {
                tray.ShowBalloonTip(5000, "MEATOS POS Agent", "설정 파일이 없습니다. 자동 판매연동에서 다시 설치해 주세요.", ToolTipIcon.Error);
                Log("START_FAILED reason=CONFIG_MISSING");
                return;
            }

            hookProc = HookCallback;
            hookId = SetHook(hookProc);
            if (hookId == IntPtr.Zero) { Log("HOOK_INSTALL_FAILED"); RecordError("HOOK_INSTALL_FAILED"); }
            // Enter(종결키)를 붙이지 않는 스캐너도 잡기 위한 자동 플러시 타이머
            flushTimer = new System.Windows.Forms.Timer();
            flushTimer.Interval = 60;
            flushTimer.Tick += delegate { TryIdleFlush(); };
            flushTimer.Start();
            // 하드닝: 절전/잠금해제/세션전환 후 저수준 키보드 훅이 조용히 풀려 수집이 멈추는 것을 방지한다.
            // 60초마다 훅을 재설치하고, 10분마다 하트비트를 로그에 남겨 살아있는지 확인할 수 있게 한다.
            watchdogTimer = new System.Windows.Forms.Timer();
            watchdogTimer.Interval = 60000;
            watchdogTimer.Tick += delegate { OnWatchdog(); };
            watchdogTimer.Start();
            powerHandler = OnPowerModeChanged;
            sessionHandler = OnSessionSwitch;
            try { Microsoft.Win32.SystemEvents.PowerModeChanged += powerHandler; } catch { }
            try { Microsoft.Win32.SystemEvents.SessionSwitch += sessionHandler; } catch { }
            deliveryCapture = new DeliveryAutoCapture(config, Log);
            deliveryCapture.Start();
            // elevated=False로 찍히는데 POS 프로그램이 관리자 권한으로 떠 있으면, Windows UIPI 정책 때문에
            // 그 창이 활성화(포그라운드)된 동안은 이 저수준 키보드 훅이 입력을 못 받는다(설치 시 작업 스케줄러로
            // 관리자 권한 실행되도록 등록해서 회피 — MeatosPosSetup.cs 참고). 로그로 실제 권한 상태를 확인한다.
            Log("AGENT_STARTED device=" + config.Device + " version=" + AgentVersion + " elevated=" + IsElevated() + " idleFlush=" + IdleFlushMs + "ms");
            tray.Text = Truncate("MEATOS POS · " + config.StoreName, 63);
            tray.ShowBalloonTip(3000, "MEATOS POS Agent", config.StoreName + " 키보드 웨지 감지 시작", ToolTipIcon.Info);
            TestConnection(false);
            // 사장님이 매장에 상주하지 못하므로, 시작 직후 한 번 + 이후 10분마다(OnWatchdog)
            // 관리자 권한/훅 상태/최근 오류를 서버로 보고해 '자동 판매연동' 화면에서 원격으로 확인할 수 있게 한다.
            SendHeartbeat();
        }

        protected override void ExitThreadCore()
        {
            try { if (powerHandler != null) Microsoft.Win32.SystemEvents.PowerModeChanged -= powerHandler; } catch { }
            try { if (sessionHandler != null) Microsoft.Win32.SystemEvents.SessionSwitch -= sessionHandler; } catch { }
            if (watchdogTimer != null) { watchdogTimer.Stop(); watchdogTimer.Dispose(); }
            if (hookId != IntPtr.Zero) UnhookWindowsHookEx(hookId);
            if (flushTimer != null) { flushTimer.Stop(); flushTimer.Dispose(); }
            if (deliveryCapture != null) deliveryCapture.Dispose();
            tray.Visible = false;
            tray.Dispose();
            base.ExitThreadCore();
        }

        private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && (wParam == (IntPtr)WmKeyDown || wParam == (IntPtr)WmSysKeyDown))
            {
                try
                {
                    int vkCode = Marshal.ReadInt32(lParam);
                    HandleKey(vkCode);
                }
                catch { }
            }
            return CallNextHookEx(hookId, nCode, wParam, lParam);
        }

        // 저수준 키보드 훅을 안전하게 재설치한다(기존 해제 후 재설치). UI 스레드에서 호출.
        private void EnsureHook()
        {
            try
            {
                if (hookId != IntPtr.Zero) { UnhookWindowsHookEx(hookId); hookId = IntPtr.Zero; }
                hookId = SetHook(hookProc);
                if (hookId == IntPtr.Zero)
                {
                    // SetWindowsHookEx가 실패해도 예외를 던지지 않는다 — 예전엔 아무 신호 없이 그냥
                    // 입력을 못 받았다. 이제 로그로 남기고 다음 하트비트에 hookOk=false로 보고한다.
                    Log("HOOK_INSTALL_FAILED");
                    RecordError("HOOK_INSTALL_FAILED");
                }
            }
            catch (Exception ex)
            {
                Log("HOOK_INSTALL_EXCEPTION reason=" + ex.Message);
                RecordError("HOOK_INSTALL_EXCEPTION");
            }
        }

        // 60초마다: 훅 재설치로 조용한 훅 소실 방지 + 10분마다 하트비트 기록 + 서버 상태 보고.
        private void OnWatchdog()
        {
            EnsureHook();
            watchdogTicks++;
            if (watchdogTicks % 10 == 0)
            {
                Log("HEARTBEAT alive successCount=" + successCount);
                SendHeartbeat();
            }
        }

        // 마지막으로 관찰된 오류를 기억해둔다(다음 하트비트에 함께 보고). 성공하면 CLEAR로 비운다.
        private void RecordError(string error) { lastError = error; }

        private void OnPowerModeChanged(object sender, Microsoft.Win32.PowerModeChangedEventArgs e)
        {
            if (e.Mode == Microsoft.Win32.PowerModes.Resume) { EnsureHook(); Log("HOOK_REHOOK reason=RESUME"); }
        }

        private void OnSessionSwitch(object sender, Microsoft.Win32.SessionSwitchEventArgs e)
        {
            if (e.Reason == Microsoft.Win32.SessionSwitchReason.SessionUnlock
                || e.Reason == Microsoft.Win32.SessionSwitchReason.SessionLogon
                || e.Reason == Microsoft.Win32.SessionSwitchReason.ConsoleConnect)
            {
                EnsureHook();
                Log("HOOK_REHOOK reason=" + e.Reason);
            }
        }

        private void HandleKey(int vkCode)
        {
            long now = Environment.TickCount & Int32.MaxValue;
            lock (inputLock)
            {
                if (lastKeyAt > 0 && now - lastKeyAt > KeyGapResetMs)
                {
                    input.Clear();
                    firstKeyAt = 0;
                }
                lastKeyAt = now;
                if (vkCode == 13 || vkCode == 9)
                {
                    FlushBuffer(now, "enter");
                    return;
                }

                char value = KeyToChar(vkCode);
                if (value == '\0') return;
                if (firstKeyAt == 0) firstKeyAt = now;
                input.Append(value);
                if (input.Length > 64)
                {
                    input.Clear();
                    firstKeyAt = 0;
                }
            }
        }

        // 종결키(Enter/Tab)를 붙이지 않는 스캐너도 잡기 위해, 입력이 멈추면 버퍼를 자동 전송한다.
        private void TryIdleFlush()
        {
            long now = Environment.TickCount & Int32.MaxValue;
            lock (inputLock)
            {
                if (input.Length == 0) return;
                if (lastKeyAt > 0 && now - lastKeyAt >= IdleFlushMs) FlushBuffer(now, "idle");
            }
        }

        // inputLock 안에서만 호출한다. 바코드 형태 + 스캐너 속도일 때만 전송(사람 손입력 배제).
        private void FlushBuffer(long now, string via)
        {
            string code = input.ToString();
            long elapsed = firstKeyAt == 0 ? long.MaxValue : now - firstKeyAt;
            input.Clear();
            firstKeyAt = 0;
            if (code.Length < 6) return;
            if (!LooksLikeBarcode(code)) { Log("BARCODE_DROPPED reason=NOT_BARCODE via=" + via + " raw=" + code); return; }
            if (elapsed > MaxAssembleMs) { Log("BARCODE_DROPPED reason=TOO_SLOW via=" + via + " ms=" + elapsed + " len=" + code.Length); return; }
            // 스캐너는 사람보다 훨씬 빠르다: 평균 80ms/자를 크게 넘으면 손입력으로 보고 버린다(느린 POS 여유 포함).
            if (elapsed > (long)code.Length * 80 + 500) { Log("BARCODE_DROPPED reason=TYPED_BY_HAND via=" + via + " ms=" + elapsed + " len=" + code.Length); return; }
            QueueCode(code);
        }

        // 규격외 코드도 현장 검증에서 전부 수집한다: 순수 EAN/UPC(숫자 8~14자리)뿐 아니라
        // 서버가 받아들이는 코드 형태(영숫자 및 . _ - 포함, 6~64자)면 그대로 전송한다.
        // 사람의 손입력은 위 FlushBuffer의 스캐너 속도 판정(TOO_SLOW/TYPED_BY_HAND)에서 걸러진다.
        private static bool LooksLikeBarcode(string code)
        {
            if (String.IsNullOrEmpty(code)) return false;
            return System.Text.RegularExpressions.Regex.IsMatch(code, "^[0-9A-Za-z._-]{6,64}$");
        }

        private static char KeyToChar(int key)
        {
            if (key >= 0x30 && key <= 0x39) return (char)key;
            if (key >= 0x60 && key <= 0x69) return (char)('0' + key - 0x60);
            if (key >= 0x41 && key <= 0x5A) return (char)key;
            if (key == 0xBD || key == 0x6D) return '-';
            if (key == 0xBE || key == 0x6E) return '.';
            return '\0';
        }

        private void QueueCode(string code)
        {
            if (deliveryCapture != null && deliveryCapture.IsDeliveryBarcode(code))
            {
                deliveryCapture.CaptureKeyboardLabel(code);
                return;
            }
            if (IsMeatosManagedScanPage())
            {
                // 판매 스캔/배달 출고 웹 화면이 직접 서버에 원자 처리한다.
                // 전역 에이전트까지 같은 코드를 보내면 재고가 이중 차감된다.
                Log("BARCODE_SKIPPED reason=MEATOS_MANAGED_SCAN_PAGE");
                return;
            }
            long now = Environment.TickCount & Int32.MaxValue;
            if (code == lastCode && now - lastSentAt < 2000) return;
            lastCode = code;
            lastSentAt = now;
            Log("BARCODE_DETECTED code=" + code);
            Task.Run(delegate { SendSale(code); });
        }

        private static bool IsMeatosManagedScanPage()
        {
            try
            {
                IntPtr window = GetForegroundWindow();
                int length = GetWindowTextLength(window);
                if (length <= 0) return false;
                var title = new StringBuilder(length + 1);
                GetWindowText(window, title, title.Capacity);
                string value = title.ToString();
                return value.IndexOf("판매 스캔", StringComparison.OrdinalIgnoreCase) >= 0
                    || value.IndexOf("쿠팡이츠 출고", StringComparison.OrdinalIgnoreCase) >= 0
                    || value.IndexOf("배달 출고", StringComparison.OrdinalIgnoreCase) >= 0;
            }
            catch { return false; }
        }

        private void SendSale(string code)
        {
            try
            {
                string txId = config.Device + "-" + DateTime.UtcNow.ToString("yyyyMMddHHmmssfff") + "-" + code;
                var payload = new Dictionary<string, object>();
                payload["p_agent_token"] = config.AgentKey;
                payload["p_barcode"] = code;
                payload["p_quantity"] = null;
                payload["p_sale_amount"] = null;
                payload["p_sold_at"] = DateTime.UtcNow.ToString("o");
                payload["p_external_transaction_id"] = txId;
                payload["p_device"] = config.Device;
                string response = Post(payload);
                var body = json.Deserialize<Dictionary<string, object>>(response);
                bool ok = body.ContainsKey("ok") && Convert.ToBoolean(body["ok"]);
                if (ok)
                {
                    successCount++;
                    lastError = "";
                    Log("SEND_SUCCEEDED code=" + code + " transaction=" + txId);
                    bool shadowMode = body.ContainsKey("shadowMode") && Convert.ToBoolean(body["shadowMode"]);
                    ShowBalloon(shadowMode ? "현장 관찰 완료" : "판매 반영 완료",
                        shadowMode ? code + " · 매출/재고 미반영" : code, ToolTipIcon.Info);
                }
                else
                {
                    string error = body.ContainsKey("error") ? Convert.ToString(body["error"]) : "SERVER_ERROR";
                    RecordError("SEND_FAILED:" + error);
                    Log("SEND_FAILED code=" + code + " reason=" + error);
                    ShowBalloon("판매 반영 실패", FriendlyError(error), ToolTipIcon.Warning);
                }
            }
            catch (Exception ex)
            {
                RecordError("SEND_EXCEPTION:" + ex.Message);
                Log("SEND_FAILED code=" + code + " reason=" + ex.Message);
                ShowBalloon("전송 실패", "네트워크 또는 서버 연결을 확인하세요.", ToolTipIcon.Error);
            }
        }

        private void TestConnection(bool showSuccess)
        {
            if (config == null) return;
            Task.Run(delegate
            {
                try
                {
                    var payload = new Dictionary<string, object>();
                    payload["p_agent_token"] = config.AgentKey;
                    payload["p_barcode"] = "x";
                    payload["p_device"] = config.Device;
                    string response = Post(payload);
                    var body = json.Deserialize<Dictionary<string, object>>(response);
                    string error = body.ContainsKey("error") ? Convert.ToString(body["error"]) : "";
                    if (error == "INVALID_BARCODE")
                    {
                        lastError = "";
                        Log("CONNECTION_OK");
                        if (showSuccess) ShowBalloon("연결 정상", config.StoreName + " 서버 인증 완료", ToolTipIcon.Info);
                    }
                    else
                    {
                        RecordError("CONNECTION_FAILED:" + error);
                        Log("CONNECTION_FAILED reason=" + error);
                        ShowBalloon("연결 확인 필요", FriendlyError(error), ToolTipIcon.Warning);
                    }
                }
                catch (Exception ex)
                {
                    RecordError("CONNECTION_EXCEPTION:" + ex.Message);
                    Log("CONNECTION_FAILED reason=" + ex.Message);
                    ShowBalloon("연결 실패", "인터넷 연결을 확인하세요.", ToolTipIcon.Error);
                }
            });
        }

        // 매장에 상주하지 않아도 원격에서(자동 판매연동 화면) 훅/권한/버전/최근 오류를 확인할 수 있도록
        // 10분마다(+ 시작 직후 1회) 상태를 보고한다. 실패해도 로컬 캡처 동작에는 영향이 없다.
        private void SendHeartbeat()
        {
            if (config == null) return;
            bool elevatedNow = IsElevated();
            bool hookOkNow = hookId != IntPtr.Zero;
            string errorSnapshot = lastError;
            Task.Run(delegate
            {
                try
                {
                    var payload = new Dictionary<string, object>();
                    payload["p_agent_token"] = config.AgentKey;
                    payload["p_elevated"] = elevatedNow;
                    payload["p_hook_ok"] = hookOkNow;
                    payload["p_agent_version"] = AgentVersion;
                    payload["p_last_error"] = errorSnapshot;
                    PostTo(HeartbeatRpcUrl(), payload);
                    Log("HEARTBEAT_SENT elevated=" + elevatedNow + " hookOk=" + hookOkNow);
                }
                catch (Exception ex)
                {
                    Log("HEARTBEAT_SEND_FAILED reason=" + ex.Message);
                }
            });
        }

        // capture_pos_sale_observation_agent와 같은 REST 베이스에서 함수명만 report_pos_agent_health로 바꾼다.
        // 이미 설치된 agent.config를 건드리지 않고도(RpcUrl 하나만으로) 새 RPC를 호출할 수 있게 하기 위함.
        private string HeartbeatRpcUrl()
        {
            int index = config.RpcUrl.LastIndexOf('/');
            return index > 0 ? config.RpcUrl.Substring(0, index + 1) + "report_pos_agent_health" : config.RpcUrl;
        }

        private string Post(Dictionary<string, object> payload)
        {
            return PostTo(config.RpcUrl, payload);
        }

        private string PostTo(string url, Dictionary<string, object> payload)
        {
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
                return reader.ReadToEnd();
        }

        private void ShowBalloon(string title, string message, ToolTipIcon icon)
        {
            try
            {
                tray.Text = Truncate("MEATOS POS · " + config.StoreName + " · " + successCount + "건", 63);
                tray.ShowBalloonTip(3000, title, message, icon);
            }
            catch { }
        }

        private static string FriendlyError(string error)
        {
            if (error == "AGENT_NOT_AUTHENTICATED") return "연동 인증이 만료되었습니다. 다시 설치해 주세요.";
            if (error == "BARCODE_NOT_MAPPED") return "미등록 바코드입니다. 판매 스캔에서 품목을 연결하세요.";
            if (error == "INSUFFICIENT_STOCK") return "연결된 상품의 재고가 부족합니다.";
            if (error == "SALE_VALUE_REQUIRED") return "판매 수량 또는 단가 설정이 필요합니다.";
            if (error == "DUPLICATE_EVENT") return "이미 처리된 입력입니다.";
            return String.IsNullOrEmpty(error) ? "서버 응답을 확인하세요." : error;
        }

        private void Log(string message)
        {
            try { File.AppendAllText(logFile, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + Environment.NewLine, Encoding.UTF8); }
            catch { }
        }

        private static string Truncate(string value, int max)
        {
            return value.Length <= max ? value : value.Substring(0, max);
        }

        // 현재 프로세스가 관리자 권한으로 실행 중인지 확인한다.
        // POS 프로그램이 관리자 권한이면, 이 값이 False인 동안은 그 창이 활성화된 시간대에
        // 저수준 키보드 훅이 조용히(에러 로그 없이) 입력을 못 받는다(Windows UIPI).
        private static bool IsElevated()
        {
            try
            {
                using (var identity = WindowsIdentity.GetCurrent())
                {
                    var principal = new WindowsPrincipal(identity);
                    return principal.IsInRole(WindowsBuiltInRole.Administrator);
                }
            }
            catch { return false; }
        }

        private static IntPtr SetHook(HookProc proc)
        {
            using (Process currentProcess = Process.GetCurrentProcess())
            using (ProcessModule currentModule = currentProcess.MainModule)
                return SetWindowsHookEx(WhKeyboardLl, proc, GetModuleHandle(currentModule.ModuleName), 0);
        }

        private delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);
        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
        [DllImport("user32.dll")]
        private static extern int GetWindowTextLength(IntPtr hWnd);
    }

    internal sealed class Config
    {
        public string RpcUrl;
        public string AnonKey;
        public string AgentKey;
        public string Device;
        public string StoreName;
        public bool DeliveryAutoCaptureEnabled;
        public string CoupangReceiptPort;
        public string ScaleLabelPort;
        public int DeliverySerialBaud;
        public string DeliveryBarcodePrefix;
        public bool DeliveryShadowMode;
        public int DeliveryFinalizeIdleSeconds;

        public static Config Load(string path)
        {
            if (!File.Exists(path)) return null;
            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (string line in File.ReadAllLines(path, Encoding.UTF8))
            {
                int index = line.IndexOf('=');
                if (index > 0) values[line.Substring(0, index)] = line.Substring(index + 1);
            }
            if (!values.ContainsKey("AgentKeyProtected")) return null;
            byte[] protectedBytes = Convert.FromBase64String(values["AgentKeyProtected"]);
            byte[] clearBytes = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
            return new Config
            {
                RpcUrl = values["RpcUrl"],
                AnonKey = values["AnonKey"],
                AgentKey = Encoding.UTF8.GetString(clearBytes),
                Device = values.ContainsKey("Device") ? values["Device"] : "POS01",
                StoreName = values.ContainsKey("StoreName") ? values["StoreName"] : "내 매장",
                DeliveryAutoCaptureEnabled = GetBool(values, "DeliveryAutoCaptureEnabled", false),
                CoupangReceiptPort = GetValue(values, "CoupangReceiptPort", ""),
                ScaleLabelPort = GetValue(values, "ScaleLabelPort", ""),
                DeliverySerialBaud = GetInt(values, "DeliverySerialBaud", 9600, 1200, 115200),
                DeliveryBarcodePrefix = GetValue(values, "DeliveryBarcodePrefix", "29"),
                DeliveryShadowMode = GetBool(values, "DeliveryShadowMode", true),
                DeliveryFinalizeIdleSeconds = GetInt(values, "DeliveryFinalizeIdleSeconds", 240, 60, 900)
            };
        }

        private static string GetValue(Dictionary<string, string> values, string key, string fallback)
        {
            return values.ContainsKey(key) ? values[key] : fallback;
        }

        private static bool GetBool(Dictionary<string, string> values, string key, bool fallback)
        {
            bool parsed;
            return values.ContainsKey(key) && Boolean.TryParse(values[key], out parsed) ? parsed : fallback;
        }

        private static int GetInt(Dictionary<string, string> values, string key, int fallback, int min, int max)
        {
            int parsed;
            if (!values.ContainsKey(key) || !Int32.TryParse(values[key], out parsed)) return fallback;
            return Math.Max(min, Math.Min(max, parsed));
        }
    }
}
