"""Keychron wireless devices over their receiver (Ultra-Link 8K) or cable, without
Keychron's own software.

Protocol from csutcliff/keychron-battery-dkms, which implements it for these ids:

  * 3434:d048  Keychron M5, over the cable
  * 3434:d028  the Ultra-Link 8K receiver

Keychron does not expose a standard HID battery report, so the level comes from the
vendor protocol:

  * the vendor collection on interface 4 - the interface number is the only handle
    that module uses to find it, and a probe logs what is actually present.
  * request: a 64-byte *feature* report `b3 06 00 ...` (report id 0xB3, command
    0x06 status).
  * reply: a 64-byte input report on the interrupt endpoint: `b4 06 ... <level> ...`,
    the battery in byte 20, accepted only when it is 100 or less.
  * up to three attempts, 100 ms apart, with a 500 ms wait for each reply.

The reply carries no charging flag, so none is reported.
"""
from __future__ import annotations

import time
from typing import List, Optional

import hid

from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

KEYCHRON_VID = 0x3434

USAGE_PAGE = 0
USAGE = 0
VENDOR_INTERFACE = 4            # the interface the module binds to

REPORT_ID_CMD = 0xB3
REPORT_ID_RESP = 0xB4
CMD_STATUS = 0x06
BATTERY_OFFSET = 20
REPORT_SIZE = 64

ATTEMPTS = 3
RETRY_DELAY = 0.1               # 100 ms between attempts
READ_TIMEOUT_MS = 500           # the module waits 500 ms for the reply
FLUSH_TIMEOUT_MS = 30

PIDS = {
    0xD028: "Keychron Ultra-Link 8K",
    0xD048: "Keychron M5",
}


def make_request() -> List[int]:
    return [REPORT_ID_CMD, CMD_STATUS] + [0x00] * (REPORT_SIZE - 2)


def parse_level(r) -> Optional[int]:
    """Percent from a status reply, or None when this is not one."""
    if not r or len(r) <= BATTERY_OFFSET:
        return None
    if r[0] != REPORT_ID_RESP or r[1] != CMD_STATUS:
        return None
    level = r[BATTERY_OFFSET]
    return level if 0 <= level <= 100 else None


class KeychronProvider(Provider):
    name = "keychron"

    def __init__(self):
        self._diag: List[str] = []

    def _pick(self, infos: List[dict]) -> Optional[dict]:
        for d in infos:
            if d.get("interface_number") == VENDOR_INTERFACE:
                return d
        self._diag.append(f"  no interface {VENDOR_INTERFACE} collection; "
                          f"falling back to the first of {len(infos)}")
        return infos[0] if infos else None

    def _query(self, path: bytes) -> Optional[List[int]]:
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"  open: {e}")
            return None
        try:
            for attempt in range(ATTEMPTS):
                if attempt:
                    time.sleep(RETRY_DELAY)
                try:
                    dev.send_feature_report(make_request())
                except (OSError, IOError, ValueError) as e:
                    self._diag.append(f"  attempt {attempt + 1} send: {e}")
                    continue
                r = dev.read(REPORT_SIZE, READ_TIMEOUT_MS)
                if not r:
                    self._diag.append(f"  attempt {attempt + 1}: no reply")
                    continue
                self._diag.append(f"  attempt {attempt + 1} reply: {hexdump(r)}")
                if parse_level(r) is not None:
                    return list(r)
            self._diag.append("  no usable level in the replies")
            return None
        finally:
            try:
                dev.close()
            except Exception:
                pass

    def poll(self) -> List[DeviceStatus]:
        self._diag = []
        try:
            infos = hidlist.enumerate(KEYCHRON_VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(keychron): %s", e)
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
            self._diag.append(f"[Keychron] pid={pid:04x} '{name}' "
                              f"iface={d.get('interface_number')} "
                              f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}")
            reply = self._query(d["path"])
            level = parse_level(reply)
            if level is None:
                continue
            out.append(DeviceStatus(f"keychron:{pid:04x}", name, level, False, True,
                                    "keychron"))
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)
