"""Offline CHERRY contract tests; zero tails below are synthetic padding."""
from contextlib import contextmanager
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ENGINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE))
sys.path.insert(0, str(ENGINE / "tests"))
import _hidstub  # noqa: F401 -- before importing any provider
import battery_hid as H
from providers import cherry as C
from test_new_brands import fixture as shared_fixture

P = C.CherryProvider
# Independent complete request oracle: no use of make_request or reply().
REQUEST = bytes.fromhex(
    "04 20 00 1A 06 00 00 00  00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00")
# #482's reported prefixes, with synthetic zero tails (not complete captures).
VECTORS = (
    bytes.fromhex("04 20 00 1A 06 00 00 00 37 00") + bytes(54),
    bytes.fromhex("04 20 00 1A 06 00 00 00 3A 01") + bytes(54),
    bytes.fromhex("04 20 00 1A 06 00 00 00 3F 01") + bytes(54),
)


def entry(physical="receiver-a", pid=0x01E0, **changes):
    info = dict(vendor_id=0x046A, product_id=pid, interface_number=1,
                product_string=C.PRODUCTS.get(pid, "unknown"),
                usage_page=0xFF1C, usage=0x0092,
                input_report_length=64, output_report_length=64,
                input_report_sizes={"4": 64}, output_report_sizes={"4": 64},
                physical_id=physical, path=(physical + "-vendor").encode(),
                serial_number="shared-private-serial")
    info.update(changes)
    return info


def reply(level=55, charging=0, **changes):
    frame = list(VECTORS[0])
    frame[8], frame[9] = level, charging
    for offset, value in changes.items():
        frame[int(offset)] = value
    return frame


@contextmanager
def fixture(frames=(), inventory=None, **kwargs):
    with shared_fixture(P, frames, [entry()] if inventory is None else inventory, **kwargs) as bus:
        yield bus


