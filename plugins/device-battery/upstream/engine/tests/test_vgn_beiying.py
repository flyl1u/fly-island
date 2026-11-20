"""Synthetic VGN BY frames/caps only; no device access or vendor code execution."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
import battery_hid as H
from providers import mchose_by_keyboard as M, vgn_beiying as V
from test_battery_caps import FakeApi, caps
from test_new_brands import entry as hid_entry, fixture as hid_fixture

P = V.VgnBeiyingProvider
FIXED_ARRAY = dict(page=0xFF02, report=19, field=0, is_range=0,
                   usage_min=0, usage_max=0, report_count=19)


def entry(physical="receiver-a", **changes):
    return hid_entry(P, physical, **changes)


def reply(level=99, flags=0x10):
    frame = [0x13, 0x4A, 1, 0, 2, level, flags] + [0] * 12
    return frame + [sum(frame) & 255]


def fixture(frames=(), inventory=None, **kwargs):
    return hid_fixture(P, frames, [entry()] if inventory is None else inventory, **kwargs)


class VgnBeiyingTests(unittest.TestCase):
    def test_exact_request_and_issue_190_charging_pair(self):
        expected = bytes.fromhex("13 4A 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 5E")
        self.assertIs(V.make_request, M.make_request)
        self.assertEqual(bytes(V.make_request()), expected)
        self.assertEqual(expected[-1], sum(expected[:-1]) & 255)
        for flags, tail in ((0x10, 0xD3), (0, 0xC3)):
            with self.subTest(flags=flags), fixture([reply(flags=flags)]) as bus:
                status, = P().poll()
                self.assertEqual(reply(flags=flags)[-1], tail)
                self.assertEqual((status.level, status.charging, status.charging_known),
                                 (99, bool(flags), True))
                self.assertEqual((status.kind, status.verification_level), ("keyboard", "C"))
                self.assertEqual(bus.writes, [(entry()["path"], list(expected))])
                self.assertEqual(bus.opened, bus.closed)

    def test_all_exact_pairs_read_directly_without_product_or_model_gate(self):
        for (vid, pid), name in V.PIDS.items():
            for product in ("", "generic receiver", "MCHOSE 2.4G Wireless"):
                info = entry(vendor_id=vid, product_id=pid, product_string=product)
                with self.subTest(vid=vid, pid=pid, product=product), fixture([reply()], [info]) as bus:
                    status, = P().poll()
                    self.assertEqual(status.name, name)
                    self.assertEqual(status.charging_known, (vid, pid) == (0x258A, 0x024F))
                    self.assertEqual(bus.writes, [(info["path"], V.make_request())])

    def test_levels_and_external_power_bit_do_not_inherit_mchose_semantics(self):
        for level in (0, 1, 63, 99, 100):
            for flags in (0, 1, 2, 0x10, 0x11, 0x20, 0xFF):
                with self.subTest(level=level, flags=flags):
                    self.assertEqual(V.parse_reply(reply(level, flags)),
                                     (level, bool(flags & 0x10), ""))
        # Keep M HUB's independent sleep/full/nibble policy and unverified CRC.
        self.assertIsNone(M.parse_reply(reply(0)))
        self.assertEqual(M.parse_reply(reply(100)), (100, False, ""))
        self.assertIsNone(M.parse_reply(reply(flags=0x20)))
        bad_crc = reply()
        bad_crc[-1] ^= 1
        self.assertEqual(M.parse_reply(bad_crc), (99, True, ""))
        self.assertIsNone(V.parse_reply(bad_crc))

    def test_corruption_headers_echo_and_invalid_percent_are_rejected(self):
        invalid = [[], reply()[:-1], reply() + [0], V.make_request(), M.identity_request()]
        for offset, value in ((0, 0), (1, 5), (2, 0), (2, 2), (3, 1),
                              (5, 101), (5, 255), (5, -1), (5, 256), (6, True)):
            frame = reply()
            frame[offset] = value
            frame[-1] = sum(frame[:-1]) & 255
            invalid.append(frame)
        for offset in (4, 5, 6, 18, 19):
            frame = reply()
            frame[offset] ^= 1  # Corruption without re-checksumming.
            invalid.append(frame)
        for frame in invalid:
            with self.subTest(frame=frame):
                self.assertIsNone(V.parse_reply(frame))
        with fixture([V.make_request(), reply()]) as bus:
            self.assertEqual([s.level for s in P().poll()], [99])
            self.assertEqual(len(bus.writes), 1)

    def test_wrong_pair_collection_size_or_ambiguous_endpoint_never_opens(self):
        defects = [dict(vendor_id=0x05AC), dict(product_id=0x024E), dict(product_id=0x027E),
                   dict(product_id=0x010C), dict(vendor_id=0x391D, product_id=0x2003),
                   dict(vendor_id=0x258A, product_id=0xFA09),
                   dict(vendor_id=0x3554, product_id=0xFA09),
                   dict(vendor_id=0x3554, product_id=0x024F),
                   dict(usage_page=0xFF00), dict(usage_page=0xFF04), dict(usage=1),
                   dict(path=b""), dict(physical_id="collection:unknown")]
        for direction in ("input", "output"):
            defects += [{direction + "_report_length": size} for size in (None, True, 19, 21, 64, 520)]
            defects += [{direction + "_report_sizes": sizes} for sizes in
                        (None, {}, {"19": 19}, {"9": 20}, {"19": 20, "6": 20})]
        inventories = [[entry(**defect)] for defect in defects]
        inventories += [[entry(), entry(path=b"duplicate")],
                        [entry(vendor_id=0x3554, product_id=0xFA09, usage_page=0xFF04)]]
        for inventory in inventories:
            with self.subTest(inventory=inventory), fixture([reply()], inventory) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual((bus.opened, bus.writes), ([], []))

    def test_only_battery_query_on_silence_failures_and_bounded_reads(self):
        for frames, options in (([], {}), ([reply(255)] * 100, {}),
                                ([reply()], {"write_result": 19}),
                                ([reply()], {"error_at": "read"}),
                                ([reply()], {"error_at": "write"})):
            with self.subTest(options=options), fixture(frames, **options) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.writes, [(entry()["path"], V.make_request())])
                self.assertLessEqual(len(bus.reads), H.MAX_READS)
                self.assertTrue(all(length == 20 and 0 < timeout <= 2500 for length, timeout in bus.reads))
                self.assertEqual(bus.opened, bus.closed)


class FixedUsageDescriptorTests(unittest.TestCase):
    def test_fixed_usage_is_opt_in_and_proves_input_and_output(self):
        api, descriptor = FakeApi([FIXED_ARRAY]), caps(ib=1, ob=1, size=20)
        self.assertEqual(H.battery_caps(api, None, descriptor),
                         dict(input_report_sizes=None, output_report_sizes=None))
        self.assertEqual(H.battery_caps(api, None, descriptor, allow_fixed_usage=True),
                         dict(input_report_sizes={"19": 20}, output_report_sizes={"19": 20}))

    def test_alias_range_variable_constant_and_wrong_count_fail_closed(self):
        for change in (dict(alias=1), dict(is_range=1), dict(field=1), dict(field=2),
                       dict(usage_max=1), dict(report_count=0), dict(report_count=18),
                       dict(report_count=20)):
            with self.subTest(change=change):
                api = FakeApi([FIXED_ARRAY | change])
                self.assertIsNone(H.byte_report_sizes(api, None, caps(ib=1, size=20), 0,
                                                     allow_fixed_usage=True))

    def test_split_mixed_failed_caps_and_length_mismatch_fail_closed(self):
        for descriptor in (caps(ib=0, size=20), caps(ib=2, size=20),
                           caps(ib=1, iv=1, size=20), caps(ib=1, size=1),
                           caps(ib=1, size=4097), caps(ib=1, size=19), caps(ib=1, size=21)):
            self.assertIsNone(H.byte_report_sizes(FakeApi([FIXED_ARRAY]), None, descriptor, 0,
                                                 allow_fixed_usage=True))
        for items in ([], [FIXED_ARRAY, FIXED_ARRAY]):
            self.assertIsNone(H.byte_report_sizes(FakeApi(items), None, caps(ib=1, size=20), 0,
                                                 allow_fixed_usage=True))
        api = FakeApi([FIXED_ARRAY])
        api.HidP_GetButtonCaps = lambda *args: 0
        self.assertIsNone(H.byte_report_sizes(api, None, caps(ib=1, size=20), 0,
                                             allow_fixed_usage=True))


if __name__ == "__main__":
    unittest.main()
