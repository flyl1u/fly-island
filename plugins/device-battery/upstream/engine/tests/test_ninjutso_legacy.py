"""Synthetic OpenMouse legacy replies; neither captures nor descriptor evidence."""
from contextlib import contextmanager
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
import battery_hid as H
from providers import ninjutso_legacy as N
from standardhid import Caps
from test_battery_caps import FakeApi

P = N.NinjutsoLegacyProvider


def entry(**changes):
    info = dict(vendor_id=0x1915, product_id=0xAE1C, usage_page=0xFFA0, usage=1,
                path=b"legacy-receiver", physical_id="receiver-a", product_string="Ninjutso Sora V2",
                feature_report_length=704, feature_report_sizes={"4": 704, "5": 32})
    info.update(changes)
    return info


def profile_reply(profile=1):
    reply = [5] + [0] * 31
    reply[9] = profile
    return reply


def checksum(reply):
    value = sum(reply[:701])
    reply[702], reply[703] = value & 255, value >> 8
    return reply


def reply(level=87, charging=0):
    frame = [4] + [0] * 703
    frame[16], frame[17] = level, charging
    return checksum(frame)


@contextmanager
def fixture(frames=(), inventory=None, short_at=None, error_at=None):
    bus = SimpleNamespace(frames=list(frames), opened=[], closed=[], writes=[], reads=[], waits=[])

    class Handle:
        def open_path(self, path):
            self.path = path
            bus.opened.append(path)
            if error_at == "open":
                raise OSError("private-path")

        def send_feature_report(self, frame):
            bus.writes.append(list(frame))
            if error_at == "write":
                raise OSError("private-path")
            return len(frame) - (len(bus.writes) == short_at)

        def get_feature_report(self, report_id, length):
            bus.reads.append((report_id, length))
            if error_at == "read":
                raise OSError("private-path")
            return bus.frames.pop(0) if bus.frames else []

        def close(self):
            bus.closed.append(self.path)

    # No output/config APIs: any additional kind of I/O fails the fixture.
    bus.device = Handle
    with patch.object(H, "hid", bus), \
            patch.object(H.hidlist, "enumerate", return_value=[entry()] if inventory is None else inventory), \
            patch.object(N, "time", SimpleNamespace(sleep=bus.waits.append)):
        yield bus


