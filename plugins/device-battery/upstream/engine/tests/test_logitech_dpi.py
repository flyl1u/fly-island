"""GPW DPI protocol/control regressions. Every HID object is an in-memory fake.

Public protocol facts: Solaar settings_templates.py, commit
e7304c4c451cc9bb4f206a914844525e67856a28 (AdjustableDpi/produce_dpi_list).
No Solaar implementation is imported, no real device is opened or written.
"""
import copy
import os
import sys
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _hidstub  # noqa: E402, F401
from providers import logitech as L
from test_logitech import FakeBus, FakeHidpp, entry


SHORT = br"\\?\HID#VID_046D&PID_C547&MI_01&Col01#7&gpw-fixture&0&0000#{fixture}"
LONG = br"\\?\HID#VID_046D&PID_C547&MI_01&Col02#7&gpw-fixture&0&0001#{fixture}"
SUPPORTED = [0, 0, 100, 0xE0, 50, 100, 0, 0, 0]  # 100..25600, step 50, terminated


def device(name="PRO X Wireless"):
    return FakeHidpp({L.F_NAME: (3, {2: [3]}), L.F_INFO: (2, {0: [1, 0x12, 0x34, 0x56, 0x78]}),
                      L.F_UNIFIED: (6, {1: [75, 4, 0]}), L.F_DPI: (10, {0: [1], 1: SUPPORTED})}, name=name)


class DpiBus(FakeBus):
    def __init__(self, mouse, slot=1):
        super().__init__({LONG: ({slot: mouse}, SHORT)})
        self.slot = slot
        self.current, self.default = 400, 800
        self.current_reads = 0
        self.set_calls = []
        self.ignore_set = self.missing_ack = self.fail_readback = self.raise_set = False
        self.short_current = False
        self.change_before_write = None
        self.change_unit_after_state = self.change_unit_after_write = False

    def write(self, path, data):
        if data[1] == self.slot and data[2] == 10 and data[3] >> 4 in (2, 3):
            self.writes.append((path, list(data)))
            fn = data[3]
            if fn >> 4 == 2:
                self.current_reads += 1
                if self.fail_readback and self.set_calls:
                    return self._error(path, self.slot, 10, fn, 0x05)
                if self.change_before_write is not None and self.current_reads == 2:
                    self.current = self.change_before_write
                if self.short_current:
                    self.queues[path].append([0x11, self.slot, 10, fn, 0, 0, 0])
                    return
                self._reply(path, self.slot, 10, fn, [0, self.current >> 8, self.current & 255,
                                            self.default >> 8, self.default & 255])
                if self.change_unit_after_state and self.current_reads == 1:
                    self.slots[LONG][self.slot].features[L.F_INFO] = (2, {0: [1, 1, 2, 3, 4]})
                return
            self.set_calls.append(list(data))
            if self.raise_set:
                raise OSError("fixture transport lost during the one write")
            if not self.ignore_set:
                self.current = (data[5] << 8) | data[6]
            if self.change_unit_after_write:
                self.slots[LONG][self.slot].features[L.F_INFO] = (2, {0: [1, 1, 2, 3, 4]})
            if not self.missing_ack:
                return self._reply(path, self.slot, 10, fn, [0])
            return
        return super().write(path, data)


