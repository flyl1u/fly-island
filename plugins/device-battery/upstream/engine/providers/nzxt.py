"""NZXT Lift Elite Wireless over its dongle (1e71:2101), without NZXT CAM.

No public protocol exists for this mouse - OpenRGB's NZXT controller covers the
wired Lift's LEDs only, and CAM keeps the battery inside its closed native
module. Every byte here is therefore taken from USBPcap captures of CAM
4.76.5 talking to the reporter's own mouse (issue #148 - four captures:
wireless at 76-77 %, the charging cable in, and the mouse on its USB cable at
84 %). The conversation is a request in a 64-byte interrupt OUT report and a
reply on interrupt IN, both starting with 0x4e:

    request:  4e 02 81 00 b0 00 ...
              0x4e framing, 02 = the mouse behind the dongle, 81 = "read a
              property", 0xb0 = the telemetry property this provider wants
    reply:    4e 02 97 00 01 40 01 86 0f fd ff 40 01 f6 00 43 00 4d 00 64 ...

Field map, read off the reporter's captures (a wireless session and a charging
one):

    bytes 17-18  battery percent, little-endian (4d 00 = 77, 4c 00 = 76). The
                 tray reads one step above CAM's panel (76 against 75, 78
                 against 77) - CAM smooths its display; the raw gauge is what
                 is shown here.
    bytes 8-9    cell voltage, big-endian millivolts (0f fd = 4093 mV wireless;
                 10 fc = 4348 mV while charging; 0f 1e = 3870 right after the
                 cable came out).
    byte 22      bit 0 set while the mouse is on its charging cable: it read 1
                 in every charging-session frame and 0 in every wireless one,
                 including right after unplugging.
    byte 7       drifts between reads (86/82 wireless, 94..91 and 9b on either
                 side of charging, 1c/31/a5 during it) with nothing conclusive
                 - NOT decoded.
    bytes 13-14  a slowly moving value (00f6 = 246 up to 00f9 = 249 across the
                 captures, rising during charging) that looks like a
                 temperature in 0.1 C - NOT decoded.
    byte 10      ff wireless; 01 from mid-charging through the unplug, back to
                 ff once settled - the exact meaning is not clear, so it is
                 not used; byte 21 reads 1e normally and 1c once.
    the rest     (43 00, 64 00, 08 00, a repeated 40 01) is constant.

The reply arrived ~25 ms after the request, always preceded by a 4e e5 00
acknowledgement from the dongle, so the read loop skips e5 frames and waits
for the 97 one. A stale frame from the previous poll is drained before the
request is sent.

The dongle splits into six HID collections; the conversation rode the one on
usage page ffca / usage 0001 - the same page the wired Lift's OpenRGB driver
picks - chosen by usage page, never by interface number.

The mouse has two ids: 1e71:2101 for the receiver and 1e71:2129 for the same
mouse on its USB cable. The wired one carries the identical ffca:0001
collection with the same 64-byte report pair, and CAM read it with the very
same request (that capture holds 84 % and the charging bit, cable in) - so
both ids are asked. They are ONE device to the tray: one icon, keyed on the
receiver's id (the family convention - the wireless id is the shared key), and
the charging reading wins when both answer. A silent id never adds a greyed
twin while the other one is answering (review by @ahmedkhursheed23).

Claimed for the mouse's two ids: 1e71:2101 (the receiver) and 1e71:2129 (the
mouse on its USB cable). The 1e71:2131 keyboard is wired and has no battery to
read. Confirmed on hardware by the reporter of #148 (@MrBeat93): the level
tracks, charging follows the cable, and both ids read. While NZXT CAM itself
is open the dongle stops answering this request - the app then keeps the last
value on a greyed icon (the same coexistence shape as other vendor tools).
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

NZXT_VID = 0x1E71
RECEIVER_PID = 0x2101
CABLE_PID = 0x2129
PIDS = {RECEIVER_PID: "NZXT Lift Elite Wireless",
        CABLE_PID: "NZXT Lift Elite (USB cable)"}

# One icon for the mouse on both of its ids, keyed on the receiver id - a silent
# id must not put a greyed twin beside the one that answers.
SHARED_KEY = f"nzxt:{RECEIVER_PID:04x}"
NAME = "NZXT Lift Elite"

VENDOR_PAGE = 0xFFCA
VENDOR_USAGE = 0x0001

MAGIC = 0x4E
TARGET_MOUSE = 0x02
OP_READ = 0x81
PROP_TELEMETRY = 0xB0
REPLY_TELEMETRY = 0x97
ACK = 0xE5

REQUEST = bytes([MAGIC, TARGET_MOUSE, OP_READ, 0x00, PROP_TELEMETRY]) + b"\x00" * 59

LEVEL_INDEX = 17
VOLTAGE_INDEX = 8
CHARGING_INDEX = 22               # bit 0: 1 while the mouse is on its charging cable
MIN_FRAME = 27

READ_ATTEMPTS = 10
READ_TIMEOUT_MS = 150
DRAIN_READS = 3
DRAIN_TIMEOUT_MS = 1
MAX_CANDIDATES = 2
ASLEEP_KEEP = 300                 # s, as in the other receiver providers

Reading = Tuple[int, int, bool]   # level %, cell millivolts, on the charging cable


def parse_telemetry(r) -> Optional[Reading]:
    """(level, millivolts, charging) from a telemetry reply, or None when it is not one."""
    if not r or len(r) < MIN_FRAME:
        return None
    if r[0] != MAGIC or r[1] != TARGET_MOUSE or r[2] != REPLY_TELEMETRY:
        return None
    level = r[LEVEL_INDEX] | (r[LEVEL_INDEX + 1] << 8)
    if not 0 <= level <= 100:
        return None               # not a percentage - refuse rather than show it
    mv = (r[VOLTAGE_INDEX] << 8) | r[VOLTAGE_INDEX + 1]
    charging = bool(r[CHARGING_INDEX] & 0x01)
    return level, mv, charging


def candidates(ifaces: List[dict]) -> List[dict]:
    """The dongle's vendor collection(s): usage page ffca / usage 0001, in order."""
    seen = set()
    out = []
    for d in ifaces:
        if (d.get("usage_page"), d.get("usage")) != (VENDOR_PAGE, VENDOR_USAGE):
            continue
        if d["path"] in seen:
            continue
        seen.add(d["path"])
        out.append(d)
    return out


