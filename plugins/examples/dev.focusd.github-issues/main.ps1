# Example plugin (API version 2): an island page (list template) with the open
# issues of a public GitHub repository. Clicking an issue opens it in the browser
# (the island does that from the item's url). Issues are fetched only while the
# page is on screen, at most every few minutes; GitHub allows 60 calls an hour
# without a token. Network errors show on the page; the plugin keeps running.
. "$PSScriptRoot\lib\focusd.ps1"

# Windows PowerShell 5.1 reads a script without a BOM as ANSI, so this file stays
# ASCII and writes Chinese text as \u escapes.
function Text([string]$Escaped) { [regex]::Unescape($Escaped) }

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$script:Repo = 'TixXin/fly-island'
$script:Minutes = 15
$script:Visible = $false
$script:FetchedAt = [DateTime]::MinValue
$script:Items = @()
$script:LoadError = $null
$script:CanShow = $false

function Read-Settings($settings) {
    $script:Repo = ([string]$settings.repo).Trim()
    $script:Minutes = [Math]::Max(5, [int]$settings.minutes)
}

function Send-Model([bool]$Loading = $false) {
    if (-not $script:CanShow) { return }
    $model = @{
        search = @{ placeholder = @{ 'zh-CN' = (Text '\u7b5b\u9009 issue'); en = 'Filter issues' } }
        groups = @(@{ title = "$($script:Repo) - $(@($script:Items).Count) open"; items = @($script:Items) })
        empty = @{ 'zh-CN' = (Text '\u6ca1\u6709\u672a\u5173\u95ed\u7684 issue'); en = 'No open issues' }
        loading = $Loading
    }
    if ($script:LoadError) { $model.error = $script:LoadError }
    [void](Invoke-FocusdMethod 'view.update' @{ viewId = 'issues'; model = $model })
}

function Update-Issues {
    $script:FetchedAt = [DateTime]::UtcNow
    if ($script:Repo -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
        $script:Items = @()
        $script:LoadError = @{ 'zh-CN' = (Text '\u4ed3\u5e93\u8981\u5199\u6210 owner/name'); en = 'Set the repository as owner/name.' }
        Send-Model
        return
    }
    if (@($script:Items).Count -eq 0) { Send-Model $true }
    try {
        $url = "https://api.github.com/repos/$($script:Repo)/issues?state=open&per_page=30"
        $headers = @{ 'User-Agent' = 'FocuSD-Island-example-plugin'; Accept = 'application/vnd.github+json' }
        # PowerShell 5.1 writes a JSON array as one object; piping the variable enumerates it.
        $response = Invoke-RestMethod -Uri $url -Headers $headers -TimeoutSec 15
        $issues = @($response | ForEach-Object { $_ })
        # The issues API lists pull requests too; they have a pull_request field.
        $script:Items = @($issues | Where-Object { $null -eq $_.pull_request } | ForEach-Object {
            $item = @{
                id = "issue-$($_.number)"
                title = [string]$_.title
                subtitle = "#$($_.number) - $($_.user.login) - $(([DateTime]$_.updated_at).ToString('yyyy-MM-dd'))"
                url = [string]$_.html_url
            }
            if ($_.comments -gt 0) { $item.note = "$($_.comments)" }
            $item
        })
        $script:LoadError = $null
        Write-FocusdLog "$(@($script:Items).Count) open issues in $($script:Repo)"
    } catch {
        $reason = $_.Exception.Message
        $script:LoadError = @{ 'zh-CN' = "$(Text '\u52a0\u8f7d\u5931\u8d25\uff1a')$reason"; en = "Could not load the issues: $reason" }
        Write-FocusdLog "fetch failed: $reason"
    }
    Send-Model
}

function Test-Stale { ([DateTime]::UtcNow - $script:FetchedAt).TotalMinutes -ge $script:Minutes }

while ($true) {
    $message = Receive-FocusdNotification 5000
    try {
        if ($null -eq $message) {
            if ($script:Visible -and (Test-Stale)) { Update-Issues }
            continue
        }
        switch ($message.method) {
            'initialize' {
                Read-Settings $message.params.settings
                $script:CanShow = @($message.params.capabilities) -contains 'views'
                if (-not $script:CanShow) { Write-FocusdLog 'this FocuSD Island is too old for this plugin (needs island pages)' }
            }
            'settings.changed' {
                Read-Settings $message.params.settings
                $script:Items = @()
                if ($script:Visible) { Update-Issues } else { $script:FetchedAt = [DateTime]::MinValue }
            }
            'view.visible' {
                $script:Visible = [bool]$message.params.visible
                # A page opened again within the interval shows what was fetched.
                if ($script:Visible) { if (Test-Stale) { Update-Issues } else { Send-Model } }
            }
            'command' {
                if ($message.params.id -eq 'refresh') { Update-Issues }
            }
            'shutdown' {
                exit 0
            }
        }
    } catch {
        # Keep running: one failed call should not make the island restart the plugin.
        Write-FocusdLog "error: $($_.Exception.Message)"
    }
}
