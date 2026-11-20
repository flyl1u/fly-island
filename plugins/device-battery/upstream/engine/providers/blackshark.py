"""Razer BlackShark V2 Pro (2023, receiver 1532:0555): the "PA" protocol.

The headset does NOT speak the standard 90-byte Razer protocol. It has its own
vendor interface (Usage Page 0xFF00, Report ID 0x02) with 64-byte interrupt
output/input reports. The format comes from the OpenRazer driver
(razerblackshark_driver, PR #2862), decoded from a Synapse traffic capture.

Request frame (64 bytes, [0] = report id):
    [0]=0x02 [1]=0x80 [2]=8+len [5]='P' [6]='A' [7]=0x08 [9]=type [10]=command
    [11]=flag [12]=data length [13..]=data
Remote mode (required before a query):
    [2]=0x07 [7]=0x0E [9]=0x02 [10]=0xE1 [11]=1 (on) / 0 (off)
Reply:
    [0]=0x02 ... [12]=command echo [13]=0x01 (ACK) [14]=length [15..]=data

Quirk: after ~0.3 s of idle the radio link dozes and the first frame only
wakes it up, so a "sacrificial" remote-on is sent first.
"""
from __future__ import annotations

import time
from typing import List, Optional, Tuple

import hid

from .base import hexdump

REPORT_ID = 0x02
REPORT_LEN = 64

TYPE_REMOTE = 0x02
TYPE_QUERY = 0x03
CMD_REMOTE = 0xE1
CMD_BATTERY = 0x21
CMD_CHARGING = 0x2A

REPLY_CMD_OFF = 12
ATTEMPTS = 3
WAKE_ATTEMPTS = 4
REPLY_TIMEOUT_MS = 150

PA_PIDS = {0x0555, 0x0556}


def frame_query(cmd_id: int, cmd_type: int = TYPE_QUERY) -> bytes:
    b = bytearray(REPORT_LEN)
    b[0] = REPORT_ID
    b[1] = 0x80
    b[2] = 8
    b[5] = 0x50  # 'P'
    b[6] = 0x41  # 'A'
    b[7] = 0x08
    b[9] = cmd_type
    b[10] = cmd_id
    return bytes(b)


def frame_remote(on: bool) -> bytes:
    b = bytearray(REPORT_LEN)
    b[0] = REPORT_ID
    b[1] = 0x80
    b[2] = 0x07
    b[5] = 0x50
    b[6] = 0x41
    b[7] = 0x0E
    b[9] = TYPE_REMOTE
    b[10] = CMD_REMOTE
    b[11] = 1 if on else 0
    return bytes(b)


def parse_reply(data, cmd_id: int) -> Optional[List[int]]:
    """Return the payload if this is an ACK for our command."""
    d = list(data or [])
    # hidapi on Windows returns the report id as the first byte; the variant
    # without it is accepted too, just in case.
    for off in (0, -1):
        c = REPLY_CMD_OFF + off
        if len(d) > c + 3 and (off == -1 or d[0] == REPORT_ID):
            if d[c] == cmd_id and d[c + 1] == 0x01:
                n = d[c + 2]
                return d[c + 3:c + 3 + max(n, 1)]
    return None


def is_candidate(info: dict) -> bool:
    return info.get("usage_page") in (0xFF00, 0xFF14)


class PASession:
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
            if n is None or n < 0:
                err = ""
                try:
                    err = self.dev.error() or ""       # Windows error text from hidapi
                except Exception:
                    pass
                self.diag.append(f"    write -> {n} {err}".rstrip())
                return False
            return True
        except (OSError, ValueError) as e:
            self.diag.append(f"    write: {e}")
            return False

    def _drain(self):
        try:
            for _ in range(32):
                if not self.dev.read(REPORT_LEN, 5):
                    break
        except (OSError, ValueError):
            pass

    def _remote(self, on: bool):
        self._write(frame_remote(on))
        time.sleep(0.035)

    def query(self, cmd_id: int) -> Optional[List[int]]:
        self._drain()
        self._remote(True)                    # sacrificial frame: wakes the link up
        result = None
        for attempt in range(ATTEMPTS):
            self._remote(True)
            if not self._write(frame_query(cmd_id)):
                break
            deadline = time.time() + REPLY_TIMEOUT_MS / 1000
            while time.time() < deadline:
                try:
                    data = self.dev.read(REPORT_LEN, 50)
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
            if result is not None:
                break
            self.diag.append(f"    cmd {cmd_id:02x} attempt {attempt + 1}: no reply")
        self._remote(False)
        return result


def read_battery(path: bytes, diag: List[str]) -> Tuple[str, Optional[int], bool]:
    """-> ('ok'|'offline'|'nowake'|'fail', level, charging)

    'ok'      - a reading.
    'offline' - the interface accepted a command and the headset did not answer the battery
                query: this IS the right collection, the headset is switched off.
    'nowake'  - the interface opened but never accepted a single command (or the reopen
                failed): the receiver is present, but the headset is off, the USB device is
                suspended, or this is the wrong collection.
    'fail'    - could not be opened at all.

    'offline' and 'nowake' look identical from the outside - both mean "no reading" - but they
    are not interchangeable to a caller that remembers the collection it talked to: only
    'offline' proves the path speaks this protocol. See RazerProvider._poll_pa.
    """
    try:
        s = PASession(path, diag)
    except (OSError, IOError) as e:
        diag.append(f"    open: {e}")
        return "fail", None, False
    try:
        # The receiver may be asleep (USB selective suspend): give it a few
        # attempts to wake up before giving up. If the current handle is
        # stuck, reopen the receiver once.
        woke = False
        for reopen in range(2):
            for attempt in range(WAKE_ATTEMPTS):
                if s._write(frame_remote(True)):
                    woke = True
                    break
                time.sleep(0.15 * (attempt + 1))
            if woke or reopen:
                break
            diag.append("    reopening the receiver")
            s.close()
            time.sleep(0.3)
            try:
                s = PASession(path, diag)
            except (OSError, IOError) as e:
                diag.append(f"    reopen: {e}")
                return "nowake", None, False     # nothing was accepted: same as above
        if not woke:
            # The interface opened, so the receiver is present: show "no link"
            # instead of removing the icon. But "opened" is all this proves - a wrong
            # collection looks exactly like this, so the caller must not remember the path.
            diag.append("    receiver does not accept commands (headset off or USB asleep)")
            return "nowake", None, False
        time.sleep(0.035)
        bat = s.query(CMD_BATTERY)
        if not bat:
            # The remote-on was accepted, so this path does speak the protocol; the headset
            # is simply not answering. This is the one "no reading" answer worth remembering.
            return "offline", None, False
        level = bat[0]
        if level > 100:
            diag.append(f"    unexpected battery value: {level}")
            level = min(level, 100)
        chg = s.query(CMD_CHARGING)
        charging = bool(chg and chg[0])
        return "ok", level, charging
    finally:
        s.close()
