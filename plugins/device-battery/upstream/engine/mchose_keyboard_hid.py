"""Shared, fail-closed HID plumbing for the two researched MCHOSE keyboards.

Report lengths are Windows HID caps lengths, including the report-ID slot.
hidapi removes that slot on unnumbered input reports only. No raw descriptor,
feature report or device command is fetched during capability discovery.
"""
from __future__ import annotations

import ctypes as c
import math
import time

try:
    import hid
except ImportError:  # pragma: no cover
    hid = None

from providers import hidlist
from providers.base import DeviceStatus, Provider
from standardhid import Values

SUCCESS = 0x00110000
MAX_REPORT_BYTES = 4096
READ_TIMEOUT_MS = 1000
MAX_READS = 32


class Buttons(c.Structure):
    _fields_ = [("page", c.c_ushort), ("report", c.c_ubyte), ("alias", c.c_ubyte),
                ("field", c.c_ushort), ("link", c.c_ushort),
                ("link_usage", c.c_ushort), ("link_page", c.c_ushort),
                ("is_range", c.c_ubyte), ("str_range", c.c_ubyte),
                ("designator_range", c.c_ubyte), ("absolute", c.c_ubyte),
                ("reserved", c.c_uint32 * 10), ("range", c.c_ushort * 8)]


def report_ids(api, data, caps, report_type):
    """All declared value/button report IDs, or None when caps are incomplete.

Consumers require exactly one ID per direction. Only then does the collection's
maximum report length describe that ID; a multi-ID maximum is not per-ID proof.
"""
    counts = (caps.ib, caps.iv) if report_type == 0 else (caps.ob, caps.ov)
    if not 1 <= sum(counts) <= 512:
        return None
    ids = set()
    for count, structure, name in zip(counts, (Buttons, Values),
                                       ("HidP_GetButtonCaps", "HidP_GetValueCaps")):
        if not count:
            continue
        fn = getattr(api, name)
        fn.argtypes = [c.c_int, c.POINTER(structure), c.POINTER(c.c_ushort), c.c_void_p]
        fn.restype = c.c_int32
        fields = (structure * count)()
        actual = c.c_ushort(count)
        if fn(report_type, fields, c.byref(actual), data) != SUCCESS or actual.value != count:
            return None
        ids.update(field.report for field in fields)
    return tuple(sorted(ids))


def keyboard_caps(api, data, caps):
    return {"input_report_ids": report_ids(api, data, caps, 0),
            "output_report_ids": report_ids(api, data, caps, 1)}


class KeyboardProvider(Provider):
    """Subclasses supply only an exact identity and read-only exchanges."""
    vid = 0x3837

    def __init__(self):
        self._diag = []
        self.sequence = 0

    def _pick(self, infos):
        candidates = []
        for info in infos:
            if info.get("vendor_id") != self.vid or info.get("product_id") not in self.pids:
                self._diag.append("VID/PID mismatch or missing: nothing sent")
            elif info.get("product_string") != self.product:
                self._diag.append("exact product name mismatch or missing: nothing sent")
            elif (info.get("usage_page"), info.get("usage")) != self.collection:
                self._diag.append("collection mismatch or missing: nothing sent on this collection")
            else:
                candidates.append(info)
        if len(candidates) != 1:
            self._diag.append("missing or ambiguous eligible collection: nothing sent")
            return None
        info = candidates[0]
        if not info.get("path"):
            self._diag.append("missing collection path: nothing sent")
            return None
        inp, out = info.get("input_report_length"), info.get("output_report_length")
        if (type(inp) is not int or type(out) is not int
                or not self.min_input <= inp <= MAX_REPORT_BYTES
                or not self.min_output <= out <= MAX_REPORT_BYTES
                or self.output_bytes is not None and out != self.output_bytes):
            self._diag.append("input/output descriptor lengths unknown or incompatible: nothing sent")
            return None
        in_ids, out_ids = info.get("input_report_ids"), info.get("output_report_ids")
        if (not isinstance(in_ids, (list, tuple)) or len(in_ids) != 1
                or type(in_ids[0]) is not int or not 0 <= in_ids[0] <= 255
                or self.input_id is not None and in_ids[0] != self.input_id
                or not isinstance(out_ids, (list, tuple)) or len(out_ids) != 1
                or type(out_ids[0]) is not int or out_ids[0] != self.output_id):
            self._diag.append("report IDs unknown, ambiguous or incompatible: nothing sent")
            return None
        self._diag.append(f"descriptor input ID={in_ids[0]:02X} bytes={inp}; "
                          f"output ID={self.output_id:02X} bytes={out}")
        return info

    def _exchange(self, dev, info, payload, parse):
        request = [self.output_id] + payload
        request += [0] * (info["output_report_length"] - len(request))
        if dev.write(request) != len(request):
            self._diag.append("short/failed output write; no retry")
            return None
        report_id = info["input_report_ids"][0]
        read_length = info["input_report_length"] - (report_id == 0)
        deadline = time.monotonic() + READ_TIMEOUT_MS / 1000
        for _ in range(MAX_READS):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            raw = dev.read(read_length, max(1, math.ceil(remaining * 1000)))
            if not raw:
                break
            if len(raw) != read_length:
                self._diag.append("rejected input report length")
                continue
            if report_id and raw[0] != report_id:
                self._diag.append("rejected input report ID")
                continue
            try:
                return parse(list(raw[1:] if report_id else raw))
            except ValueError as error:
                self._diag.append(str(error))
        self._diag.append("no valid reply within deadline/read limit; connection unknown")
        return None

    def poll(self):
        self._diag = []
        if hid is None:
            self._diag.append("hidapi unavailable: nothing sent")
            return []
        try:
            inventory = hidlist.enumerate(self.vid)
        except OSError:
            self._diag.append("enumeration failed: nothing sent")
            return []
        groups = {}
        for info in inventory:
            physical = info.get("physical_id", "")
            if physical.startswith("collection:"):
                # The engine scopes readers by physical_id. A fallback path ID
                # cannot prove that another scoped collection is not a duplicate.
                self._diag.append("physical parent unresolved; collection uniqueness unknown: nothing sent")
                continue
            # Unproven parents must not turn two matching collections into two
            # independent probes. The normal engine supplies a USB parent.
            if not physical:
                physical = "unresolved"
            groups.setdefault(physical, []).append(info)
        result = []
        for physical, infos in groups.items():
            info = self._pick(infos)
            if info is None:
                continue
            self._diag.append("C: pending hardware validation; reply checksum unconfirmed, "
                              "not checked; padding, cold start and sleep/cache behavior unconfirmed")
            dev = hid.device()
            try:
                dev.open_path(info["path"])
                reading = self._query(dev, info)
                if reading is not None:
                    level, charging = reading
                    key = physical if physical != "unresolved" else repr(info["path"])
                    result.append(DeviceStatus(
                        f"{self.name}:{key}", self.pids[info["product_id"]],
                        level, charging, True, self.name, kind="keyboard",
                        physical_id=info.get("physical_id", ""), connection_known=True,
                        charging_known=True, verification_level="C"))
            except (OSError, ValueError):
                # Do not export exception text: a backend may embed a private path.
                self._diag.append("battery I/O failed; no measurement, connection unknown")
            finally:
                try:
                    dev.close()
                except OSError:
                    self._diag.append("HID handle close failed")
        return result

    def diagnostics(self):
        return list(self._diag)
