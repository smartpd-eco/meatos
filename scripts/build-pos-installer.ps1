$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$framework = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319"
$csc = Join-Path $framework "csc.exe"
$sourceDir = Join-Path $workspace "agent\windows"
$outputDir = Join-Path $workspace "downloads"
$buildDir = Join-Path $workspace ".build\pos-agent"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$agentExe = Join-Path $buildDir "MEATOS-POS-Agent.exe"
& $csc /nologo /target:winexe /platform:anycpu /optimize+ `
  /reference:"$framework\System.dll" `
  /reference:"$framework\System.Core.dll" `
  /reference:"$framework\System.Drawing.dll" `
  /reference:"$framework\System.Security.dll" `
  /reference:"$framework\System.Web.Extensions.dll" `
  /reference:"$framework\System.Windows.Forms.dll" `
  /out:$agentExe (Join-Path $sourceDir "MeatosPosAgent.cs") (Join-Path $sourceDir "MeatosDeliveryAutoCapture.cs")
if ($LASTEXITCODE -ne 0) { throw "POS agent compilation failed." }

$agentBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($agentExe))
$setupTemplate = Get-Content -Raw -Encoding UTF8 (Join-Path $sourceDir "MeatosPosSetup.cs")
$setupSource = Join-Path $buildDir "MeatosPosSetup.generated.cs"
[IO.File]::WriteAllText(
  $setupSource,
  $setupTemplate.Replace("__AGENT_BASE64__", $agentBase64),
  [Text.UTF8Encoding]::new($false)
)

$setupExe = Join-Path $outputDir "MEATOS-POS-Setup.exe"
& $csc /nologo /target:winexe /platform:anycpu /optimize+ `
  /reference:"$framework\System.dll" `
  /reference:"$framework\System.Core.dll" `
  /reference:"$framework\System.Security.dll" `
  /reference:"$framework\System.Web.Extensions.dll" `
  /reference:"$framework\System.Windows.Forms.dll" `
  /out:$setupExe $setupSource
if ($LASTEXITCODE -ne 0) { throw "POS setup compilation failed." }

$agentHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $agentExe).Hash.ToLowerInvariant()
$setupHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $setupExe).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(
  (Join-Path $outputDir "MEATOS-POS-Setup.sha256"),
  "$setupHash  MEATOS-POS-Setup.exe`r`n$agentHash  embedded/MEATOS-POS-Agent.exe`r`n",
  [Text.UTF8Encoding]::new($false)
)

# 배포일 버전 표시: 버전 파일 + 날짜 포함 사본(정식 설치본은 MEATOS-POS-Setup.exe 유지)
$buildDate = Get-Date -Format "yyyy-MM-dd HH:mm"
$buildStamp = Get-Date -Format "yyyyMMdd"
$setupBytes = (Get-Item -LiteralPath $setupExe).Length
[IO.File]::WriteAllText(
  (Join-Path $outputDir "MEATOS-POS-Setup.version.txt"),
  "buildDate=$buildDate`r`nbuildStamp=$buildStamp`r`nsetupBytes=$setupBytes`r`nsetupSha256=$setupHash`r`nagentSha256=$agentHash`r`n",
  [Text.UTF8Encoding]::new($false)
)
Copy-Item -LiteralPath $setupExe -Destination (Join-Path $outputDir ("MEATOS-POS-Setup-" + $buildStamp + ".exe")) -Force

Write-Output ([pscustomobject]@{
  Setup = $setupExe
  BuildDate = $buildDate
  BuildStamp = $buildStamp
  SetupBytes = $setupBytes
  SetupSha256 = $setupHash
  AgentBytes = (Get-Item -LiteralPath $agentExe).Length
  AgentSha256 = $agentHash
})
