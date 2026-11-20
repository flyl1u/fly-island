"""Bluetooth devices whose battery level Windows itself knows
(the ones shown in Settings > Bluetooth & devices).

Battery:  DEVPKEY_Bluetooth_Battery {104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2 (PnP)
Link:     WinRT BluetoothDevice.ConnectionStatus (BluetoothLEDevice for LE),
          queried directly by MAC address: the same source Windows Settings uses.
          Fallback when WinRT is unavailable: the undocumented PnP key
          {83DA6326-97A6-4088-9453-A1923F573B29} 15 (in practice it flickers:
          some headsets report False while playing audio).

One physical device is several PnP nodes in Windows: the root node
(BTHENUM\\DEV_<MAC>, BTHLE\\DEV_<MAC>) and service nodes. Nodes of one device
are matched by the MAC address found in every node's instance id.
Everything is fetched with a SINGLE PowerShell call.
Windows 10/11 only; on by default (toggle in the tray menu).
"""
from __future__ import annotations

import json
import queue
import os
import re
import subprocess
import sys
import threading
import time
from typing import Callable, Dict, List, Optional

from .base import DeviceStatus, Provider, log

K_BAT = "{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2"
K_CONN = "{83DA6326-97A6-4088-9453-A1923F573B29} 15"

PS_COMMON = r"""
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# --- WinRT setup: reliable "connected right now", same as Windows Settings ---
# A direct query by MAC (FromBluetoothAddressAsync) does not scan the air, so it
# is fast. Enumerating with FindAllAsync triggered a scan and exceeded 15 s.
$script:winrtErr = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $script:asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  $script:tClassic = [Windows.Devices.Bluetooth.BluetoothDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime]
  $script:tLE = [Windows.Devices.Bluetooth.BluetoothLEDevice, Windows.Devices.Bluetooth, ContentType = WindowsRuntime]
} catch { $script:winrtErr = "$_" }

function Get-BtConn($roots) {
  $out = @()
  if ($script:winrtErr) { return $out }
  foreach ($r in $roots) {
    $conn = $null; $err = $null; $cls = $null
    try {
      $addr = [Convert]::ToUInt64($r.mac, 16)
      if ($r.le) { $t = $script:tLE; $op = [Windows.Devices.Bluetooth.BluetoothLEDevice]::FromBluetoothAddressAsync($addr) }
      else       { $t = $script:tClassic; $op = [Windows.Devices.Bluetooth.BluetoothDevice]::FromBluetoothAddressAsync($addr) }
      $task = $script:asTask.MakeGenericMethod($t).Invoke($null, @($op))
      if ($task.Wait(3000)) {
        $d = $task.Result
        if ($d) {
          $conn = ("$($d.ConnectionStatus)" -eq 'Connected')
          # device type: Class of Device (classic) or Appearance (LE)
          try { if ($r.le) { $cls = [int]$d.Appearance.RawValue } else { $cls = [int]$d.ClassOfDevice.RawValue } } catch { }
          $d.Dispose()
        }
      } else { $err = 'timeout' }
    } catch { $err = "$_" }
    $out += [pscustomobject]@{ addr = $r.mac; conn = $conn; le = $r.le; err = $err; cls = $cls }
  }
  return $out
}

function Get-BtSnapshot {
  # --- PnP: battery level (and the fallback connection flag) ---
  $devs = @(Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '^(BTHENUM|BTHLE|BTHLEDEVICE)\\' })
  $props = @()
  if ($devs.Count -gt 0) {
    $props = @(Get-PnpDeviceProperty -InstanceId $devs.InstanceId -KeyName '%BAT%', '%CONN%' |
               Where-Object { $_.Data -ne $null } |
               ForEach-Object { [pscustomobject]@{ id = $_.InstanceId; key = $_.KeyName; data = $_.Data } })
  }
  $list = @($devs | ForEach-Object { [pscustomobject]@{ id = $_.InstanceId; name = $_.FriendlyName; status = "$($_.Status)" } })
  $roots = @($devs | Where-Object { $_.InstanceId -match '^(BTHENUM|BTHLE)\\DEV_([0-9A-F]{12})' } |
             ForEach-Object { $null = $_.InstanceId -match '^(BTHENUM|BTHLE)\\DEV_([0-9A-F]{12})'
                              [pscustomobject]@{ le = ($Matches[1] -eq 'BTHLE'); mac = $Matches[2] } })
  $aep = @(Get-BtConn $roots)
  return [pscustomobject]@{ devs = $list; props = $props; aep = $aep; aep_error = $script:winrtErr; roots = $roots }
}

function Get-ConnKey($aep) { return (@($aep | ForEach-Object { "$($_.addr)=$($_.conn)" }) -join ',') }
""".replace("%BAT%", K_BAT).replace("%CONN%", K_CONN)

