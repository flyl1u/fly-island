# Example plugin (API version 2): shows the new song on the island when the
# track changes. media:read is a sensitive permission, so the first call that
# uses it (here the media.changed subscription) waits until the user answers
# on the island; a refusal comes back as an error and is logged.
. "$PSScriptRoot\lib\focusd.ps1"

# Windows PowerShell 5.1 reads a script without a BOM as ANSI, so this file stays
# ASCII and writes Chinese text as \u escapes.
function Text([string]$Escaped) { [regex]::Unescape($Escaped) }

function Show-Playing($now) {
    if ($null -eq $now -or -not $now.title) {
        Write-FocusdLog 'nothing is playing'
        return
    }
    $body = [string]$now.title
    if ($now.artist) { $body = "$body - $($now.artist)" }
    $answer = Invoke-FocusdMethod 'island.notify' @{ title = "Now playing / $(Text '\u6b63\u5728\u64ad\u653e')"; body = $body; durationMs = 6000 }
    if ($answer.muted) { Write-FocusdLog "now playing: $body (messages are muted)" }
}

function Watch-Media {
    try {
        [void](Invoke-FocusdMethod 'events.subscribe' @{ events = @('media.changed') })
        Write-FocusdLog 'watching the player'
    } catch {
        Write-FocusdLog "not allowed to see the player: $($_.Exception.Message)"
    }
}

while ($true) {
    $message = Receive-FocusdNotification 60000
    if ($null -eq $message) {
        continue
    }
    try {
        switch ($message.method) {
            'initialize' {
                if (@($message.params.capabilities) -notcontains 'events') {
                    Write-FocusdLog 'this FocuSD Island is too old for this plugin (needs plugin API version 2)'
                } else {
                    Watch-Media
                }
            }
            'event' {
                if ($message.params.name -eq 'media.changed' -and $message.params.payload.status -eq 'playing') {
                    Show-Playing $message.params.payload
                }
            }
            'command' {
                if ($message.params.id -eq 'show') {
                    Show-Playing (Invoke-FocusdMethod 'media.nowPlaying')
                }
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
