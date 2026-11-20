"""Local physical-instance evidence, without reading device input reports.

A USB parent's PnP instance is reliable grouping evidence for its HID
collections, not a statement that all receiver slots are the same device.
When Windows cannot prove that relationship we retain the exact collection
path. Names, model IDs and empty/reused serials are never grouping evidence.
"""
from __future__ import annotations

import ctypes as c
import os
import re


class _Guid(c.Structure):
    _fields_ = [("a", c.c_uint32), ("b", c.c_uint16), ("c", c.c_uint16),
                ("d", c.c_ubyte * 8)]


class _Interface(c.Structure):
    _fields_ = [("size", c.c_uint32), ("guid", _Guid), ("flags", c.c_uint32),
                ("reserved", c.c_void_p)]


class _DevInfo(c.Structure):
    _fields_ = [("size", c.c_uint32), ("guid", _Guid), ("devinst", c.c_uint32),
                ("reserved", c.c_void_p)]


def usb_parent(path):
    """Exact Windows USB-parent PnP instance, or None; no handles to the HID."""
    if os.name != "nt":
        return None
    setup = c.WinDLL("setupapi", use_last_error=True)
    cfg = c.WinDLL("cfgmgr32", use_last_error=True)
    setup.SetupDiCreateDeviceInfoList.argtypes = [c.c_void_p, c.c_void_p]
    setup.SetupDiCreateDeviceInfoList.restype = c.c_void_p
    setup.SetupDiOpenDeviceInterfaceW.argtypes = [c.c_void_p, c.c_wchar_p, c.c_uint32, c.POINTER(_Interface)]
    setup.SetupDiGetDeviceInterfaceDetailW.argtypes = [c.c_void_p, c.POINTER(_Interface), c.c_void_p,
                                                     c.c_uint32, c.POINTER(c.c_uint32), c.POINTER(_DevInfo)]
    setup.SetupDiDestroyDeviceInfoList.argtypes = [c.c_void_p]
    cfg.CM_Get_Parent.argtypes = [c.POINTER(c.c_uint32), c.c_uint32, c.c_uint32]
    cfg.CM_Get_Device_IDW.argtypes = [c.c_uint32, c.c_wchar_p, c.c_uint32, c.c_uint32]
    handle = setup.SetupDiCreateDeviceInfoList(None, None)
    if handle in (None, c.c_void_p(-1).value):
        return None
    try:
        interface = _Interface()
        interface.size = c.sizeof(interface)
        if not setup.SetupDiOpenDeviceInterfaceW(handle, path, 0, c.byref(interface)):
            return None
        size = c.c_uint32()
        setup.SetupDiGetDeviceInterfaceDetailW(handle, c.byref(interface), None, 0, c.byref(size), None)
        if not 8 <= size.value <= 65536:
            return None
        detail = c.create_string_buffer(size.value)
        c.cast(detail, c.POINTER(c.c_uint32))[0] = 8 if c.sizeof(c.c_void_p) == 8 else 6
        dev = _DevInfo()
        dev.size = c.sizeof(dev)
        if not setup.SetupDiGetDeviceInterfaceDetailW(handle, c.byref(interface), detail,
                                                       size, None, c.byref(dev)):
            return None
        node = dev.devinst
        for _ in range(12):
            text = c.create_unicode_buffer(4096)
            if cfg.CM_Get_Device_IDW(node, text, len(text), 0) != 0:
                return None
            value = text.value.lower()
            if value.startswith("usb\\vid_") and "&mi_" not in value.split("\\")[1]:
                return "pnp:" + value
            parent = c.c_uint32()
            if cfg.CM_Get_Parent(c.byref(parent), node, 0) != 0:
                break
            node = parent.value
    finally:
        setup.SetupDiDestroyDeviceInfoList(handle)
    return None


def physical_instance(info):
    # Explicit metadata is supplied only by our topology builder/tests, never
    # inferred from a product string or VID/PID pair.
    if info.get("physical_id"):
        return str(info["physical_id"])
    path = info.get("path", b"")
    if isinstance(path, bytes):
        path = path.decode("utf-8", "replace")
    return usb_parent(path) or "collection:" + path.lower()


def enrich(inventory, excluded=()):
    out = []
    for info in inventory:
        if (info.get("vendor_id"), info.get("product_id")) in excluded:
            continue
        value = dict(info)
        value["physical_id"] = physical_instance(info)
        out.append(value)
    return out


