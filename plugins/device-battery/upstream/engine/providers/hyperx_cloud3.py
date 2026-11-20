"""HyperX Cloud III Wireless over USB/HID, without NGENUITY.

Protocol (LennardKittner/HyperHeadset's cloud_iii_wireless device, which lists these two
product ids and was written from the vendor's own traffic):

  * the dongle's vendor collection, usage page 0xFF13 / usage 0x0001. It has to be picked
    by usage: the same interface also carries the consumer-control (000c) and telephony
    (000b) collections, which are not the battery endpoint.
  * request: 62 bytes, 66 <cmd> 00 ...   (0x66 is the report id)
      cmd 0x89, battery
      cmd 0x8A, charging
  * reply: 62 bytes starting with 0x66, whose second byte is either the command echo or
    the matching response id:
      0x89 / 0x0D  battery:  reply[4] is the percent, but only when reply[2] or reply[3]
                   is non-zero - the reference treats an all-zero state as no reading yet
      0x8A / 0x0C  charging: reply[2] = 0 not charging, 1 charging, 2 fully charged,
                   anything else an error; the two non-zero cases mean on the cable
  * on Windows some HyperX dongles accept these packets as feature reports only: write()
    fails with "Incorrect function" (ERROR_INVALID_FUNCTION) and the reference falls back
    to send_feature_report, so this does too. The diagnostics say which path was used,
    because that is the difference between a reading and none at all.

The Cloud II Core Wireless (03F0:0995 its dongle, 03F0:0795 the second mode the same
reporter's diagnostics show) speaks the same exchange, decoded from his own USBPcap
capture of NGENUITY in #155: NGENUITY wrote `66 89` to interface 3 as a 62-byte output
report and the dongle answered `66 89 0e d7 30 ...` (48 %), and `66 8a` was answered
`66 8a 00 00` (off the cable) - same report id, same commands, same vendor collection as
the Cloud III Wireless. The plain output report is what NGENUITY itself uses here, so
write() is the path in use; the feature fallback stays for the dongles that need it.
Both of its ids can answer in the same poll - the reporter's test-build diagnostics show
the same level and charging state on 0995 and 0795 at once while charging - so each
model's readings are merged into one icon and the charging one wins, the same rule the
ASUS provider uses for a mouse answering on its cable and receiver.

A reply that does not carry the expected command or response id is ignored, and a level
above 100 is refused rather than shown as a made-up number.
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
USAGE_PAGE = 0xFF13
USAGE = 0x0001

REPORT_ID = 0x66
CMD_BATTERY = 0x89
RESP_BATTERY = 0x0D
CMD_CHARGING = 0x8A
RESP_CHARGING = 0x0C

PACKET_LEN = 62
READ_LEN = 64
READ_ATTEMPTS = 6
READ_TIMEOUT_MS = 200
WRITE_PAUSE = 0.1                  # the reference waits between request and read

# Cloud III Wireless. 0x05B7 is the dongle here, 0x0C9D the other id the reference lists.
# 0x0FCC uses the same exchange, user-verified in #186 (90%, not charging).
# Cloud II Core Wireless (#155): 0x0995 is its dongle (the one in the capture), 0x0795 the
# second mode the reporter's diagnostics show - same vendor collection, same exchange.
PIDS = {
    0x05B7: "HyperX Cloud III Wireless",
    0x0C9D: "HyperX Cloud III Wireless",
    0x0FCC: "HyperX Cloud III Wireless",
    0x0795: "HyperX Cloud II Core Wireless",
    0x0995: "HyperX Cloud II Core Wireless",
}

# One headset, two connection ids, one icon. The value keeps the icon's key stable:
# the wireless id is what almost every user runs, and a changed key would throw away
# the icon settings a user already made. Both ids of one model can answer in the same
# poll (#155's diagnostics show the Cloud II Core on 0995 and 0795 at once while
# charging), so per model the readings merge and the charging one wins - the same rule
# the ASUS provider uses for a mouse answering on its cable and receiver.
CANONICAL = {
    0x05B7: 0x05B7, 0x0C9D: 0x05B7,     # Cloud III Wireless (0C9D is its alternate id)
    0x0FCC: 0x05B7,                     # #186: same headset and icon
    0x0995: 0x0995, 0x0795: 0x0995,     # Cloud II Core Wireless and its charging mode
}

# The two error spellings Windows gives when the dongle wants a feature report.
_FEATURE_ONLY = ("incorrect function", "0x00000001")


def make_request(cmd: int) -> List[int]:
    return [REPORT_ID, cmd] + [0x00] * (PACKET_LEN - 2)


def parse_battery(r) -> Optional[int]:
    if not r or len(r) <= 4:
        return None
    if r[0] != REPORT_ID or r[1] not in (CMD_BATTERY, RESP_BATTERY):
        return None
    if r[2] == 0 and r[3] == 0:
        return None                       # the reference's "no reading yet" case
    level = r[4]
    return level if 0 <= level <= 100 else None


def parse_charging(r) -> Optional[bool]:
    if not r or len(r) <= 2:
        return None
    if r[0] != REPORT_ID or r[1] not in (CMD_CHARGING, RESP_CHARGING):
        return None
    state = r[2]
    if state == 0:
        return False
    if state in (1, 2):                   # charging, fully charged
        return True
    return None                           # the reference's error value: no claim either way


class HyperXCloud3Provider(Provider):
    name = "hyperx_cloud3"

    def __init__(self):
        self._diag: List[str] = []

    def _pick(self, infos: List[dict]) -> Optional[dict]:
        """The battery collection by usage page/usage. Without it nothing is written: the
        other collections on that interface are consumer control and telephony."""
        for d in infos:
            if (d.get("usage_page"), d.get("usage")) == (USAGE_PAGE, USAGE):
                return d
        offered = ", ".join(f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}" for d in infos)
        self._diag.append(f"  no usage {USAGE_PAGE:04x}:{USAGE:04x} collection (found: {offered})")
        return None

    @staticmethod
    def _error(dev) -> str:
        """hidapi's text for the last failure (on Windows, the system error message)."""
        try:
            return str(dev.error() or "")
        except Exception:
            return ""

    def _write(self, dev, packet: List[int]) -> bool:
        """write() first, then the feature-report fallback some dongles need on Windows.
        cython-hidapi returns -1 from write() and send_feature_report() on failure rather
        than raising, so a negative result counts as a failure, with dev.error() as its
        text. Some builds raise instead; both paths end up in the same check."""
        try:
            n = dev.write(packet)
            if n is not None and n >= 0:
                return True
            err = f"-> {n} {self._error(dev)}".rstrip()
        except (OSError, IOError, ValueError) as e:
            err = str(e)
        if not any(s in err.lower() for s in _FEATURE_ONLY):
            self._diag.append(f"  write: {err}")
            return False
        self._diag.append(f"  write: {err} -> retrying as a feature report")
        try:
            n = dev.send_feature_report(packet)
            if n is not None and n < 0:
                self._diag.append(f"  feature report -> {n} {self._error(dev)}".rstrip())
                return False
            self._diag.append("  feature report accepted")
            return True
        except (OSError, IOError, ValueError) as e2:
            self._diag.append(f"  feature report: {e2}")
            return False

    def _query(self, path: bytes, cmd: int, expected: tuple) -> Optional[List[int]]:
        """Send one command and return the first reply carrying the echo or response id."""
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"  open: {e}")
            return None
        try:
            if not self._write(dev, make_request(cmd)):
                return None
            time.sleep(WRITE_PAUSE)
            for _ in range(READ_ATTEMPTS):
                r = list(dev.read(READ_LEN, READ_TIMEOUT_MS) or [])
                if not r:
                    continue
                if r[0] == REPORT_ID and len(r) > 1 and r[1] in expected:
                    self._diag.append(f"  cmd {cmd:02x} reply: {hexdump(r, 8)}")
                    return r
                self._diag.append(f"  cmd {cmd:02x} ignored: {hexdump(r, 8)}")
            self._diag.append(f"  cmd {cmd:02x}: no reply carrying "
                              f"{'/'.join(f'{e:02x}' for e in expected)}")
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
        if hid is None:
            return []
        try:
            infos = hidlist.enumerate(HP_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(hyperx cloud iii): %s", e)
            return []
        found: Dict[int, Tuple[int, bool, str]] = {}     # canonical pid -> (level, charging, name)
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
            self._diag.append(f"[HyperX] pid={pid:04x} '{name}' "
                              f"iface={d.get('interface_number')} "
                              f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}")
            level = parse_battery(self._query(d["path"], CMD_BATTERY,
                                             (CMD_BATTERY, RESP_BATTERY)))
            if level is None:
                continue
            charging = parse_charging(self._query(d["path"], CMD_CHARGING,
                                                 (CMD_CHARGING, RESP_CHARGING)))
            canon = CANONICAL.get(pid, pid)
            prev = found.get(canon)
            if prev is None:
                found[canon] = (level, bool(charging), name)
            else:
                if charging and not prev[1]:
                    found[canon] = (level, bool(charging), name)
                self._diag.append("  two connection ids answered; one icon")
        out = []
        for canon, (level, charging, name) in found.items():
            out.append(DeviceStatus(f"hyperx:{canon:04x}", name, level, charging, True,
                                    "hyperx", kind="headset"))
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)
