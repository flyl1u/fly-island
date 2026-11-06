# FlyIsland.Plugin: helpers for FocuSD Island plugins written for Windows
# PowerShell 5.1, which every Windows 10/11 has, so plugins built on it need
# nothing installed. Protocol reference: docs/plugins/README.md in the
# FocuSD Island repository. Never write other text to stdout; use
# Write-FocusdLog (or stderr) for logs. Keep this file ASCII: PowerShell 5.1
# reads files without a BOM as ANSI.

$ErrorActionPreference = 'Stop'
$focusdUtf8 = New-Object System.Text.UTF8Encoding $false
# Set before [Console]::In is first used, so todo titles in any language survive.
[Console]::InputEncoding = $focusdUtf8
[Console]::OutputEncoding = $focusdUtf8
$script:FocusdNextId = 0
$script:FocusdQueue = New-Object System.Collections.Queue
$script:FocusdPendingLine = $null

function Send-FocusdMessage([hashtable]$Message) {
    $Message['jsonrpc'] = '2.0'
    [Console]::Out.WriteLine(($Message | ConvertTo-Json -Compress -Depth 20))
    [Console]::Out.Flush()
}

function Write-FocusdLog([string]$Text) {
    Send-FocusdMessage @{ method = 'log'; params = @{ message = $Text } }
}

# The next line from the island, or $null when none arrives within TimeoutMs.
# Exits when stdin closes: that is the island stopping the plugin.
function Read-FocusdLine([int]$TimeoutMs) {
    if ($null -eq $script:FocusdPendingLine) {
        $script:FocusdPendingLine = [Console]::In.ReadLineAsync()
    }
    if (-not $script:FocusdPendingLine.Wait($TimeoutMs)) {
        return $null
    }
    $line = $script:FocusdPendingLine.Result
    $script:FocusdPendingLine = $null
    if ($null -eq $line) {
        exit 0
    }
    return $line
}

# Calls a host method (todos.list, note.set, ...) and returns its result; throws
# the host's error message. Notifications that arrive meanwhile are kept for
# Receive-FocusdNotification.
function Invoke-FocusdMethod([string]$Method, $Params = $null) {
    $script:FocusdNextId++
    $id = $script:FocusdNextId
    $message = @{ id = $id; method = $Method }
    if ($null -ne $Params) {
        $message['params'] = $Params
    }
    Send-FocusdMessage $message
    while ($true) {
        # Up to 40 s: the first use of a sensitive permission waits up to 30 s for the user.
        $line = Read-FocusdLine 40000
        if ($null -eq $line) {
            throw "No answer to $Method."
        }
        $reply = $line | ConvertFrom-Json
        $names = $reply.PSObject.Properties.Name
        if ($reply.id -eq $id -and ($names -contains 'result' -or $names -contains 'error')) {
            if ($names -contains 'error') {
                throw $reply.error.message
            }
            return $reply.result
        }
        $script:FocusdQueue.Enqueue($reply)
    }
}

# The next notification from the island (initialize, command, event, shutdown,
# ...), or $null when none arrives within TimeoutMs.
function Receive-FocusdNotification([int]$TimeoutMs) {
    if ($script:FocusdQueue.Count -gt 0) {
        return $script:FocusdQueue.Dequeue()
    }
    $line = Read-FocusdLine $TimeoutMs
    if ($null -eq $line) {
        return $null
    }
    return $line | ConvertFrom-Json
}

# Runs the plugin: calls $Handlers[<method>] with the notification's params for
# each notification (initialize, command, event, view.visible, ...) and $OnIdle
# when nothing arrived within TimeoutMs. An error in a handler is logged and the
# loop goes on. Returns on shutdown, after the 'shutdown' handler if there is one.
function Invoke-FocusdLoop([hashtable]$Handlers, [int]$TimeoutMs = 5000, [scriptblock]$OnIdle = $null) {
    while ($true) {
        $message = Receive-FocusdNotification $TimeoutMs
        try {
            if ($null -eq $message) {
                if ($null -ne $OnIdle) { & $OnIdle }
                continue
            }
            $method = [string]$message.method
            if ($Handlers.ContainsKey($method)) { & $Handlers[$method] $message.params }
            if ($method -eq 'shutdown') { return }
        } catch {
            # One failed call should not make the island restart the plugin.
            Write-FocusdLog "error: $($_.Exception.Message)"
        }
    }
}

# A text in both languages, for view models and messages.
function New-FocusdText([string]$ZhCN, [string]$En) {
    return @{ 'zh-CN' = $ZhCN; en = $En }
}

# Turns backslash-u escapes (a backslash, u and four hex digits per character)
# into text, so a script file can stay ASCII and still show Chinese text.
function ConvertFrom-FocusdEscape([string]$Escaped) {
    return [regex]::Unescape($Escaped)
}

# API version 2 from here on.

function Register-FocusdEvent([string[]]$Events) {
    return (Invoke-FocusdMethod 'events.subscribe' @{ events = @($Events) }).events
}

function Unregister-FocusdEvent([string[]]$Events) {
    return (Invoke-FocusdMethod 'events.unsubscribe' @{ events = @($Events) }).events
}

