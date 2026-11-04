# Example plugin: logs how many todos are open whenever they change, and on
# request writes a short digest of them into the daily note. Runs on the Windows
# PowerShell that ships with Windows, so users install nothing.
. "$PSScriptRoot\lib\focusd.ps1"

# PowerShell unrolls a returned array, so callers wrap the result in @().
function Get-OpenTodos {
    (Invoke-FocusdMethod 'todos.list').todos | Where-Object { -not $_.completed }
}

function Write-OpenCount {
    Write-FocusdLog "$(@(Get-OpenTodos).Count) open todos"
}

while ($true) {
    # No timer work any more: the island tells us when todos change.
    $message = Receive-FocusdNotification 60000
    if ($null -eq $message) {
        continue
    }
    try {
        switch ($message.method) {
            'initialize' {
                $permissions = @($message.params.permissions) -join ', '
                Write-FocusdLog "ready (FocuSD $($message.params.appVersion); permissions: $permissions)"
                if (@($message.params.capabilities) -contains 'events') {
                    [void](Invoke-FocusdMethod 'events.subscribe' @{ events = @('todos.changed') })
                }
                Write-OpenCount
            }
            'event' {
                if ($message.params.name -eq 'todos.changed') {
                    Write-OpenCount
                }
            }
            'command' {
                if ($message.params.id -eq 'write-digest') {
                    $open = @(Get-OpenTodos)
                    $lines = @("[$(Get-Date -Format 'HH:mm')] open todos: $($open.Count)")
                    if ($open.Count -eq 0) {
                        $lines += 'all done'
                    } else {
                        $lines += $open | ForEach-Object { "- $($_.title)" }
                    }
                    [void](Invoke-FocusdMethod 'note.set' @{ append = ($lines -join "`n") })
                    Write-FocusdLog "digest written ($($open.Count) open)"
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
