$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$taskPid = [int](Get-Content -LiteralPath 'delivery\luma-20260919-01\native-test-pid.txt')
$taskProcess = Get-Process -Id $taskPid
if ($taskProcess.Path -notmatch '^D:\\Apps\\Luma\\versions\\202609(19|20)-0[3-9]\\Luma\.exe$') { throw 'Unexpected process' }
$taskCommand = (Get-CimInstance Win32_Process -Filter "ProcessId=$taskPid").CommandLine
if (-not $taskCommand.Contains('private\native-workspace')) { throw 'Not the isolated test workspace' }
$taskCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $taskPid)
$taskWindows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$taskCondition)
$taskFound = $false
$taskButtonHandle = 0
foreach ($taskWindow in $taskWindows) {
    $taskNodes = $taskWindow.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
    foreach ($taskNode in $taskNodes) {
        if ($taskNode.Current.Name -like 'Submit and open Results?*' -or $taskNode.Current.Name -like 'Submit this Listening session?*') { $taskFound = $true }
        if ($taskNode.Current.ClassName -eq 'CCPushButton' -and $taskNode.Current.Name -eq ([char]0x786e).ToString()+([char]0x5b9a).ToString() -and $taskNode.Current.IsEnabled) { $taskButtonHandle = $taskNode.Current.NativeWindowHandle }
    }
}
if (-not $taskFound) { throw 'Expected native submission dialog is not present' }
if ($taskButtonHandle -eq 0) { throw 'Native OK control is unavailable' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LumaNativeConfirm { [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr handle,uint message,IntPtr wParam,IntPtr lParam); }
'@
[LumaNativeConfirm]::SendMessage([IntPtr]$taskButtonHandle,0xF5,[IntPtr]::Zero,[IntPtr]::Zero) | Out-Null
'Native submission confirmation activated in the isolated test window.'
