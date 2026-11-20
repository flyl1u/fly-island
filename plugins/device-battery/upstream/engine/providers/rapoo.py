"""Passive Rapoo VT nrf54L battery notifications; no device requests.

Only the listed wireless IDs below are supported, at evidence level C. The
official A HUB's Ik/dy parser receives report 07 on the default FF00:0002
channel. Report length must be proven from that collection's descriptor.

#120's VT3S exposes a fixed-usage button array: without the opt-in descriptor
proof in topology, _pick refuses to open it. The user observed report 07 about
every 3 s; cadence for other models remains unknown. The collection handle
stays open between polls: Windows queues input reports for an open handle,
and each poll drains that queue and keeps the newest battery report. The
first poll after opening still listens briefly.
See upstream-protocols.md for the host route, UI flags and remaining unknowns.
"""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
import json
import time

import hid

from battery_hid import report_proof_summary
from . import hidlist
from .base import DeviceStatus, Provider

VID = 0x24AE
PIDS = {
    0x1410: "Rapoo VT0",
    0x1411: "Rapoo VT3S",
    0x1412: "Rapoo VT3",
    0x1413: "Rapoo VT7",
    0x1414: "Rapoo VT9",
    0x1415: "Rapoo VT1",
    0x1416: "Rapoo VT7 MAX",
    0x1417: "Rapoo VT3 MAX",
    0x1418: "Rapoo VT9 MAX",
    0x1420: "Rapoo VT0 MAX",
    0x1421: "Rapoo VT3S MAX",
    0x1422: "Rapoo VT2",
    0x1423: "Rapoo VT2 MAX",
    0x1444: "Rapoo VT1 MAX",
    0x144A: "Rapoo VT0 MAX MASTER",
    0x144B: "Rapoo VT3S MAX MASTER",
    0x1451: "Rapoo VT6",
    0x1452: "Rapoo VT6 MAX",
    0x1453: "Rapoo VT9S V2",
    0x1459: "Rapoo VT7S V2",
    0x145B: "Rapoo VT4 V2",
    0x145D: "Rapoo VT2S V2",
    0x1460: "Rapoo VT7 V2",
    0x1462: "Rapoo VT3 V2",
    0x1464: "Rapoo VT3S V2",
    0x1466: "Rapoo VT9 V2",
    0x1468: "Rapoo VT2 V2",
    0x146A: "Rapoo VT1S V2",
    0x146C: "Rapoo VT8 V2",
    0x146D: "Rapoo VT3 MAX MASTER V2",
    0x146E: "Rapoo VT3S MAX MASTER V2",
    0x1470: "Rapoo VT7 MAX MASTER V2",
    0x1471: "Rapoo VT7S MAX MASTER V2",
    0x1473: "Rapoo VT9 MAX MASTER V2",
    0x1474: "Rapoo VT9S MAX MASTER V2",
    0x1475: "Rapoo VT2 MAX MASTER V2",
    0x1476: "Rapoo VT2S MAX MASTER V2",
    0x1477: "Rapoo VT4 MAX MASTER V2",
    0x1478: "Rapoo VT8 MAX MASTER V2",
    0x14A1: "Rapoo VT0 Air MAX",
    0x14A2: "Rapoo VT3S Air Max",
    0x14A4: "Rapoo VT2K MAX",
    0x14A5: "Rapoo VT3 PRO V2",
    0x14A6: "Rapoo VT3S PRO V2",
    0x14A7: "Rapoo VT7 PRO V2",
    0x14A8: "Rapoo VT7S PRO V2",
    0x14A9: "Rapoo VT9 PRO V2",
    0x14AA: "Rapoo VT9S PRO V2",
    0x1B01: "Rapoo VT9S MAX V2",
    0x1B02: "Rapoo VT7S MAX V2",
    0x1B03: "Rapoo VT4 MAX V2",
    0x1B04: "Rapoo VT2S MAX V2",
    0x1B05: "Rapoo VT7 MAX V2",
    0x1B06: "Rapoo VT3 MAX V2",
    0x1B07: "Rapoo VT3S MAX V2",
    0x1B08: "Rapoo VT9 MAX V2",
    0x1B09: "Rapoo VT2 MAX V2",
    0x1B0A: "Rapoo VT1S MAX V2",
    0x1B0B: "Rapoo VT8 MAX V2",
    0x1B0C: "Rapoo VT3 Air MAX V2",
    0x1B0D: "Rapoo VT3S Air MAX V2",
    0x1B0E: "Rapoo VT7 Air MAX V2",
    0x1B0F: "Rapoo VT7S Air MAX V2",
    0x1B10: "Rapoo VT9 Air MAX V2",
    0x1B11: "Rapoo VT9S Air MAX V2",
    0x1B12: "Rapoo VT2 Air MAX V2",
    0x1B13: "Rapoo VT2S Air MAX V2",
    0x1B14: "Rapoo VT4 Air MAX V2",
    0x1B15: "Rapoo VT8 Air MAX V2",
}
COLLECTION = (0xFF00, 0x0002)
INPUT_ID = 0x07
READ_WINDOW_MS = 1500
MAX_READS = 32
DRAIN_TIMEOUT_MS = 1   # reading what is already queued, not waiting for more
MAX_DRAIN = 256        # bounded even if other reports keep arriving