# one-shot query (fallback and diagnostics)
PS_SCRIPT = PS_COMMON + r"""
ConvertTo-Json -InputObject (Get-BtSnapshot) -Compress -Depth 4
"""

# Long-running watcher: checks only the WinRT connection state every 2 s (no
# PowerShell start-up, no device scan), and takes a full snapshot with battery
# levels right after a device connects or disconnects (then again at +3, +8 and
# +15 s, because Windows reports the battery a little after connecting) and
# once a minute. Each snapshot is printed as one JSON line. The script exits by
# itself when the app's process is gone.
WATCH_SCRIPT = PS_COMMON + r"""
$parent = %PPID%
function Emit($snap) { [Console]::Out.WriteLine((ConvertTo-Json -InputObject $snap -Compress -Depth 4)); [Console]::Out.Flush() }
$queue = New-Object 'System.Collections.Generic.List[datetime]'
$snap = Get-BtSnapshot; Emit $snap
$roots = $snap.roots; $prev = Get-ConnKey $snap.aep; $nextFull = (Get-Date).AddSeconds(60)
while ($true) {
  try { $null = [System.Diagnostics.Process]::GetProcessById($parent) } catch { break }
  Start-Sleep -Milliseconds 2000
  $now = Get-Date
  if ($roots.Count -gt 0 -and -not $script:winrtErr) {
    $key = Get-ConnKey (Get-BtConn $roots)
    if ($key -ne $prev) {
      $prev = $key; $queue.Clear()
      foreach ($s in 0, 3, 8, 15) { $queue.Add($now.AddSeconds($s)) }
    }
  }
  $due = $false
  while ($queue.Count -gt 0 -and $queue[0] -le $now) { $queue.RemoveAt(0); $due = $true }
  if ($due -or $now -ge $nextFull) {
    $snap = Get-BtSnapshot; Emit $snap
    $roots = $snap.roots; $prev = Get-ConnKey $snap.aep; $nextFull = (Get-Date).AddSeconds(60)
  }
}
"""

_HEX12 = re.compile(r"(?<![0-9A-F])([0-9A-F]{12})(?![0-9A-F])")


def mac_of(instance_id: str) -> Optional[str]:
    """Device MAC address from the instance id of any of its PnP nodes."""
    s = (instance_id or "").upper()
    m = re.search(r"DEV_([0-9A-F]{12})(?![0-9A-F])", s)
    if m:
        return m.group(1)
    found = _HEX12.findall(s)
    return found[-1] if found else None


def norm_addr(addr: str) -> Optional[str]:
    """'a1:b2:c3:d4:e5:f6' -> 'A1B2C3D4E5F6'"""
    h = re.sub(r"[^0-9A-Fa-f]", "", addr or "").upper()
    return h if len(h) == 12 else None


# Bluetooth service UUIDs (16-bit) found in the instance ids of a device's
# service nodes: audio profiles mean headphones or a headset
AUDIO_SERVICES = ("0000110b-", "0000111e-", "00001108-", "00001131-")   # A2DP sink, HFP, HSP, HSP HS


def kind_from_class(raw, le: bool) -> str:
    """headset / mouse / keyboard / gamepad from the Bluetooth Class of Device
    (classic) or the GAP Appearance value (LE); "" if unknown or other."""
    try:
        raw = int(raw)
    except (TypeError, ValueError):
        return ""
    if le:
        cat, sub = raw >> 6, raw & 0x3F
        if cat == 0x0F:                               # HID
            return {1: "keyboard", 2: "mouse", 3: "gamepad", 4: "gamepad"}.get(sub, "")
        if cat == 0x25:                               # wearable audio device
            return "headset"
        return ""
    major, minor = (raw >> 8) & 0x1F, (raw >> 2) & 0x3F
    if major == 4:                                    # audio / video
        return "headset" if minor in (1, 2, 6) else ""   # wearable headset, hands-free, headphones
    if major == 5:                                    # peripheral
        if (minor & 0x0F) in (1, 2):                  # joystick, gamepad
            return "gamepad"
        return {1: "keyboard", 2: "mouse", 3: "keyboard"}.get(minor >> 4, "")
    return ""


def _is_root(instance_id: str) -> bool:
    return bool(re.match(r"^(BTHENUM|BTHLE)\\DEV_[0-9A-F]{12}", (instance_id or "").upper()))