class GpwDpiTests(unittest.TestCase):
    def setUp(self):
        self.mouse = device()
        self.inventory = [dict(entry(0xC547, 0xFF00, 1, SHORT), vendor_id=L.LOGITECH_VID),
                          dict(entry(0xC547, 0xFF00, 2, LONG), vendor_id=L.LOGITECH_VID)]
        self.bus = DpiBus(self.mouse)
        hid = patch.object(L, "hid", types.SimpleNamespace(device=self.bus.device_class()))
        hidlist = patch.object(L, "hidlist", types.SimpleNamespace(enumerate=lambda vid=0: self.inventory))
        original = L._Channel.request
        def bounded(channel, idx, feat, func, params=(), timeout=None):
            return original(channel, idx, feat, func, params, timeout=.01)
        request = patch.object(L._Channel, "request", bounded)
        for replacement in (hid, hidlist, request):
            replacement.start()
            self.addCleanup(replacement.stop)

    def prime(self):
        [self.status] = L.LogitechProvider().poll()
        self.assertTrue(self.status.dpi["canSet"])
        self.target = self.status.dpi_target
        self.token = self.status.dpi["targetToken"]
        self.bus.writes.clear()
        self.bus.current_reads = 0

    def change(self, value=800, expected=400):
        return L.set_device_dpi(self.inventory, self.target, value, expected, self.token)

    def test_exact_gpw_range_is_linear_and_not_a_preset_list(self):
        values = L.parse_dpi_list(SUPPORTED)
        self.assertEqual(len(values), 511)
        self.assertEqual((values[0], values[-1]), (100, 25600))
        self.assertTrue(all(b - a == 50 for a, b in zip(values, values[1:])))
        self.assertTrue({400, 800, 1600, 3200}.issubset(values))
        self.prime()
        self.assertEqual(self.status.dpi["stages"], [400, 800, 1600, 3200])
        self.assertEqual(self.status.dpi["stageSource"], "quick")
        self.assertRegex(self.token, r"^[0-9a-f]{64}$")
        self.assertFalse(any(data[2] == 10 and data[3] >> 4 == 3 for _, data in self.bus.writes))

    def test_quick_choices_include_current_without_fabricating_presets(self):
        self.bus.current = 1200
        self.prime()
        self.assertEqual(self.status.dpi["stages"], [400, 800, 1200, 1600, 3200])
        self.assertLessEqual(len(self.status.dpi["stages"]), 8)

    def test_success_is_one_volatile_write_followed_by_readback(self):
        self.prime()
        before = copy.deepcopy(self.status)
        result = self.change()
        self.assertTrue(result["success"])
        self.assertFalse(result["outcomeUnknown"])
        self.assertEqual(result["confirmedDpi"], 800)
        self.assertEqual(result["dpi"]["current"], 800)
        self.assertEqual(len(self.bus.set_calls), 1)
        self.assertEqual(self.bus.set_calls[0][4:7], [0, 3, 32])
        self.assertGreaterEqual(self.bus.current_reads, 3)
        self.assertEqual(self.status, before, "DPI control cannot rewrite earlier battery evidence")
        self.assertFalse(any(data[2] == 0 and data[4:6] == [0x81, 0] for _, data in self.bus.writes))

    def test_dpi_reads_do_not_advance_battery_measurement_time(self):
        with patch.object(L, "_dpi_now", side_effect=["2026-10-18T01:00:00Z", "2026-10-18T01:00:01Z"]):
            [status] = L.LogitechProvider().poll()
        self.assertEqual(status.measured_at_utc, "2026-10-18T01:00:00Z")
        self.assertEqual(status.queried_at_utc, status.measured_at_utc)
        self.assertEqual(status.dpi["checkedAtUtc"], "2026-10-18T01:00:01Z")
        self.assertEqual(status.level, 75)

    def test_stale_unit_cannot_be_written(self):
        self.prime()
        self.mouse.features[L.F_INFO] = (2, {0: [1, 1, 2, 3, 4]})
        result = self.change()
        self.assertEqual(result["error"], "dpi_target_changed")
        self.assertFalse(result["dpi"]["canSet"])
        self.assertEqual(self.bus.set_calls, [])

    def test_unit_is_rechecked_after_capability_queries(self):
        self.prime()
        self.bus.change_unit_after_state = True
        self.assertEqual(self.change()["error"], "dpi_target_changed")
        self.assertEqual(self.bus.set_calls, [])

    def test_missing_receiver_or_stale_token_has_no_hid_work(self):
        self.prime()
        result = L.set_device_dpi([], self.target, 800, 400, self.token)
        self.assertEqual(result["error"], "dpi_receiver_changed")
        result = L.set_device_dpi(self.inventory, self.target, 800, 400, "0" * 64)
        self.assertEqual(result["error"], "dpi_stale_target")
        self.assertEqual(self.bus.writes, [])

    def test_same_pid_other_receiver_does_not_match_exact_paths(self):
        self.prime()
        other = [dict(value, path=value["path"].replace(b"gpw-fixture", b"other-receiver")) for value in self.inventory]
        self.assertEqual(L.set_device_dpi(other, self.target, 800, 400, self.token)["error"], "dpi_receiver_changed")
        self.assertEqual(self.bus.writes, [])

    def test_unsupported_value_and_invalid_types_never_write(self):
        self.prime()
        self.assertEqual(self.change(555)["error"], "dpi_unsupported_value")
        for value, expected in ((True, 400), (800, False), ("800", 400), (0, 400), (800, None)):
            self.assertEqual(self.change(value, expected)["error"], "dpi_invalid_value")
        self.assertEqual(self.bus.set_calls, [])

    def test_current_mismatch_before_or_after_capability_read_never_writes(self):
        self.prime()
        self.bus.current = 1600
        result = self.change()
        self.assertEqual((result["error"], result["confirmedDpi"]), ("dpi_current_changed", 1600))
        self.bus.current, self.bus.current_reads = 400, 0
        self.bus.change_before_write = 3200
        result = self.change()
        self.assertEqual((result["error"], result["confirmedDpi"]), ("dpi_current_changed", 3200))
        self.assertEqual(self.bus.set_calls, [])

    def test_repeated_current_selection_is_verified_without_a_write(self):
        self.prime()
        result = self.change(400)
        self.assertTrue(result["success"])
        self.assertEqual(result["confirmedDpi"], 400)
        self.assertEqual(self.bus.set_calls, [])

    def test_unknown_readback_is_not_retried_or_reported_successful(self):
        self.prime()
        self.bus.fail_readback = True
        result = self.change()
        self.assertFalse(result["success"])
        self.assertTrue(result["outcomeUnknown"])
        self.assertIsNone(result["confirmedDpi"])
        self.assertIsNone(result["dpi"]["current"])
        self.assertFalse(result["dpi"]["canSet"])
        self.assertEqual(len(self.bus.set_calls), 1)

    def test_missing_ack_with_matching_readback_can_confirm_state(self):
        self.prime()
        self.bus.missing_ack = True
        result = self.change()
        self.assertTrue(result["success"])
        self.assertEqual(result["confirmedDpi"], 800)
        self.assertEqual(len(self.bus.set_calls), 1)

    def test_missing_ack_and_mismatch_remain_unknown_without_retry(self):
        self.prime()
        self.bus.missing_ack = self.bus.ignore_set = True
        result = self.change()
        self.assertFalse(result["success"])
        self.assertTrue(result["outcomeUnknown"])
        self.assertIsNone(result["confirmedDpi"])
        self.assertEqual(len(self.bus.set_calls), 1)

    def test_write_transport_exception_is_uncertain_and_never_retried(self):
        self.prime()
        self.bus.raise_set = True
        result = self.change()
        self.assertFalse(result["success"])
        self.assertTrue(result["outcomeUnknown"])
        self.assertEqual(len(self.bus.set_calls), 1)

    def test_changed_unit_after_write_invalidates_readback_identity(self):
        self.prime()
        self.bus.change_unit_after_write = True
        result = self.change()
        self.assertFalse(result["success"])
        self.assertTrue(result["outcomeUnknown"])
        self.assertIsNone(result["confirmedDpi"])
        self.assertEqual(len(self.bus.set_calls), 1)

    def test_sleeping_mouse_has_no_enabled_cached_controls(self):
        self.prime()
        provider = L.LogitechProvider()
        provider.poll()
        self.mouse.silent = True
        [status] = provider.poll()
        self.assertFalse(status.online)
        self.assertIsNone(status.dpi)
        self.assertEqual(self.change()["error"], "dpi_device_unavailable")
        self.assertEqual(self.bus.set_calls, [])

    def test_short_dpi_payload_does_not_erase_valid_battery(self):
        self.bus.short_current = True
        [status] = L.LogitechProvider().poll()
        self.assertEqual(status.level, 75)
        self.assertFalse(status.dpi["canSet"])
        self.assertEqual(status.dpi["error"], "dpi_invalid_reply")
        self.assertIsNone(status.dpi_target)

    def test_name_alone_on_a_different_receiver_has_no_dpi_probe(self):
        self.inventory[:] = [dict(value, product_id=0xC539) for value in self.inventory]
        [status] = L.LogitechProvider().poll()
        self.assertIsNone(status.dpi)
        self.assertFalse(any(data[2] == 10 for _, data in self.bus.writes))

    def test_malformed_supported_ranges_are_rejected(self):
        for reply in ([0, 0, 100, 0xE0, 0, 100, 0, 0, 0],
                      [0, 0, 100, 0xE0, 50, 0, 50, 0, 0], [1, 0, 100, 0, 0], [0, 0, 100]):
            with self.assertRaises(ValueError):
                L.parse_dpi_list(reply)

    def configure_g_pro(self, pid=0xC539, slot=1):
        self.mouse.name = "G Pro Wireless Gaming Mouse"
        self.inventory[:] = [dict(value, product_id=pid) for value in self.inventory]
        self.bus.slot = slot
        self.bus.slots[LONG] = {slot: self.mouse}

    def test_g_pro_wireless_exact_name_all_listed_lightspeed_receivers(self):
        for pid in (0xC539, 0xC53A, 0xC53D, 0xC53F, 0xC541, 0xC545, 0xC547, 0xC54D):
            with self.subTest(pid=hex(pid)):
                self.configure_g_pro(pid)
                self.bus.current = 400
                self.bus.set_calls.clear()
                self.prime()
                result = self.change()
                self.assertTrue(result["success"])
                self.assertEqual(result["confirmedDpi"], 800)
                self.assertEqual(len(self.bus.set_calls), 1)

    def test_g_pro_wireless_cable_uses_same_unit_and_volatile_readback(self):
        self.configure_g_pro(0xC088, 0xFF)
        self.prime()
        self.assertEqual(self.target["slot"], 0xFF)
        self.assertEqual(self.target["unit"], "12345678")
        self.assertTrue(self.change()["success"])
        self.assertEqual(len(self.bus.set_calls), 1)
        self.assertEqual(self.bus.set_calls[0][1:3], [0xFF, 10])

    def test_g_pro_wireless_rejects_close_names_other_models_and_receivers(self):
        for name in ("G Pro Wireless Gaming Mousf", "G Pro Wireless Gaming Mouse X", "G Pro Wireless", "PRO X Wireless"):
            with self.subTest(name=name):
                self.configure_g_pro()
                self.mouse.name = name
                [status] = L.LogitechProvider().poll()
                self.assertIsNone(status.dpi)
                self.assertEqual(self.bus.set_calls, [])
        for pid in (0xC548, 0xC52B, 0xC500):
            with self.subTest(pid=hex(pid)):
                self.configure_g_pro(pid)
                self.inventory[:] = [dict(value, product_string="Receiver") for value in self.inventory]
                [status] = L.LogitechProvider().poll()
                self.assertIsNone(status.dpi)
                self.assertEqual(self.bus.set_calls, [])

    def test_g_pro_wireless_preserves_identity_current_and_readback_guards(self):
        for wired in (False, True):
            for failure in ("unit", "current", "readback", "unit-after-write"):
                with self.subTest(wired=wired, failure=failure):
                    self.configure_g_pro(0xC088 if wired else 0xC539, 0xFF if wired else 1)
                    self.mouse.features[L.F_INFO] = (2, {0: [1, 0x12, 0x34, 0x56, 0x78]})
                    self.bus.current = 400
                    self.bus.set_calls.clear()
                    self.bus.fail_readback = self.bus.change_unit_after_write = False
                    self.prime()
                    if failure == "unit":
                        self.mouse.features[L.F_INFO] = (2, {0: [1, 1, 2, 3, 4]})
                    elif failure == "current":
                        self.bus.current = 1600
                    elif failure == "readback":
                        self.bus.fail_readback = True
                    else:
                        self.bus.change_unit_after_write = True
                    result = self.change()
                    self.assertFalse(result["success"])
                    self.assertEqual(len(self.bus.set_calls), int(failure in ("readback", "unit-after-write")))
                    self.assertEqual(result["outcomeUnknown"], failure in ("readback", "unit-after-write"))

    def test_g_pro_wireless_no_dpi_without_unit_or_long_collection(self):
        self.configure_g_pro(0xC088, 0xFF)
        self.mouse.features[L.F_INFO] = (2, {0: [1, 0, 0, 0, 0]})
        [status] = L.LogitechProvider().poll()
        self.assertFalse(status.dpi and status.dpi["canSet"])
        self.assertIsNone(status.dpi_target)
        self.inventory[:] = self.inventory[:1]
        self.assertEqual(L.LogitechProvider().poll(), [])

    def test_g_pro_wireless_invalid_write_identity_never_touches_hid(self):
        self.configure_g_pro()
        self.prime()
        for change in (dict(name=[]), dict(name="G Pro Wireless Gaming Mousf"),
                       dict(pid=0xC548), dict(pid=0xC500), dict(pid=0),
                       dict(slot=0), dict(slot=7), dict(slot=True), dict(unit="00000000")):
            with self.subTest(change=change):
                target = dict(self.target, **change)
                result = L.set_device_dpi(self.inventory, target, 800, 400, L._target_token(target))
                self.assertEqual(result["error"], "dpi_invalid_target")
                self.assertEqual(self.bus.writes, [])

    def test_g_pro_wireless_name_change_to_another_allowed_model_is_rejected(self):
        self.configure_g_pro(0xC547)
        self.prime()
        self.mouse.name = "PRO X Wireless"
        self.assertEqual(self.change()["error"], "dpi_target_changed")
        self.assertEqual(self.bus.set_calls, [])

    def test_g_pro_wireless_cable_can_use_long_collection_only(self):
        self.configure_g_pro(0xC088, 0xFF)
        self.inventory[:] = self.inventory[1:]
        self.prime()
        self.assertIsNone(self.target["short_path"])
        self.assertTrue(self.change()["success"])
        self.assertEqual(len(self.bus.set_calls), 1)

    def test_g_pro_wireless_acknowledged_mismatch_keeps_actual_readback_without_retry(self):
        for wired in (False, True):
            with self.subTest(wired=wired):
                self.configure_g_pro(0xC088 if wired else 0xC539, 0xFF if wired else 1)
                self.bus.current = 400
                self.bus.set_calls.clear()
                self.prime()
                self.bus.ignore_set = True
                result = self.change()
                self.assertFalse(result["success"])
                self.assertFalse(result["outcomeUnknown"])
                self.assertEqual((result["error"], result["confirmedDpi"]), ("dpi_readback_mismatch", 400))
                self.assertEqual(len(self.bus.set_calls), 1)

    def test_pro_x_partial_cached_identity_can_recover_on_the_next_poll(self):
        provider = L.LogitechProvider()
        self.mouse.features[L.F_NAME] = (3, {2: [255]})
        [first] = provider.poll()
        self.assertFalse(first.dpi and first.dpi["canSet"])
        self.mouse.features[L.F_NAME] = (3, {2: [3]})
        [recovered] = provider.poll()
        self.assertTrue(recovered.dpi and recovered.dpi["canSet"])
        self.assertEqual(self.bus.set_calls, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
