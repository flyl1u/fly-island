"""HyperX Cloud III S Wireless over its USB dongle, without NGENUITY.

A different protocol from the Cloud III Wireless (hyperx_cloud3.py). Sources:
  * LennardKittner/HyperHeadset, src/devices/cloud_iii_s_wireless.rs at 57dfa2b: the
    packets, and the product ids 0x06BE and 0x02CC.
  * HyperHeadset issue #36 and PR #42 (vxel): two Windows USBPcap captures of NGENUITY.
    NGENUITY sends every request as an *output* report (SET_REPORT, wValue 0x020C) to
    interface 3, and the dongle ignores the same bytes sent as a feature report (which
    HyperHeadset's code at 57dfa2b does, and which got no answer in #106 of this
    repository). The answers arrive on interrupt IN endpoint 0x84 of interface 3.

  * request: a 64-byte output report
        0c 02 03 01 00 <cmd> 00 ...
    0x0C is the report id; byte 3 = 01 asks for a value (00 would set one, which this
    provider never sends).
        cmd 0x06  battery
        cmd 0x48  charging
  * reply: input report 0x0C
        0c .. .. .. .. <cmd> <value>
    value 0xFF = no value (the reference ignores it; here it is above 100 for the battery
    and not a charging state). Battery: the percent. Charging: 0 not charging,
    1 charging, 2 fully charged, anything else an error.
  * the headset also pushes notifications, input report 0x0D: byte 4 = 1 carries the
    battery percent in byte 5, byte 4 = 10 the charging state in byte 5.
  * the collections: Windows splits interface 3 into six collections and gives each its
    own handle. The request goes to the first collection that takes an output report
    0x0C (Windows refuses a report id a collection does not declare; hidapi then returns
    -1), vendor pages first, and that collection is remembered. The answer is an input
    report that Windows delivers to the collection that declares it, which need not be
    the same one, so all collections of the dongle are read while waiting.
  * the captures' author found that the dongle stops answering after it was unplugged
    until Windows restarts or the dongle is plugged in again (HyperHeadset #36); a dongle
    that takes the request and never answers gives no icon.

A level above 100 is refused rather than shown as a made-up number.
"""
from __future__ import annotations

import time
from typing import Dict, List, Optional, Tuple

try:
    import hid
except ImportError:              # pragma: no cover
    hid = None

from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

HP_VID = 0x03F0

PIDS = {
    0x02CC: "HyperX Cloud III S Wireless",
    0x06BE: "HyperX Cloud III S Wireless",   # the other id the reference lists
}

REPORT_ID = 0x0C
NOTIFICATION_ID = 0x0D
PACKET_LEN = 64
CMD_BATTERY = 0x06
CMD_CHARGING = 0x48
NOTE_BATTERY = 1
NOTE_CHARGING = 10

READ_LEN = 64
READ_WINDOW = 1.0            # s: the reference waits up to 1 s for the reply
READ_PAUSE = 0.01            # s between rounds of non-blocking reads

KIND_BATTERY, KIND_CHARGING = "battery", "charging"


def make_request(cmd: int) -> List[int]:
    return [REPORT_ID, 0x02, 0x03, 0x01, 0x00, cmd] + [0x00] * (PACKET_LEN - 6)


def parse(r) -> Optional[Tuple[str, int]]:
    """An input report -> ("battery", percent) or ("charging", state), or None."""
    if not r or len(r) < 7:
        return None
    if r[0] == REPORT_ID:
        value = r[6]                      # 0xFF, "no value", fails both checks below
        if r[5] == CMD_BATTERY:
            return (KIND_BATTERY, value) if value <= 100 else None
        if r[5] == CMD_CHARGING:
            return KIND_CHARGING, value
        return None
    if r[0] == NOTIFICATION_ID:
        if r[4] == NOTE_BATTERY:
            return (KIND_BATTERY, r[5]) if r[5] <= 100 else None
        if r[4] == NOTE_CHARGING:
            return KIND_CHARGING, r[5]
    return None


