"""Read-only Windows XInput battery tiers; no HID IO or controller commands.

Only the Windows 10/11 system xinput1_4.dll is loaded. XInput exposes slots,
not Bluetooth identities; the manager prefers Bluetooth percentages using a
documented count-based heuristic when both readers report Xbox gamepads.
"""
from __future__ import annotations

import ctypes
import sys

from .base import DeviceStatus, Provider

BATTERY_DEVTYPE_GAMEPAD = 0
BATTERY_TYPE_DISCONNECTED = 0
BATTERY_TYPE_WIRED = 1
BATTERY_TYPE_ALKALINE = 2
BATTERY_TYPE_NIMH = 3
BATTERY_TYPE_UNKNOWN = 0xFF
BATTERY_LEVELS = {0: (5, "empty"), 1: (30, "low"),
                  2: (65, "medium"), 3: (100, "full")}


class XINPUT_GAMEPAD(ctypes.Structure):
    _fields_ = [("wButtons", ctypes.c_uint16),
                ("bLeftTrigger", ctypes.c_uint8), ("bRightTrigger", ctypes.c_uint8),
                ("sThumbLX", ctypes.c_int16), ("sThumbLY", ctypes.c_int16),
                ("sThumbRX", ctypes.c_int16), ("sThumbRY", ctypes.c_int16)]


class XINPUT_STATE(ctypes.Structure):
    _fields_ = [("dwPacketNumber", ctypes.c_uint32), ("Gamepad", XINPUT_GAMEPAD)]


class XINPUT_BATTERY_INFORMATION(ctypes.Structure):
    _fields_ = [("BatteryType", ctypes.c_uint8), ("BatteryLevel", ctypes.c_uint8)]


def _load_functions():
    if sys.platform != "win32":
        return None
    try:
        # LOAD_LIBRARY_SEARCH_SYSTEM32: never load a same-named local DLL.
        dll = ctypes.WinDLL("xinput1_4.dll", winmode=0x00000800)
        get_state = dll.XInputGetState
        get_battery = dll.XInputGetBatteryInformation
        get_state.argtypes = [ctypes.c_uint32, ctypes.POINTER(XINPUT_STATE)]
        get_battery.argtypes = [ctypes.c_uint32, ctypes.c_uint8,
                               ctypes.POINTER(XINPUT_BATTERY_INFORMATION)]
        get_state.restype = get_battery.restype = ctypes.c_uint32
        return get_state, get_battery
    except (OSError, AttributeError):
        return None


class XInputProvider(Provider):
    name = "xinput"

    def __init__(self):
        self._functions = _load_functions()

    def poll(self):
        if self._functions is None:
            return []
        get_state, get_battery = self._functions
        out = []
        for slot in range(4):
            state = XINPUT_STATE()
            if get_state(slot, ctypes.byref(state)) != 0:
                continue
            battery = XINPUT_BATTERY_INFORMATION()
            if get_battery(slot, BATTERY_DEVTYPE_GAMEPAD, ctypes.byref(battery)) != 0:
                continue
            if battery.BatteryType == BATTERY_TYPE_DISCONNECTED:
                continue
            level, approx = None, ""
            if battery.BatteryType in (BATTERY_TYPE_ALKALINE, BATTERY_TYPE_NIMH):
                tier = BATTERY_LEVELS.get(battery.BatteryLevel)
                if tier is not None:
                    level, label = tier
                    approx = f"about {level}% ({label})"
            # Wired, unknown types/levels have no percentage. Explicitly clear
            # any earlier wireless percentage for this slot in the manager.
            out.append(DeviceStatus(
                f"xinput:{slot}", "Xbox 手柄" + (f" {slot + 1}" if slot else ""),
                level, source="xinput", approx=approx, kind="gamepad",
                source_quality="system_property", connection_known=True,
                charging_known=False, level_unavailable=level is None,
            ))
        return out
