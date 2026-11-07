# System monitor (API version 2): CPU, GPU, memory, network, battery and the busiest programs
# on a webview page (ui/), and up to four figures on the collapsed bar (status.update cells).
#
# It reads only while something shows the figures: every second while the page is open
# (programs every 3 s, the GPU every 2 s), every 2 s for the collapsed bar when some bar
# items are ticked, and not at all otherwise. Bar items keep the plugin running
# (host.keepAlive); without them it starts 10 s after the island and stops when idle.
#
# Sources, all readable without administrator rights: .NET performance counters (CPU, cores,
# memory), the network adapters' byte counts, Get-Process (programs), the ACPI thermal zones
# through WMI (CPU temperature; many desktops have none), Win32_Battery, and nvidia-smi
# (NVIDIA GPUs only). This file stays ASCII: Windows PowerShell reads it in the ANSI code page.
. "$PSScriptRoot\lib\focusd.ps1"

$script:Settings = @{}
$script:CanCells = $false
$script:Visible = $false
$script:Counters = $null
$script:LastNet = $null
$script:LastProcs = $null
$script:Gpu = $null
$script:GpuAt = [datetime]::MinValue
$script:Battery = $null
$script:BatteryAt = [datetime]::MinValue
$script:Thermal = $null
$script:ProcsAt = [datetime]::MinValue
$script:NextPage = [datetime]::MinValue
$script:NextBar = [datetime]::MinValue
$script:HasSmi = [bool](Get-Command nvidia-smi -ErrorAction SilentlyContinue)
$script:Degree = [string][char]0x00B0
$script:TotalMemory = [double](Get-CimInstance Win32_ComputerSystem -Property TotalPhysicalMemory).TotalPhysicalMemory

$BarKeys = @('barCpu', 'barMemory', 'barCpuTemperature', 'barGpuTemperature')

function Test-Setting([string]$Key) {
    $script:Settings.ContainsKey($Key) -and [bool]$script:Settings[$Key]
}

function Test-Bar {
    foreach ($key in $BarKeys) { if (Test-Setting $key) { return $true } }
    $false
}

function Read-Settings($Values) {
    $script:Settings = @{}
    if ($null -ne $Values) {
        foreach ($property in $Values.PSObject.Properties) { $script:Settings[$property.Name] = $property.Value }
    }
    if (Test-Bar) {
        Set-FocusdKeepAlive 'Shows system figures on the collapsed bar'
        $script:NextBar = [datetime]::MinValue
    } else {
        Set-FocusdKeepAlive $null
        Clear-FocusdStatus 'bar'
    }
}

# Performance counters take a few seconds to open the first time, so only when needed.
function Open-Counters {
    if ($null -ne $script:Counters) { return }
    $names = (New-Object Diagnostics.PerformanceCounterCategory('Processor')).GetInstanceNames() |
        Where-Object { $_ -match '^\d+$' } | Sort-Object { [int]$_ }
    $script:Counters = @{
        Total = New-Object Diagnostics.PerformanceCounter('Processor', '% Processor Time', '_Total')
        Cores = @($names | ForEach-Object { New-Object Diagnostics.PerformanceCounter('Processor', '% Processor Time', $_) })
        Available = New-Object Diagnostics.PerformanceCounter('Memory', 'Available Bytes')
    }
    # A rate counter's first value is always 0; this primes it for the next read.
    [void]$script:Counters.Total.NextValue()
    foreach ($core in $script:Counters.Cores) { [void]$core.NextValue() }
}

function Read-Cpu([bool]$WithCores) {
    $cpu = [math]::Round($script:Counters.Total.NextValue(), 1)
    $cores = @()
    if ($WithCores) { $cores = @($script:Counters.Cores | ForEach-Object { [math]::Round($_.NextValue()) }) }
    @{ cpu = $cpu; cores = $cores }
}

function Read-MemoryUsed {
    # 0.0, not 0: an int first argument makes PowerShell pick Max(Int32, Int32).
    [math]::Max(0.0, $script:TotalMemory - [double]$script:Counters.Available.NextValue())
}

# The hottest ACPI thermal zone in degrees Celsius, or $null (cached for 2 s).
function Read-CpuTemperature {
    if ($null -ne $script:Thermal -and ((Get-Date) - $script:Thermal.At).TotalMilliseconds -lt 1900) { return $script:Thermal.Value }
    $value = $null
    try {
        $zones = @(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -Property HighPrecisionTemperature -ErrorAction Stop)
        $hottest = ($zones | ForEach-Object { [double]$_.HighPrecisionTemperature } | Measure-Object -Maximum).Maximum
        if ($hottest -gt 0) { $value = [math]::Round($hottest / 10 - 273.15, 1) }
    } catch { }
    $script:Thermal = @{ At = Get-Date; Value = $value }
    $value
}