# Shows a message on the island (permission island:notify). Actions are
# @(@{ id = 'again'; title = 'Again' }); a click sends notification.action { id }.
# Returns $true when the user muted the plugin's messages.
function Show-FocusdNotification([string]$Title, [string]$Body = $null, [object[]]$Actions = $null, [int]$DurationMs = 0) {
    $params = @{ title = $Title }
    if ($Body) { $params.body = $Body }
    if ($null -ne $Actions -and $Actions.Count -gt 0) { $params.actions = @($Actions) }
    if ($DurationMs -gt 0) { $params.durationMs = $DurationMs }
    return [bool](Invoke-FocusdMethod 'island.notify' $params).muted
}

# Asks the user for optional permissions (manifest optionalPermissions), e.g.
# Request-FocusdPermission 'clipboard:read'. Returns @{ granted = @(...); denied = @(...) }.
function Request-FocusdPermission([string[]]$Permissions) {
    $answer = Invoke-FocusdMethod 'permissions.request' @{ permissions = @($Permissions) }
    return @{ granted = @($answer.granted); denied = @($answer.denied) }
}

# Replaces the model of one of the plugin's contributes.views.
function Update-FocusdView([string]$ViewId, [hashtable]$Model) {
    [void](Invoke-FocusdMethod 'view.update' @{ viewId = $ViewId; model = $Model })
}

# Changes a list page: -Items replaces items by id, -Remove deletes ids, and
# -Add inserts entries like @{ item = @{ id = 'x'; title = 'X' }; before = 'b' }
# (or group = 0 for the end of a group; neither: the end of the list).
# Returns the ids that were not found.
function Update-FocusdViewItems([string]$ViewId, [object[]]$Items = $null, [string[]]$Remove = $null, [object[]]$Add = $null) {
    $params = @{ viewId = $ViewId }
    if ($null -ne $Items -and $Items.Count -gt 0) { $params.items = @($Items) }
    if ($null -ne $Remove -and $Remove.Count -gt 0) { $params.remove = @($Remove) }
    if ($null -ne $Add -and $Add.Count -gt 0) { $params.add = @($Add) }
    return @((Invoke-FocusdMethod 'view.patch' $params).missing)
}

# Sends a message to one of the plugin's webview pages (template "webview").
# Returns $true when the page is on screen; a closed page drops the message.
function Send-FocusdWebviewMessage([string]$ViewId, $Message) {
    [bool](Invoke-FocusdMethod 'webview.postMessage' @{ viewId = $ViewId; message = $Message }).shown
}

# Sets the collapsed-bar text (max 24 characters) of one of the plugin's statusItems.
function Update-FocusdStatus([string]$ItemId, [string]$Text, [string]$Tooltip = $null, [string]$Tone = $null) {
    $params = @{ itemId = $ItemId; text = $Text }
    if ($Tooltip) { $params.tooltip = $Tooltip }
    if ($Tone) { $params.tone = $Tone }
    [void](Invoke-FocusdMethod 'status.update' $params)
}

function Clear-FocusdStatus([string]$ItemId) {
    [void](Invoke-FocusdMethod 'status.update' @{ itemId = $ItemId; text = '' })
}

function Get-FocusdStorage([string]$Key) {
    return (Invoke-FocusdMethod 'storage.get' @{ key = $Key }).value
}

function Set-FocusdStorage([string]$Key, $Value) {
    [void](Invoke-FocusdMethod 'storage.set' @{ key = $Key; value = $Value })
}

function Remove-FocusdStorage([string]$Key) {
    return [bool](Invoke-FocusdMethod 'storage.delete' @{ key = $Key }).deleted
}

# Secrets live in the Windows Credential Manager (permission secrets).
function Get-FocusdSecret([string]$Key) {
    return (Invoke-FocusdMethod 'secrets.get' @{ key = $Key }).value
}

function Set-FocusdSecret([string]$Key, [string]$Value) {
    [void](Invoke-FocusdMethod 'secrets.set' @{ key = $Key; value = $Value })
}

function Remove-FocusdSecret([string]$Key) {
    return [bool](Invoke-FocusdMethod 'secrets.delete' @{ key = $Key }).deleted
}

# Keeps an on-demand plugin running, with a reason shown on its page; no reason
# lets it stop again after 60 s with nothing to do.
function Set-FocusdKeepAlive([string]$Reason = $null) {
    $value = $null
    if ($Reason) { $value = $Reason }
    [void](Invoke-FocusdMethod 'host.keepAlive' @{ reason = $value })
}

# Changes some of the plugin's declared settings (all or none), e.g.
# @{ account = 'me@example.com' }; the settings page shows them.
function Set-FocusdSetting([hashtable]$Values) {
    [void](Invoke-FocusdMethod 'settings.set' @{ values = $Values })
}

# Opens one of the plugin's pages on the island. Works only right after the
# user used the plugin (a command, a message button, a link or its page).
function Open-FocusdView([string]$ViewId) {
    [void](Invoke-FocusdMethod 'island.openView' @{ viewId = $ViewId })
}

Export-ModuleMember -Function *-Focusd*
