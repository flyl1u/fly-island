"""XInput fixtures replace the DLL loader; no real controller APIs are called."""
from contextlib import contextmanager
import ctypes
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from providers import xinput as X


class FakeFunction:
    def __init__(self, callback):
        self.callback = callback

    def __call__(self, *args):
        return self.callback(*args)


class FakeDLL:
    def __init__(self, slots=None, state_errors=None, battery_errors=None):
        self.slots = slots or {}
        self.state_errors = state_errors or {}
        self.battery_errors = battery_errors or {}
        self.state_calls, self.battery_calls = [], []
        self.XInputGetState = FakeFunction(self.state)
        self.XInputGetBatteryInformation = FakeFunction(self.battery)

    def state(self, slot, pointer):
        self.state_calls.append(slot)
        ctypes.cast(pointer, ctypes.POINTER(X.XINPUT_STATE)).contents.dwPacketNumber = 1
        return self.state_errors.get(slot, 0 if slot in self.slots else 1167)

    def battery(self, slot, device_type, pointer):
        self.battery_calls.append((slot, device_type))
        result = ctypes.cast(pointer, ctypes.POINTER(X.XINPUT_BATTERY_INFORMATION)).contents
        result.BatteryType, result.BatteryLevel = self.slots[slot]
        return self.battery_errors.get(slot, 0)


@contextmanager
def xinput_fixture(slots=None, **kwargs):
    dll = FakeDLL(slots, **kwargs)
    with patch.object(X.sys, "platform", "win32"), \
            patch.object(X.ctypes, "WinDLL", return_value=dll, create=True) as loader:
        yield dll, loader


class XInputTests(unittest.TestCase):
    def test_connected_full_battery_and_system_evidence(self):
        with xinput_fixture({0: (3, 3)}) as (dll, loader):
            status, = X.XInputProvider().poll()
        self.assertEqual((status.key, status.name, status.level, status.source, status.kind),
                         ("xinput:0", "Xbox 手柄", 100, "xinput", "gamepad"))
        self.assertEqual(status.approx, "about 100% (full)")
        self.assertEqual(status.source_quality, "system_property")
        self.assertTrue(status.connection_known)
        self.assertFalse(status.charging_known)
        self.assertFalse(status.charging)
        self.assertIsNone(status.measured_at_utc)
        self.assertEqual(dll.state_calls, [0, 1, 2, 3])
        self.assertEqual(dll.battery_calls, [(0, 0)])
        loader.assert_called_once_with("xinput1_4.dll", winmode=0x00000800)

    def test_all_wireless_tiers_are_approximate(self):
        for battery_type in (2, 3):
            with self.subTest(battery_type=battery_type), xinput_fixture(
                    {slot: (battery_type, slot) for slot in range(4)}):
                statuses = X.XInputProvider().poll()
                self.assertEqual([s.level for s in statuses], [5, 30, 65, 100])
                self.assertEqual([s.approx for s in statuses],
                                 ["about 5% (empty)", "about 30% (low)",
                                  "about 65% (medium)", "about 100% (full)"])
                self.assertTrue(all(not s.charging_known for s in statuses))

    def test_wired_unknown_and_invalid_values_never_invent_percentages(self):
        for battery_type, level in ((1, 0), (1, 3), (0xFF, 3), (7, 3), (2, 4), (3, 0xFF)):
            with self.subTest(battery_type=battery_type, level=level), \
                    xinput_fixture({0: (battery_type, level)}):
                status, = X.XInputProvider().poll()
                self.assertIsNone(status.level)
                self.assertEqual(status.approx, "")
                self.assertTrue(status.level_unavailable)
                self.assertTrue(status.online)
                self.assertFalse(status.charging_known)

    def test_state_failure_and_disconnected_battery_are_omitted(self):
        with xinput_fixture({0: (3, 3), 1: (0, 3)}, state_errors={0: 1167}) as (dll, _):
            self.assertEqual(X.XInputProvider().poll(), [])
        self.assertEqual(dll.battery_calls, [(1, 0)])

    def test_battery_failure_does_not_prevent_other_slots(self):
        with xinput_fixture({0: (3, 3), 2: (2, 1)}, battery_errors={0: 1167}):
            status, = X.XInputProvider().poll()
        self.assertEqual((status.key, status.name, status.level), ("xinput:2", "Xbox 手柄 3", 30))

    def test_multiple_slots_have_stable_slot_keys_and_names(self):
        with xinput_fixture({0: (3, 3), 1: (1, 0), 3: (2, 2)}):
            provider = X.XInputProvider()
            first, second = provider.poll(), provider.poll()
        self.assertEqual([s.key for s in first], ["xinput:0", "xinput:1", "xinput:3"])
        self.assertEqual([s.name for s in first], ["Xbox 手柄", "Xbox 手柄 2", "Xbox 手柄 4"])
        self.assertEqual([s.key for s in first], [s.key for s in second])

    def test_missing_dll_or_either_function_disables_reader_without_fallback(self):
        for missing in ("dll", "XInputGetState", "XInputGetBatteryInformation"):
            dll = FakeDLL({0: (3, 3)})
            if missing != "dll":
                delattr(dll, missing)
            with self.subTest(missing=missing), patch.object(X.sys, "platform", "win32"), \
                    patch.object(X.ctypes, "WinDLL", return_value=dll,
                                 side_effect=OSError("unavailable") if missing == "dll" else None,
                                 create=True) as loader:
                provider = X.XInputProvider()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.diagnostics(), [])
                loader.assert_called_once_with("xinput1_4.dll", winmode=0x00000800)
                self.assertEqual((dll.state_calls, dll.battery_calls), ([], []))

    def test_non_windows_does_not_attempt_a_dll_load(self):
        with patch.object(X.sys, "platform", "linux"), \
                patch.object(X.ctypes, "WinDLL", create=True) as loader:
            self.assertEqual(X.XInputProvider().poll(), [])
            loader.assert_not_called()

    def test_windows_abi_uses_fixed_width_structures_and_pointer_arguments(self):
        self.assertEqual(ctypes.sizeof(X.XINPUT_GAMEPAD), 12)
        self.assertEqual(ctypes.sizeof(X.XINPUT_STATE), 16)
        self.assertEqual(ctypes.sizeof(X.XINPUT_BATTERY_INFORMATION), 2)
        with xinput_fixture() as (dll, _):
            X.XInputProvider()
        self.assertEqual(dll.XInputGetState.argtypes,
                         [ctypes.c_uint32, ctypes.POINTER(X.XINPUT_STATE)])
        self.assertEqual(dll.XInputGetBatteryInformation.argtypes,
                         [ctypes.c_uint32, ctypes.c_uint8, ctypes.POINTER(X.XINPUT_BATTERY_INFORMATION)])
        self.assertIs(dll.XInputGetState.restype, ctypes.c_uint32)
        self.assertIs(dll.XInputGetBatteryInformation.restype, ctypes.c_uint32)


if __name__ == "__main__":
    unittest.main()
