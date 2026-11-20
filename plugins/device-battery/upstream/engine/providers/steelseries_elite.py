"""SteelSeries Arctis Nova Elite (base station 1038:2244), without SteelSeries GG.

A different exchange from the Nova 7 / Nova 5 dongles and the Nova Pro Wireless base
stations (steelseries.py), so it has a provider of its own and that code stays as it is.

Sources:
  * elegos/Linux-Arctis-Manager, src/linux_arctis_manager/devices/nova_elite.yaml at
    4c4b503c34 (made from a USB capture of SteelSeries GG on Windows; the project's
    README lists 2244 as supported), and its core.py for how the request goes out:
    64 bytes, zero-padded, sent as an output report (HID SET_REPORT, report type 2) to
    interface 3; the answers are read on interface 3.
  * loteran/Arctis-Sound-Manager, src/arctis_sound_manager/devices/nova_elite.yaml at
    1e5d374659: the same request and the same 07 b7 / 07 b5 frames, and the layout of
    the direct 01 b0 reply, taken from SteelSeries GG's own description of the station
    (`struct wireless_settings`). It also quotes JerwuQu/ggoled#35: on Windows the
    station uses report id 1 for one interface 3 collection (Col01) and report id 7 for
    the other (Col02).
  * #138: on a real station the request is answered by the direct reply
    `01 b0 00 00 01 00 1f 64 ...` on 0xFFC0:0x0001 while SteelSeries GG showed 31 %:
    byte 6 = 0x1f = 31, as the layout above says. No 07 b7 frame came. With build
    1.12.0.7 the reporter then confirmed on the same station that the level matches
    SteelSeries GG and that charging works (the icon animates). A switched-off headset
    shows 0 %, and SteelSeries GG shows 0 % in its tray for the same state: the off
    state does not arrive as power code 01 on this station, so this is parity with the
    vendor rather than a gap.

The exchange:
  * request: 64-byte output report 01 b0 00 ... (01 is the report id)
  * 07 b7 <headset level> <spare battery level> <charging> ...
      headset level 0..100; the spare battery in the station's charging slot is not
      shown; charging 02 = charging, 08 = on battery
  * 07 b5 <?> <bluetooth> <power> ...
      power 01 = headset offline, 02 = charging on the cable, 04 = standby, 08 = online
  * the direct reply 01 b0 <bt power> <bt call> <bt mode> <bt status> <headset level>
      <spare level> ... byte 14 <power, the 07 b5 codes> byte 15 <charging, the 07 b7
      codes>: the headset level (byte 6) and the charging state are the ones #138
      confirmed; byte 14 and 15 use the codes of the frames above
  * the station also sends other 07 xx frames (settings)
  * the station can push a 07 b7 without being asked; that is read as well

Not included yet: the other product ids that Arctis-Sound-Manager lists for the same
station (0x2246, 0x2249, 0x2270), which have no hardware-derived source; 0x2247 (Xbox
mode) is known not to answer this exchange.

The collections: Windows splits interface 3 into two collections and gives each its own
handle. The request goes to the first vendor collection that takes an output report 01,
0xFFC0 first (Windows refuses a report id a collection does not declare; hidapi then
returns -1), and that collection is remembered. The answer is report 07, which Windows delivers to the
collection that declares it, so every interface 3 collection is read while waiting.

A level above 100 is refused rather than shown as a made-up number, and an offline
headset gives no reading, as the other SteelSeries headsets do.
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

STEELSERIES_VID = 0x1038

# only 0x2244 has a source made from the hardware (and the #138 reporter)
PIDS = {
    0x2244: "Arctis Nova Elite",
}

INTERFACE = 3
VENDOR_USAGE_PAGE = 0xFFC0
PACKET_LEN = 64
REQUEST = [0x01, 0xB0] + [0x00] * (PACKET_LEN - 2)

FRAME = 0x07
REPLY = 0x01                 # 01 b0: the direct reply to the request
STATUS = 0xB0
REPLY_LEVEL, REPLY_POWER, REPLY_CHARGING = 6, 14, 15
BATTERY = 0xB7               # 07 b7 <headset level> <spare level> <charging>
POWER = 0xB5                 # 07 b5 <?> <bluetooth> <power>
CHARGING = 0x02              # 07 b7 byte 4
POWER_OFFLINE = 0x01         # 07 b5 byte 4
POWER_CABLE = 0x02           # 07 b5 byte 4: charging on the cable

READ_LEN = 64
READ_WINDOW = 1.0            # s to wait for the frames
READ_PAUSE = 0.01            # s between rounds of non-blocking reads


def parse_reply(r) -> Optional[Tuple[Optional[int], bool, int]]:
    """The direct 01 b0 reply -> (level or None, charging, power state), or None."""
    if not r or len(r) <= REPLY_CHARGING or r[0] != REPLY or r[1] != STATUS:
        return None
    level = r[REPLY_LEVEL] if 0 <= r[REPLY_LEVEL] <= 100 else None
    return level, r[REPLY_CHARGING] == CHARGING, r[REPLY_POWER]


def parse(r) -> Optional[Tuple[str, int, bool]]:
    """An input report -> ("battery", level, charging) or ("power", state, False), or None."""
    if not r or len(r) < 5 or r[0] != FRAME:
        return None
    if r[1] == BATTERY:
        if not 0 <= r[2] <= 100:
            return None
        return "battery", r[2], r[4] == CHARGING
    if r[1] == POWER:
        return "power", r[4], False
    return None


def _order(d: dict) -> Tuple[int, int]:
    """0xFFC0 first (the configuration collection of the other SteelSeries headsets),
    then the other vendor pages, then the rest."""
    page = d.get("usage_page") or 0
    return (0 if page == VENDOR_USAGE_PAGE else 1 if page >= 0xFF00 else 2, page)


class SteelSeriesEliteProvider(Provider):
    name = "steelseries_elite"

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

    @staticmethod
    def _write(dev) -> bool:
        try:
            n = dev.write(REQUEST)
        except (OSError, IOError, ValueError):
            return False
        return n is None or n >= 0

    def _send(self, pid: int, handles) -> Optional[bytes]:
        """Send 01 b0 to the remembered collection, or find a vendor one that takes it."""
        vendor = [(d, dev) for d, dev in handles if (d.get("usage_page") or 0) >= 0xFF00]
        cached = self._path.get(pid)
        for d, dev in vendor:
            if d["path"] == cached:
                if self._write(dev):
                    return cached
                self._path.pop(pid, None)
                break
        for d, dev in vendor:
            if d["path"] == cached:
                continue                  # it has just refused
            label = f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}"
            if self._write(dev):
                self._diag.append(f"  01 b0: output report taken by {label}")
                self._path[pid] = d["path"]
                return d["path"]
            self._diag.append(f"  01 b0: refused by {label}")
        self._diag.append("  01 b0: no collection took the request, listening only")
        return None

    def _listen(self, handles) -> Tuple[Optional[Tuple[int, bool]], Optional[int]]:
        """Read every collection until a level and a power state came (the direct
        reply has both, or the two frames) or the window ends.
        -> ((level, charging) or None, power state or None)."""
        level, power = None, None
        end = time.time() + READ_WINDOW
        while time.time() < end and (level is None or power is None):
            got = False
            for d, dev in handles:
                try:
                    r = list(dev.read(READ_LEN) or [])
                except (OSError, IOError, ValueError):
                    continue
                if not r:
                    continue
                got = True
                label = f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}"
                reply = parse_reply(r)
                if reply is not None:
                    self._diag.append(f"  01 b0 reply on {label}: {hexdump(r, 17)}")
                    if reply[0] is not None:
                        level = (reply[0], reply[1])
                    power = reply[2]
                    continue
                res = parse(r)
                if res is None:
                    self._diag.append(f"  ignored on {label}: {hexdump(r, 17)}")
                    continue
                self._diag.append(f"  {res[0]} frame on {label}: {hexdump(r, 8)}")
                if res[0] == "battery":
                    level = (res[1], res[2])
                else:
                    power = res[1]
                    if power == POWER_OFFLINE:
                        return level, power
            if not got:
                time.sleep(READ_PAUSE)
        return level, power

    # ---- poll ------------------------------------------------------------------
    def poll(self) -> List[DeviceStatus]:
        self._diag = []
        if hid is None:
            return []
        try:
            infos = hidlist.enumerate(STEELSERIES_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(steelseries elite): %s", e)
            return []
        out = []
        for pid, name in PIDS.items():
            mine = [d for d in infos
                    if d["product_id"] == pid and d.get("interface_number") == INTERFACE]
            if not mine:
                continue
            self._diag.append(f"[SteelSeries] pid={pid:04x} '{name}', "
                              f"interface {INTERFACE} collections: {len(mine)}")
            handles = self._open(mine)
            try:
                self._send(pid, handles)
                level, power = self._listen(handles)
            finally:
                self._close(handles)
            if power == POWER_OFFLINE:
                self._diag.append("  the headset is off or out of range")
                continue
            if level is None:
                self._diag.append("  no battery level (01 b0 reply or 07 b7 frame)")
                continue
            percent, charging = level
            out.append(DeviceStatus(f"steelseries:{pid:04x}", name, percent,
                                    charging or power == POWER_CABLE, True,
                                    "steelseries", kind="headset"))
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)
