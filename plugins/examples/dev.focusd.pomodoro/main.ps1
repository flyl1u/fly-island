# Example plugin (API version 2): a pomodoro timer. Start it with the command's
# shortcut (Ctrl+Alt+P), the plugin page or the todo right-click menu; when the
# round ends it shows an island.notify message with a "one more round" button.
# The running round and today's finished rounds live in plugin storage, so they
# survive a restart of the plugin or the island. The countdown shows on the
# plugin's island page (status template) and on the collapsed bar (status item).
. "$PSScriptRoot\lib\focusd.ps1"

$script:Minutes = 25
$script:EndsAt = $null      # UTC DateTime of the running round, or $null
$script:Label = ''
$script:LastLabel = ''   # label of the round that just ended, for "one more"
$script:ShownInfo = $null
$script:Rounds = 0
$script:CanShow = $false    # the island has views and status items (API version 2)
$script:Visible = $false    # our island page is on screen
$script:ShownView = $null
$script:ShownStatus = $null

# Windows PowerShell 5.1 reads a script without a BOM as ANSI, so this file stays
# ASCII and writes Chinese text as \u escapes.
function Text([string]$Escaped) { [regex]::Unescape($Escaped) }

function Get-Today { (Get-Date).ToString('yyyy-MM-dd') }

function Get-Rounds {
    $saved = (Invoke-FocusdMethod 'storage.get' @{ key = 'rounds' }).value
    if ($null -ne $saved -and $saved.date -eq (Get-Today)) { return [int]$saved.count }
    return 0
}

function Save-Current {
    $value = $null
    if ($null -ne $script:EndsAt) {
        $value = @{ endsAt = $script:EndsAt.ToString('o'); label = $script:Label }
    }
    if ($null -eq $value) {
        [void](Invoke-FocusdMethod 'storage.delete' @{ key = 'current' })
    } else {
        [void](Invoke-FocusdMethod 'storage.set' @{ key = 'current'; value = $value })
    }
}

function Show-Info {
    $state = 'idle'
    if ($null -ne $script:EndsAt) {
        $left = [Math]::Max(0, [Math]::Ceiling(($script:EndsAt - [DateTime]::UtcNow).TotalMinutes))
        $state = "$left min left"
        if ($script:Label) { $state += " - $($script:Label)" }
    }
    $info = "$state|$(Get-Rounds)"
    if ($info -eq $script:ShownInfo) { return }
    $script:ShownInfo = $info
    [void](Invoke-FocusdMethod 'ui.setInfo' @{ items = @(
        @{ label = @{ 'zh-CN' = (Text '\u72b6\u6001'); en = 'Status' }; value = $state },
        @{ label = @{ 'zh-CN' = (Text '\u4eca\u5929\u5b8c\u6210'); en = 'Done today' }; value = "$(Get-Rounds)" }
    ) })
}

function Get-Clock([TimeSpan]$Span) {
    $seconds = [Math]::Max(0, [int][Math]::Ceiling($Span.TotalSeconds))
    return '{0:00}:{1:00}' -f [Math]::Floor($seconds / 60), ($seconds % 60)
}

# The countdown on the collapsed bar and, while it is on screen, the island page.
# Only sent when it changed, so an idle timer sends nothing.
function Show-Island {
    if (-not $script:CanShow) { return }
    $running = $null -ne $script:EndsAt
    $clock = if ($running) { Get-Clock ($script:EndsAt - [DateTime]::UtcNow) } else { '' }
    if ($clock -ne $script:ShownStatus) {
        $script:ShownStatus = $clock
        [void](Invoke-FocusdMethod 'status.update' @{ itemId = 'countdown'; text = $clock; tone = 'accent' })
    }
    if (-not $script:Visible) { return }
    $done = @{ 'zh-CN' = "$(Text '\u4eca\u5929\u5b8c\u6210') $($script:Rounds)"; en = "Done today: $($script:Rounds)" }
    if ($running) {
        $total = [double]$script:Minutes * 60
        $progress = 1 - [Math]::Min(1, ($script:EndsAt - [DateTime]::UtcNow).TotalSeconds / $total)
        $label = if ($script:Label) { $script:Label } else { @{ 'zh-CN' = (Text '\u4e13\u6ce8\u4e2d'); en = 'Focus' } }
        $model = @{ primary = $clock; secondary = $label; caption = $done; progress = $progress; tone = 'accent'
            actions = @(@{ id = 'stop'; title = @{ 'zh-CN' = (Text '\u505c\u6b62'); en = 'Stop' } }) }
    } else {
        $model = @{ primary = (Get-Clock ([TimeSpan]::FromMinutes($script:Minutes))); secondary = @{ 'zh-CN' = (Text '\u672a\u5f00\u59cb'); en = 'Not started' }; caption = $done
            actions = @(@{ id = 'start'; title = @{ 'zh-CN' = (Text '\u5f00\u59cb'); en = 'Start' }; icon = 'timer' }) }
    }
    $text = $model | ConvertTo-Json -Compress -Depth 6
    if ($text -eq $script:ShownView) { return }
    $script:ShownView = $text
    [void](Invoke-FocusdMethod 'view.update' @{ viewId = 'timer'; model = $model })
}

