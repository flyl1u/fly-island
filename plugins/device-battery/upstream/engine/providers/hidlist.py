"""Gentle access to the list of HID devices.

hidapi's hid.enumerate() briefly opens EVERY HID device on the system (the
keyboard included) to read its attributes, even when filtering by vendor id.
Doing that every couple of seconds can upset sensitive devices such as
high-polling-rate keyboards. So:

  * interface_paths() lists the HID device paths through the Windows
    configuration manager (cfgmgr32) WITHOUT opening any device. It is cheap
    and is what the app uses to notice devices being plugged in or removed.
  * enumerate(vid) returns hid.enumerate(vid), but only calls hidapi when the
    device list has actually changed since the last call; otherwise it returns
    the cached result. If no device with that vendor id is present at all,
    hidapi is not called.

On other platforms (and in tests) it falls back to plain hid.enumerate().
"""
from __future__ import annotations

import ctypes
import re
import sys
import threading
import time
from typing import Dict, FrozenSet, List, Optional, Tuple

try:
    import hid
except ImportError:          # pragma: no cover
    hid = None

_lock = threading.Lock()
_cache: Dict[int, Tuple[FrozenSet[str], List[dict]]] = {}
_short_at: Dict[int, float] = {}      # vid -> when a short result was last re-read
_stats = {"hidapi": 0, "cached": 0, "skipped": 0, "short": 0}

# hidapi opens every device it lists to read its attributes, so it can return fewer entries
# than there are interfaces for that vendor: a collection it could not open right then is
# simply missing. The path set is unchanged by that, so the short list would be cached until
# the device is unplugged. Re-read when the cached result is short, but at most this often -
# a collection that is permanently unopenable must not turn every call into an enumeration.
SHORT_RETRY = 30.0

# USB paths carry the vendor id as "VID_054C"; Bluetooth HID paths use
# "VID&0002054C" (eight hex digits, the vendor id is the low four). Match both.
_VID_RE = re.compile(r"vid[_&]([0-9a-f]{4,8})")


def _path_vids(path: str) -> FrozenSet[int]:
    return frozenset(int(m.group(1)[-4:], 16) for m in _VID_RE.finditer(path))


class _GUID(ctypes.Structure):
    _fields_ = [("Data1", ctypes.c_ulong), ("Data2", ctypes.c_ushort),
                ("Data3", ctypes.c_ushort), ("Data4", ctypes.c_ubyte * 8)]


# GUID_DEVINTERFACE_HID {4D1E55B2-F16F-11CF-88CB-001111000030}
_HID_GUID = _GUID(0x4D1E55B2, 0xF16F, 0x11CF, (ctypes.c_ubyte * 8)(0x88, 0xCB, 0x00, 0x11, 0x11, 0x00, 0x00, 0x30))
_CR_SUCCESS = 0x00
_CR_BUFFER_SMALL = 0x1A
_PRESENT = 0x00              # CM_GET_DEVICE_INTERFACE_LIST_PRESENT

_cfgmgr = None
if sys.platform == "win32":
    try:
        _cfgmgr = ctypes.WinDLL("cfgmgr32")
        _cfgmgr.CM_Get_Device_Interface_List_SizeW.argtypes = [
            ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(_GUID), ctypes.c_wchar_p, ctypes.c_ulong]
        _cfgmgr.CM_Get_Device_Interface_List_SizeW.restype = ctypes.c_ulong
        _cfgmgr.CM_Get_Device_Interface_ListW.argtypes = [
            ctypes.POINTER(_GUID), ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_ulong, ctypes.c_ulong]
        _cfgmgr.CM_Get_Device_Interface_ListW.restype = ctypes.c_ulong
    except (OSError, AttributeError):
        _cfgmgr = None


def interface_paths() -> Optional[FrozenSet[str]]:
    """Paths of the present HID interfaces, lower-case, without opening any device.
    None if the configuration manager is not available (non-Windows)."""
    if _cfgmgr is None:
        return None
    for _ in range(4):                       # the list can grow between the two calls
        size = ctypes.c_ulong(0)
        if _cfgmgr.CM_Get_Device_Interface_List_SizeW(ctypes.byref(size), ctypes.byref(_HID_GUID),
                                                      None, _PRESENT) != _CR_SUCCESS:
            return None
        buf = ctypes.create_unicode_buffer(size.value + 1)
        rc = _cfgmgr.CM_Get_Device_Interface_ListW(ctypes.byref(_HID_GUID), None, buf,
                                                   size.value + 1, _PRESENT)
        if rc == _CR_BUFFER_SMALL:
            continue
        if rc != _CR_SUCCESS:
            return None
        raw = ctypes.wstring_at(ctypes.addressof(buf), size.value)
        return frozenset(p.lower() for p in raw.split("\0") if p)
    return None


def vendor_present(paths: FrozenSet[str], vid: int) -> bool:
    return any(vid in _path_vids(p) for p in paths)


def paths_for(paths: FrozenSet[str], vid: int) -> List[str]:
    """The present interfaces of one vendor. hidapi lists one entry per collection, so this
    is the number of entries a complete result has."""
    return [p for p in paths if vid in _path_vids(p)]


def present_vids(paths: FrozenSet[str]) -> FrozenSet[int]:
    out = set()
    for p in paths:
        out |= _path_vids(p)
    return frozenset(out)


def enumerate(vid: int = 0) -> List[dict]:  # noqa: A001  (mirrors hid.enumerate)
    """hid.enumerate(vid), re-run only when the set of HID devices changes."""
    if hid is None:
        return []
    paths = interface_paths()
    if paths is None:                        # no cfgmgr32: nothing to compare against
        _stats["hidapi"] += 1
        return hid.enumerate(vid)
    with _lock:
        if vid and not vendor_present(paths, vid):
            _cache[vid] = (paths, [])
            _stats["skipped"] += 1
            return []
        hit = _cache.get(vid)
        if hit is not None and hit[0] == paths:
            # A short result means hidapi could not open one of the vendor's collections and
            # left it out. Serving that from the cache would hide the collection for the life
            # of the process, so ask again - rate limited, because a permanently unopenable
            # collection would otherwise cost a full enumeration on every single call.
            short = len(hit[1]) < len(paths_for(paths, vid))
            if not short or time.time() - _short_at.get(vid, 0.0) < SHORT_RETRY:
                _stats["cached"] += 1
                return list(hit[1])
            _short_at[vid] = time.time()
            _stats["short"] += 1
        result = hid.enumerate(vid)
        _stats["hidapi"] += 1
        _cache[vid] = (paths, result)
        return list(result)


def stats() -> Dict[str, int]:
    return dict(_stats)