# The first NVIDIA GPU, at most every 2 s; $null without nvidia-smi.
function Read-Gpu {
    if (-not $script:HasSmi -or ((Get-Date) - $script:GpuAt).TotalMilliseconds -lt 1900) { return $script:Gpu }
    $script:GpuAt = Get-Date
    try {
        $line = @(& nvidia-smi '--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw' '--format=csv,noheader,nounits' 2>$null)[0]
        $parts = @($line -split ',\s*')
        $number = { param($text) $parsed = 0.0; if ([double]::TryParse($text, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) { $parsed } else { $null } }
        $script:Gpu = if ($parts.Count -ge 6) {
            @{ name = $parts[0]; usage = & $number $parts[1]; temperature = & $number $parts[2]; memoryUsed = & $number $parts[3]; memoryTotal = & $number $parts[4]; power = & $number $parts[5] }
        } else { $null }
    } catch {
        $script:Gpu = $null
    }
    $script:Gpu
}

# Bytes per second down and up across the adapters that are up.
function Read-Network {
    $received = 0L; $sent = 0L
    foreach ($nic in [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
        if ($nic.OperationalStatus -ne 'Up' -or $nic.NetworkInterfaceType -eq 'Loopback') { continue }
        try { $stats = $nic.GetIPStatistics(); $received += $stats.BytesReceived; $sent += $stats.BytesSent } catch { }
    }
    $now = Get-Date
    $rates = @{ down = 0; up = 0 }
    if ($null -ne $script:LastNet) {
        $seconds = [math]::Max(0.2, ($now - $script:LastNet.At).TotalSeconds)
        $rates.down = [math]::Max(0.0, [math]::Round(($received - $script:LastNet.Received) / $seconds))
        $rates.up = [math]::Max(0.0, [math]::Round(($sent - $script:LastNet.Sent) / $seconds))
    }
    $script:LastNet = @{ At = $now; Received = $received; Sent = $sent }
    $rates
}

function Read-Battery {
    if (((Get-Date) - $script:BatteryAt).TotalSeconds -lt 10) { return $script:Battery }
    $script:BatteryAt = Get-Date
    $battery = @(Get-CimInstance Win32_Battery -Property EstimatedChargeRemaining, BatteryStatus -ErrorAction SilentlyContinue)[0]
    # BatteryStatus 2 means on AC power; 6 to 9 are charging states.
    $script:Battery = if ($null -ne $battery) { @{ percent = [int]$battery.EstimatedChargeRemaining; charging = @(2, 6, 7, 8, 9) -contains [int]$battery.BatteryStatus } } else { $null }
    $script:Battery
}

# The five programs using the most CPU and the most memory, each program's processes added up.
# CPU is the share of the whole machine since the last scan; $null on the first scan.
function Read-Processes {
    $now = Get-Date
    $times = @{}
    $programs = @{}
    foreach ($process in Get-Process) {
        $name = $process.ProcessName
        if ($process.Id -eq 0 -or $name -eq 'Idle') { continue }
        $ms = 0.0
        try { $ms = $process.TotalProcessorTime.TotalMilliseconds } catch { }
        $times[$process.Id] = $ms
        if (-not $programs.ContainsKey($name)) { $programs[$name] = @{ name = $name; count = 0; cpuMs = 0.0; memory = 0L } }
        $entry = $programs[$name]
        $entry.count++
        $entry.memory += $process.WorkingSet64
        if ($null -ne $script:LastProcs -and $script:LastProcs.Times.ContainsKey($process.Id)) {
            $entry.cpuMs += [math]::Max(0.0, $ms - $script:LastProcs.Times[$process.Id])
        }
    }
    $first = $null -eq $script:LastProcs
    $span = if ($first) { 1 } else { [math]::Max(1, ($now - $script:LastProcs.At).TotalMilliseconds) * [Environment]::ProcessorCount }
    $script:LastProcs = @{ At = $now; Times = $times }
    if ($first) { return $null }
    $list = @($programs.Values | ForEach-Object {
        @{ name = $_.name; count = $_.count; cpu = [math]::Round($_.cpuMs / $span * 100, 1); memory = $_.memory }
    })
    @{
        byCpu = @($list | Sort-Object { $_.cpu } -Descending | Select-Object -First 5)
        byMemory = @($list | Sort-Object { $_.memory } -Descending | Select-Object -First 5)
    }
}

function Get-Tone([object]$Value, [double]$Warm, [double]$Hot) {
    if ($null -eq $Value) { return 'neutral' }
    if ($Value -ge $Hot) { return 'danger' }
    if ($Value -ge $Warm) { return 'warning' }
    'neutral'
}

function Send-Bar {
    $cpu = $null; $memory = $null; $cpuTemperature = $null; $gpuTemperature = $null
    if ((Test-Setting 'barCpu') -or (Test-Setting 'barMemory')) {
        if (Test-Setting 'barCpu') { $cpu = (Read-Cpu $false).cpu }
        if (Test-Setting 'barMemory') { $memory = [math]::Round((Read-MemoryUsed) / $script:TotalMemory * 100) }
    }
    if (Test-Setting 'barCpuTemperature') { $cpuTemperature = Read-CpuTemperature }
    if (Test-Setting 'barGpuTemperature') { $gpu = Read-Gpu; if ($null -ne $gpu) { $gpuTemperature = $gpu.temperature } }
    $degrees = { param($value) if ($null -eq $value) { '-' } else { "$([math]::Round($value))$script:Degree" } }
    $cells = @()
    if (Test-Setting 'barCpu') { $cells += @{ label = 'CPU'; value = "$([math]::Round($cpu))%"; tone = Get-Tone $cpu 70 90 } }
    if (Test-Setting 'barMemory') { $cells += @{ label = 'RAM'; value = "$memory%"; tone = Get-Tone $memory 80 92 } }
    if (Test-Setting 'barCpuTemperature') { $cells += @{ label = 'CPU'; value = & $degrees $cpuTemperature; tone = Get-Tone $cpuTemperature 75 90 } }
    if (Test-Setting 'barGpuTemperature') { $cells += @{ label = 'GPU'; value = & $degrees $gpuTemperature; tone = Get-Tone $gpuTemperature 75 87 } }
    $text = (@($cells | ForEach-Object { "$($_.label) $($_.value)" }) -join ' ')
    if ($text.Length -gt 24) { $text = $text.Substring(0, 24).TrimEnd() }
    $worst = 'neutral'
    foreach ($cell in $cells) { if ($cell.tone -eq 'danger' -or ($cell.tone -eq 'warning' -and $worst -eq 'neutral')) { $worst = $cell.tone } }
    if ($script:CanCells) { Update-FocusdStatus 'bar' $text -Cells $cells }
    else { Update-FocusdStatus 'bar' $text -Tone $worst }
}

function Send-Page {
    $now = Get-Date
    $cpu = Read-Cpu $true
    $sample = @{
        type = 'sample'
        cpu = $cpu.cpu
        cores = $cpu.cores
        memoryUsed = Read-MemoryUsed
        memoryTotal = $script:TotalMemory
        cpuTemperature = Read-CpuTemperature
        gpu = Read-Gpu
        battery = Read-Battery
    }
    $network = Read-Network
    $sample.download = $network.down
    $sample.upload = $network.up
    if (($now - $script:ProcsAt).TotalMilliseconds -ge 2900) {
        $script:ProcsAt = $now
        $processes = Read-Processes
        if ($null -ne $processes) { $sample.processes = $processes }
    }
    if (-not (Send-FocusdWebviewMessage 'monitor' $sample)) { $script:Visible = $false }
}

function Invoke-Due {
    $now = Get-Date
    if ($script:Visible -and $now -ge $script:NextPage) {
        $script:NextPage = $now.AddMilliseconds(1000)
        Open-Counters
        Send-Page
    }
    if ((Test-Bar) -and $now -ge $script:NextBar) {
        $script:NextBar = $now.AddMilliseconds(2000)
        Open-Counters
        Send-Bar
    }
}

function Get-WaitMs {
    $due = @()
    if ($script:Visible) { $due += $script:NextPage }
    if (Test-Bar) { $due += $script:NextBar }
    if ($due.Count -eq 0) { return 60000 }
    $next = ($due | Measure-Object -Minimum).Minimum
    [int][math]::Min(60000, [math]::Max(10, ($next - (Get-Date)).TotalMilliseconds))
}

while ($true) {
    $message = Receive-FocusdNotification (Get-WaitMs)
    try {
        if ($null -ne $message) {
            switch ($message.method) {
                'initialize' {
                    $script:CanCells = @($message.params.capabilities) -contains 'statusCells'
                    if (-not (@($message.params.capabilities) -contains 'webview')) {
                        Write-FocusdLog 'this FocuSD Island is too old for this plugin (needs webview pages)'
                    }
                    Read-Settings $message.params.settings
                }
                'settings.changed' { Read-Settings $message.params.settings }
                'view.visible' {
                    $script:Visible = [bool]$message.params.visible
                    if (-not $script:Visible) { $script:LastNet = $null; $script:LastProcs = $null; $script:ProcsAt = [datetime]::MinValue }
                }
                'webview.message' {
                    # The page sends { type: "ready" } once it has loaded; answer at once.
                    if ($message.params.message.type -eq 'ready') { $script:Visible = $true; $script:NextPage = [datetime]::MinValue }
                }
                'shutdown' { exit 0 }
            }
        }
        Invoke-Due
    } catch {
        # Keep running: one failed read should not make the island restart the plugin.
        Write-FocusdLog "error: $($_.Exception.Message)"
    }
}
