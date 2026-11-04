# Example plugin: logs how many todos are open, and on request writes a short
# digest of them into the daily note. Runs on the Windows PowerShell that ships
# with Windows, so users install nothing.
. "$PSScriptRoot\lib\focusd.ps1"

$logEvery = [TimeSpan]::FromMinutes(30)
$nextLog = [DateTime]::MaxValue

# PowerShell unrolls a returned array, so callers wrap the result in @().
function Get-OpenTodos {
    (Invoke-FocusdMethod 'todos.list').todos | Where-Object { -not $_.completed }
}

function Write-OpenCount {
    Write-FocusdLog "$(@(Get-OpenTodos).Count) open todos"
    $script:nextLog = [DateTime]::Now + $logEvery
}

while ($true) {
    $message = Receive-FocusdNotification 1000
    try {
        if ($null -eq $message) {
            if ([DateTime]::Now -ge $nextLog) {
                Write-OpenCount
            }
            continue
        }
        switch ($message.method) {
            'initialize' {
                $permissions = @($message.params.permissions) -join ', '
                Write-FocusdLog "ready (FocuSD $($message.params.appVersion); permissions: $permissions)"
                Write-OpenCount
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
