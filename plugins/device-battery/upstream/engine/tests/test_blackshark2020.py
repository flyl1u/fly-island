"""BlackShark 2020 regression tests; no hardware is opened.

Fixtures come from direct HID reads on receiver 1532:0528 on Windows,without Synapse.
Physical power states were checked during the reads,
including the full-charge LED. See the provider (blackshark2020.py) docstring for more info.
Mutated frames exercise invalid responses;
they are not evidence of additional supported hardware states or percentages.

Run: python -m unittest discover -s tests
"""
import os
import sys
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _hidstub  # noqa: E402, F401

from providers import blackshark2020
from providers.razer import RazerProvider


def frame(hex_data):
    return bytes.fromhex(hex_data).ljust(64, b"\x00")


BATTERY = frame("ff 0f 05 fe 12 04 1f 08 05 03 05 01 0e c0 50")
CHARGING = frame("ff 0f 05 fe 12 04 1f 08 05 05 03 09 10 80 50")
OFFLINE = frame("ff 01 00 fe 12 04 1f 08 05 05 03 09 10 88 50")
FULL = frame("ff 0f 05 fe 12 04 1f 08 05 06 05 06 10 88 64")
UNPLUGGED = frame("ff 0f 05 fe 12 04 1f 08 05 03 05 01 10 38 64")
HALF = frame("ff 0f 05 fe 12 04 1f 08 05 03 05 01 0e a0 32 00")
HALF_LATER = frame("ff 0f 05 fe 12 04 1f 08 05 03 05 01 0e 70 32 00")
LOW = frame("ff 0f 05 fe 12 04 1f 08 05 03 05 02 0e 08 1e 00")
BATTERY_10 = frame("ff 0f 05 fe 12 04 1f 08 05 03 05 03 0d a0 0a 00")


