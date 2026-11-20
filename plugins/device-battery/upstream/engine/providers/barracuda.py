"""Razer Barracuda Pro (2.4 GHz, receiver 1532:053a): the "PA" protocol.

The headset does not answer the standard Razer mouse request the way our
Razer provider sends it, and it does not expose a battery usage either - both
collections its receiver publishes (`ff00:0000` and `000c:0001`) return nothing
for it. What it does speak is the same family the BlackShark V2 Pro uses: a
64-byte vendor request beginning with 'P','A' (0x50 0x41) and a reply beginning
with 'P','I' (0x50 0x49).

The layout below is not copied from the BlackShark implementation - it is read
off a USBPcap capture of Razer Synapse refreshing the battery page of a real
Barracuda Pro on Windows (issue #10). The two differ by an offset: the request
here carries 'P','A' two bytes earlier, and the reply's command echo sits at
byte 13 rather than 12.

Request (64 bytes, [0] = report id):
    [0]=0x01 [1]=0x80 [2]=8 [3]='P' [4]='A' [5]=0x08 [6]=0x08 [7]=0x03 [8]=command
Remote mode (Synapse sends it before querying):
    [2]=0x07 [5]=0x0E [6]=0x08 [7]=0x02 [8]=0xE1 [9]=1 (on) / 0 (off)
Reply:
    [0]=0x01 [1]=0x80 [2]=length [3]='P' [4]='I' [5]=0x08 [6..12]=sequence bytes
    [13]=command echo [14]=0x01 (reply) or 0x02 (notification) [15]=length
    [16..]=data - the battery command's data byte is the level in percent
"""
from __future__ import annotations

import time
from typing import List, Optional, Tuple

import hid

from .base import DeviceStatus, Provider, hexdump

VID = 0x1532
PID = 0x053A
REPORT_ID = 0x01
REPORT_LEN = 64

TYPE_REMOTE = 0x02
TYPE_QUERY = 0x03
CMD_REMOTE = 0xE1
CMD_BATTERY = 0x21
CMD_CHARGING = 0x2A

MARKER_REQUEST = (0x50, 0x41)   # 'P','A'
MARKER_REPLY = (0x50, 0x49)     # 'P','I'
REPLY_CMD_OFF = 13
ATTEMPTS = 4
REPLY_TIMEOUT_MS = 150
WAKE_ATTEMPTS = 3

USAGE_PAGE_VENDOR = 0xFF00


def frame_query(cmd_id: int, cmd_type: int = TYPE_QUERY) -> bytes:
    b = bytearray(REPORT_LEN)
    b[0] = REPORT_ID
    b[1] = 0x80
    b[2] = 8
    b[3], b[4] = MARKER_REQUEST
    b[5] = 0x08
    b[6] = 0x08
    b[7] = cmd_type
    b[8] = cmd_id
    return bytes(b)


def frame_remote(on: bool) -> bytes:
    b = bytearray(REPORT_LEN)
    b[0] = REPORT_ID
    b[1] = 0x80
    b[2] = 0x07
    b[3], b[4] = MARKER_REQUEST
    b[5] = 0x0E
    b[6] = 0x08
    b[7] = TYPE_REMOTE
    b[8] = CMD_REMOTE
    b[9] = 1 if on else 0
    return bytes(b)


def is_reply(data) -> bool:
    """A reply from this headset, with or without hidapi's report-id prefix."""
    d = list(data or [])
    for off in (0, -1):
        if off == -1 and d and d[0] == REPORT_ID:
            continue
        m = 3 + off
        if len(d) > m + 1 and d[m] == MARKER_REPLY[0] and d[m + 1] == MARKER_REPLY[1]:
            return True
    return False


def parse_reply(data, cmd_id: int) -> Optional[List[int]]:
    """Return the payload of an ACK (or notification) for our command."""
    d = list(data or [])
    for off in (0, -1):
        if off == -1 and d and d[0] == REPORT_ID:
            continue
        c = REPLY_CMD_OFF + off
        if len(d) > c + 3 and d[c] == cmd_id and d[c + 1] in (0x01, 0x02):
            n = d[c + 2]
            if 0 < n <= 32:
                return d[c + 3:c + 3 + n]
    return None


def parse_level(payload) -> Optional[int]:
    if not payload:
        return None
    level = payload[0]
    return level if 0 <= level <= 100 else None


def is_candidate(info: dict) -> bool:
    """The receiver's vendor collection - by usage page, never by interface."""
    return info.get("usage_page") == USAGE_PAGE_VENDOR


