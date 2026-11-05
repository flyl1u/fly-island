// main.ps1 of a new plugin written for Windows PowerShell 5.1. The file has to
// stay ASCII (PowerShell 5.1 reads files without a BOM as ANSI), so Chinese
// text is written as escapes and turned back with ConvertFrom-FocusdEscape.

const BACKSLASH = String.fromCharCode(92);

/** A PowerShell expression for `text` that keeps the script ASCII. */
export function psText(text) {
  if (/^[\x20-\x7e]*$/.test(text)) return `'${text.replaceAll("'", "''")}'`;
  const escaped = [...text]
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 0x20 && code <= 0x7e && char !== BACKSLASH) return char === "'" ? "''" : char;
      return `${BACKSLASH}u${code.toString(16).padStart(4, "0")}`;
    })
    .join("");
  return `(ConvertFrom-FocusdEscape '${escaped}')`;
}

const both = (zh, en) => `(New-FocusdText ${psText(zh)} ${psText(en)})`;

function header(options) {
  return `# ${options.name.en}: a FocuSD Island plugin for Windows PowerShell 5.1.
# Protocol and API: https://github.com/TixXin/fly-island/blob/main/docs/plugins/README.md
# Keep this file ASCII; write other languages with ConvertFrom-FocusdEscape.
. "$PSScriptRoot${BACKSLASH}lib${BACKSLASH}focusd.ps1"
`;
}

const bodies = {
  blank: () => `
Invoke-FocusdLoop @{
    initialize = { param($params) Write-FocusdLog "started ($($params.activationEvent))" }
    'settings.changed' = { param($params) Write-FocusdLog "settings changed: $($params.settings | ConvertTo-Json -Compress)" }
}
`,
  command: () => `
Invoke-FocusdLoop @{
    initialize = { param($params) Write-FocusdLog "started ($($params.activationEvent))" }
    # Runs when the user clicks "Say hello" on the plugin's page in Settings.
    command = {
        param($params)
        if ($params.id -ne 'hello') { return }
        $count = [int](Get-FocusdStorage 'count') + 1
        Set-FocusdStorage 'count' $count
        [void](Show-FocusdNotification "Hello #$count" 'This message came from a plugin.')
    }
}
`,
  list: () => `
$script:View = 'main'
$script:Items = $null

function Get-Items {
    if ($null -eq $script:Items) {
        $saved = Get-FocusdStorage 'items'
        if ($null -eq $saved) {
            $script:Items = @(
                @{ id = '1'; title = 'Open this page from the island'; done = $true },
                @{ id = '2'; title = 'Tick an item'; done = $false },
                @{ id = '3'; title = 'Run "Add an item" on the plugin''s page in Settings'; done = $false }
            )
        } else {
            $script:Items = @($saved | ForEach-Object { @{ id = [string]$_.id; title = [string]$_.title; done = [bool]$_.done } })
        }
    }
    return $script:Items
}

function Save-Items($items) {
    $script:Items = @($items)
    Set-FocusdStorage 'items' @($script:Items)
    Show-Items
}

function Show-Items {
    $rows = @(Get-Items | ForEach-Object {
        @{ id = $_.id; title = $_.title; checked = $_.done; actions = @(@{ id = 'remove'; title = ${both("删除", "Remove")} }) }
    })
    Update-FocusdView $script:View @{
        search = @{ placeholder = ${both("筛选", "Filter")} }
        items = $rows
        empty = ${both("没有条目", "Nothing here")}
    }
}

Invoke-FocusdLoop @{
    initialize = { param($params) Write-FocusdLog "started ($($params.activationEvent))" }
    # The island only shows the page while it is open; send the model then.
    'view.visible' = { param($params) if ($params.visible) { Show-Items } }
    'view.action' = {
        param($params)
        $items = Get-Items
        if ($params.actionId -eq 'check') {
            foreach ($item in $items) { if ($item.id -eq $params.itemId) { $item.done = [bool]$params.checked } }
            Save-Items $items
        } elseif ($params.actionId -eq 'remove') {
            Save-Items @($items | Where-Object { $_.id -ne $params.itemId })
        }
    }
    command = {
        param($params)
        if ($params.id -ne 'add') { return }
        $items = Get-Items
        $next = 1 + (@($items | ForEach-Object { [int]$_.id }) + 0 | Measure-Object -Maximum).Maximum
        Save-Items (@($items) + @(@{ id = [string]$next; title = "New item $next"; done = $false }))
    }
}
`,
  status: () => `
# Shows how many of today's todos are open on the collapsed island and updates
# it when they change. The subscription keeps this on-demand plugin running.
function Update-Open {
    $state = Invoke-FocusdMethod 'todos.list'
    $open = @($state.todos | Where-Object { -not $_.completed }).Count
    $text = if ($open -eq 0) { 'All done' } else { "$open open" }
    Update-FocusdStatus 'open' $text 'Open todos today'
}

Invoke-FocusdLoop @{
    initialize = {
        param($params)
        [void](Register-FocusdEvent 'todos.changed')
        Update-Open
    }
    event = { param($params) if ($params.name -eq 'todos.changed') { Update-Open } }
}
`,
};

/** The plugin's main.ps1. */
export function powershellMain(options) {
  return header(options) + bodies[options.template]();
}