class NzxtProvider(Provider):
    name = "nzxt"

    def __init__(self):
        self._diag: List[str] = []
        self._last: Optional[Tuple[int, int, bool, float]] = None
        self._chosen: Dict[int, bytes] = {}          # pid -> the collection that answered

    def _read(self, path: bytes) -> Optional[Reading]:
        """Ask the dongle for the mouse's telemetry and read the reply."""
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"    open: {e}")
            return None
        try:
            for _ in range(DRAIN_READS):   # clear a stale reply from the last poll
                r = dev.read(64, DRAIN_TIMEOUT_MS)
                if not r:
                    break
                self._diag.append(f"    drained stale: {hexdump(r, 8)}")
            try:
                n = dev.write(REQUEST)
            except (OSError, IOError) as e:
                self._diag.append(f"    write refused: {e}")
                return None
            if isinstance(n, int) and n < 0:
                self._diag.append("    Windows refused the 64-byte request "
                                  "(the collection did not take it)")
                return None
            for _ in range(READ_ATTEMPTS):
                r = dev.read(64, READ_TIMEOUT_MS)
                if not r:
                    continue
                if len(r) > 1 and r[0] == MAGIC and r[1] == ACK:
                    self._diag.append("    ack")
                    continue
                reading = parse_telemetry(r)
                self._diag.append(f"    reply: {hexdump(r, 20)}"
                                  + ("" if reading else "  (not the telemetry shape)"))
                if reading is not None:
                    return reading
                time.sleep(0.02)
            self._diag.append("    no telemetry reply in ~1.5 s "
                              "(mouse off, or the request never reached it)")
            return None
        except (OSError, IOError, ValueError) as e:
            self._diag.append(f"    read error: {e}")
            return None
        finally:
            try:
                dev.close()
            except Exception:
                pass

    def poll(self) -> List[DeviceStatus]:
        self._diag = []
        if hid is None:
            return []
        try:
            infos = hidlist.enumerate(NZXT_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(nzxt): %s", e)
            return []
        out: List[DeviceStatus] = []
        answered: List[Tuple[int, int, bool, int]] = []   # level, mV, charging, pid
        for pid in sorted(PIDS):
            label = PIDS[pid]
            mine = [d for d in infos if d["product_id"] == pid]
            if not mine:
                continue
            self._diag.append(f"[NZXT] pid={pid:04x} '{label}' "
                              f"'{str(mine[0].get('product_string') or '').strip()}'")
            order = candidates(mine)
            if not order:
                self._diag.append("  no ffca:0001 collection on the device - not asked")
                continue
            chosen = self._chosen.get(pid)
            if chosen is not None:
                order = sorted(order, key=lambda d: d["path"] != chosen)
            got = None
            for d in order[:MAX_CANDIDATES]:
                self._diag.append(f"  asking on iface={d.get('interface_number')} "
                                  f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}")
                got = self._read(d["path"])
                if got is not None:
                    self._chosen[pid] = d["path"]
                    break
            if got is not None:
                level, mv, charging = got
                self._last = (level, mv, charging, time.time())
                self._diag.append(f"  {level} % (cell {mv} mV"
                                  + (", on the charging cable" if charging else "")
                                  + ")")
                answered.append((level, mv, charging, pid))
            else:
                self._diag.append(f"  pid={pid:04x}: no reply")
        if answered:
            # One icon for the mouse: when both ids answer, the charging reading
            # wins (the wired one is the one on its cable); otherwise the first.
            level, mv, charging, pid = next((a for a in answered if a[2]), answered[0])
            out.append(DeviceStatus(SHARED_KEY, NAME, level, charging, True, "nzxt",
                                    kind="mouse"))
        elif self._last and time.time() - self._last[3] < ASLEEP_KEEP:
            self._diag.append("  no reply from either id; keeping the last level, greyed out")
            out.append(DeviceStatus(SHARED_KEY, NAME, self._last[0], self._last[2], False,
                                    "nzxt", kind="mouse"))
        else:
            self._diag.append("  no reply yet and no earlier level")
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)