def _as_bool(v) -> Optional[bool]:
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        if v.lower() == "true":
            return True
        if v.lower() == "false":
            return False
    if isinstance(v, (int, float)):
        return bool(v)
    return None


def _as_list(v):
    if v is None:
        return []
    return [v] if isinstance(v, dict) else list(v)


def group_devices(data: dict, diag: List[str],
                  last_levels: Optional[Dict[str, int]] = None) -> List[DeviceStatus]:
    """last_levels - last known battery level per MAC (updated in place)."""
    if last_levels is None:
        last_levels = {}
    devs = _as_list(data.get("devs"))
    props = _as_list(data.get("props"))
    aep = _as_list(data.get("aep"))
    if data.get("aep_error"):
        diag.append(f"[Bluetooth] WinRT unavailable ({data['aep_error'][:150]}), "
                    f"using the fallback PnP flag")

    info = {d.get("id"): d for d in devs if d.get("id")}
    by_mac: Dict[str, dict] = {}

    def slot(mac):
        return by_mac.setdefault(mac, {"level": None, "pnp_conn": None, "aep_conn": None,
                                       "name": None, "root_name": None, "aep_name": None,
                                       "status_ok": False, "aep_err": False,
                                       "kind": "", "audio": False})

    for d in devs:
        mac = mac_of(d.get("id"))
        if mac:
            g = slot(mac)
            if _is_root(d.get("id")) and d.get("name"):
                g["root_name"] = d["name"]
            if any(u in (d.get("id") or "").lower() for u in AUDIO_SERVICES):
                g["audio"] = True

    for p in props:
        mac = mac_of(p.get("id"))
        if not mac:
            continue
        g = slot(mac)
        key = (p.get("key") or "").upper()
        if key == K_BAT.upper():
            try:
                raw_level = p.get("data")
                if isinstance(raw_level, bool) or not isinstance(raw_level, (int, float)):
                    continue
                if not 0 <= raw_level <= 100 or int(raw_level) != raw_level:
                    continue
                g["level"] = int(raw_level)
            except (TypeError, ValueError):
                continue
            d = info.get(p.get("id")) or {}
            g["name"] = g["name"] or d.get("name")
            g["status_ok"] = g["status_ok"] or str(d.get("status", "")).upper() == "OK"
        elif key == K_CONN.upper():
            b = _as_bool(p.get("data"))
            if b is not None:
                g["pnp_conn"] = bool(g["pnp_conn"]) or b

    for a in aep:
        mac = norm_addr(a.get("addr"))
        if not mac:
            continue
        g = slot(mac)
        if a.get("err"):
            g["aep_err"] = True
            diag.append(f"[Bluetooth] WinRT for {mac}: {str(a['err'])[:120]}")
        b = _as_bool(a.get("conn"))
        if b is not None:
            g["aep_conn"] = bool(g["aep_conn"]) or b
        g["aep_name"] = g["aep_name"] or a.get("name")
        g["kind"] = g["kind"] or kind_from_class(a.get("cls"), bool(_as_bool(a.get("le"))))

    out: List[DeviceStatus] = []
    for mac, g in by_mac.items():
        # battery: fresh value, otherwise the last known one (Windows sometimes omits it)
        level, cached = g["level"], False
        if level is not None:
            last_levels[mac] = level
        elif mac in last_levels:
            level, cached = last_levels[mac], True
        if level is None:
            continue
        name = (g["root_name"] or g["aep_name"] or g["name"] or "Bluetooth device").strip()
        if g["aep_conn"] is not None:
            shown, src = g["aep_conn"], "WinRT"
        elif g["pnp_conn"] is not None:
            shown, src = g["pnp_conn"], "PnP"
        elif g["aep_err"]:
            # WinRT gave no answer for this device and there is no PnP flag: hide it
            # (falling back to "status OK" here used to show disconnected headsets)
            shown, src = False, "no data"
        else:
            shown, src = g["status_ok"], "status"
        kind = g["kind"] or ("headset" if g["audio"] else "")
        diag.append(f"[Bluetooth] {name} ({mac}): {level}%{' (cached)' if cached else ''} "
                    f"connected: WinRT={g['aep_conn']} PnP={g['pnp_conn']} "
                    f"-> {'shown' if shown else 'hidden'} [{src}], kind: {kind or 'unknown'}")
        if shown:
            out.append(DeviceStatus(f"bt:{mac}", name, level, False, True, "bluetooth", kind=kind,
                                    cached=cached, source_quality="system_property",
                                    connection_known=g["aep_conn"] is not None or g["pnp_conn"] is not None,
                                    charging_known=False))
    if not by_mac:
        diag.append("[Bluetooth] no Bluetooth devices found")
    return out


