"""HyperX Cloud II Wireless over USB/HID, without NGENUITY.

Protocol (Sapd/HeadsetControl's hyperx_cloud_2_wireless device, which lists the
same two product ids):

  * the dongle's vendor collection, usage page 0xFF90 / usage 0x0303. It has to be
    picked by usage: HeadsetControl gives interface 0 for it while a dongle here
    reports it on interface 3, and the same dongle carries four collections on
    that interface (000c, ff00, ff90, ffc0), so taking the first one would talk to
    the wrong endpoint.
  * request: 52 bytes, 06 ff bb <cmd> 00 ...   (0x06 is the report id)
  * reply:   20 bytes, its first four bytes echo the request: 06 ff bb <cmd>
      cmd 02, battery:  reply[7] = percent, reply[5..6] = millivolts
      cmd 03, charging: reply[4] == 1 means charging

A reply that does not echo the command is ignored, and a level above 100 is
refused rather than shown as a made-up number.
"""
from __future__ import annotations

import time
from typing import List, Optional

try:
    import hid
except ImportError:              # pragma: no cover
    hid = None

from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

HYPERX_VID = 0x03F0
USAGE_PAGE = 0xFF90
USAGE = 0x0303

CMD_LEVEL = 0x02
CMD_CHARGING = 0x03
LEVEL_INDEX = 0x07
CHARGING_INDEX = 0x04

WRITE_TIMEOUT = 0.1          # HeadsetControl waits 100 ms between request and read
READ_TIMEOUT_MS = 1000
REPLY_LEN = 20

# Cloud II Wireless. 0x0696 is the older dongle revision, 0x018b the newer one.
PIDS = {
    0x0696: "HyperX Cloud II Wireless",
    0x018B: "HyperX Cloud II Wireless",
}


def make_request(cmd: int) -> List[int]:
    return [0x06, 0xFF, 0xBB, cmd, 0x00] + [0x00] * 47


def parse_level(r) -> Optional[int]:
    if not r or len(r) <= LEVEL_INDEX:
        return None
    if list(r[:4]) != [0x06, 0xFF, 0xBB, CMD_LEVEL]:
        return None
    level = r[LEVEL_INDEX]
    return level if 0 <= level <= 100 else None


def parse_charging(r) -> Optional[bool]:
    if not r or len(r) <= CHARGING_INDEX:
        return None
    if list(r[:4]) != [0x06, 0xFF, 0xBB, CMD_CHARGING]:
        return None
    return r[CHARGING_INDEX] == 1


class HyperXProvider(Provider):
    name = "hyperx"

    def __init__(self):
        self._diag: List[str] = []

    def _pick(self, infos: List[dict]) -> Optional[dict]:
        """The battery collection by usage page/usage. Without it nothing is written:
        the other collections on that interface are not the battery endpoint, so the
        probe only lists what the dongle offers."""
        for d in infos:
            if (d.get("usage_page"), d.get("usage")) == (USAGE_PAGE, USAGE):
                return d
        offered = ", ".join(f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}" for d in infos)
        self._diag.append(f"  no usage {USAGE_PAGE:04x}:{USAGE:04x} collection (found: {offered})")
        return None

    def _query(self, path: bytes, cmd: int) -> Optional[List[int]]:
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"  open: {e}")
            return None
        try:
            dev.write(make_request(cmd))
            time.sleep(WRITE_TIMEOUT)
            r = dev.read(REPLY_LEN, READ_TIMEOUT_MS)
            if not r:
                self._diag.append(f"  cmd {cmd:02x}: no reply")
                return None
            self._diag.append(f"  cmd {cmd:02x} reply: {hexdump(r)}")
            return list(r)
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
            infos = hidlist.enumerate(HYPERX_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(hyperx): %s", e)
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
            self._diag.append(f"[HyperX] pid={pid:04x} '{name}' "
                              f"iface={d.get('interface_number')} "
                              f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}")
            level = parse_level(self._query(d["path"], CMD_LEVEL))
            if level is None:
                continue
            charging = parse_charging(self._query(d["path"], CMD_CHARGING))
            out.append(DeviceStatus(f"hyperx:{pid:04x}", name, level, charging, True,
                                    "hyperx", kind="headset", charging_known=charging is not None))
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)
