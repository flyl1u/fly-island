#requires -Version 5.1
#requires -PSEdition Desktop
param([switch]$Repair)

$ErrorActionPreference = 'Stop'
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
$notificationManager = [Windows.UI.Notifications.ToastNotificationManager]

function Get-QQNotificationStatus {
    try {
        $status = $notificationManager::CreateToastNotifier('QQ').Setting
        if ($null -ne $status) { return $status.ToString() }
    } catch {
        return 'Unavailable'
    }
    return 'Unavailable'
}

$before = Get-QQNotificationStatus
if ($before -eq 'Enabled') {
    [pscustomobject]@{ Result = 'AlreadyEnabled'; Status = $before; Modified = $false } | ConvertTo-Json
    exit 0
}
if (-not $Repair) {
    [pscustomobject]@{ Result = 'NotRepaired'; Status = $before; Modified = $false } | ConvertTo-Json
    exit 2
}
if ($before -ne 'Unavailable') {
    throw "QQ notification status is $before. Change the corresponding Windows notification setting first."
}

$shell = New-Object -ComObject Shell.Application
$qqShortcut = $null
foreach ($root in @([Environment]::GetFolderPath('StartMenu'), [Environment]::GetFolderPath('CommonStartMenu'))) {
    foreach ($file in @(Get-ChildItem -LiteralPath $root -Filter 'QQ.lnk' -Recurse -ErrorAction SilentlyContinue)) {
        $item = $shell.NameSpace($file.DirectoryName).ParseName($file.Name)
        $target = $item.ExtendedProperty('System.Link.TargetParsingPath')
        if ($item.ExtendedProperty('System.AppUserModel.ID') -eq 'QQ' -and
            [IO.Path]::GetFileName($target) -ieq 'QQ.exe' -and
            (Test-Path -LiteralPath $target -PathType Leaf)) {
            $signature = Get-AuthenticodeSignature -LiteralPath $target
            if ($signature.Status -eq 'Valid' -and $signature.SignerCertificate.Subject -match 'Tencent') {
                $qqShortcut = $file.FullName
                break
            }
        }
    }
    if ($qqShortcut) { break }
}
if (-not $qqShortcut) { throw 'A valid QQ shortcut with AppUserModelID QQ and a Tencent-signed QQ.exe was not found.' }

$backup = Join-Path $env:LOCALAPPDATA ('FocuSD\diagnostics\qq-notification-repair-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup | Out-Null
if (Test-Path -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\QQ') {
    & reg.exe export 'HKCU\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\QQ' (Join-Path $backup 'settings-before.reg') /y | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not back up the QQ notification settings.' }
}
[pscustomobject]@{ StatusBefore = $before; Shortcut = $qqShortcut; TestOnly = $true } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'repair.json') -Encoding UTF8

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>FocuSD QQ notification diagnostic</text><text>Local channel test; this is not a chat message.</text></binding></visual><audio silent="true" /></toast>')
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$tag = 'FocusdDiag'
$toast.Tag = $tag
$toast.Group = $tag
$toast.SuppressPopup = $true
$toast.ExpirationTime = [DateTimeOffset]::Now.AddMinutes(1)
try {
    $notificationManager::CreateToastNotifier('QQ').Show($toast)
    $after = Get-QQNotificationStatus
} finally {
    $notificationManager::History.Remove($tag, $tag, 'QQ')
}
if ($after -ne 'Enabled') { throw "QQ notification registration remains unavailable: $after. Backup: $backup" }
[pscustomobject]@{ Result = 'RegistrationRestored'; Status = $after; Backup = $backup; RealMessagesVerified = $false } | ConvertTo-Json
