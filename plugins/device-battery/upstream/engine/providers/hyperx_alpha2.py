"""HyperX Cloud Alpha 2 over its 2.4 GHz station, without NGENUITY.

The station is two USB functions: 03F0:08BE ("Wireless Controller", which carries
the battery) and 03F0:0ABE ("Wireless Chat", isochronous audio only - there is
nothing to read there; a Device Manager listing can quote that half).

The battery exchange was decoded from two USBPcap captures of NGENUITY in issue
#26, taken at two different charge levels, and matched against the number
NGENUITY displayed at the time:

  * battery collection, usage page 0xFF13 / usage 0xFF00
  * request: 64-byte output report  50 02 00 00 ...   (0x50 is the report id)
  * reply:   the input report starting 51 02
        51 02 <level%> 00 1a 00 <flags> ...
      level = byte 2, a plain percentage: 0x33 = 51 and 0x43 = 67 in the two
              captures, matching NGENUITY both times
      flags = index 6; bit 7 was set after a recharge and clear before, so it is
              reported as charging (one capture each way)

Do not use the 61 02 frame: it is byte-identical across both charge levels, so it
is not the battery. While NGENUITY runs, the same channel carries thousands of
`ff 01` and `44`/`45` frames; stale reports are drained before the request and the
reply is read until it arrives, so the two applications can run at once. A reply that does not start 51 02 is ignored, and a level
above 100 is refused rather than shown as a made-up number.
"""
from __future__ import annotations

import time
from typing import List, Optional, Tuple

try:
    import hid
except ImportError:              # pragma: no cover
    hid = None

from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

HYPERX_VID = 0x03F0
PID = 0x08BE                    # the Controller half; 0x0ABE is the Chat half
NAME = "HyperX Cloud Alpha 2"

USAGE_PAGE = 0xFF13
USAGE = 0xFF00

REPORT_ID_REQUEST = 0x50
REPORT_ID_REPLY = 0x51
SUBCMD_BATTERY = 0x02

REQUEST_LEN = 64
REPLY_LEN = 64
LEVEL_INDEX = 2
FLAGS_INDEX = 6
CHARGING_BIT = 0x80

# while the vendor app is open the station talks constantly (thousands of `ff 01`
# and `44`/`45` frames against a handful of battery replies), so stale input reports
# are drained before the write and the reply is then read until it arrives.
DRAIN_MAX = 64
DRAIN_TIMEOUT_MS = 5
READ_TIMEOUT_MS = 150
REPLY_DEADLINE_MS = 1500


def make_request() -> List[int]:
    return [REPORT_ID_REQUEST, SUBCMD_BATTERY] + [0x00] * (REQUEST_LEN - 2)


def parse_reply(r) -> Optional[Tuple[int, bool]]:
    """(level, charging) from a 51 02 reply, or None if it is not one."""
    if not r or len(r) <= FLAGS_INDEX:
        return None
    if r[0] != REPORT_ID_REPLY or r[1] != SUBCMD_BATTERY:
        return None
    level = r[LEVEL_INDEX]
    if not 0 <= level <= 100:
        return None
    return level, bool(r[FLAGS_INDEX] & CHARGING_BIT)


class HyperXAlpha2Provider(Provider):
    name = "hyperx_alpha2"

    def __init__(self):
        self._diag: List[str] = []

    def _pick(self, infos: List[dict]) -> Optional[dict]:
        """The battery collection by usage page/usage - never by interface number:
        the same station carries ff13:0001 on another interface, and the Chat half
        shares the vendor page without carrying the battery."""
        for d in infos:
            if (d.get("usage_page"), d.get("usage")) == (USAGE_PAGE, USAGE):
                return d
        offered = ", ".join(f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}" for d in infos)
        self._diag.append(f"  no usage {USAGE_PAGE:04x}:{USAGE:04x} collection (found: {offered})")
        return None

    def _query(self, path: bytes) -> Optional[Tuple[int, bool]]:
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"  open: {e}")
            return None
        try:
            # clear the backlog first: with the vendor app running the queue is full of
            # its housekeeping, and a reply read from the back of it would never arrive
            drained = 0
            while drained < DRAIN_MAX:
                if not dev.read(REPLY_LEN, DRAIN_TIMEOUT_MS):
                    break
                drained += 1
            dev.write(make_request())
            deadline = time.monotonic() + REPLY_DEADLINE_MS / 1000.0
            seen = 0
            while time.monotonic() < deadline:
                r = dev.read(REPLY_LEN, READ_TIMEOUT_MS)
                if not r:
                    continue
                parsed = parse_reply(r)
                if parsed is not None:
                    extra = f" after {seen} other frame(s)" if seen or drained else ""
                    self._diag.append(f"  reply{extra}: {hexdump(r)}")
                    return parsed
                if seen == 0:
                    self._diag.append(f"  first frame: {hexdump(r)}")
                seen += 1
            self._diag.append(f"  no 51 02 reply ({seen} frame(s) seen, {drained} drained)")
            return None
        except (OSError, IOError, ValueError) as e:
            self._diag.append(f"  error: {e}")
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
            log.warning("hid.enumerate(hyperx_alpha2): %s", e)
            return []
        mine = [d for d in infos if d.get("product_id") == PID]
        if not mine:
            return []
        d = self._pick(mine)
        if d is None:
            return []
        self._diag.append(f"[HyperX Alpha 2] pid={PID:04x} iface={d.get('interface_number')} "
                          f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}")
        parsed = self._query(d["path"])
        if parsed is None:
            return []
        level, charging = parsed
        return [DeviceStatus(f"hyperx:{PID:04x}", NAME, level, charging, True,
                             "hyperx_alpha2", kind="headset")]

    def diagnostics(self) -> List[str]:
        return list(self._diag)