def physical_groups(inventory):
    groups = {}
    for info in inventory:
        groups.setdefault(physical_instance(info), []).append(info)
    return groups


class _Attributes(c.Structure):
    _fields_ = [("size", c.c_uint32), ("vendor", c.c_uint16),
                ("product", c.c_uint16), ("release", c.c_uint16)]


_descriptor_cache = {}
_descriptor_paths = None


def _a5v2_path_identity(path):
    match = re.search(r"vid[_&]([0-9a-f]{4,8}).*?pid[_&]([0-9a-f]{4})", path, re.I)
    return (int(match[1][-4:], 16), int(match[2], 16)) if match else None


def _a5v2_snapshot(inventory, present_paths):
    """Attest only this call's supplied target paths, never a global USB census.

    physical_topology may supply a full inventory or a selected physical
    device's paths. Neither mode can prove an omitted path exists. Within
    that input boundary, every target path must have fresh attrs/caps and a
    consistent USB parent; a returned list alone cannot prove completeness.
    The attestation is attached after caching and is never itself cached.
    """
    expected = [p.lower() for p in present_paths if _a5v2_path_identity(p) == (0x3837, 0x100C)]
    targets = [d for d in inventory if (d["vendor_id"], d["product_id"]) == (0x3837, 0x100C)]
    actual = [d["path"].decode("utf-8").lower() for d in targets]
    valid = (bool(expected) and len(present_paths) <= 512
             and len(expected) == len(set(expected)) and sorted(actual) == sorted(expected)
             and all(d.get("a5v2_descriptor_complete") is True
                     and d["product_string"].strip() == "MCHOSE A5 V2 Ultra"
                     and re.fullmatch(r"\\\\\?\\hid#vid_3837&pid_100c(?:&[a-z0-9_]+)*#[^\\\s]+",
                                      d["path"].decode("utf-8"), re.I)
                     for d in targets))
    parents = {d["physical_id"] for d in targets}
    primary = [d for d in targets if (d["usage_page"], d["usage"]) == (0xFF01, 1)]
    valid = (valid and len(parents) == 1 and len(primary) == 1
             and re.fullmatch(r"pnp:usb\\vid_3837&pid_100c(?:&rev_[0-9a-f]{4})?\\[^\\\s]+",
                              next(iter(parents)), re.I) is not None
             and all((d["vendor_id"], d["product_id"]) == (0x3837, 0x100C)
                     for d in inventory if d["physical_id"] in parents))
    if valid:
        proof = {"paths": sorted(expected), "parent": next(iter(parents)),
                 "collection": primary[0]["path"].decode("utf-8").lower()}
        for info in targets:
            info["a5v2_topology"] = dict(proof, paths=list(proof["paths"]))
    else:
        # Failure must be retried. Do not evict another brand's descriptor.
        for path in present_paths:
            if path.lower() in expected:
                _descriptor_cache.pop(path, None)
        for info in targets:
            _descriptor_cache.pop(info["path"].decode("utf-8"), None)
    return inventory


def _read_report_descriptor(path):
    """Optional hidapi metadata access; no input, output or feature reports."""
    from battery_hid import hid
    dev = None
    raw, reason = None, "get_report_descriptor unavailable"
    try:
        if hid is not None and callable(getattr(hid, "device", None)):
            dev = hid.device()
            getter = getattr(dev, "get_report_descriptor", None)
            if callable(getter):
                dev.open_path(path)
                raw = getter()
                reason = None
    except Exception:
        raw, reason = None, "descriptor read failed"
    finally:
        if dev is not None:
            try:
                dev.close()
            except Exception:
                raw, reason = None, "descriptor close failed"
    # cython-hidapi versions may return a list instead of bytes. Reject other
    # objects rather than letting bytes(int) manufacture a zero descriptor.
    if reason is None and isinstance(raw, (list, tuple)):
        if len(raw) > 4096 or any(type(n) is not int or not 0 <= n <= 255 for n in raw):
            return None, "invalid descriptor bytes"
        raw = bytes(raw)
    return raw, reason