def charging_flag(state: Optional[int]) -> Optional[bool]:
    if state == 0:
        return False
    if state in (1, 2):                   # charging, fully charged: on the cable
        return True
    return None                           # the reference's error value: no claim


def _order(d: dict) -> Tuple[int, int]:
    page = d.get("usage_page") or 0
    return (0 if page >= 0xFF00 else 1, page)


class HyperXCloud3SProvider(Provider):
    name = "hyperx_cloud3s"

    def __init__(self):
        self._diag: List[str] = []
        self._path: Dict[int, bytes] = {}      # pid -> the collection that takes the request

    # ---- transport ---------------------------------------------------------
    def _open(self, mine: List[dict]) -> List[Tuple[dict, object]]:
        handles = []
        for d in sorted(mine, key=_order):
            dev = hid.device()
            try:
                dev.open_path(d["path"])
            except (OSError, IOError) as e:
                self._diag.append(f"  open {d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}: {e}")
                continue
            try:
                dev.set_nonblocking(True)
            except Exception:
                pass
            handles.append((d, dev))
        return handles

    @staticmethod
    def _close(handles) -> None:
        for _, dev in handles:
            try:
                dev.close()
            except Exception:
                pass

    def _write(self, dev, cmd: int) -> bool:
        try:
            n = dev.write(make_request(cmd))
        except (OSError, IOError, ValueError):
            return False
        return n is None or n >= 0

    def _send(self, pid: int, handles, cmd: int) -> Optional[bytes]:
        """Send the request to the remembered collection, or find one that takes it."""
        cached = self._path.get(pid)
        for d, dev in handles:
            if d["path"] == cached:
                if self._write(dev, cmd):
                    return cached
                self._path.pop(pid, None)
                break
        for d, dev in handles:
            label = f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}"
            if self._write(dev, cmd):
                self._diag.append(f"  cmd {cmd:02x}: output report taken by {label}")
                self._path[pid] = d["path"]
                return d["path"]
            self._diag.append(f"  cmd {cmd:02x}: refused by {label}")
        return None

    def _ask(self, pid: int, handles, cmd: int, want: str) -> Tuple[bool, Optional[int]]:
        """-> (a collection took the request, value or None)."""
        if self._send(pid, handles, cmd) is None:
            return False, None
        end = time.time() + READ_WINDOW
        while time.time() < end:
            got = False
            for d, dev in handles:
                try:
                    r = list(dev.read(READ_LEN) or [])
                except (OSError, IOError, ValueError):
                    continue
                if not r:
                    continue
                got = True
                res = parse(r)
                if res is not None and res[0] == want:
                    self._diag.append(f"  cmd {cmd:02x} reply on {d.get('usage_page', 0):04x}:"
                                      f"{d.get('usage', 0):04x}: {hexdump(r, 8)}")
                    return True, res[1]
                self._diag.append(f"  cmd {cmd:02x} ignored: {hexdump(r, 8)}")
            if not got:
                time.sleep(READ_PAUSE)
        self._diag.append(f"  cmd {cmd:02x}: no reply (if NGENUITY also shows nothing, "
                          "unplug the dongle and plug it in again)")
        return True, None

    # ---- poll ------------------------------------------------------------------
    def poll(self) -> List[DeviceStatus]:
        self._diag = []
        if hid is None:
            return []
        try:
            infos = hidlist.enumerate(HP_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(hyperx cloud iii s): %s", e)
            return []
        out = []
        for pid, name in PIDS.items():
            mine = [d for d in infos if d["product_id"] == pid]
            if not mine:
                continue
            self._diag.append(f"[HyperX] pid={pid:04x} '{name}', collections: {len(mine)}")
            handles = self._open(mine)
            try:
                _, level = self._ask(pid, handles, CMD_BATTERY, KIND_BATTERY)
                if level is None:
                    continue              # off, or no collection answered: no icon
                _, state = self._ask(pid, handles, CMD_CHARGING, KIND_CHARGING)
            finally:
                self._close(handles)
            charging = charging_flag(state)
            out.append(DeviceStatus(f"hyperx:{pid:04x}", name, level, bool(charging), True,
                                    "hyperx", kind="headset"))
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)