function Start-Round([string]$Label) {
    $script:EndsAt = [DateTime]::UtcNow.AddMinutes($script:Minutes)
    $script:Label = $Label
    Save-Current
    Write-FocusdLog "round started ($($script:Minutes) min) $Label"
    Show-Info
}

function Stop-Round {
    $script:EndsAt = $null
    $script:Label = ''
    Save-Current
    Show-Info
}

function Complete-Round {
    $count = (Get-Rounds) + 1
    $script:Rounds = $count
    [void](Invoke-FocusdMethod 'storage.set' @{ key = 'rounds'; value = @{ date = (Get-Today); count = $count } })
    $body = "Rounds today: $count"
    if ($script:Label) { $body = "$($script:Label) - $body" }
    $script:LastLabel = $script:Label
    Stop-Round
    $answer = Invoke-FocusdMethod 'island.notify' @{
        title = "Pomodoro done / $(Text '\u756a\u8304\u949f\u7ed3\u675f')"
        body = $body
        durationMs = 10000
        actions = @(@{ id = 'again'; title = "One more / $(Text '\u518d\u6765')" })
    }
    if ($answer.muted) { Write-FocusdLog 'round done (messages are muted)' }
}

# Picks up a round that was running when the plugin last stopped.
function Restore-Current {
    $saved = (Invoke-FocusdMethod 'storage.get' @{ key = 'current' }).value
    if ($null -eq $saved) { return }
    $script:EndsAt = [DateTime]::Parse($saved.endsAt, $null, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
    $script:Label = [string]$saved.label
}

function Get-TodoTitle([string]$Id) {
    $todo = @((Invoke-FocusdMethod 'todos.list').todos) | Where-Object { $_.id -eq $Id } | Select-Object -First 1
    if ($null -eq $todo) { return '' }
    return [string]$todo.title
}

while ($true) {
    $message = Receive-FocusdNotification 1000
    try {
        # Checked on every turn, so a round that ended while busy (or while the
        # plugin was stopped) is counted before the next message is handled.
        if ($null -ne $script:EndsAt) {
            if ([DateTime]::UtcNow -ge $script:EndsAt) { Complete-Round } elseif ($null -eq $message) { Show-Info }
        }
        Show-Island
        if ($null -eq $message) {
            continue
        }
        switch ($message.method) {
            'initialize' {
                $script:Minutes = [int]$message.params.settings.minutes
                if (@($message.params.capabilities) -notcontains 'storage') {
                    Write-FocusdLog 'this FocuSD Island is too old for this plugin (needs plugin API version 2)'
                } else {
                    Restore-Current
                    $script:Rounds = Get-Rounds
                    $script:CanShow = @($message.params.capabilities) -contains 'views'
                    Write-FocusdLog "ready ($($script:Minutes) min rounds)"
                    Show-Info
                }
            }
            'settings.changed' {
                $script:Minutes = [int]$message.params.settings.minutes
            }
            'command' {
                switch ($message.params.id) {
                    'start' { Start-Round '' }
                    'stop' { Stop-Round; Write-FocusdLog 'round stopped' }
                    'focus-todo' { Start-Round (Get-TodoTitle $message.params.args.todoId) }
                }
            }
            'view.visible' {
                $script:Visible = [bool]$message.params.visible
                $script:ShownView = $null
                Show-Island
            }
            'view.action' {
                switch ($message.params.actionId) {
                    'start' { Start-Round '' }
                    'stop' { Stop-Round; Write-FocusdLog 'round stopped' }
                }
                Show-Island
            }
            'notification.action' {
                if ($message.params.id -eq 'again') { Start-Round $script:LastLabel }
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