def _sizes_summary(sizes):
    """Only descriptor report IDs and numeric lengths, never arbitrary metadata."""
    if not isinstance(sizes, dict):
        return "null"
    safe = {}
    for key, value in sizes.items():
        if (type(key) is int and 0 <= key <= 255
                or isinstance(key, str) and key.isascii() and key.isdecimal()
                and len(key) <= 3 and 0 <= int(key) <= 255):
            safe[str(key)] = value if type(value) is int and 0 <= value <= 4096 else None
    items = sorted(safe.items(), key=lambda item: (item[0] != "7", int(item[0])))
    return json.dumps(dict(items[:6]), separators=(",", ":")) + ("..." if len(items) > 6 else "")


def parse_battery(raw):
    """Offsets include the ID; never default missing battery bytes to zero.

    A HUB's wireless UI marks states 2 and 3 as charging, 1 as not charging.
    It does not distinguish full from charging. State 0 and other values do
    not establish a charging state; a valid percentage is still kept.
    """
    if len(raw) < 9 or raw[0] != INPUT_ID or not 0 <= raw[8] <= 100:
        return None
    state = raw[7]
    return raw[8], state in (2, 3), state in (1, 2, 3)


class RapooProvider(Provider):
    name = "rapoo"

    def __init__(self):
        self._diag = []
        self._last = {}  # physical USB parent -> last DeviceStatus and receive time
        self._paths = {}  # keep history if parent resolution temporarily fails
        self._handles = {}  # physical USB parent -> (collection path, open handle)
        self._seen_inputs = {}  # path -> bounded ID/length pairs since open/last valid input

    def _pick(self, infos):
        candidates = [d for d in infos
                      if d.get("vendor_id") == VID and d.get("product_id") in PIDS
                      and (d.get("usage_page"), d.get("usage")) == COLLECTION]
        if len(candidates) != 1 or not candidates[0].get("path"):
            self._diag.append("missing or ambiguous FF00:0002 collection; not opened")
            return None
        info = candidates[0]
        maximum = info.get("input_report_length")
        sizes = info.get("input_report_sizes")
        if (type(maximum) is not int or not 9 <= maximum <= 4096
                or not isinstance(sizes, dict) or not sizes
                or any(type(n) is not int or not 2 <= n <= maximum for n in sizes.values())
                or max(sizes.values()) != maximum
                or type(sizes.get("7")) is not int or not 9 <= sizes["7"] <= maximum):
            self._diag.append(f"report 07 unproven; sizes={_sizes_summary(sizes)}"
                              + report_proof_summary(info, "input", include_declared=True) + "; not opened")
            return None
        return info

    def _observe_input(self, info, raw):
        seen = self._seen_inputs.setdefault(info["path"], set())
        if len(seen) < 32:
            seen.add((raw[0], len(raw)))

    def _no_measurement(self, info):
        seen = sorted(self._seen_inputs.get(info["path"], ()))
        if not seen:
            self._diag.append("opened; no input reports; no new measurement"
                              + report_proof_summary(info, "input"))
        else:
            summary = ",".join(f"{report_id:02X}/{length}" for report_id, length in seen[:6])
            self._diag.append("opened; no valid report 07; seen=" + summary
                              + (",..." if len(seen) > 6 else "") + report_proof_summary(info, "input"))

    def _drain(self, dev, info):
        """Newest valid battery report already queued on a handle kept open."""
        newest = None
        for _ in range(MAX_DRAIN):
            raw = dev.read(info["input_report_length"], DRAIN_TIMEOUT_MS)
            if not raw:
                break
            self._observe_input(info, raw)
            if raw[0] != INPUT_ID or len(raw) != info["input_report_sizes"]["7"]:
                continue
            parsed = parse_battery(raw)
            if parsed is not None:
                newest = parsed
                self._seen_inputs.pop(info["path"], None)
        if newest is None:
            self._no_measurement(info)
        return newest

    def _release(self, physical):
        entry = self._handles.pop(physical, None)
        if entry is not None:
            self._seen_inputs.pop(entry[0], None)
            dev = entry[1]
            try:
                dev.close()
            except OSError:
                self._diag.append("HID handle close failed")

    def close(self):
        for physical in list(self._handles):
            self._release(physical)

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass

    def _listen(self, dev, info):
        deadline = time.monotonic() + READ_WINDOW_MS / 1000
        for _ in range(MAX_READS):
            # Floor the timeout so even the last read fits the remaining budget.
            remaining_ms = min(READ_WINDOW_MS, int((deadline - time.monotonic()) * 1000))
            if remaining_ms <= 0:
                break
            raw = dev.read(info["input_report_length"], remaining_ms)
            if not raw:
                break
            self._observe_input(info, raw)
            if raw[0] != INPUT_ID or len(raw) != info["input_report_sizes"]["7"]:
                continue
            parsed = parse_battery(raw)
            if parsed is not None:
                self._seen_inputs.pop(info["path"], None)
                return parsed
        self._no_measurement(info)
        return None

    @staticmethod
    def _historical(status):
        return replace(status, online=False, cached=True, wake_on_input=True,
                       connection_known=False, charging_known=False)

    def poll(self):
        self._diag = []
        try:
            inventory = hidlist.enumerate(VID)
        except OSError:
            # Failed enumeration cannot prove that a receiver left the USB tree.
            self._diag.append("enumeration failed; retaining history")
            return [self._historical(s) for s in self._last.values()]
        groups = {}
        present_paths = set()
        for info in inventory:
            if info.get("vendor_id") != VID or info.get("product_id") not in PIDS:
                continue
            present_paths.add(info.get("path"))
            physical = info.get("physical_id", "")
            if not physical or physical.startswith("collection:"):
                self._diag.append("USB parent unproven; collection uniqueness unknown; not opened")
                continue
            groups.setdefault(physical, []).append(info)
        result = []
        found = set()
        for physical, infos in groups.items():
            self._paths[physical] = {d.get("path") for d in infos if d.get("path")}
            reading = None
            info = self._pick(infos)
            if info is None:
                self._release(physical)
            else:
                entry = self._handles.get(physical)
                if entry is not None and entry[0] != info["path"]:
                    self._release(physical)
                    entry = None
                try:
                    if entry is None:
                        dev = hid.device()
                        try:
                            dev.open_path(info["path"])
                        except (OSError, ValueError):
                            try:
                                dev.close()
                            except OSError:
                                pass
                            raise
                        self._handles[physical] = (info["path"], dev)
                        reading = self._listen(dev, info)
                    else:
                        reading = self._drain(entry[1], info)
                except (OSError, ValueError):
                    self._diag.append("input read failed; no new measurement"
                                      + report_proof_summary(info, "input"))
                    self._release(physical)
            if reading is not None:
                level, charging, charging_known = reading
                received = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
                status = DeviceStatus(
                    f"{self.name}:{physical}", PIDS[info["product_id"]],
                    level, charging, True, self.name, kind="mouse",
                    physical_id=physical, connection_known=True,
                    charging_known=charging_known, verification_level="C",
                    measured_at_utc=received, queried_at_utc=received)
                self._last[physical] = status
                found.add(physical)
                result.append(status)
        # Descriptor loss/ambiguity above does not expire a receiver's history.
        # Only absence from the enumerated USB parents removes it.
        for physical in list(self._paths):
            if physical in found:
                continue
            if physical in groups or self._paths[physical] & present_paths:
                if physical in self._last:
                    result.append(self._historical(self._last[physical]))
            else:
                self._last.pop(physical, None)
                del self._paths[physical]
        for physical in [p for p in self._handles if p not in groups]:
            self._release(physical)
        return result

    def diagnostics(self):
        return list(self._diag)