class BatteryTests(unittest.TestCase):
    def test_candidate_requires_vendor_collection(self):
        self.assertTrue(blackshark2020.is_candidate(dict(usage_page=0xFF00, usage=1)))
        for info in ({}, dict(usage_page=0x0C, usage=1),
                     dict(usage_page=0xFFC0, usage=1), dict(usage_page=0xFF00, usage=2)):
            with self.subTest(info=info):
                self.assertFalse(blackshark2020.is_candidate(info))

    def test_captured_replies(self):
        self.assertEqual(blackshark2020.parse_reply(BATTERY), (1, 3776, 80))
        self.assertEqual(blackshark2020.parse_reply(CHARGING), (9, 4224, 80))

    def test_rejects_incomplete_unrelated_echo(self):
        unrelated = bytearray(BATTERY)
        unrelated[8] = 0x41
        for data in (None, [], BATTERY[:14], BATTERY[:-1], BATTERY[1:],
                     blackshark2020.REQUEST, OFFLINE, unrelated):
            with self.subTest(data=data):
                self.assertIsNone(blackshark2020.parse_reply(data))

    def read(self, replies):
        dev = Mock()
        dev.send_feature_report.return_value = 64
        dev.get_feature_report.side_effect = replies
        with patch.object(blackshark2020.hid, "device", return_value=dev), \
                patch.object(blackshark2020.time, "sleep"):
            result = blackshark2020.read_battery(b"receiver", [])
        dev.send_feature_report.assert_called_once_with(blackshark2020.REQUEST)
        dev.get_feature_report.assert_called_with(0xFF, 64)
        dev.close.assert_called_once()
        return result

    def test_read_on_battery_and_charging(self):
        self.assertEqual(self.read([BATTERY]), ("ok", 80, False))
        self.assertEqual(self.read([CHARGING]), ("ok", None, True))
        self.assertEqual(self.read([HALF]), ("ok", 50, False))
        self.assertEqual(self.read([HALF_LATER]), ("ok", 50, False))
        self.assertEqual(self.read([LOW]), ("ok", 30, False))
        self.assertEqual(self.read([BATTERY_10]), ("ok", 10, False))

    def test_full_charge_remains_online_without_charging(self):
        self.assertEqual(self.read([FULL]), ("ok", 100, False))

    def test_level_survives_charge_completion_and_unplugging(self):
        for reply, expected in ((BATTERY, ("ok", 80, False)),
                                (CHARGING, ("ok", None, True)),
                                (FULL, ("ok", 100, False)),
                                (UNPLUGGED, ("ok", 100, False))):
            with self.subTest(reply=reply):
                self.assertEqual(self.read([reply]), expected)

    def test_invalid_level_keeps_connection_and_charging_state(self):
        for reply, charging in ((BATTERY, False), (CHARGING, True)):
            data = bytearray(reply)
            data[14] = 255
            self.assertEqual(self.read([data]), ("ok", None, charging))

    def test_reported_zero_is_not_treated_as_offline(self):
        data = bytearray(BATTERY)
        data[14] = 0
        self.assertEqual(self.read([data]), ("ok", 0, False))

    def test_unexpected_full_payload_does_not_invent_percentage(self):
        data = bytearray(FULL)
        data[14] = 255
        self.assertEqual(self.read([data]), ("ok", None, False))

    def test_stale_full_reply_is_not_displayed(self):
        data = bytearray(FULL)
        data[:9] = blackshark2020.NO_REPLY_PREFIX
        with patch.object(blackshark2020.time, "monotonic", side_effect=[0, 1]):
            self.assertEqual(self.read([data]), ("offline", None, False))

    def test_waits_for_reply_after_request_echo(self):
        self.assertEqual(self.read([blackshark2020.REQUEST, BATTERY]), ("ok", 80, False))

    def test_read_error_closes_device(self):
        self.assertEqual(self.read([OSError("disconnected")]), ("fail", None, False))

    def test_unknown_power_state_keeps_level_without_guessing_charging(self):
        for state in range(256):
            if state in (0x01, 0x02, 0x03, 0x06, 0x09):
                continue
            for raw_level, expected in ((0, 0), (10, 10), (80, 80), (100, 100),
                                        (101, None), (255, None)):
                with self.subTest(state=state, level=raw_level):
                    data = bytearray(BATTERY)
                    data[11] = state
                    data[14] = raw_level
                    self.assertEqual(self.read([data]), ("ok", expected, None))

    def test_zero_voltage_is_offline(self):
        data = bytearray(BATTERY)
        data[12:14] = b"\x00\x00"
        self.assertEqual(self.read([data]), ("offline", None, False))

    def test_malformed_reply_has_bounded_retries(self):
        with patch.object(blackshark2020.time, "monotonic", side_effect=[0, 0.1, 0.5]):
            self.assertEqual(self.read([bytes(64), bytes(64)]), ("fail", None, False))

    def test_open_and_write_errors_close_handle(self):
        for method in ("open_path", "send_feature_report"):
            dev = Mock()
            getattr(dev, method).side_effect = OSError("unavailable")
            with self.subTest(method=method), \
                    patch.object(blackshark2020.hid, "device", return_value=dev):
                self.assertEqual(blackshark2020.read_battery(b"receiver", []),
                                 ("fail", None, False))
            dev.close.assert_called_once()
            dev.get_feature_report.assert_not_called()

    def test_captured_lifecycle_through_provider(self):
        iface = dict(product_id=0x0528, serial_number="", path=b"receiver",
                     usage_page=0xFF00, usage=1, interface_number=3)
        p = RazerProvider()
        dev = Mock()
        dev.send_feature_report.return_value = 64
        dev.get_feature_report.side_effect = [CHARGING, FULL, UNPLUGGED, OFFLINE, BATTERY]
        with patch("providers.razer.hidlist.enumerate", return_value=[iface]), \
                patch.object(blackshark2020.hid, "device", return_value=dev), \
                patch.object(blackshark2020.time, "sleep"), \
                patch.object(blackshark2020.time, "monotonic", side_effect=[0, 0, 0, 0, 1, 0]), \
                patch.object(p, "_poll_group") as generic, patch.object(p, "_poll_pa") as pa:
            for expected in ((None, True), (100, False), (100, False), None, (80, False)):
                result = p.poll()
                if expected is None:
                    self.assertEqual(result, [])
                else:
                    self.assertEqual(len(result), 1)
                    self.assertEqual((result[0].level, result[0].charging), expected)
                    self.assertEqual(result[0].approx,
                                     "battery level unknown, charging" if expected[0] is None else "")
                    self.assertTrue(result[0].online)
        generic.assert_not_called()
        pa.assert_not_called()
        self.assertEqual(dev.close.call_count, 5)

    def test_offline_does_not_reuse_stale_charging_and_level(self):
        with patch.object(blackshark2020.time, "monotonic", side_effect=[0, 1]):
            self.assertEqual(self.read([OFFLINE]), ("offline", None, False))

    def test_short_write_is_failure_and_closes_device(self):
        dev = Mock()
        dev.send_feature_report.return_value = -1
        with patch.object(blackshark2020.hid, "device", return_value=dev):
            self.assertEqual(blackshark2020.read_battery(b"receiver", []),
                             ("fail", None, False))
        dev.get_feature_report.assert_not_called()
        dev.close.assert_called_once()

    def test_2020_routes_only_to_vendor_collection_and_skips_cable(self):
        ifaces = [dict(product_id=0x0528, serial_number="", path=b"consumer",
                       usage_page=0x0C, usage=1, interface_number=3),
                  dict(product_id=0x0528, serial_number="", path=b"receiver",
                       usage_page=0xFF00, usage=1, interface_number=3),
                  dict(product_id=0x052E, serial_number="", path=b"cable",
                       usage_page=0xFF00, usage=1, interface_number=0)]
        p = RazerProvider()
        with patch("providers.razer.hidlist.enumerate", return_value=ifaces), \
                patch.object(blackshark2020, "read_battery", return_value=("ok", None, True)) as read, \
                patch.object(p, "_poll_group") as generic, patch.object(p, "_poll_pa") as pa:
            result = p.poll()
        self.assertEqual(len(result), 1)
        self.assertIsNone(result[0].level)
        self.assertEqual(result[0].approx, "battery level unknown, charging")
        self.assertTrue(result[0].charging)
        self.assertEqual(read.call_args.args[0], b"receiver")
        read.assert_called_once()
        generic.assert_not_called()
        pa.assert_not_called()

    def test_offline_headset_disappears_and_reconnects(self):
        iface = dict(product_id=0x0528, serial_number="", path=b"receiver",
                     usage_page=0xFF00, usage=1, interface_number=3)
        p = RazerProvider()
        with patch("providers.razer.hidlist.enumerate", return_value=[iface]), \
                patch.object(blackshark2020, "read_battery", side_effect=[
                    ("ok", None, True), ("offline", None, False), ("ok", None, False)]):
            first = p.poll()
            self.assertTrue(first[0].charging)
            self.assertEqual(p.poll(), [])
            last = p.poll()
            self.assertEqual(last[0].key, first[0].key)
            self.assertFalse(last[0].charging)

    def test_other_models_keep_their_transports(self):
        for pid, expected in ((0x0555, "pa"), (0x00AA, "generic")):
            with self.subTest(pid=pid):
                iface = dict(product_id=pid, serial_number="", path=b"other")
                p = RazerProvider()
                with patch("providers.razer.hidlist.enumerate", return_value=[iface]), \
                        patch.object(p, "_poll_2020") as legacy, \
                        patch.object(p, "_poll_group", return_value=(2, 50, False)) as generic, \
                        patch.object(p, "_poll_pa", return_value=(2, 50, False)) as pa:
                    self.assertEqual(p.poll()[0].level, 50)
                legacy.assert_not_called()
                (pa if expected == "pa" else generic).assert_called_once()
                (generic if expected == "pa" else pa).assert_not_called()


if __name__ == "__main__":
    unittest.main()