class Session:
    def __init__(self, path: bytes, diag: List[str]):
        self.dev = hid.device()
        self.dev.open_path(path)
        self.diag = diag

    def close(self):
        try:
            self.dev.close()
        except Exception:
            pass

    def _write(self, frame: bytes) -> bool:
        try:
            n = self.dev.write(frame)
        except (OSError, IOError) as e:
            self.diag.append(f"    write: {e}")
            return False
        if n is not None and n < 0:
            # hidapi reports a failed write by returning -1, not by raising
            self.diag.append(f"    write -> {n}")
            return False
        return True

    def _drain(self):
        for _ in range(8):
            try:
                if not self.dev.read(REPORT_LEN, 20):
                    return
            except (OSError, IOError):
                return

    def remote(self, on: bool) -> bool:
        self._drain()
        return self._write(frame_remote(on))

    def query(self, cmd_id: int) -> Optional[List[int]]:
        result = None
        for attempt in range(ATTEMPTS):
            self._drain()
            if not self._write(frame_query(cmd_id)):
                return None
            for _ in range(6):
                try:
                    data = self.dev.read(REPORT_LEN, REPLY_TIMEOUT_MS)
                except (OSError, ValueError) as e:
                    self.diag.append(f"    read: {e}")
                    data = None
                if not data:
                    continue
                payload = parse_reply(data, cmd_id)
                if payload is not None:
                    self.diag.append(f"    cmd {cmd_id:02x} attempt {attempt + 1}: {hexdump(data, 20)}")
                    result = payload
                    break
                if is_reply(data):
                    self.diag.append(f"    cmd {cmd_id:02x} attempt {attempt + 1}: other report "
                                     f"{hexdump(data, 20)}")
                else:
                    self.diag.append(f"    cmd {cmd_id:02x} attempt {attempt + 1}: "
                                     f"unrecognised {hexdump(data, 20)}")
            if result is not None:
                break
            self.diag.append(f"    cmd {cmd_id:02x} attempt {attempt + 1}: no reply")
        return result


def read_battery(path: bytes, diag: List[str]) -> Tuple[str, Optional[int], bool]:
    """-> ('ok'|'offline'|'fail', level, charging)

    'offline' - the collection accepts commands but the headset does not answer
    (switched off, or the radio link is down).
    'fail'    - could not be opened at all.
    """
    try:
        s = Session(path, diag)
    except (OSError, IOError) as e:
        diag.append(f"    open: {e}")
        return "fail", None, False
    try:
        woke = False
        for attempt in range(WAKE_ATTEMPTS):
            if s.remote(True):
                woke = True
                break
            time.sleep(0.15 * (attempt + 1))
        if not woke:
            diag.append("    receiver does not accept commands")
            return "offline", None, False
        time.sleep(0.05)
        battery = s.query(CMD_BATTERY)
        if battery is None:
            # no answer: the charging query would only wait out its own timeouts
            s.remote(False)
            diag.append("    no battery reply")
            return "offline", None, False
        charging = s.query(CMD_CHARGING)
        s.remote(False)
        level = parse_level(battery)
        if level is None:
            diag.append(f"    battery reply out of range: {battery[:4]}")
            return "fail", None, False
        return "ok", level, bool(charging and charging[0])
    finally:
        s.close()


class BarracudaProvider(Provider):
    """The Barracuda Pro over its 2.4 GHz receiver."""

    name = "barracuda"

    def __init__(self):
        self._diag: List[str] = []

    def poll(self) -> List[DeviceStatus]:
        from . import hidlist

        self._diag = []
        try:
            infos = hidlist.enumerate(VID)
        except Exception as e:
            self._diag.append(f"  enumerate: {e}")
            return []
        mine = [d for d in infos if d.get("product_id") == PID]
        if not mine:
            return []
        cands = [d for d in mine if is_candidate(d)]
        if not cands:
            self._diag.append("  no %04x vendor collection on the receiver" % USAGE_PAGE_VENDOR)
            return []
        path = cands[0]["path"]
        self._diag.append("  pid=%04x vendor collection: %s" % (PID, hexdump(path)))
        state, level, charging = read_battery(path, self._diag)
        if state != "ok" or level is None:
            # The receiver is present but the headset is not answering: say so
            # rather than dropping the icon, the same way the other wireless
            # headsets behave.
            return [DeviceStatus("barracuda:053a", "Razer Barracuda Pro (2.4 GHz)", None,
                                 False, False, "barracuda", kind="headset")]
        return [DeviceStatus("barracuda:053a", "Razer Barracuda Pro (2.4 GHz)", level,
                             charging, True, "barracuda", kind="headset")]

    def diagnostics(self) -> List[str]:
        return list(self._diag)
