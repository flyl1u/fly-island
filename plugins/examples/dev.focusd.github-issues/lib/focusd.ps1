# FocuSD Island plugin helpers for Windows PowerShell 5.1, which every Windows
# 10/11 has, so plugins built on it need nothing installed. Dot-source it:
#   . "$PSScriptRoot\lib\focusd.ps1"
# Protocol reference: docs/plugins/README.md. Never write other text to stdout;
# use Write-FocusdLog (or stderr) for logs.

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
        $line = Read-FocusdLine 10000
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

# The next notification from the island (initialize, command, shutdown), or
# $null when none arrives within TimeoutMs.
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