class NinjutsoLegacyTests(unittest.TestCase):
    def test_only_two_read_requests_and_synthetic_battery(self):
        for level, charging in ((0, 0), (87, 0), (100, 1)):
            with self.subTest(level=level, charging=charging), fixture([profile_reply(2), reply(level, charging)]) as bus:
                status, = P().poll()
            self.assertEqual(bus.writes, [[5, 13, 0, 0, 1, 0, 0, 22] + [0] * 24,
                                         [4, 38, 0, 0, 1, 0, 2] + [0] * 697])
            self.assertEqual(bus.reads, [(5, 32), (4, 704)])
            self.assertEqual(bus.waits, [0.015, 0.090])
            self.assertEqual((status.level, status.charging, status.charging_known, status.verification_level),
                             (level, bool(charging), True, "C"))
            self.assertEqual(bus.opened, bus.closed)

    def test_zero_profile_retries_once_then_stops_or_reads(self):
        for last in (0, 3):
            with self.subTest(profile=last), fixture([profile_reply(0), profile_reply(last), reply()]) as bus:
                statuses = P().poll()
            self.assertEqual(len(statuses), int(last != 0))
            self.assertEqual(bus.writes[:2], [N.profile_request()] * 2)
            self.assertEqual(len(bus.writes), 3 if last else 2)
            if last:
                self.assertEqual(bus.writes[-1], N.settings_request(last))
            self.assertEqual(bus.opened, bus.closed)

    def test_invalid_profile_or_silence_never_reads_settings(self):
        wrong_id = profile_reply()
        wrong_id[0] = 6
        for frame in ([], profile_reply()[:-1], profile_reply() + [0], wrong_id):
            with self.subTest(frame=frame), fixture([frame]) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.writes, [N.profile_request()])
                self.assertEqual(bus.opened, bus.closed)

    def test_bad_length_id_checksum_level_charge_and_echo_are_rejected(self):
        bad_sum, bad_id = reply(), reply()
        bad_sum[702] ^= 1
        bad_id[0] = 5
        for frame in ([], reply()[:-1], reply() + [0], bad_sum, checksum(bad_id),
                      reply(101), reply(255), reply(87, 2), N.settings_request(1)):
            with self.subTest(frame=frame), fixture([profile_reply(), frame]) as bus:
                self.assertIsNone(N.parse_reply(frame))
                self.assertEqual(P().poll(), [])
                self.assertEqual(len(bus.writes), 2)
                self.assertEqual(bus.opened, bus.closed)

    def test_checksum_matches_upstream_exact_range_and_has_no_modulo(self):
        frame = reply()
        frame[701] = 255  # Explicitly outside the upstream checksum range.
        self.assertEqual(N.parse_reply(frame), (87, False, ""))
        frame[700] = 1
        self.assertIsNone(N.parse_reply(frame))
        frame = reply()
        frame[20:700] = [255] * 680
        value = sum(frame[:701]) & 65535
        frame[702], frame[703] = value & 255, value >> 8
        self.assertIsNone(N.parse_reply(frame))

    def test_unproven_ambiguous_or_other_variants_never_open(self):
        changes = [dict(feature_report_length=n) for n in (None, True, 32, 703, 705)]
        changes += [dict(feature_report_sizes=sizes) for sizes in
                    (None, {}, {"4": 704}, {"5": 32}, {"4": 705, "5": 32},
                     {"4": 704, "5": 31}, {"4": 704, "6": 32}, {"4": 74, "5": 32})]
        changes += [dict(product_id=pid) for pid in (0xAE1B, 0xAE8C, 0xAE8A, 0xAE20)]
        changes += [dict(product_string=name) for name in (None, "", "Ninjutso Sora V2 8K")]
        changes += [dict(vendor_id=0x3554), dict(usage_page=0xFF00), dict(usage=2),
                    dict(path=b""), dict(physical_id="collection:unknown")]
        inventories = [[entry(**change)] for change in changes]
        inventories.append([entry(), entry(path=b"duplicate")])
        for inventory in inventories:
            with self.subTest(inventory=inventory), fixture([profile_reply(), reply()], inventory) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.opened, [])
                self.assertEqual(bus.writes, [])

    def test_short_feature_writes_and_io_errors_close_without_retry(self):
        cases = [dict(short_at=1), dict(short_at=2)]
        cases += [dict(error_at=stage) for stage in ("open", "write", "read")]
        for options in cases:
            provider = P()
            with self.subTest(options=options), fixture([profile_reply(), reply()], **options) as bus:
                self.assertEqual(provider.poll(), [])
            self.assertLessEqual(len(bus.writes), options.get("short_at", 1))
            self.assertEqual(bus.opened, bus.closed)
            self.assertNotIn("private-path", " ".join(provider.diagnostics()))

    def test_feature_descriptor_proof_is_per_id_and_rejects_split_fields(self):
        caps = Caps()
        caps.feature, caps.fv = 704, 2
        fields = [dict(report=4, bits=8, count=703), dict(report=5, bits=8, count=31)]
        self.assertEqual(H.byte_report_sizes(FakeApi(values=fields), None, caps, 2), {"4": 704, "5": 32})
        for change in (dict(bits=16), dict(report=4), dict(alias=1)):
            self.assertIsNone(H.byte_report_sizes(FakeApi(values=[fields[0], dict(fields[1], **change)]),
                                                  None, caps, 2))


if __name__ == "__main__":
    unittest.main()
