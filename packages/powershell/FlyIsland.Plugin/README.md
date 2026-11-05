# FlyIsland.Plugin

Helpers for [FocuSD Island](https://github.com/TixXin/fly-island) plugins written for Windows PowerShell 5.1 (also PowerShell 7).

Plugins normally carry the single-file version, `plugins/sdk/powershell/focusd.ps1` in the FocuSD Island repository (generated from this module by `pnpm sdk:build`), so users need nothing installed:

```powershell
. "$PSScriptRoot\lib\focusd.ps1"

Invoke-FocusdLoop @{
    initialize = { param($params) Write-FocusdLog "started ($($params.activationEvent))" }
    command = { param($params) if ($params.id -eq 'hello') { [void](Show-FocusdNotification 'Hello') } }
}
```

For your own scripts: `Import-Module FlyIsland.Plugin`. Keep plugin scripts ASCII (PowerShell 5.1 reads files without a BOM as ANSI) and write other languages with `ConvertFrom-FocusdEscape`.
