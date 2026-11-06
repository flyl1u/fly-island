# The dev task board (roadmap F10): the tasks in docs/tasks of the fly-island
# repo on an island page, from `node scripts/tasks/tasks.mjs --json`, so the
# board, stale claims and handoffs are worked out in one place (tasks.mjs).
# The collapsed bar shows how many tasks wait for the user. Installed by
# `pnpm tasks:plugin`, which copies lib/focusd.ps1 next to this file and records
# the repo folder in repo.txt.
. "$PSScriptRoot\lib\focusd.ps1"

# Windows PowerShell 5.1 reads a script without a BOM as ANSI, so this file stays
# ASCII and writes Chinese text as \u escapes.
function Text([string]$Escaped) { [regex]::Unescape($Escaped) }
function Both([string]$Zh, [string]$En) { @{ 'zh-CN' = (Text $Zh); en = $En } }

$script:Repo = ''
$script:Minutes = 2
$script:Visible = $false
$script:FetchedAt = [DateTime]::MinValue
$script:Tasks = @()
$script:LoadError = $null
$script:CanShow = $false
$script:ShownStatus = $null

function Read-Settings($settings) {
    $repo = ([string]$settings.repo).Trim()
    if (-not $repo) {
        $recorded = Join-Path $PSScriptRoot 'repo.txt'
        if (Test-Path $recorded) { $repo = (Get-Content $recorded -Raw).Trim() }
    }
    $script:Repo = $repo
    $script:Minutes = [Math]::Max(1, [int]$settings.minutes)
}

function Get-Field($task, [string]$Name) { [string]$task.$Name }

function New-Item-Row($task) {
    $parts = @()
    if (Get-Field $task 'owner') { $parts += Get-Field $task 'owner' }
    if (Get-Field $task 'lane') { $parts += "lane $(Get-Field $task 'lane')" }
    if (Get-Field $task 'claimed') { $parts += Get-Field $task 'claimed' }
    if ($task.stale) { $parts += "! $($task.stale)" }
    $row = @{
        id = "task-$(Get-Field $task 'id')"
        title = "$(Get-Field $task 'id')  $(Get-Field $task 'title')"
        action = 'open'
    }
    if ($parts.Count -gt 0) { $row.subtitle = $parts -join ' - ' }
    if ($task.handoff) { $row.note = (Text '\u6709\u4ea4\u63a5') }
    $row
}

function Send-Model([bool]$Loading = $false) {
    $waiting = @($script:Tasks | Where-Object { $_.status -eq (Text '\u5f85\u7528\u6237\u786e\u8ba4') })
    $stale = @($script:Tasks | Where-Object { $_.stale })
    $active = @($script:Tasks | Where-Object { $_.status -eq (Text '\u8fdb\u884c\u4e2d') -and -not $_.stale })
    $todo = @($script:Tasks | Where-Object { $_.status -eq (Text '\u5f85\u505a') })

    $status = if ($waiting.Count -gt 0) { "$(Text '\u5f85\u786e\u8ba4') $($waiting.Count)" } else { '' }
    if ($status -ne $script:ShownStatus) {
        $script:ShownStatus = $status
        [void](Invoke-FocusdMethod 'status.update' @{ itemId = 'waiting'; text = $status; tone = 'warning'; tooltip = (Text '\u6709\u4efb\u52a1\u7b49\u4f60\u786e\u8ba4') })
    }
    if (-not $script:CanShow -or -not $script:Visible) { return }

    $groups = @()
    foreach ($group in @(
        @{ title = (Text '\u7b49\u4f60\u786e\u8ba4'); list = $waiting },
        @{ title = (Text '\u8ba4\u9886\u5df2\u5931\u6548'); list = $stale },
        @{ title = (Text '\u8fdb\u884c\u4e2d'); list = $active },
        @{ title = (Text '\u5f85\u505a'); list = $todo }
    )) {
        if ($group.list.Count -gt 0) {
            $groups += @{ title = "$($group.title) $($group.list.Count)"; items = @($group.list | ForEach-Object { New-Item-Row $_ }) }
        }
    }
    $model = @{
        search = @{ placeholder = (Both '\u7b5b\u9009\u4efb\u52a1' 'Filter tasks') }
        groups = $groups
        empty = (Both '\u6ca1\u6709\u672a\u5b8c\u6210\u7684\u4efb\u52a1' 'No open tasks')
        loading = $Loading
    }
    if ($script:LoadError) { $model.error = $script:LoadError }
    [void](Invoke-FocusdMethod 'view.update' @{ viewId = 'tasks'; model = $model })
}

function Update-Tasks {
    $script:FetchedAt = [DateTime]::UtcNow
    $cli = Join-Path $script:Repo 'scripts\tasks\tasks.mjs'
    if (-not $script:Repo -or -not (Test-Path $cli)) {
        $script:Tasks = @()
        $script:LoadError = Both '\u5728\u63d2\u4ef6\u8bbe\u7f6e\u91cc\u586b fly-island \u4ed3\u5e93\u76ee\u5f55' 'Set the fly-island repository folder in the settings.'
        Send-Model
        return
    }
    try {
        Push-Location $script:Repo
        try { $json = & node $cli --json 2>$null | Out-String } finally { Pop-Location }
        if ($LASTEXITCODE -ne 0) { throw "tasks.mjs exited with $LASTEXITCODE" }
        $script:Tasks = @(($json | ConvertFrom-Json) | ForEach-Object { $_ })
        $script:LoadError = $null
    } catch {
        $reason = $_.Exception.Message
        $script:LoadError = @{ 'zh-CN' = "$(Text '\u8bfb\u53d6\u5931\u8d25\uff1a')$reason"; en = "Could not read the tasks: $reason" }
        Write-FocusdLog "read failed: $reason"
    }
    Send-Model
}

function Test-Stale { ([DateTime]::UtcNow - $script:FetchedAt).TotalMinutes -ge $script:Minutes }

while ($true) {
    $message = Receive-FocusdNotification 5000
    try {
        # The collapsed bar's count stays current while the page is closed too.
        if ($null -eq $message) {
            if (Test-Stale) { Update-Tasks }
            continue
        }
        switch ($message.method) {
            'initialize' {
                Read-Settings $message.params.settings
                $script:CanShow = @($message.params.capabilities) -contains 'views'
                Update-Tasks
            }
            'settings.changed' {
                Read-Settings $message.params.settings
                Update-Tasks
            }
            'view.visible' {
                $script:Visible = [bool]$message.params.visible
                if ($script:Visible) { Update-Tasks }
            }
            'view.action' {
                $id = ([string]$message.params.itemId) -replace '^task-', ''
                $file = Join-Path $script:Repo "docs\tasks\$id.md"
                if ($id -match '^[A-Za-z0-9.]+$' -and (Test-Path $file)) { Invoke-Item $file }
            }
            'command' {
                if ($message.params.id -eq 'refresh') { Update-Tasks }
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