# How many polls in a row (one per minute) a device may be missing before its
# icon is removed. Smooths over brief PowerShell failures and polls where
# Windows reports a headset as disconnected for a moment.
MISS_LIMIT = 2


def powershell_path() -> str:
    system_root = os.environ.get("SystemRoot")
    if not system_root:
        raise OSError("SystemRoot is not set")
    return os.path.join(system_root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")


class BluetoothProvider(Provider):
    name = "bluetooth"

    def __init__(self):
        self._diag: List[str] = []
        self._shown: Dict[str, DeviceStatus] = {}   # key -> last shown state
        self._misses: Dict[str, int] = {}
        self._levels: Dict[str, int] = {}           # MAC -> last known battery level
        self._observed_at: Dict[str, str] = {}      # property query time, NOT device measurement time

    def _query(self) -> Optional[str]:
        """Raw JSON from PowerShell, or None on failure."""
        try:
            flags = 0x08000000  # CREATE_NO_WINDOW
            proc = subprocess.run(
                [powershell_path(), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                 "-Command", PS_SCRIPT],
                stdin=subprocess.DEVNULL,       # pythonw has no console: pass an explicit empty stdin
                capture_output=True, timeout=60, creationflags=flags)
            raw = proc.stdout.decode("utf-8", errors="replace").strip().lstrip("\ufeff")
            err = proc.stderr.decode("utf-8", errors="replace").strip()
            if err:
                self._diag.append(f"[Bluetooth] stderr: {err[:300]}")
            if proc.returncode != 0:
                self._diag.append(f"[Bluetooth] PowerShell exited with code {proc.returncode}")
                return None
            self._diag.append(f"[Bluetooth] PowerShell: {len(raw)} bytes of output")
            return raw
        except subprocess.TimeoutExpired:
            self._diag.append("[Bluetooth] FAILURE: PowerShell did not answer within 60 s")
        except Exception as e:
            self._diag.append(f"[Bluetooth] FAILURE: {e}")
        return None

    def poll(self) -> List[DeviceStatus]:
        self._diag = []
        if sys.platform != "win32":
            return []
        raw = self._query()
        fresh = self.parse(raw) if raw is not None else None
        result = self.merge(fresh)
        for line in self._diag:          # every poll goes to the log in detail, to investigate disappearing icons
            log.info(line)
        if fresh is None:
            raise RuntimeError("Bluetooth query failed")
        return result

    def handle(self, raw: str) -> List[DeviceStatus]:
        """One snapshot line from the watcher -> the devices to show."""
        self._diag = []
        result = self.merge(self.parse(raw))
        for line in self._diag:
            log.info(line)
        return result

    def merge(self, fresh: Optional[List[DeviceStatus]]) -> List[DeviceStatus]:
        """Smoothing: a missing device is kept for MISS_LIMIT-1 more polls."""
        if fresh is None:
            self._diag.append("[Bluetooth] poll failed, keeping the previous icons")
            fresh = []
        now = {st.key: st for st in fresh}
        for key, st in now.items():
            self._shown[key] = st
            self._misses[key] = 0
        out = list(now.values())
        for key in list(self._shown):
            if key in now:
                continue
            self._misses[key] = self._misses.get(key, 0) + 1
            if self._misses[key] < MISS_LIMIT:
                self._diag.append(f"[Bluetooth] {self._shown[key].name}: missing from the reply, "
                                  f"keeping the icon (miss {self._misses[key]}/{MISS_LIMIT})")
                # A missing reply is history, even if the previous connection
                # flag said connected. Never mutate the object held by callers.
                from dataclasses import replace
                out.append(replace(self._shown[key], cached=True, connection_known=False))
            else:
                self._diag.append(f"[Bluetooth] {self._shown[key].name}: removing the icon "
                                  f"({self._misses[key]} misses in a row)")
                self._shown.pop(key, None)
                self._misses.pop(key, None)
        return out

    def parse(self, raw: str) -> Optional[List[DeviceStatus]]:
        """None - unusable output (treated as a failure), [] - there really are no devices."""
        if not raw:
            self._diag.append("[Bluetooth] FAILURE: empty PowerShell output")
            return None
        try:
            data = json.loads(raw)
        except ValueError:
            self._diag.append(f"[Bluetooth] FAILURE: could not parse the output: {raw[:300]}")
            return None
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        result = group_devices(data, self._diag, self._levels)
        for status in result:
            if not status.cached:
                self._observed_at[status.key] = now
            # Windows returns a system property without the device's sample
            # time. Keep queried_at separately and leave measured_at unknown.
            status.queried_at_utc = self._observed_at.get(status.key)
        return result

    def diagnostics(self) -> List[str]:
        return list(self._diag)


# The PowerShell script emits a snapshot on start, on every change of the Bluetooth connection
# key and otherwise on a 60 s timer, so a healthy child is never silent for much longer than a
# minute. Silence beyond this is a wedged child: WinRT calls can block indefinitely, and the
# script cannot report that it is stuck.
STALL_TIMEOUT = 180.0
STALL_LIMIT = 2


class BluetoothWatcher:
    """Runs WATCH_SCRIPT in one long-lived PowerShell process and feeds every
    snapshot it prints to the provider. Restarts the process if it dies; after
    three quick failures in a row it gives up (failed = True) and the app falls
    back to one-shot polls once a minute."""

    def __init__(self, provider: BluetoothProvider, on_update: Callable[[List[DeviceStatus]], None]):
        self.provider = provider
        self.on_update = on_update
        self.failed = False
        self.snapshots = 0
        self.stalls = 0
        self._stop = threading.Event()
        self._proc: Optional[subprocess.Popen] = None
        self._thread = threading.Thread(target=self._run, daemon=True)

    def command(self) -> List[str]:
        script = WATCH_SCRIPT.replace("%PPID%", str(os.getpid()))
        return [powershell_path(), "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]

    def start(self) -> "BluetoothWatcher":
        self._thread.start()
        return self

    def running(self) -> bool:
        return self._thread.is_alive() and not self.failed

    def stop(self) -> None:
        self._stop.set()
        proc = self._proc
        if proc is not None and proc.poll() is None:
            try:
                proc.terminate()
            except OSError:
                pass

    @staticmethod
    def _pump(stream, q: "queue.Queue") -> None:
        """Read the child's stdout in its own thread so that a silent child cannot park the
        caller, and hand each line over with a timeout to wait on. A thread rather than
        `stream.readline()` in the main loop because a blocking read cannot be interrupted."""
        try:
            for line in stream:
                q.put(line)
        except (OSError, ValueError):          # the pipe was closed under us
            pass
        finally:
            q.put(None)

    def _run(self) -> None:
        quick_failures = 0
        while not self._stop.is_set():
            started = time.time()
            try:
                self._proc = subprocess.Popen(
                    self.command(), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL, creationflags=0x08000000 if sys.platform == "win32" else 0)
            except Exception as e:
                log.warning("bluetooth watcher: cannot start PowerShell: %s", e)
                self.failed = True
                return
            got_output = False
            stalled = False
            q: "queue.Queue" = queue.Queue()
            reader = threading.Thread(target=self._pump, args=(self._proc.stdout, q), daemon=True)
            reader.start()
            last = time.time()
            while True:
                try:
                    line = q.get(timeout=1.0)
                except queue.Empty:
                    if self._stop.is_set():
                        break
                    if self._proc.poll() is not None and q.empty():
                        break                 # the child is gone and its output is drained
                    if time.time() - last > STALL_TIMEOUT:
                        # Reading `for line in self._proc.stdout` parked this thread for ever
                        # on a wedged child: no output, `failed` still False, running() still
                        # True, and the app never fell back to its once-a-minute polling.
                        log.warning("bluetooth watcher: no output for %.0f s, killing PowerShell",
                                    STALL_TIMEOUT)
                        try:
                            self._proc.kill()
                        except OSError:
                            pass
                        stalled = True
                        break
                    continue
                if line is None:              # end of the child's output
                    break
                last = time.time()
                text = line.decode("utf-8", errors="replace").strip().lstrip("\ufeff")
                if not text:
                    continue
                got_output = True
                try:
                    devices = self.provider.handle(text)
                except Exception:
                    log.exception("bluetooth watcher")
                    continue
                self.snapshots += 1
                self.on_update(devices)
            self._proc.wait()
            if self._stop.is_set():
                return
            if stalled:
                self.stalls += 1
                if self.stalls >= STALL_LIMIT:
                    log.warning("bluetooth watcher: PowerShell stalled %d times, giving up - "
                                "falling back to polling once a minute", self.stalls)
                    self.failed = True
                    return
                self._stop.wait(5)
                continue
            log.warning("bluetooth watcher: PowerShell exited with code %s", self._proc.returncode)
            quick = not got_output or time.time() - started < 30
            quick_failures = quick_failures + 1 if quick else 0
            if quick_failures >= 3:
                log.warning("bluetooth watcher: giving up, falling back to polling once a minute")
                self.failed = True
                return
            self._stop.wait(5)
