using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Meatos.PosSetup
{
    internal static class Program
    {
        private const string Marker = "\nMEATOS_POS_CONFIG_V1\n";
        private const string AgentBase64 = "__AGENT_BASE64__";

        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            try
            {
                Install();
                MessageBox.Show(
                    "MEATOS POS Agent 설치가 완료되었습니다.\n\n" +
                    "트레이 아이콘에서 연결 상태를 확인할 수 있습니다.\n" +
                    "현장 검증 모드이므로 매출과 재고는 변경되지 않습니다.\n" +
                    "계산대에서 연결된 테스트 바코드를 스캔해 비교하세요.",
                    "MEATOS POS Agent", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "설치하지 못했습니다.\n\n" + ex.Message + "\n\n" +
                    "정육비서 자동 판매연동에서 설치 프로그램을 다시 받아주세요.",
                    "MEATOS POS Agent", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Environment.ExitCode = 1;
            }
        }

        private static void Install()
        {
            string ownPath = Assembly.GetExecutingAssembly().Location;
            byte[] ownBytes = File.ReadAllBytes(ownPath);
            byte[] markerBytes = Encoding.UTF8.GetBytes(Marker);
            int markerIndex = LastIndexOf(ownBytes, markerBytes);
            if (markerIndex < 0) throw new InvalidOperationException("매장 연결 정보가 없는 설치 파일입니다.");
            string configJson = Encoding.UTF8.GetString(
                ownBytes, markerIndex + markerBytes.Length,
                ownBytes.Length - markerIndex - markerBytes.Length).Trim();
            var serializer = new JavaScriptSerializer();
            var config = serializer.Deserialize<Dictionary<string, object>>(configJson);
            Require(config, "rpcUrl");
            Require(config, "anonKey");
            Require(config, "agentKey");
            Require(config, "device");

            string appDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MEATOS", "POS Agent");
            Directory.CreateDirectory(appDir);
            string agentPath = Path.Combine(appDir, "MEATOS-POS-Agent.exe");
            string configPath = Path.Combine(appDir, "agent.config");

            foreach (Process process in Process.GetProcessesByName("MEATOS-POS-Agent"))
            {
                try { process.Kill(); process.WaitForExit(3000); } catch { }
            }

            File.WriteAllBytes(agentPath, Convert.FromBase64String(AgentBase64));
            byte[] clearKey = Encoding.UTF8.GetBytes(Convert.ToString(config["agentKey"]));
            byte[] protectedKey = ProtectedData.Protect(clearKey, null, DataProtectionScope.CurrentUser);
            var lines = new List<string>();
            lines.Add("RpcUrl=" + Convert.ToString(config["rpcUrl"]));
            lines.Add("AnonKey=" + Convert.ToString(config["anonKey"]));
            lines.Add("AgentKeyProtected=" + Convert.ToBase64String(protectedKey));
            lines.Add("Device=" + Convert.ToString(config["device"]));
            lines.Add("StoreName=" + (config.ContainsKey("storeName") ? Convert.ToString(config["storeName"]) : "내 매장"));
            lines.Add("DeliveryAutoCaptureEnabled=" + Optional(config, "deliveryAutoCaptureEnabled", "false"));
            lines.Add("CoupangReceiptPort=" + SafePort(Optional(config, "coupangReceiptPort", "")));
            lines.Add("ScaleLabelPort=" + SafePort(Optional(config, "scaleLabelPort", "")));
            lines.Add("DeliverySerialBaud=" + Optional(config, "deliverySerialBaud", "9600"));
            lines.Add("DeliveryBarcodePrefix=" + Digits(Optional(config, "deliveryBarcodePrefix", "29"), 2));
            // 첫 설치는 반드시 그림자 모드다. 운영 전환은 검증 후 별도 승인 절차로만 수행한다.
            lines.Add("DeliveryShadowMode=true");
            lines.Add("DeliveryFinalizeIdleSeconds=" + Optional(config, "deliveryFinalizeIdleSeconds", "240"));
            File.WriteAllLines(configPath, lines.ToArray(), new UTF8Encoding(false));

            RegisterElevatedAutostart(agentPath);

            string uninstallPath = Path.Combine(appDir, "uninstall.cmd");
            File.WriteAllText(uninstallPath,
                "@echo off\r\n" +
                "taskkill /IM MEATOS-POS-Agent.exe /F >nul 2>&1\r\n" +
                "schtasks /Delete /TN \"MEATOS POS Agent\" /F >nul 2>&1\r\n" +
                "reg delete \"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\" /v \"MEATOS POS Agent\" /f >nul 2>&1\r\n" +
                "cd /d \"%TEMP%\"\r\n" +
                "timeout /t 1 /nobreak >nul\r\n" +
                "rmdir /s /q \"" + appDir + "\"\r\n",
                Encoding.Default);
            StartAgentElevated(agentPath);
            CleanupOldInstallers(ownPath);
            ScheduleSelfDelete(ownPath);
        }

        // POS 프로그램이 관리자 권한으로 떠 있으면, 일반 권한으로 실행되는 에이전트의 저수준 키보드 훅은
        // Windows UIPI 정책 때문에 그 POS 창이 활성화(포그라운드)된 동안 입력을 못 받는다("포스가 화면에
        // 떠 있으면 데이터를 못 가져온다"는 현상의 원인). 로그인 시 작업 스케줄러로 "가장 높은 수준의 권한"
        // 으로 실행되도록 등록해 회피한다 — 관리자 계정이면 매번 UAC 창 없이 자동으로 관리자 권한으로 뜬다.
        private static void RegisterElevatedAutostart(string agentPath)
        {
            RunSchTasks("/Delete /TN \"MEATOS POS Agent\" /F"); // 이전 등록 정리(있으면 무시됨)
            string createArgs = "/Create /TN \"MEATOS POS Agent\" /TR \"\\\"" + agentPath + "\\\"\" " +
                                 "/SC ONLOGON /RL HIGHEST /F";
            int exitCode = RunSchTasks(createArgs);
            if (exitCode == 0)
            {
                // 작업 스케줄러 등록에 성공했으면, 예전 방식(Run 키)이 남아 있을 경우 제거한다.
                // (둘 다 남으면 로그인 시 일반 권한 인스턴스가 먼저떠서 뮤텍스를 선점할 수 있다.)
                try
                {
                    using (RegistryKey run = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                        if (run != null) run.DeleteValue("MEATOS POS Agent", false);
                }
                catch { }
            }
            else
            {
                // 관리자 계정이 아니거나 작업 스케줄러 등록이 막힌 환경 등: 기존 방식으로 폴백한다.
                // 이 경우 POS가 관리자 권한이면 여전히 같은 증상이 재현될 수 있다.
                using (RegistryKey run = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                    run.SetValue("MEATOS POS Agent", "\"" + agentPath + "\"");
            }
        }

        // 방금 등록한 작업을 즉시 한 번 실행해, 재부팅/재로그인 없이 바로 관리자 권한으로 뜨게 한다.
        // 작업 실행이 실패하면(예: 폴백으로 Run 키만 등록된 경우) 기존 방식대로 그냥 실행한다.
        private static void StartAgentElevated(string agentPath)
        {
            int exitCode = RunSchTasks("/Run /TN \"MEATOS POS Agent\"");
            if (exitCode != 0) Process.Start(agentPath);
        }

        private static int RunSchTasks(string arguments)
        {
            try
            {
                var info = new ProcessStartInfo("schtasks.exe", arguments)
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                using (Process process = Process.Start(info))
                {
                    process.WaitForExit(10000);
                    return process.ExitCode;
                }
            }
            catch { return -1; }
        }

        // 비전문 사용자가 여러 번 받아 (1)(2)(3)으로 쌓인 옛 설치파일들을 같은 폴더에서 자동 정리한다.
        private static void CleanupOldInstallers(string ownPath)
        {
            try
            {
                string dir = Path.GetDirectoryName(ownPath);
                string ownName = Path.GetFileName(ownPath);
                if (String.IsNullOrEmpty(dir)) return;
                var patterns = new[] { "MEATOS-POS-설치*.exe", "MEATOS-POS-Setup*.exe" };
                foreach (string pattern in patterns)
                {
                    foreach (string file in Directory.GetFiles(dir, pattern))
                    {
                        if (String.Equals(Path.GetFileName(file), ownName, StringComparison.OrdinalIgnoreCase)) continue;
                        try { File.Delete(file); } catch { }
                    }
                }
            }
            catch { }
        }

        private static void ScheduleSelfDelete(string setupPath)
        {
            // The personalized installer contains the one-time raw agent key in its
            // overlay. Remove it after this process exits; the installed copy keeps
            // only a Windows DPAPI-protected value.
            var delete = new ProcessStartInfo(
                "cmd.exe",
                "/c ping 127.0.0.1 -n 3 > nul & del /f /q \"" + setupPath + "\"")
            {
                CreateNoWindow = true,
                UseShellExecute = false,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            Process.Start(delete);
        }

        private static void Require(Dictionary<string, object> config, string key)
        {
            if (!config.ContainsKey(key) || String.IsNullOrWhiteSpace(Convert.ToString(config[key])))
                throw new InvalidOperationException("필수 연결 정보가 없습니다: " + key);
        }

        private static string Optional(Dictionary<string, object> config, string key, string fallback)
        {
            return config.ContainsKey(key) ? Convert.ToString(config[key]) : fallback;
        }

        private static string SafePort(string value)
        {
            value = (value ?? "").Trim().ToUpperInvariant();
            return System.Text.RegularExpressions.Regex.IsMatch(value, @"^COM[1-9][0-9]?$") ? value : "";
        }

        private static string Digits(string value, int max)
        {
            string result = System.Text.RegularExpressions.Regex.Replace(value ?? "", @"\D", "");
            return result.Length > max ? result.Substring(0, max) : result;
        }

        private static int LastIndexOf(byte[] source, byte[] value)
        {
            for (int index = source.Length - value.Length; index >= 0; index--)
            {
                bool match = true;
                for (int offset = 0; offset < value.Length; offset++)
                    if (source[index + offset] != value[offset]) { match = false; break; }
                if (match) return index;
            }
            return -1;
        }
    }
}
