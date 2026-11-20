"""Bounded output/input battery queries for exact supported identities.

Lengths include the Windows report-ID slot. Unnumbered hidapi input omits it.
Caps prove raw byte arrays; a strict raw-descriptor parser can also prove sizes.
Collection maxima alone cannot prove the size of an individual report.
No descriptor discovery here sends device commands or fetches features.
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

READ_TIMEOUT_MS = 1000
MAX_READS = 32


DESCRIPTOR_FAILURES = frozenset({
    "invalid descriptor bytes", "descriptor length out of bounds", "long item",
    "truncated item", "reserved item", "invalid global item", "invalid report ID",
    "unbalanced global stack", "unsupported local item", "invalid usage",
    "unknown main item", "invalid main item", "ambiguous collection usage",
    "duplicate top-level collection", "unbalanced collection", "missing report size/count",
    "report size out of bounds", "report shared across collections", "mixed report IDs",
    "non-byte-aligned report", "no reports", "get_report_descriptor unavailable",
    "descriptor read failed", "descriptor close failed", "collection not found",
    "collection maximum mismatch", "caps/descriptor disagreement",
})


def parse_report_descriptor(raw):
    """Pure, fail-closed HID 1.11 sizes by (page, usage), direction and string ID.

    Lengths include one Windows report-ID slot, also for implicit ID 0. Constant
    padding counts toward the final bit total; no rounding is permitted. Local
    ranges are accepted for fields, but a collection needs one explicit Usage.
    Duplicate top-level usages and reports shared across top-level collections
    are ambiguous for collection selection and are deliberately unsupported.
    """
    return report_descriptor_proof(raw)[0]


def report_descriptor_proof(raw):
    """The pure parser plus a fixed, privacy-safe failure reason for diagnostics."""
    try:
        return _parse_report_descriptor(raw), None
    except ValueError as error:
        return None, str(error)


def _parse_report_descriptor(raw):
    if not isinstance(raw, (bytes, bytearray)):
        raise ValueError("invalid descriptor bytes")
    if not 1 <= len(raw) <= 4096:
        raise ValueError("descriptor length out of bounds")
    globals_ = {0: None, 7: None, 8: 0, 9: None}
    stack, collections, usages = [], [], []
    usage_range = {}
    result, owners, report_ids = {}, {}, set()
    offset, numbered = 0, False
    while offset < len(raw):
        prefix = raw[offset]
        offset += 1
        if prefix == 0xFE:
            raise ValueError("long item")
        size = (0, 1, 2, 4)[prefix & 3]
        kind, tag = (prefix >> 2) & 3, prefix >> 4
        if offset + size > len(raw):
            raise ValueError("truncated item")
        value = int.from_bytes(raw[offset:offset + size], "little")
        offset += size
        if kind == 3:
            raise ValueError("reserved item")
        if kind == 1:  # Global state survives all Main items, including End Collection.
            if tag in (10, 11):
                if size:
                    raise ValueError("invalid global item")
                if tag == 10:
                    stack.append(dict(globals_))
                elif stack:
                    globals_ = stack.pop()
                else:
                    raise ValueError("unbalanced global stack")
            elif tag <= 9:
                if not size or tag == 0 and value > 0xFFFF:
                    raise ValueError("invalid global item")
                if tag == 8 and (size != 1 or value == 0):
                    raise ValueError("invalid report ID")
                if tag == 8:
                    numbered = True
                globals_[tag] = value
            else:
                raise ValueError("reserved item")
        elif kind == 2:
            # Usage Minimum/Maximum do not affect lengths, but must not be
            # mistaken for an unambiguous top-level collection Usage.
            if tag not in (0, 1, 2):
                raise ValueError("unsupported local item")
            if not size or size < 4 and globals_[0] is None:
                raise ValueError("invalid usage")
            usage = (value >> 16, value & 0xFFFF) if size == 4 else (globals_[0], value)
            if tag == 0:
                usages.append(usage)
            else:
                if tag in usage_range:
                    raise ValueError("invalid usage")
                usage_range[tag] = usage
        else:  # Main; every Main item consumes/resets local state.
            if usage_range and (set(usage_range) != {1, 2}
                                or usage_range[1][0] != usage_range[2][0]
                                or usage_range[1][1] > usage_range[2][1]):
                raise ValueError("invalid usage")
            if tag == 10:  # Collection
                if size != 1 or 7 <= value < 0x80:
                    raise ValueError("invalid main item")
                if not collections:
                    if len(usages) != 1 or usage_range:
                        raise ValueError("ambiguous collection usage")
                    key = usages[0]
                    if key in result:
                        raise ValueError("duplicate top-level collection")
                    result[key] = {"input": {}, "output": {}, "feature": {}}
                collections.append(collections[0] if collections else key)
            elif tag == 12:  # End Collection
                if size:
                    raise ValueError("invalid main item")
                if not collections:
                    raise ValueError("unbalanced collection")
                collections.pop()
            elif tag in (8, 9, 11):
                if not size or value & ~0x1FF or tag == 8 and value & 0x80:
                    raise ValueError("invalid main item")
                if not collections:
                    raise ValueError("unbalanced collection")
                width, count, report_id = (globals_[n] for n in (7, 9, 8))
                if width is None or count is None:
                    raise ValueError("missing report size/count")
                if not width or not count or width * count > 4095 * 8:
                    raise ValueError("report size out of bounds")
                direction = {8: "input", 9: "output", 11: "feature"}[tag]
                owner_key = direction, report_id
                key = collections[0]
                if owner_key in owners and owners[owner_key] != key:
                    raise ValueError("report shared across collections")
                owners[owner_key] = key
                report_ids.add(report_id)
                fields = result[key][direction]
                fields[str(report_id)] = fields.get(str(report_id), 0) + width * count
                if fields[str(report_id)] > 4095 * 8:
                    raise ValueError("report size out of bounds")
            else:
                raise ValueError("unknown main item")
            usages, usage_range = [], {}
    if collections:
        raise ValueError("unbalanced collection")
    if stack:
        raise ValueError("unbalanced global stack")
    if usages or usage_range:
        raise ValueError("invalid usage")
    if 0 in report_ids and numbered:
        raise ValueError("mixed report IDs")
    if not report_ids:
        raise ValueError("no reports")
    for directions in result.values():
        for fields in directions.values():
            for report_id, bits in fields.items():
                if bits % 8:
                    raise ValueError("non-byte-aligned report")
                fields[report_id] = bits // 8 + 1
    return result


def declared_report_summary(info):
    """Bounded, numeric-only declarations for this collection, never a proof.

    Raw descriptor declarations can disagree with caps; keep them separate
    from the *_report_sizes maps that authorize I/O. Unknown is not absence.
    """
    declared = info.get("declared_report_sizes")
    parts = []
    for direction, label in (("output", "out"), ("input", "in"), ("feature", "feature")):
        sizes = (declared.get(direction) if isinstance(declared, dict)
                 else info.get(direction + "_report_sizes"))
        if not isinstance(sizes, dict):
            parts.append(label + ":unknown")
            continue
        safe = {}
        for key, length in sizes.items():
            if (isinstance(key, str) and key.isascii() and key.isdecimal()
                    and len(key) <= 3 and 0 <= int(key) <= 255
                    and type(length) is int and 1 <= length <= 4096):
                safe[int(key)] = length
        parts.extend(f"{label}:{report_id:02X}/{length}"
                     for report_id, length in sorted(safe.items())[:8])
        if len(safe) > 8:
            parts.append(f"{label}:+{len(safe) - 8}")
        if len(safe) != len(sizes):
            parts.append(label + ":unknown")
        elif not sizes:
            parts.append(label + ":none")
    return "; declared=" + ",".join(parts)


def report_proof_summary(info, direction, *, include_declared=False):
    """Render only our known proof codes; never echo arbitrary inventory text."""
    proof = info.get(direction + "_report_proof")
    summary = ""
    if proof in ("caps", "descriptor"):
        summary = "; proof=" + proof
    elif proof == "failed":
        reason = info.get("report_descriptor_error")
        if not isinstance(reason, str) or reason not in DESCRIPTOR_FAILURES:
            reason = "unknown"
        summary = "; proof=caps+descriptor failed; descriptor=" + reason
    return summary + (declared_report_summary(info) if include_declared else "")


def byte_report_sizes(api, data, caps, report_type, *, allow_fixed_usage=False):
    """Prove sizes of simple, non-aliased byte arrays, or fail closed.

