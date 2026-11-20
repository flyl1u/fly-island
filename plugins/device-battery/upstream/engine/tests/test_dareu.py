"""Synthetic Dareu reports/descriptors only; no hardware or driver execution."""
from contextlib import contextmanager
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
import battery_hid as H
from catalog import load_catalog
from known_ids import build_index
from providers import dareu as D
import server

POWER_REQUEST = bytes.fromhex("08 04 00 00 00 00 00 00 00 00 00 00 00 00 00 00 49")


def entry(**changes):
    info = dict(vendor_id=0x260D, product_id=0x1074, usage_page=0xFF02, usage=2,
                path=b"dareu-control", physical_id="receiver-a",
                feature_report_length=17, feature_report_sizes={"8": 17},
                input_report_length=17, input_report_sizes={"9": 17})
    info.update(changes)
    return info


def reply(level=73, charging=0, status=0, command=4, report_id=9, length=17):
    frame = [report_id, command, status, 0, 0, 0, level, charging]
    return frame + [0] * (length - len(frame))


@contextmanager
def fixture(frames=(), inventory=None, short_send=False, error_at=None):
    bus = SimpleNamespace(frames=list(frames), opened=[], closed=[], sent=[], reads=[])

    class Handle:
        def open_path(self, path):
            self.path = path
            bus.opened.append(path)
            if error_at == "open":
                raise OSError("private-path")

        def send_feature_report(self, frame):
            bus.sent.append(bytes(frame))
            if error_at == "send":
                raise OSError("private-path")
            return len(frame) - short_send

        def read(self, length, timeout_ms):
            bus.reads.append((length, timeout_ms))
            if error_at == "read":
                raise OSError("private-path")
            return bus.frames.pop(0) if bus.frames else []

        def close(self):
            bus.closed.append(self.path)

    # No write/get_feature_report/configuration methods: any such use fails.
    bus.device = Handle
    with patch.object(H, "hid", bus), patch.object(
            H.hidlist, "enumerate", return_value=[entry()] if inventory is None else inventory):
        yield bus


