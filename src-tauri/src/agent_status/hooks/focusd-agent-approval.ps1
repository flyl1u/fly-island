# Codex PermissionRequest hook: Codex has no HTTP hooks, so this forwards the hook input to
# FocuSD Island's approval endpoint (src-tauri/src/agent_approval) and prints its answer, which is
# already in the format Codex reads. The endpoint's address and token are read from
# agent-approval.json next to this script on every run, so a changed port needs no reinstall.
# It prints nothing, and Codex asks in the terminal as usual, when the island is not running,
# approving on the island is off, the request was handed back ({}), or anything fails.
$ErrorActionPreference = 'Stop'
try {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $body = (New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8)).ReadToEnd()
    $config = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'agent-approval.json') | ConvertFrom-Json
    $port = [int]$config.port

    # Windows takes about 2 s to give up on a refused local connection; a running island accepts
    # at once, so a short probe keeps Codex from waiting while the island is closed.
    $probe = New-Object System.Net.Sockets.TcpClient
    $connected = $probe.ConnectAsync('127.0.0.1', $port).Wait(300)
    $probe.Close()
    if (-not $connected) { exit 0 }

    # The endpoint reads the whole request at once; no 100-continue round trip.
    [System.Net.ServicePointManager]::Expect100Continue = $false
    $request = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$port/codex/permission-request")
    $request.Method = 'POST'
    $request.Proxy = $null
    $request.ContentType = 'application/json'
    $request.Headers.Add('Authorization', "Bearer $($config.token)")
    # The endpoint hands a request back after 120 s; the hook itself is allowed 150 s.
    $request.Timeout = 140000
    $request.ReadWriteTimeout = 140000
    $bytes = $utf8.GetBytes($body)
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()

    $response = $request.GetResponse()
    $answer = (New-Object System.IO.StreamReader($response.GetResponseStream(), $utf8)).ReadToEnd().Trim()
    $response.Close()
    if ($answer -and $answer -ne '{}') {
        $out = [Console]::OpenStandardOutput()
        $data = $utf8.GetBytes($answer)
        $out.Write($data, 0, $data.Length)
        $out.Flush()
    }
} catch {
    # No decision: Codex shows its own prompt.
}
exit 0