One value-cap per ID supplies the entire payload. A collection maximum must
agree with the largest array; buttons, split fields and padding are not guessed.
String keys survive the reader child's JSON boundary without conversion.
"""
    buttons, count, maximum = ((caps.ib, caps.iv, caps.input),
                               (caps.ob, caps.ov, caps.output),
                               (caps.fb, caps.fv, caps.feature))[report_type]
    if buttons and not count:
        sizes = byte_array_report_size(api, data, buttons, maximum, report_type)
        if sizes is None and allow_fixed_usage:
            sizes = fixed_usage_report_size(api, data, buttons, maximum, report_type)
        return sizes
    if buttons or not 1 <= count <= 32 or not 2 <= maximum <= 4096:
        return None
    fn = api.HidP_GetValueCaps
    fn.argtypes = [c.c_int, c.POINTER(Values), c.POINTER(c.c_ushort), c.c_void_p]
    fn.restype = c.c_int32
    fields, actual = (Values * count)(), c.c_ushort(count)
    if fn(report_type, fields, c.byref(actual), data) != 0x00110000 or actual.value != count:
        return None
    sizes = {}
    for field in fields:
        key = str(field.report)
        if field.alias or field.bits != 8 or not field.count or key in sizes:
            return None
        sizes[key] = field.count + 1
    return sizes if max(sizes.values()) == maximum else None


class Buttons(c.Structure):
    _fields_ = [("page", c.c_ushort), ("report", c.c_ubyte), ("alias", c.c_ubyte), ("field", c.c_ushort),
                ("link", c.c_ushort), ("link_usage", c.c_ushort), ("link_page", c.c_ushort),
                ("is_range", c.c_ubyte), ("str_range", c.c_ubyte), ("designator_range", c.c_ubyte),
                ("absolute", c.c_ubyte), ("report_count", c.c_ushort), ("reserved2", c.c_ushort),
                ("reserved", c.c_uint32 * 9), ("usage_min", c.c_ushort), ("usage_max", c.c_ushort),
                ("string_min", c.c_ushort), ("string_max", c.c_ushort),
                ("designator_min", c.c_ushort), ("designator_max", c.c_ushort),
                ("index_min", c.c_ushort), ("index_max", c.c_ushort)]


def byte_array_report_size(api, data, buttons, maximum, report_type):
    """Prove the size of a lone byte-selector array report, or fail closed.

    Some vendor collections (VGN 320F:5088) declare their payload as one
    Input/Output(Data,Array) item with usages 0..255, i.e. one byte per element.
    Windows reports such arrays as a single button cap without an element count,
    so the size is the collection maximum - valid only when this is the only
    item and the only report ID in the collection for that direction.
    """
    if buttons != 1 or not 2 <= maximum <= 4096:
        return None
    fn = api.HidP_GetButtonCaps
    fn.argtypes = [c.c_int, c.POINTER(Buttons), c.POINTER(c.c_ushort), c.c_void_p]
    fn.restype = c.c_int32
    fields, actual = (Buttons * 1)(), c.c_ushort(1)
    if fn(report_type, fields, c.byref(actual), data) != 0x00110000 or actual.value != 1:
        return None
    field = fields[0]
    # Main-item bit 1 (Variable) clear = array; byte selectors span exactly 0..255.
    if (field.alias or field.field & 0x02 or not field.is_range
            or field.usage_min != 0 or field.usage_max != 255):
        return None
    return {str(field.report): maximum}


def fixed_usage_report_size(api, data, buttons, maximum, report_type):
    """Prove #190's lone fixed-usage Data,Array report; opt-in identities only.

    HIDP_BUTTON_CAPS lacks an element width. One non-aliased item, a repeated
    fixed usage, and report_count == maximum - 1 establish a byte-array payload
    including the report-ID slot. Mixed fields are rejected by the caller.
    """
    if buttons != 1 or not 2 <= maximum <= 4096:
        return None
    fn = api.HidP_GetButtonCaps
    fn.argtypes = [c.c_int, c.POINTER(Buttons), c.POINTER(c.c_ushort), c.c_void_p]
    fn.restype = c.c_int32
    fields, actual = (Buttons * 1)(), c.c_ushort(1)
    if fn(report_type, fields, c.byref(actual), data) != 0x00110000 or actual.value != 1:
        return None
    field = fields[0]
    if (field.alias or field.field & 0x03 or field.is_range
            or field.usage_min != field.usage_max or field.report_count != maximum - 1):
        return None
    return {str(field.report): maximum}


def battery_caps(api, data, caps, *, allow_fixed_usage=False):
    return {"input_report_sizes": byte_report_sizes(api, data, caps, 0, allow_fixed_usage=allow_fixed_usage),
            "output_report_sizes": byte_report_sizes(api, data, caps, 1, allow_fixed_usage=allow_fixed_usage)}


class BatteryHidProvider(Provider):
    """Each subclass supplies one exact identity and one fixed read request."""
    charging_known = False
    unconfirmed = False
    verification_level = "C"
    read_timeout_ms = READ_TIMEOUT_MS

    def __init__(self):
        self._diag = []

    def device_name(self, info):
        return self.pids[info["product_id"]]

    def no_reading_reply(self, reply):
        return False

    def _pick(self, infos):
        candidates = [info for info in infos
                      if info.get("vendor_id") == self.vid
                      and info.get("product_id") in self.pids
                      and (info.get("usage_page"), info.get("usage")) == self.collection]
        if len(candidates) != 1 or not candidates[0].get("path"):
            self._diag.append("missing or ambiguous eligible collection: nothing sent")
            return None
        info = candidates[0]
        for direction, report_id, bounds in (
                ("input", self.input_id, self.input_bounds),
                ("output", self.output_id, (self.output_bytes, self.output_bytes))):
            maximum = info.get(direction + "_report_length")
            sizes = info.get(direction + "_report_sizes")
            if (type(maximum) is not int or not bounds[0] <= maximum <= bounds[1]
                    or not isinstance(sizes, dict) or not sizes
                    or any(type(n) is not int or not 2 <= n <= maximum for n in sizes.values())
                    or sizes.get(str(report_id)) != maximum
                    or report_id == 0 and set(sizes) != {"0"}):
                self._diag.append("report IDs/lengths unknown or incompatible: nothing sent"
                                  + report_proof_summary(info, direction, include_declared=True))
                return None
        return info

    def _query(self, dev, info):
        request = self.make_request()
        if dev.write(request) != len(request):
            self._diag.append("short/failed battery query write; no retry")
            return None
        length = info["input_report_length"] - (self.input_id == 0)
        deadline = time.monotonic() + self.read_timeout_ms / 1000
        for _ in range(MAX_READS):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            raw = dev.read(length, max(1, math.ceil(remaining * 1000)))
            if not raw:
                break
            if len(raw) != length:
                self._diag.append("rejected input report length")
                continue
            if self.no_reading_reply(raw):
                self._diag.append("device asleep/offline; no new reading; connection unknown")
                return None
            parsed = self.parse_reply(raw)
            if parsed is not None:
                return parsed
            self._diag.append("rejected battery reply")
        self._diag.append("no valid reply within deadline/read limit; connection unknown")
        return None

    def poll(self):
        self._diag = []
        if hid is None:
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
                self._diag.append("physical parent unresolved; uniqueness unknown: nothing sent")
                continue
            groups.setdefault(physical, []).append(info)
        result = []
        for physical, infos in groups.items():
            info = self._pick(infos)
            if info is None:
                continue
            dev = hid.device()
            try:
                dev.open_path(info["path"])
                reading = self._query(dev, info)
                if reading is not None:
                    level, charging, approx = reading
                    result.append(DeviceStatus(
                        f"{self.name}:{physical or repr(info['path'])}",
                        self.device_name(info), level, charging, True, self.name,
                        approx=approx, kind=self.kind, physical_id=physical,
                        connection_known=True, charging_known=self.charging_known,
                        verification_level=self.verification_level, level_unavailable=level is None,
                        unconfirmed=self.unconfirmed))
            except (OSError, ValueError):
                # Backend exception text can contain private device paths.
                self._diag.append("battery I/O failed; connection unknown")
            finally:
                try:
                    dev.close()
                except OSError:
                    self._diag.append("HID handle close failed")
        return result

    def diagnostics(self):
        return list(self._diag)