class DareuTests(unittest.TestCase):
    def test_request_matches_official_driver_byte_for_byte(self):
        self.assertEqual(bytes(D.make_request()), POWER_REQUEST)
        self.assertEqual(sum(POWER_REQUEST) & 255, 0x55)

    def test_feature_send_then_input_09_with_raw_percent_and_nonzero_charging(self):
        for level in (0, 1, 73, 100):
            for flag in (0, 1, 2, 0x80, 0xFF):
                with self.subTest(level=level, flag=flag), fixture([reply(level, flag)]) as bus:
                    status, = D.DareuProvider().poll()
                self.assertEqual(bus.sent, [POWER_REQUEST])
                self.assertEqual(bus.opened, [b"dareu-control"])
                self.assertEqual(bus.closed, bus.opened)
                self.assertEqual(len(bus.reads), 1)
                self.assertEqual(bus.reads[0][0], 17)
                self.assertTrue(0 < bus.reads[0][1] <= 1000)
                self.assertEqual((status.name, status.kind, status.source, status.verification_level),
                                 ("Dareu EM901", "mouse", "dareu", "C"))
                self.assertEqual((status.level, status.charging, status.charging_known),
                                 (level, flag != 0, True))
                self.assertIsNone(status.dpi)

    def test_reply_checksum_is_not_invented(self):
        # The inspected driver does not check byte 16. Exercise every value.
        for tail in range(256):
            frame = reply()
            frame[-1] = tail
            self.assertEqual(D.parse_reply(frame), (73, False, ""))

    def test_invalid_status_id_command_length_and_range_never_trigger_other_commands(self):
        frames = [[], reply()[:-1], reply() + [0], list(POWER_REQUEST)]
        frames += [reply(status=status) for status in (1, 2, 255)]
        frames += [reply(report_id=report_id) for report_id in (0, 8, 10)]
        frames += [reply(command=command) for command in (1, 2, 3, 5, 7, 8, 9, 10, 16, 0xB0)]
        frames += [reply(level=level) for level in (101, 255)]
        for frame in frames:
            with self.subTest(frame=frame), fixture([frame]) as bus:
                self.assertIsNone(D.parse_reply(frame))
                self.assertEqual(D.DareuProvider().poll(), [])
                self.assertEqual(bus.sent, [POWER_REQUEST])
                self.assertEqual(bus.closed, bus.opened)

    def test_unrelated_inputs_are_skipped_without_resending(self):
        with fixture([reply(command=10), reply(report_id=8), reply(status=1), reply(42)]) as bus:
            status, = D.DareuProvider().poll()
        self.assertEqual(status.level, 42)
        self.assertEqual(len(bus.reads), 4)
        self.assertEqual(bus.sent, [POWER_REQUEST])

    def test_silence_after_success_produces_no_reading_or_error(self):
        provider = D.DareuProvider()
        with fixture([reply()]) as bus:
            self.assertEqual(len(provider.poll()), 1)
            self.assertEqual(provider.poll(), [])
        self.assertEqual(bus.sent, [POWER_REQUEST, POWER_REQUEST])
        self.assertFalse(any("error" in line or "failed" in line for line in provider.diagnostics()))

    def test_wrong_identity_collection_and_ambiguous_paths_never_open(self):
        changes = [dict(product_id=pid) for pid in (0x1090, 0x1073, 0x1075)]
        changes += [dict(vendor_id=0x3554), dict(usage=1), dict(path=b""),
                    dict(physical_id="collection:unknown")]
        changes += [dict(usage_page=page) for page in (1, 0xFF01, 0xFF04, 0xFF05)]
        inventories = [[entry(**change)] for change in changes]
        inventories += [[], [entry(), entry(path=b"duplicate")]]
        for inventory in inventories:
            with self.subTest(inventory=inventory), fixture([reply()], inventory) as bus:
                self.assertEqual(D.DareuProvider().poll(), [])
                self.assertEqual(bus.opened, [])
                self.assertEqual(bus.sent, [])

    def test_both_descriptor_directions_must_prove_per_id_lengths_before_open(self):
        changes = [dict(feature_report_length=n) for n in (None, True, "17", 0, 16, 18, 64)]
        changes += [dict(input_report_length=n) for n in (None, True, "17", 0, 7, 4097)]
        for direction, report_id in (("feature", "8"), ("input", "9")):
            changes += [{direction + "_report_sizes": sizes} for sizes in
                        (None, {}, {"0": 17}, {"7": 17}, {report_id: "17"},
                         {report_id: True}, {report_id: 16}, {report_id: 18},
                         {report_id: 7}, {report_id: 17, "10": 18})]
        changes += [dict(input_report_length=64, input_report_sizes={"9": 17})]
        for change in changes:
            with self.subTest(change=change), fixture([reply()], [entry(**change)]) as bus:
                self.assertEqual(D.DareuProvider().poll(), [])
                self.assertEqual(bus.opened, [])
                self.assertEqual(bus.sent, [])

    def test_input_size_is_proven_per_id_even_with_other_reports_in_collection(self):
        info = entry(input_report_length=64, input_report_sizes={"9": 20, "10": 64})
        with fixture([reply(length=17), reply(61, length=20)], [info]) as bus:
            status, = D.DareuProvider().poll()
        self.assertEqual(status.level, 61)
        self.assertEqual([length for length, _ in bus.reads], [64, 64])
        self.assertEqual(bus.sent, [POWER_REQUEST])

    def test_collection_proofs_cannot_be_combined_across_siblings(self):
        infos = [entry(input_report_sizes={}),
                 entry(path=b"sibling", usage_page=0xFF04, feature_report_sizes={})]
        with fixture([reply()], infos) as bus:
            self.assertEqual(D.DareuProvider().poll(), [])
            self.assertEqual(bus.opened, [])

    def test_two_physical_receivers_keep_separate_readings(self):
        infos = [entry(), entry(path=b"second", physical_id="receiver-b")]
        with fixture([reply(32), reply(87)], infos) as bus:
            statuses = D.DareuProvider().poll()
        self.assertEqual([s.level for s in statuses], [32, 87])
        self.assertNotEqual(statuses[0].key, statuses[1].key)
        self.assertEqual(bus.sent, [POWER_REQUEST, POWER_REQUEST])

    def test_deadline_and_read_count_both_bound_the_receive_loop(self):
        with fixture([reply(command=10)] * 100) as bus, patch.object(
                D, "time", SimpleNamespace(monotonic=lambda: 0)):
            self.assertEqual(D.DareuProvider().poll(), [])
            self.assertEqual(len(bus.reads), H.MAX_READS)
            self.assertEqual(bus.sent, [POWER_REQUEST])
        with fixture([reply(command=10), reply()]) as bus, patch.object(
                D, "time", SimpleNamespace(monotonic=iter([0, .75, 1.01]).__next__)):
            self.assertEqual(D.DareuProvider().poll(), [])
            self.assertEqual(bus.reads, [(17, 250)])
            self.assertEqual(bus.sent, [POWER_REQUEST])

    def test_short_send_and_io_failure_close_without_retry_or_private_diagnostics(self):
        cases = [dict(short_send=True)] + [dict(error_at=step) for step in ("open", "send", "read")]
        for options in cases:
            provider = D.DareuProvider()
            with self.subTest(options=options), fixture([reply()], **options) as bus:
                self.assertEqual(provider.poll(), [])
                self.assertEqual(bus.closed, bus.opened)
                self.assertEqual(bus.sent, [] if options.get("error_at") == "open" else [POWER_REQUEST])
                if options.get("error_at") != "read":
                    self.assertEqual(bus.reads, [])
            self.assertNotIn("private-path", " ".join(provider.diagnostics()))

    def test_registration_is_exact_level_c_mouse_without_dpi(self):
        self.assertIn(("dareu", "DareuProvider"), server.PROVIDERS)
        self.assertEqual(server.PROVIDER_VIDS["dareu"], (0x260D,))
        self.assertNotIn("dareu", server.DPI_PROVIDERS)
        self.assertEqual(server.recognized_candidate_count("dareu", [entry()]), 1)
        self.assertEqual(server.recognized_candidate_count("dareu", [entry(product_id=0x1090)]), 0)
        index = build_index()
        rows = [row for row in index["devices"] if row["provider"] == "dareu"]
        self.assertEqual([(row["vendorId"], row["productId"], row["name"], row["kind"]) for row in rows],
                         [(0x260D, 0x1074, "Dareu EM901", "mouse")])
        self.assertNotIn("dareu", index["unparsed"])
        reader, = [row for row in load_catalog()["readers"] if row["provider"] == "dareu"]
        self.assertEqual((reader["verificationLevel"], reader["kinds"]), ("C", ["mouse"]))


if __name__ == "__main__":
    unittest.main()
