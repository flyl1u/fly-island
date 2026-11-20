"""Astro A50 Gen 5 base station (Logitech 046d:0b1c) over USB/HID, without G HUB.

Protocol from Sapd/HeadsetControl's logitech_astro_a50 device, which was
reverse-engineered from G HUB captures and verified on the same USB id
(046d:0b1c) - it is *not* HID++ and not the newer "Centurion" protocol used by
the A50 X:

  * one vendor HID collection, usage page 0xFF32 / usage 0x0074. It is picked by
    usage page rather than by its interface number: HeadsetControl names
    interface 8, and a station here reports exactly that, but the usage page is
    what identifies the collection and the interface number is not part of the
    protocol.
  * frames are 64 bytes, report id 0x02:
        [0] 0x02   report id
        [1] 0x0c   constant marker
        [2] LEN    meaningful bytes that follow = 3 + payload length
        [3] 0x00
        [4] CMD
        [5] HANDLE transaction handle, echoed back (any value works)
        [6..] payload
  * battery: CMD 0x06, no payload -> reply 02 0c 06 00 06 00 <level> <level2> <dock>
        level  = byte 6 (percent)
        docked = byte 8 != 0, which is how the station reports charging

The station also pushes unsolicited frames of the same shape, so a reply is only
accepted when it matches our command. A level above 100 is refused rather than
shown as a made-up number.
"""
from __future__ import annotations

import time
from typing import List, Optional

import hid

from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

ASTRO_VID = 0x046D
ASTRO_PID_A50_GEN5 = 0x0B1C
USAGE_PAGE = 0xFF32
USAGE = 0x0074

REPORT_ID = 0x02
MARKER = 0x0C
FRAME_SIZE = 64

CMD_BATTERY = 0x06
HANDLE_BATTERY = 0x0C           # an echo token, not a real transaction id

LEVEL_INDEX = 6
DOCK_INDEX = 8

POLL_ATTEMPTS = 8               # same as HeadsetControl: other frames can arrive first
READ_TIMEOUT_MS = 300
FLUSH_TIMEOUT_MS = 30

PIDS = {
    ASTRO_PID_A50_GEN5: "Astro A50 Gen 5",
}


def make_request(cmd: int, handle: int, payload: bytes = b"") -> List[int]:
    frame = [REPORT_ID, MARKER, 3 + len(payload), 0x00, cmd, handle] + list(payload)
    return frame + [0x00] * (FRAME_SIZE - len(frame))


def parse_battery(r) -> Optional[int]:
    """Percent from a battery reply, or None when this is not one."""
    if not r or len(r) <= LEVEL_INDEX:
        return None
    if r[0] != REPORT_ID or r[1] != MARKER or r[4] != CMD_BATTERY:
        return None
    level = r[LEVEL_INDEX]
    return level if 0 <= level <= 100 else None


def parse_dock(r) -> Optional[bool]:
    if not r or len(r) <= DOCK_INDEX:
        return None
    if r[0] != REPORT_ID or r[1] != MARKER or r[4] != CMD_BATTERY:
        return None
    return r[DOCK_INDEX] != 0


class AstroProvider(Provider):
    name = "astro"

    def __init__(self):
        self._diag: List[str] = []

    def _pick(self, infos: List[dict]) -> Optional[dict]:
        """The control collection by usage page/usage, falling back to the first
        entry so that a probe still shows what the station offers."""
        for d in infos:
            if (d.get("usage_page"), d.get("usage")) == (USAGE_PAGE, USAGE):
                return d
        self._diag.append(f"  no usage {USAGE_PAGE:04x}:{USAGE:04x} collection; "
                          f"falling back to the first of {len(infos)}")
        return infos[0] if infos else None

    def _query(self, path: bytes, cmd: int, handle: int) -> Optional[List[int]]:
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"  open: {e}")
            return None
        try:
            dev.write(make_request(cmd, handle))
            for _ in range(POLL_ATTEMPTS):
                r = dev.read(FRAME_SIZE, READ_TIMEOUT_MS)
                if not r:
                    continue
                self._diag.append(f"  cmd {cmd:02x} frame: {hexdump(r)}")
                reply = list(r)
                if len(reply) > 4 and reply[4] == cmd:
                    return reply
            self._diag.append(f"  cmd {cmd:02x}: no frame matching the command")
            return None
        except (OSError, IOError, ValueError) as e:
            self._diag.append(f"  cmd {cmd:02x} error: {e}")
            return None
        finally:
            try:
                dev.close()
            except Exception:
                pass

    def poll(self) -> List[DeviceStatus]:
        self._diag = []
        try:
            infos = hidlist.enumerate(ASTRO_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(astro): %s", e)
            return []
        out = []
        seen = set()
        for pid in PIDS:
            mine = [d for d in infos if d["product_id"] == pid and d["path"] not in seen]
            if not mine:
                continue
            d = self._pick(mine)
            if d is None:
                continue
            seen.add(d["path"])
            name = PIDS[pid]
            self._diag.append(f"[Astro] pid={pid:04x} '{name}' "
                              f"iface={d.get('interface_number')} "
                              f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}")
            reply = self._query(d["path"], CMD_BATTERY, HANDLE_BATTERY)
            level = parse_battery(reply)
            if level is None:
                continue
            charging = parse_dock(reply) or False
            out.append(DeviceStatus(f"astro:{pid:04x}", name, level, charging, True,
                                    "astro", kind="headset"))
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)