class CherryTests(unittest.TestCase):
    def test_both_exact_usb_ids_only_send_literal_request_and_report_known_charging(self):
        self.assertEqual(bytes(C.make_request()), REQUEST)
        for pid in (0x01E0, 0x01DE):
            for level in (1, 55, 58, 63, 100):
                for charging in (0, 1):
                    with self.subTest(pid=pid, level=level, charging=charging), fixture(
                            [reply(level, charging)], [entry(pid=pid)]) as bus:
                        status, = P().poll()
                        self.assertEqual((status.level, status.charging, status.charging_known),
                                         (level, bool(charging), True))
                        self.assertEqual((status.source, status.kind, status.verification_level),
                                         ("cherry", "keyboard", "C"))
                        self.assertTrue(status.online and status.connection_known)
                        self.assertEqual(bus.writes, [(entry()["path"], list(REQUEST))])
                        self.assertEqual(bus.opened, bus.closed)
                        self.assertEqual(bus.reads[0][0], 64)

    def test_reported_prefix_vectors_parse_independently_of_request(self):
        for vector, expected in zip(VECTORS, ((55, False, ""), (58, True, ""), (63, True, ""))):
            for container in (bytes, bytearray, list, tuple):
                self.assertEqual(C.parse_reply(container(vector)), expected)

    def test_wrong_identity_product_mi_collection_and_ble_never_open(self):
        bad = [dict(vendor_id=0), dict(product_id=0), dict(product_string=""),
               dict(product_string="MX 2.0S Pro Dongle "), dict(product_string="MX 2.0S WL Pro"),
               dict(interface_number=-1), dict(interface_number=0), dict(interface_number=2),
               dict(interface_number=True), dict(interface_number="1"),
               dict(usage_page=1), dict(usage=1), dict(vendor_id=0x0687, product_id=0x01DE)]
        for changes in bad:
            with self.subTest(changes=changes), fixture([reply()], [entry(**changes)]) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual((bus.opened, bus.writes), ([], []))
        with fixture([reply()], [entry(pid=0x01DE, product_string="MX 2.0S Pro Dongle")]) as bus:
            self.assertEqual(P().poll(), [])
            self.assertEqual(bus.opened, [])

    def test_unknown_parent_or_path_never_open(self):
        bad = [dict(physical_id=""), dict(physical_id="collection:private-path"),
               dict(path=b""), dict(path=""), dict(path=None), dict(path=64)]
        inventories = [[entry(**changes)] for changes in bad]
        missing = entry()
        missing.pop("physical_id")
        inventories.append([missing])
        for inventory in inventories:
            with self.subTest(inventory=inventory), fixture([reply()], inventory) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual((bus.opened, bus.writes), ([], []))

    def test_duplicate_parent_collection_rejected_even_if_only_one_product_matches(self):
        for changes in ({}, dict(product_string="wrong"), dict(interface_number=2),
                        dict(product_id=0x01DE, product_string="MX 2.0S WL Pro")):
            infos = [entry(), entry(path=b"second-collection", **changes)]
            with self.subTest(changes=changes), fixture([reply()], infos) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual((bus.opened, bus.writes), ([], []))

    def test_unknown_wrong_lengths_or_multiple_report_maps_never_open(self):
        for direction in ("input", "output"):
            for value in (None, 0, True, 63, 65, "64", 64.0):
                with self.subTest(direction=direction, length=value), fixture(
                        [reply()], [entry(**{direction + "_report_length": value})]) as bus:
                    self.assertEqual(P().poll(), [])
                    self.assertEqual(bus.opened, [])
            for sizes in (None, {}, {"5": 64}, {"4": 63}, {4: 64}, {"4": True},
                          {"4": 64.0}, {"4": 64, "5": 64}, {"4": 64, "5": 2}):
                with self.subTest(direction=direction, sizes=sizes), fixture(
                        [reply()], [entry(**{direction + "_report_sizes": sizes})]) as bus:
                    self.assertEqual(P().poll(), [])
                    self.assertEqual((bus.opened, bus.writes), ([], []))

    def test_missing_proof_cannot_be_replaced_by_declared_metadata(self):
        info = entry(input_report_sizes=None, input_report_proof="failed",
                     declared_report_sizes={"input": {"4": 64}},
                     report_descriptor_error="private-path")
        with fixture([reply()], [info]) as bus:
            provider = P()
            self.assertEqual(provider.poll(), [])
            self.assertEqual(bus.opened, [])
            self.assertNotIn("private-path", " ".join(provider.diagnostics()))

    def test_wrong_headers_states_percentages_charging_and_lengths_produce_no_status(self):
        invalid = [[], [0] * 64, reply()[:-1], reply() + [0], list(REQUEST)]
        invalid += [reply(**{str(i): value}) for i, value in
                    ((0, 0), (1, 0), (2, 1), (3, 0), (4, 0), (7, 1), (7, 255),
                     (8, 0), (8, 101), (8, 255), (9, 2), (9, 255))]
        for frame in invalid:
            with self.subTest(frame=frame), fixture([frame]) as bus:
                self.assertEqual(C.parse_reply(frame), None)
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.writes, [(entry()["path"], list(REQUEST))])
                self.assertEqual(bus.opened, bus.closed)

    def test_direct_parser_rejects_nonbyte_containers_and_elements_without_throwing(self):
        invalid = [None, True, 64, 64.0, "x" * 64, {i: 0 for i in range(64)},
                   iter(reply()), object()]
        # Invalid synthetic byte anywhere, including otherwise unused padding.
        for offset in (0, 7, 8, 9, 63):
            for value in (True, False, None, "55", 55.0, -1, 256, [], {}):
                invalid.append(reply(**{str(offset): value}))
        for value in invalid:
            with self.subTest(value=value):
                self.assertIsNone(C.parse_reply(value))

    def test_noise_then_valid_uses_one_query_and_stops_before_duplicate(self):
        with fixture([[0] * 4, reply(**{"7": 2}), reply(58, 1), reply(63, 1)]) as bus:
            status, = P().poll()
            self.assertEqual((status.level, status.charging), (58, True))
            self.assertEqual(len(bus.writes), 1)
            self.assertEqual(len(bus.reads), 3)
            self.assertEqual(len(bus.frames), 1)
            self.assertEqual(bus.closed, bus.opened)

    def test_silence_noise_read_limit_and_deadline_never_retry_query(self):
        for frames, read_ms, expected_reads in (([], 10, 1), ([[0] * 64] * 40, 0, 32),
                                                 ([[0] * 64, reply()], 1000, 1)):
            with self.subTest(read_ms=read_ms, count=len(frames)), fixture(frames, read_ms=read_ms) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(len(bus.reads), expected_reads)
                self.assertEqual(len(bus.writes), 1)
                self.assertLessEqual(bus.now, 1.0)
                self.assertEqual(bus.opened, bus.closed)

    def test_short_write_never_reads_or_retries(self):
        for count in (0, 63, -1):
            with self.subTest(count=count), fixture([reply()], write_result=count) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual((len(bus.writes), len(bus.reads)), (1, 0))
                self.assertEqual(bus.opened, bus.closed)

    def test_io_errors_always_close_without_exposing_exception(self):
        for stage in ("open", "write", "read"):
            with self.subTest(stage=stage), fixture([reply()], error_at=stage) as bus:
                provider = P()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(bus.opened, bus.closed)
                self.assertIn("battery I/O failed; connection unknown", provider.diagnostics())
                self.assertNotIn("private-path", " ".join(provider.diagnostics()))

    def test_enumeration_failure_and_missing_backend_never_open(self):
        with fixture() as bus, patch.object(H.hidlist, "enumerate", side_effect=OSError("private-path")):
            provider = P()
            self.assertEqual(provider.poll(), [])
            self.assertEqual(provider.diagnostics(), ["enumeration failed: nothing sent"])
            self.assertEqual(bus.opened, [])
        with patch.object(H, "hid", None), patch.object(H.hidlist, "enumerate") as enumerate_hid:
            self.assertEqual(P().poll(), [])
            enumerate_hid.assert_not_called()

    def test_close_failure_keeps_valid_measurement_and_fixed_diagnostic(self):
        with fixture([reply()]) as bus:
            original = bus.device

            def device():
                handle = original()
                close = handle.close

                def failed_close():
                    close()
                    raise OSError("private-path")

                handle.close = failed_close
                return handle

            with patch.object(bus, "device", side_effect=device):
                provider = P()
                self.assertEqual([s.level for s in provider.poll()], [55])
            self.assertEqual(provider.diagnostics(), ["HID handle close failed"])
            self.assertEqual(bus.opened, bus.closed)

    def test_independent_parents_with_same_name_and_near_percentages_keep_keys(self):
        infos = [entry("one"), entry("two", pid=0x01DE), entry("one", usage_page=1, path=b"keyboard")]
        with fixture([reply(58), reply(60)], infos) as bus:
            statuses = P().poll()
            self.assertEqual([s.level for s in statuses], [58, 60])
            self.assertEqual(len({s.key for s in statuses}), 2)
            self.assertEqual([s.physical_id for s in statuses], ["one", "two"])
            self.assertEqual(bus.opened, [infos[0]["path"], infos[1]["path"]])
            self.assertEqual(bus.opened, bus.closed)


if __name__ == "__main__":
    unittest.main()
