"""Read only battery fields explicitly declared by a standard HID descriptor.

No vendor commands, input reads, feature writes, firmware operations or driver
installation are used. Keyboard/mouse system collections are opened with zero
desired access, so the program does not take ownership of input devices.
"""
from __future__ import annotations

import ctypes as c
import os
from providers import hidlist
from providers.base import DeviceStatus, Provider


class Caps(c.Structure):
    _fields_ = [(n, c.c_ushort) for n in ("usage", "page", "input", "output", "feature")]+[("reserved", c.c_ushort * 17)]+[(n, c.c_ushort) for n in ("links", "ib", "iv", "id", "ob", "ov", "od", "fb", "fv", "fd")]


class Values(c.Structure):
    _fields_ = [("page", c.c_ushort), ("report", c.c_ubyte), ("alias", c.c_ubyte),
                ("field", c.c_ushort), ("link", c.c_ushort), ("link_usage", c.c_ushort), ("link_page", c.c_ushort),
                ("is_range", c.c_ubyte), ("str_range", c.c_ubyte), ("designator_range", c.c_ubyte), ("absolute", c.c_ubyte),
                ("null", c.c_ubyte), ("reserved", c.c_ubyte), ("bits", c.c_ushort), ("count", c.c_ushort),
                ("reserved2", c.c_ushort * 5), ("units_exp", c.c_uint32), ("units", c.c_uint32),
                ("logical_min", c.c_int32), ("logical_max", c.c_int32), ("physical_min", c.c_int32), ("physical_max", c.c_int32),
                ("range", c.c_ushort * 8)]


def percent(value, low, high):
    if low < 0 or high <= low or high > 65535 or not low <= value <= high:
        return None
    return round((value - low) * 100 / (high - low))


class StandardHidProvider(Provider):
    name = "standard_hid"

    def __init__(self):
        self._capabilities = {}
        self._paths = None
        self.candidate_count = 0

    def poll(self):
        self.candidate_count = 0
        if os.name != "nt":
            return []
        kernel = c.WinDLL("kernel32", use_last_error=True)
        hid = c.WinDLL("hid", use_last_error=True)
        kernel.CreateFileW.argtypes = [c.c_wchar_p,c.c_uint32,c.c_uint32,c.c_void_p,c.c_uint32,c.c_uint32,c.c_void_p]
        kernel.CreateFileW.restype = c.c_void_p
        kernel.CloseHandle.argtypes = [c.c_void_p]
        hid.HidD_GetPreparsedData.argtypes = [c.c_void_p,c.POINTER(c.c_void_p)]
        hid.HidD_GetPreparsedData.restype = c.c_ubyte
        hid.HidD_FreePreparsedData.argtypes = [c.c_void_p]
        hid.HidP_GetCaps.argtypes = [c.c_void_p,c.POINTER(Caps)]
        hid.HidP_GetValueCaps.argtypes = [c.c_int,c.POINTER(Values),c.POINTER(c.c_ushort),c.c_void_p]
        hid.HidP_GetUsageValue.argtypes = [c.c_int,c.c_ushort,c.c_ushort,c.c_ushort,c.POINTER(c.c_uint32),c.c_void_p,c.c_void_p,c.c_uint32]
        hid.HidD_GetFeature.argtypes = [c.c_void_p,c.c_void_p,c.c_uint32]
        hid.HidD_GetFeature.restype = c.c_ubyte
        current = hidlist.interface_paths()
        if current != self._paths:
            self._capabilities.clear()
            self._paths = current
        results = []
        for info in hidlist.enumerate():
            path = info["path"].decode("utf-8", "replace") if isinstance(info["path"], bytes) else info["path"]
            if self._capabilities.get(path) is False:
                continue
            handle = kernel.CreateFileW(path, 0, 3, None, 3, 0, None)
            if handle in (None, c.c_void_p(-1).value):
                continue
            data = c.c_void_p()
            try:
                if not hid.HidD_GetPreparsedData(handle, c.byref(data)):
                    continue
                caps = Caps()
                if hid.HidP_GetCaps(data, c.byref(caps)) != 0x00110000:
                    continue
                if not 1 <= caps.fv <= 128 or not 2 <= caps.feature <= 4096:
                    self._capabilities[path] = False
                    continue
                values = (Values * caps.fv)()
                length = c.c_ushort(caps.fv)
                if hid.HidP_GetValueCaps(2, values, c.byref(length), data) != 0x00110000:
                    continue
                found = False
                for field in values[:length.value]:
                    usage = 0x20 if field.page == 0x06 else 0x64 if field.page == 0x85 else None
                    if usage is None or field.bits > 32 or field.count < 1:
                        continue
                    if field.is_range:
                        if not field.range[0] <= usage <= field.range[1]:
                            continue
                    elif field.range[0] != usage:
                        continue
                    found = True
                    report = (c.c_ubyte * caps.feature)()
                    report[0] = field.report
                    if not hid.HidD_GetFeature(handle, report, caps.feature):
                        continue
                    value = c.c_uint32()
                    if hid.HidP_GetUsageValue(2, field.page, field.link, usage, c.byref(value), data, report, caps.feature) != 0x00110000:
                        continue
                    level = percent(value.value, field.logical_min, field.logical_max)
                    if level is None:
                        continue
                    name = info.get("product_string") or "Wireless HID device"
                    kind = "keyboard" if caps.page == 1 and caps.usage == 6 else "mouse" if caps.page == 1 and caps.usage == 2 else ""
                    results.append(DeviceStatus("standard:"+path, name, level, False, True, self.name,
                                                approx="coarse" if field.logical_max-field.logical_min < 100 else "", kind=kind,
                                                charging_known=False))
                    break
                self._capabilities[path] = found
                if found:
                    self.candidate_count += 1
            finally:
                if data.value:
                    hid.HidD_FreePreparsedData(data)
                kernel.CloseHandle(handle)
        return results
