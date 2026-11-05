# Example plugin (API version 2): a webview page (the plugin's own HTML in
# ui/) with a ring showing how many of today's todos are done. The page cannot
# read todos or go online; it asks this process, which reads them with the
# todos:read permission and sends the counts back. Counts are sent when the
# page says it is ready, and again whenever todos change while it is open.
. "$PSScriptRoot\lib\focusd.ps1"

$script:Visible = $false

function Send-Counts {
    $todos = @((Invoke-FocusdMethod 'todos.list').todos)
    $done = @($todos | Where-Object { $_.completed }).Count
    [void](Send-FocusdWebviewMessage 'ring' @{ type = 'counts'; done = $done; total = $todos.Count })
}

while ($true) {
    $message = Receive-FocusdNotification 60000
    if ($null -eq $message) {
        continue
    }
    try {
        switch ($message.method) {
            'initialize' {
                if (-not (@($message.params.capabilities) -contains 'webview')) {
                    Write-FocusdLog 'this FocuSD Island is too old for this plugin (needs webview pages)'
                }
                [void](Invoke-FocusdMethod 'events.subscribe' @{ events = @('todos.changed') })
            }
            'view.visible' {
                $script:Visible = [bool]$message.params.visible
            }
            'webview.message' {
                # The page sends { type: "ready" } when it loads and { type: "refresh" } from its button.
                if (@('ready', 'refresh') -contains $message.params.message.type) { Send-Counts }
            }
            'event' {
                if ($message.params.name -eq 'todos.changed' -and $script:Visible) { Send-Counts }
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
