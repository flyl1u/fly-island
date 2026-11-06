@{
    RootModule = 'FlyIsland.Plugin.psm1'
    ModuleVersion = '0.1.0'
    GUID = '6180e14e-88a5-4497-8ed0-4bbbb5c4954d'
    Author = 'FocuSD'
    CompanyName = 'FocuSD'
    Copyright = '(c) 2026 flyl1u and contributors. MIT License.'
    Description = 'Helpers for FocuSD Island plugins written in Windows PowerShell 5.1: JSON-RPC over stdio, events, island messages, views, status texts, storage and secrets.'
    PowerShellVersion = '5.1'
    CompatiblePSEditions = @('Desktop', 'Core')
    FunctionsToExport = @(
        'Send-FocusdMessage', 'Write-FocusdLog', 'Read-FocusdLine', 'Invoke-FocusdMethod',
        'Receive-FocusdNotification', 'Invoke-FocusdLoop', 'New-FocusdText', 'ConvertFrom-FocusdEscape',
        'Register-FocusdEvent', 'Unregister-FocusdEvent', 'Show-FocusdNotification',
        'Update-FocusdView', 'Update-FocusdViewItems', 'Send-FocusdWebviewMessage', 'Update-FocusdStatus', 'Clear-FocusdStatus',
        'Get-FocusdStorage', 'Set-FocusdStorage', 'Remove-FocusdStorage',
        'Get-FocusdSecret', 'Set-FocusdSecret', 'Remove-FocusdSecret', 'Set-FocusdKeepAlive', 'Request-FocusdPermission', 'Open-FocusdView'
    )
    CmdletsToExport = @()
    VariablesToExport = @()
    AliasesToExport = @()
    PrivateData = @{
        PSData = @{
            Tags = @('FocuSD', 'FlyIsland', 'plugin', 'Windows')
            LicenseUri = 'https://github.com/TixXin/fly-island/blob/main/LICENSE'
            ProjectUri = 'https://github.com/TixXin/fly-island/tree/main/packages/powershell/FlyIsland.Plugin'
        }
    }
}
