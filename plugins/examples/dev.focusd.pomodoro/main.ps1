# Example plugin (API version 2): a pomodoro timer. Start it with the command's
# shortcut (Ctrl+Alt+P), the plugin page or the todo right-click menu; when the
# round ends it shows an island.notify message with a "one more round" button.
# The running round and today's finished rounds live in plugin storage, so they
# survive a restart of the plugin or the island.
. "$PSScriptRoot\lib\focusd.ps1"

$script:Minutes = 25
$script:EndsAt = $null      # UTC DateTime of the running round, or $null
$script:Label = ''
$script:LastLabel = ''   # label of the round that just ended, for "one more"
$script:ShownInfo = $null

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