def _descriptor_fallback(info, caps, directions):
    """Called only inside explicit provider identity/usage gates."""
    # Diagnostic metadata only: do not turn declarations into I/O permission.
    info["declared_report_sizes"] = {
        direction: info.get(direction + "_report_sizes", {} if not any(fields) else None)
        for direction, fields in (("input", (caps.input, caps.ib, caps.iv)),
                                  ("output", (caps.output, caps.ob, caps.ov)),
                                  ("feature", (caps.feature, caps.fb, caps.fv)))
    }
    missing = [d for d in directions if info.get(d + "_report_sizes") is None]
    for direction in directions:
        info[direction + "_report_proof"] = "failed" if direction in missing else "caps"
    if not missing:
        return
    from battery_hid import report_descriptor_proof
    raw, reason = _read_report_descriptor(info["path"])
    if reason is None:
        parsed, reason = report_descriptor_proof(raw)
        if parsed is not None:
            collection = parsed.get((caps.page, caps.usage))
            if collection is not None:
                # Retain exactly this collection even if caps disagree below.
                info["declared_report_sizes"] = collection
            if collection is None:
                reason = "collection not found"
            elif any(max(collection[d].values(), default=0) != maximum
                     for d, maximum in (("input", caps.input), ("output", caps.output),
                                        ("feature", caps.feature))):
                reason = "collection maximum mismatch"
            elif any(info[d + "_report_sizes"] != collection[d]
                     for d in directions if d not in missing):
                reason = "caps/descriptor disagreement"
            else:
                for direction in missing:
                    info[direction + "_report_sizes"] = collection[direction]
                    info[direction + "_report_proof"] = "descriptor"
                return
    info["report_descriptor_error"] = reason


def _windows_report_id_supported(hid, data, report_id, length):
    """Check both directions in memory using the collection's preparsed data."""
    try:
        initialize = hid.HidP_InitializeReportForID
    except AttributeError:
        return False
    initialize.argtypes = [c.c_int, c.c_ubyte, c.c_void_p, c.c_void_p, c.c_uint32]
    initialize.restype = c.c_int32
    return all(initialize(direction, report_id, data, c.create_string_buffer(length),
                          length) == 0x00110000 for direction in (0, 1))


