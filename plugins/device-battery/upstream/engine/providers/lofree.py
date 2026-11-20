"""Lofree Hyzen keyboards on their 2.4 GHz dongle.

Source: Lofree's own web driver (hyzen.lofree.tech). Its code is obfuscated; the
exchange below comes from its device list and from its battery routine, with the
strings decoded by the page's own decoder functions.

Device list: vendor 0x388D, collection usage page 0xFF1C, usage 0x92:
    0x0024  Hyzen on the USB cable     (connection type 1, device id 101)
    0x0025  Hyzen on the 2.4 GHz dongle (connection type 2, device id 101)
    0x0029  a second model on the cable (device id 102)

Every command is a small transaction on HID report 0x04. After the report id, a
frame is 31 bytes on the dongle (63 on the cable):

    host   00 00 01                       start
    kbd    .. .. 01 ...                   byte 2 = 01: start acknowledged
    host   00 00 <cmd> 00 00 00 00        the command, no data, offset 0
    kbd    .. .. <cmd> .. 00 00 .. <d0>   byte 2 = cmd (or 00), bytes 4-5 = offset 0,
                                          the answer starts at byte 7
    host   00 00 02                       end
    kbd    .. .. 02 ...                   byte 2 = 02: end acknowledged

The web driver reads the battery only over the dongle, and not when the same
keyboard is also on its cable:
    command 0xAA  "is the keyboard online": d0 = 0 means offline
    command 0x1A  battery: d0 = the level in %
The web driver shows no charging state, so this provider does not either.
"""
from __future__ import annotations

import time
from typing import Dict, List, Optional

try:
    import hid
except ImportError:              # pragma: no cover
    hid = None

from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

LOFREE_VID = 0x388D
USAGE_PAGE, USAGE = 0xFF1C, 0x0092

DONGLES = {0x0025: "Lofree Hyzen"}           # the pids that are read (2.4 GHz)
WIRED_OF = {0x0025: 0x0024}                  # the same keyboard on its cable

REPORT_ID = 0x04
FRAME = 31                                   # bytes after the report id, on the dongle
START, END = 0x01, 0x02
CMD_ONLINE, CMD_BATTERY = 0xAA, 0x1A
DATA_AT = 7                                  # the answer starts here (after the report id)
TIMEOUT = 3.0                                # s, the web driver's minimum timeout
READ_MS = 100


def frame(b2: int) -> List[int]:
    """Report 0x04 with byte 2 set: 00 00 <b2> 00 ..., 31 bytes after the id."""
    return [REPORT_ID, 0x00, 0x00, b2] + [0x00] * (FRAME - 3)


def payload(r) -> Optional[List[int]]:
    """The bytes after the report id of an input report 0x04, or None."""
    if not r or len(r) < 2 or r[0] != REPORT_ID:
        return None
    return list(r[1:])


class LofreeProvider(Provider):
    name = "lofree"

    def __init__(self):
        self._diag: List[str] = []

    def _wait(self, dev, want, deadline: float) -> Optional[List[int]]:
        """Read reports 0x04 until `want(payload)` is true, or until the deadline."""
        while time.time() < deadline:
            try:
                r = dev.read(64, READ_MS)
            except (OSError, ValueError) as e:
                self._diag.append(f"    read: {e}")
                return None
            p = payload(r)
            if p is not None and want(p):
                return p
        return None

    def _command(self, dev, cmd: int) -> Optional[int]:
        """One transaction; the first answer byte, or None."""
        deadline = time.time() + TIMEOUT
        dev.write(frame(START))
        if self._wait(dev, lambda p: len(p) >= 3 and p[2] == START, deadline) is None:
            self._diag.append(f"    cmd {cmd:02x}: no start acknowledgement")
            return None
        dev.write([REPORT_ID, 0x00, 0x00, cmd, 0x00, 0x00, 0x00, 0x00] + [0x00] * (FRAME - 7))
        p = self._wait(dev, lambda p: (len(p) > DATA_AT and p[2] in (cmd, 0x00)
                                       and p[4] == 0x00 and p[5] == 0x00), deadline)
        # close the transaction in any case, as the web driver does
        dev.write(frame(END))
        self._wait(dev, lambda p: len(p) >= 3 and p[2] == END, min(deadline, time.time() + 0.5))
        if p is None:
            self._diag.append(f"    cmd {cmd:02x}: no answer")
            return None
        self._diag.append(f"    cmd {cmd:02x}: {hexdump(p, 10)}")
        return p[DATA_AT]

    def _read(self, path) -> Optional[int]:
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"    open: {e}")
            return None
        try:
            try:
                online = self._command(dev, CMD_ONLINE)
                if online is None:
                    return None
                if online == 0:
                    self._diag.append("    keyboard offline (off or asleep)")
                    return None
                level = self._command(dev, CMD_BATTERY)
            except (OSError, IOError, ValueError) as e:
                self._diag.append(f"    write: {e}")
                return None
            if level is None or not 0 <= level <= 100:
                if level is not None:
                    self._diag.append(f"    level {level} out of range, not shown")
                return None
            return level
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
            infos = hidlist.enumerate(LOFREE_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(lofree): %s", e)
            return []
        present = {d["product_id"] for d in infos}
        out: List[DeviceStatus] = []
        for d in infos:
            pid = d["product_id"]
            if pid not in DONGLES or (d.get("usage_page"), d.get("usage")) != (USAGE_PAGE, USAGE):
                continue
            product = (d.get("product_string") or "").split("@")[0].strip()
            name = f"Lofree {product}" if product else DONGLES[pid]
            self._diag.append(f"[Lofree] {name} pid={pid:04x}")
            if WIRED_OF.get(pid) in present:
                self._diag.append("  the keyboard is on its cable: the dongle is not read")
                continue
            level = self._read(d["path"])
            if level is not None:
                self._diag.append(f"  -> {level}%")
                out.append(DeviceStatus(f"lofree:{pid:04x}", name, level, False, True, "lofree",
                                        kind="keyboard"))
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)
