param([string]$Version = '20260920-05', [switch]$Stage)
$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
$taskOut = Join-Path $taskRepo 'delivery\luma-20260919-01'
$taskWorkspace = Join-Path $taskOut 'private\native-workspace'
if ($Version -notmatch '^20260920-0[5-9]$') { throw 'Unexpected version' }
$taskDestination = "D:\Apps\Luma\versions\$Version\Luma.exe"
if ($Stage) {
    if (Test-Path -LiteralPath $taskDestination) { throw 'Version already staged' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $taskDestination) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $taskRepo 'src-tauri\target\release\ielts-workbench.exe') -Destination $taskDestination
    $taskHash = (Get-FileHash -LiteralPath $taskDestination -Algorithm SHA256).Hash.ToLowerInvariant()
    @{ path=$taskDestination; sha256=$taskHash; stagedAt=(Get-Date).ToUniversalTime().ToString('o'); nativeVerified=$false } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskOut 'FINAL_BINARY.json') -Encoding UTF8
}
if (-not (Test-Path -LiteralPath $taskDestination)) { throw 'Version missing' }
$taskCandidates = Get-CimInstance Win32_Process -Filter "Name='Luma.exe'" | Where-Object { $_.CommandLine -like '*luma-20260919-01\private\native-workspace*' }
foreach ($taskCandidate in $taskCandidates) {
    if ($taskCandidate.ExecutablePath -notmatch '^D:\\Apps\\Luma\\versions\\202609(19|20)-0[3-9]\\Luma\.exe$') { throw 'Unexpected isolated process path' }
    $taskProcess = Get-Process -Id $taskCandidate.ProcessId
    $taskProcess.CloseMainWindow() | Out-Null
    if (-not $taskProcess.WaitForExit(8000)) {
        # This exact process uses only the acceptance workspace; formal windows
        # and their live answers are never terminated.
        Stop-Process -Id $taskCandidate.ProcessId
    }
}
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $taskOut "private\webview-test-$Version"
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9259'
$taskApp = Start-Process -FilePath $taskDestination -ArgumentList @('--workspace', ('"' + $taskWorkspace + '"')) -PassThru
Set-Content -LiteralPath (Join-Path $taskOut 'native-test-pid.txt') -Value $taskApp.Id -Encoding ASCII
Remove-Item Env:WEBVIEW2_USER_DATA_FOLDER
Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
Write-Output "Isolated native process $($taskApp.Id): $taskDestination"
