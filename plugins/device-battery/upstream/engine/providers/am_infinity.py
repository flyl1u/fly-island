"""Angry Miao AM Infinity 8K on its 2.4 GHz receiver/basetta (3151:5007).

Protocol from the AJAZZ Control Center project (Aiacos/ajazz-control-center,
GPL-3.0): its "AJ-series mouse battery" write-up and the byte table it cites.
That project reads the same USB id on its own hardware - the AJAZZ AJ159 APEX
(2.4G 8K) per its device matrix; the receiver of an AM Infinity enumerates as
'AM INFINITY 8K MOUSE' with the identical six collections.

The charge is not a one-shot query. The basetta (the receiver the mouse pairs
to over 2.4 GHz) mirrors the mouse's charge into its status feature report
only after it receives the vendor's ~1 Hz status poll, so the read is a
two-step sequence on the usage page 0xFFFF / usage 0x02 control collection:

    request   feature report id 0x00:  00 F7 00 ... (zero payload)
    wait      ~30 ms for the 2.4G round-trip
    reply     feature report 0x05:     05 00 00 64 01 01 01 02   (Windows)

The charge is the byte after the report id and the zero padding (byte 3 on
Windows hidapi; byte 2 for an unnumbered Linux read - auto-detected). A
non-zero byte before the charge is junk a wireless reconnect can return and
is refused; a charge of 0 means the link is not up yet and is reported as
unknown, never as a wrong 0 %. The reference ships the 65-byte poll in its
app and tries both 65 and 67 in its hardware probe, so both are tried here.
The status report carries no charging flag, so none is shown. Nothing else
is ever written to the device.

**Unverified** on the AM Infinity itself: the exchange is hardware-confirmed
by the reference project on its own unit; the receiver of #72 has to answer
once for this layout to be confirmed too.
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

VID = 0x3151
PID = 0x5007
NAME = "AM Infinity 8K Mouse"

CONTROL_USAGE_PAGE = 0xFFFF      # the control collection: usage page 0xFFFF ...
CONTROL_USAGE = 0x02             # ... and usage 0x02 (interface 2 / MI_02 in the reference)

STATUS_REPORT_ID = 0x05          # the vendor status report the charge rides in
STATUS_POLL_OPCODE = 0xF7        # the vendor's ~1 Hz status poll, zero payload
POLL_LENGTHS = (65, 67)          # the app sends 65; the hardware probe tries both
SETTLE_S = 0.03                  # one 2.4G round-trip is enough from cold
ASLEEP_KEEP = 300                # s, as in the other receiver providers


def control_collection(ifaces: List[dict]) -> Optional[dict]:
    """The one collection the status poll may go to: usage page 0xFFFF, usage 0x02."""
    for d in ifaces:
        if d.get("usage_page") == CONTROL_USAGE_PAGE and d.get("usage") == CONTROL_USAGE:
            return d
    return None


def parse_charge(frame) -> Optional[int]:
    """Charge percent from a status report, or None when there is no usable value.

    Windows hidapi keeps the requested report id at index 0 (`05 00 00 64 ...`,
    charge at byte 3); an unnumbered Linux read has no id prefix (charge at
    byte 2). The bytes between the id and the charge are zero padding - a
    non-zero there is junk a wireless reconnect can return and is refused. A
    charge of 0 means the link is not up yet.
    """
    if not frame or len(frame) < 4:
        return None
    charge_index = 3 if frame[0] == STATUS_REPORT_ID else 2
    for i in range(1, charge_index):
        if frame[i] != 0:
            return None
    charge = frame[charge_index]
    if charge == 0:
        return None
    return min(charge, 100)


class AmInfinityProvider(Provider):
    name = "am_infinity"

    def __init__(self):
        self._diag: List[str] = []
        self._last: Optional[Tuple[int, float]] = None    # (charge, when)

    def _read(self, path: bytes) -> Optional[int]:
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"    open: {e}")
            return None
        try:
            for length in POLL_LENGTHS:
                poll = [0x00, STATUS_POLL_OPCODE] + [0x00] * (length - 2)
                try:
                    dev.send_feature_report(poll)
                except (OSError, ValueError) as e:
                    self._diag.append(f"    send (len={length}): {e}")
                    continue
                time.sleep(SETTLE_S)
                try:
                    resp = dev.get_feature_report(STATUS_REPORT_ID, 65)
                except (OSError, ValueError):
                    resp = None
                charge = parse_charge(resp)
                if charge is not None:
                    self._diag.append(f"    reply: {hexdump(resp, 10)}")
                    return charge
            self._diag.append("    no charge in the status report (mouse off or "
                              "asleep, or the 2.4G link is not up)")
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
            infos = hidlist.enumerate(VID)
        except Exception as e:  # pragma: no cover
            log.warning("hid.enumerate(am_infinity): %s", e)
            return []
        ifaces = [d for d in infos if d.get("product_id") == PID]
        if not ifaces:
            return []
        self._diag.append(f"[AM Infinity] pid={PID:04x} "
                          f"'{(ifaces[0].get('product_string') or '').strip()}'")

        d = control_collection(ifaces)
        if d is None:
            self._diag.append(f"  no {CONTROL_USAGE_PAGE:04x}:{CONTROL_USAGE:04x} "
                              f"collection: nothing sent")
        else:
            self._diag.append(f"  iface={d.get('interface_number')} usage="
                              f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}")
            charge = self._read(d["path"])
            if charge is not None:
                self._last = (charge, time.time())
                return [DeviceStatus("am_infinity", NAME, charge, False, True,
                                     "am_infinity", kind="mouse")]

        # Silent receiver: it cannot tell a sleeping mouse from a switched-off
        # one, so the last value stays (greyed out) for a while, then the icon
        # is hidden and comes back with the next reading.
        if self._last and time.time() - self._last[1] < ASLEEP_KEEP:
            return [DeviceStatus("am_infinity", NAME, self._last[0], False, False,
                                 "am_infinity", kind="mouse")]
        return []

    def diagnostics(self) -> List[str]:
        return list(self._diag)