def discover(paths, excluded=(), *, full=False):
    """Serialized descriptor discovery with native paths excluded BEFORE open.

    hidapi's global enumeration opens every HID collection, even when its
    results are subsequently filtered. Here cfgmgr32 already supplied present
    paths; read only attributes/caps/strings for remaining paths, with access 0.
    No keyboard input reports, feature queries or feature writes are read here.
    Rapoo/MOONDROP/MCHOSE V3/BY/S9 PRO/exact FA6x caps failures may open their allow-listed
    collection via hidapi solely to fetch the raw report descriptor, then close.
    Cache complete descriptors while the full path set is unchanged: product
    strings can encode connection state. Partial discoveries always refresh
    their selected paths. enrich recomputes physical identity on every call.
    The exact 100C candidate always refreshes attrs/caps and independently
    attests coverage of the supplied snapshot, even on a full cache hit.
    """
    global _descriptor_paths
    if os.name != "nt":
        from providers import hidlist
        return enrich(hidlist.enumerate(), excluded)
    if paths is None:
        # Do not fall back to global hidapi enumeration on Windows: native
        # collections must remain excluded before any descriptor handle opens.
        raise RuntimeError("topology_unavailable")
    present_paths = tuple(paths)  # Preserve duplicates/truncation for the exact 100C proof.
    paths = frozenset(present_paths)
    selected_paths = sorted(paths)[:512]
    if full:
        if paths != _descriptor_paths:
            _descriptor_cache.clear()
            _descriptor_paths = paths
        present = set(selected_paths)
        for path in list(_descriptor_cache):
            if path not in present:
                _descriptor_cache.pop(path)
    from standardhid import Caps
    kernel = c.WinDLL("kernel32", use_last_error=True)
    hid = c.WinDLL("hid", use_last_error=True)
    kernel.CreateFileW.argtypes = [c.c_wchar_p, c.c_uint32, c.c_uint32, c.c_void_p, c.c_uint32, c.c_uint32, c.c_void_p]
    kernel.CreateFileW.restype = c.c_void_p
    kernel.CloseHandle.argtypes = [c.c_void_p]
    hid.HidD_GetAttributes.argtypes = [c.c_void_p, c.POINTER(_Attributes)]
    hid.HidD_GetAttributes.restype = c.c_ubyte
    hid.HidD_GetPreparsedData.argtypes = [c.c_void_p, c.POINTER(c.c_void_p)]
    hid.HidD_GetPreparsedData.restype = c.c_ubyte
    hid.HidD_FreePreparsedData.argtypes = [c.c_void_p]
    hid.HidP_GetCaps.argtypes = [c.c_void_p, c.POINTER(Caps)]
    for getter in ("HidD_GetProductString", "HidD_GetManufacturerString", "HidD_GetSerialNumberString"):
        getattr(hid, getter).argtypes = [c.c_void_p, c.c_void_p, c.c_uint32]
        getattr(hid, getter).restype = c.c_ubyte
    inventory = []
    for path in selected_paths:
        match = re.search(r"vid[_&]([0-9a-f]{4,8}).*?pid[_&]([0-9a-f]{4})", path, re.I)
        if match and (int(match[1][-4:], 16), int(match[2], 16)) in excluded:
            _descriptor_cache.pop(path, None)
            continue
        if (not full or _a5v2_path_identity(path) == (0x3837, 0x100C)
                or (_descriptor_cache.get(path, {}).get("vendor_id"),
                    _descriptor_cache.get(path, {}).get("product_id")) == (0x3837, 0x100C)):
            # This candidate needs fresh attrs/caps even on an unchanged full
            # snapshot. Other providers retain their existing cache policy.
            _descriptor_cache.pop(path, None)
        cached = _descriptor_cache.get(path)
        if cached is not None:
            if (cached["vendor_id"], cached["product_id"]) in excluded:
                _descriptor_cache.pop(path)
                continue
            inventory.append(dict(cached))
            continue
        handle = kernel.CreateFileW(path, 0, 3, None, 3, 0, None)
        if handle in (None, c.c_void_p(-1).value):
            continue
        data = c.c_void_p()
        try:
            attrs = _Attributes()
            attrs.size = c.sizeof(attrs)
            if not hid.HidD_GetAttributes(handle, c.byref(attrs)) or (attrs.vendor, attrs.product) in excluded:
                continue
            iface = re.search(r"&mi_([0-9a-f]{2})", path, re.I)
            info = {"path": path.encode("utf-8"), "vendor_id": attrs.vendor,
                    "product_id": attrs.product, "release_number": attrs.release,
                    "interface_number": int(iface[1], 16) if iface else -1,
                    "usage_page": 0, "usage": 0}
            caps_complete = False
            if hid.HidD_GetPreparsedData(handle, c.byref(data)):
                caps = Caps()
                if hid.HidP_GetCaps(data, c.byref(caps)) == 0x00110000:
                    info.update(usage_page=caps.page, usage=caps.usage,
                                input_report_length=caps.input, output_report_length=caps.output)
                    caps_complete = True
            for field, getter in (("product_string", "HidD_GetProductString"),
                                  ("manufacturer_string", "HidD_GetManufacturerString"),
                                  ("serial_number", "HidD_GetSerialNumberString")):
                value = c.create_unicode_buffer(256)
                info[field] = value.value if getattr(hid, getter)(handle, value, c.sizeof(value)) else ""
            if (caps_complete and (attrs.vendor, attrs.product, caps.page, caps.usage)
                    == (0x3837, 0x100C, 0xFF01, 0x0001)
                    and info["product_string"].strip() == "MCHOSE A5 V2 Ultra"):
                # Exact candidate only: strict Feature (type 2) byte arrays,
                # no fixed-Usage opt-in and no raw-descriptor fallback.
                from battery_hid import byte_report_sizes
                sizes = byte_report_sizes(hid, data, caps, 2)
                info.update(feature_report_length=caps.feature, feature_report_sizes=sizes)
                caps_complete = bool(sizes and sizes.get("17") in (21, 65)
                                     and sizes["17"] == max(sizes.values()) == caps.feature)
                info["feature_report_proof"] = "caps" if caps_complete else "failed"
            # The two keyboard protocols require proof of report IDs as well as
            # capacity. Inspect only their exact identity/collection; no I/O.
            if caps_complete and attrs.vendor == 0x3837 and (
                    (attrs.product, info["product_string"], caps.page, caps.usage) in (
                        (0x1015, "MCHOSE G98 V3 2.4G", 0xFF80, 1),
                        (0x3033, "MCHOSE G87 V2 2.4G", 1, 0))):
                from mchose_keyboard_hid import keyboard_caps
                info.update(keyboard_caps(hid, data, caps))
                caps_complete = all(info.get(key) is not None
                                    for key in ("input_report_ids", "output_report_ids"))
            if caps_complete and attrs.vendor == 0x046A and attrs.product in (0x01E0, 0x01DE) and (
                    caps.page, caps.usage) == (0xFF1C, 0x0092):
                from mchose_keyboard_hid import keyboard_caps
                ids = keyboard_caps(hid, data, caps)
                # Only a unique ID gives the collection maximum an exact owner.
                # Include every button/value cap in each direction; no raw fallback.
                for direction, maximum in (("input", caps.input), ("output", caps.output)):
                    info[direction + "_report_sizes"] = (
                        {"4": 64} if ids[direction + "_report_ids"] == (4,) and maximum == 64 else None)
                caps_complete = all(info[key] is not None
                                    for key in ("input_report_sizes", "output_report_sizes"))
            if (caps_complete and (attrs.vendor, attrs.product, caps.page, caps.usage) == (
                    0x088D, 0x052F, 0xFF00, 0x0001)
                    and info["interface_number"] == 1 and info["product_string"] == "Wireless-Receiver"):
                # #171: metadata only, access 0. The collection maximum alone
                # cannot authorize a Feature fetch; use the full existing proof.
                from battery_hid import byte_report_sizes
                info.update(feature_report_length=caps.feature,
                            feature_report_sizes=byte_report_sizes(hid, data, caps, 2, allow_fixed_usage=True))
                caps_complete = (caps.feature == 33 and info["feature_report_sizes"] == {"15": 33})
            if (caps_complete and (attrs.vendor, attrs.product, caps.page, caps.usage) == (
                    0x0B05, 0x1ACE, 0xFF01, 0x0001) and info["interface_number"] == 2
                    and len(path.split("#")) >= 3
                    and re.search(r"&mi_02&col03(?:&|$)", path.split("#")[1], re.I)):
                # OMNI mouse candidate: access-0 metadata only, existing strict
                # byte-array proof for each ID. No raw-descriptor handle fallback.
                from battery_hid import battery_caps
                info.update(battery_caps(hid, data, caps))
                for direction in ("input", "output"):
                    info[direction + "_report_proof"] = (
                        "caps" if info[direction + "_report_sizes"] is not None else "failed")
                caps_complete = all(info[key] is not None and info[key].get("3") == 64
                                    for key in ("input_report_sizes", "output_report_sizes"))
            if caps_complete and (attrs.vendor, attrs.product, caps.page, caps.usage) == (
                    0x3654, 0x5055, 0xFF05, 0x0001):
                # #459's fixed-Usage Data,Array, CE input / CD output. This
                # exact opt-in never touches either FF02 or reads HID reports.
                from battery_hid import battery_caps
                info.update(battery_caps(hid, data, caps, allow_fixed_usage=True))
                for direction in ("input", "output"):
                    info[direction + "_report_proof"] = (
                        "caps" if info[direction + "_report_sizes"] is not None else "failed")
                # Failed APIs/partial counts and incompatible IDs stay uncached.
                caps_complete = (caps.input == caps.output == 64
                                 and info["input_report_sizes"] == {"206": 64}
                                 and info["output_report_sizes"] == {"205": 64})
            if caps_complete and (attrs.vendor, attrs.product, caps.page, caps.usage) in (
                    (0x3837, 0x1018, 0xFF01, 0x0001),
                    (0x3837, 0x1018, 0xFF0B, 0x00C4),
                    (0x3837, 0x1014, 0xFF01, 0x0001),
                    (0x373B, 0x1262, 0xFF90, 0x0001),
                    (0x373B, 0x12D6, 0xFF90, 0x0001),
                    (0x373B, 0x1216, 0xFF05, 0x0001),
                    (0x35D8, 0x0133, 0xFF02, 0x0002),
                    (0x35D8, 0x0133, 0x000C, 0x0001),
                    (0x3710, 0x5501, 0xFF02, 0x0002),
                    (0x41E4, 0x2001, 0xFF04, 0x0002),
                    (0x41E4, 0x2001, 0xFF02, 0x0002),
                    (0x3554, 0xFA09, 0xFF02, 0x0002),
                    (0x320F, 0x706E, 0xFF1C, 0x0092),
                    (0x320F, 0x5088, 0xFF1C, 0x0092),
                    (0x391D, 0x1A01, 0xFF01, 0x0010),
                    (0x089D, 0x062F, 0xFF01, 0x0010),
                    (0x37D7, 0x2501, 0xFFA0, 0x0001)):
                from battery_hid import battery_caps
                info.update(battery_caps(hid, data, caps))
                if (attrs.vendor, attrs.product) in (
                        (0x35D8, 0x0133), (0x3837, 0x1018), (0x3837, 0x1014),
                        (0x41E4, 0x2001), (0x3554, 0xFA09)):
                    # The alternate 1018 collection is useful only at 4D/64.
                    # Do not repeatedly open a known 41-byte/zero-capacity TLC
                    # for raw metadata. Keep all prior primary/provider gates.
                    if ((caps.page, caps.usage) != (0xFF0B, 0x00C4)
                            or caps.input == caps.output == 64):
                        _descriptor_fallback(info, caps, ("input", "output"))
                caps_complete = all(info.get(key) is not None
                                    for key in ("input_report_sizes", "output_report_sizes"))
                if (not caps_complete and (attrs.vendor, attrs.product, caps.page, caps.usage)
                        == (0x3837, 0x1018, 0xFF01, 0x0001)
                        and info.get("report_descriptor_error") == "collection maximum mismatch"):
                    from providers.mchose import (V3_REPORT_ID, V3_REPORT_LEN,
                                                  v3_ultra_windows_report_candidate)
                    if (v3_ultra_windows_report_candidate(info)
                            and _windows_report_id_supported(hid, data, V3_REPORT_ID, V3_REPORT_LEN)):
                        info["v3_windows_report_confirmed"] = True
                        caps_complete = True
            if caps_complete and (attrs.vendor, attrs.product, caps.page, caps.usage) == (
                    0x3554, 0xFA09, 0xFF04, 0x0002):
                from battery_hid import battery_caps, byte_report_sizes
                info.update(battery_caps(hid, data, caps))
                info.update(feature_report_length=caps.feature,
                            feature_report_sizes=byte_report_sizes(hid, data, caps, 2))
                # Distinguish proven absence ({}) from failed/unknown proof
                # (None); contradictory nonzero field counts remain unproven.
                for direction, maximum, buttons, values in (
                        ("input", caps.input, caps.ib, caps.iv),
                        ("output", caps.output, caps.ob, caps.ov)):
                    if not any((maximum, buttons, values)):
                        info[direction + "_report_sizes"] = {}
                # Either proven BY input/output or a feature-only descriptor.
                # A failed proof stays uncached so later discovery can retry.
                caps_complete = (all(bool(info.get(key))
                                     for key in ("input_report_sizes", "output_report_sizes"))
                                 or (not any((caps.input, caps.output, caps.ib, caps.iv, caps.ob, caps.ov))
                                     and info["feature_report_sizes"] is not None))
            # #305's V9 PRO sibling: prove the read-only AA firmware report
            # before the provider may open it. Max length alone is not proof.
            if caps_complete and (attrs.vendor, attrs.product, caps.page, caps.usage) == (
                    0x291D, 0x385D, 0xFF22, 0x0001):
                from battery_hid import byte_report_sizes
                info.update(feature_report_length=caps.feature,
                            feature_report_sizes=byte_report_sizes(hid, data, caps, 2))
                caps_complete = info["feature_report_sizes"] is not None
            # Fixed-usage arrays are enabled only for VGN HUB's exact beiying
            # receiver pairs/collection, never for M HUB's FF04 BY endpoint.
            if caps_complete and (attrs.vendor, attrs.product, caps.page, caps.usage) in (
                    (0x258A, 0x024F, 0xFF02, 0x0002),
                    (0x258A, 0x027F, 0xFF02, 0x0002),
                    (0x258A, 0x027B, 0xFF02, 0x0002),
                    (0x391D, 0x2A01, 0xFF02, 0x0002),
                    (0x391D, 0x2A02, 0xFF02, 0x0002)):
                from battery_hid import battery_caps
                info.update(battery_caps(hid, data, caps, allow_fixed_usage=True))
                caps_complete = all(info.get(key) is not None
                                    for key in ("input_report_sizes", "output_report_sizes"))
            if caps_complete and attrs.vendor == 0x24AE and attrs.product in (
                    0x1410, 0x1411, 0x1412, 0x1413, 0x1414, 0x1415, 0x1416, 0x1417,
                    0x1418, 0x1420, 0x1421, 0x1422, 0x1423, 0x1444, 0x144A, 0x144B,
                    0x1451, 0x1452, 0x1453, 0x1459, 0x145B, 0x145D, 0x1460, 0x1462,
                    0x1464, 0x1466, 0x1468, 0x146A, 0x146C, 0x146D, 0x146E, 0x1470,
                    0x1471, 0x1473, 0x1474, 0x1475, 0x1476, 0x1477, 0x1478, 0x14A1,
                    0x14A2, 0x14A4, 0x14A5, 0x14A6, 0x14A7, 0x14A8, 0x14A9, 0x14AA,
                    0x1B01, 0x1B02, 0x1B03, 0x1B04, 0x1B05, 0x1B06, 0x1B07, 0x1B08,
                    0x1B09, 0x1B0A, 0x1B0B, 0x1B0C, 0x1B0D, 0x1B0E, 0x1B0F, 0x1B10,
                    0x1B11, 0x1B12, 0x1B13, 0x1B14, 0x1B15,
                    ) and (caps.page, caps.usage) == (0xFF00, 0x0002):
                # Passive Rapoo input only: never query feature/output reports.
                from battery_hid import byte_report_sizes
                info["input_report_sizes"] = byte_report_sizes(hid, data, caps, 0, allow_fixed_usage=True)
                _descriptor_fallback(info, caps, ("input",))
                caps_complete = bool(info["input_report_sizes"] and "7" in info["input_report_sizes"])
            if caps_complete and ((attrs.vendor, attrs.product, caps.page, caps.usage) in (
                    (0x1D57, 0xFA60, 0x000A, 0x0000),
                    (0x1D57, 0xFA65, 0xFF00, 0x0001))
                    or (attrs.vendor, attrs.product, caps.page, caps.usage) == (
                        0x1D57, 0xFA65, 0x000A, 0x0000) and attrs.release & 0xFF == 0x16):
                # FA6x is receive-only: prove Input 03 from descriptor metadata.
                from battery_hid import byte_report_sizes
                info["input_report_sizes"] = byte_report_sizes(hid, data, caps, 0)
                if info["input_report_sizes"] is None:
                    _descriptor_fallback(info, caps, ("input",))
                else:
                    info["input_report_proof"] = "caps"
                caps_complete = bool(info["input_report_sizes"]
                                     and info["input_report_sizes"].get("3", 0) >= 5)
            if caps_complete and (attrs.vendor, attrs.product, caps.page, caps.usage) == (
                    0x260D, 0x1074, 0xFF02, 0x0002):
                from battery_hid import byte_report_sizes
                info.update(feature_report_length=caps.feature,
                            feature_report_sizes=byte_report_sizes(hid, data, caps, 2),
                            input_report_sizes=byte_report_sizes(hid, data, caps, 0))
                caps_complete = all(info.get(key) is not None
                                    for key in ("feature_report_sizes", "input_report_sizes"))
            if caps_complete and (attrs.vendor, attrs.product, caps.page, caps.usage) in (
                    (0x1915, 0xAE1C, 0xFFA0, 0x0001),
                    (0x372E, 0x1026, 0xFF00, 0x0001),
                    (0x372E, 0x1026, 0xFF06, 0x0001)):
                from battery_hid import byte_report_sizes
                info.update(feature_report_length=caps.feature,
                            feature_report_sizes=byte_report_sizes(hid, data, caps, 2))
                if (attrs.vendor, attrs.product) == (0x372E, 0x1026):
                    _descriptor_fallback(info, caps, ("feature",))
                caps_complete = info["feature_report_sizes"] is not None
            if (attrs.vendor, attrs.product) == (0x3837, 0x100C):
                info["a5v2_descriptor_complete"] = bool(caps_complete and info["usage_page"] and info["usage"])
            if caps_complete and info["product_string"] and len(_descriptor_cache) < 512:
                _descriptor_cache[path] = dict(info)
            inventory.append(info)
        except (OSError, ValueError):
            if _a5v2_path_identity(path) != (0x3837, 0x100C):
                raise
        finally:
            if data.value:
                hid.HidD_FreePreparsedData(data)
            kernel.CloseHandle(handle)
    return _a5v2_snapshot(enrich(inventory, excluded), present_paths)
