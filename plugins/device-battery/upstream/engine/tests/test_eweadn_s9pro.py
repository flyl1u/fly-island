"""Synthetic Bytech replies and #315-based fixtures; no real HID access."""
from contextlib import contextmanager
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
import battery_hid as H
from providers import eweadn_s9pro as E

P = E.EweadnS9ProProvider
REQUEST = [3, 0x20, 0x50, 0, 0, 0x4F, 0x81] + [0] * 57


def entry(**changes):
    info = dict(vendor_id=0x372E, product_id=0x1026, usage_page=0xFF00, usage=1,
                path=b"s9-ff00", physical_id="receiver-a", product_string="EWEADN S9",
                feature_report_length=64, feature_report_sizes={"3": 64})
    info.update(changes)
    return info


def reply(level=73, charging=False):
    # TYPE and OFFSET are illustrative, not proven constant response bytes.
    return [3, 0x50, 0, 7, 0, 0x81, level | (0x80 if charging else 0)] + [0] * 57


def short_reply(level=73, charging=False):
    # 16-byte format reported by the #315 hardware tester.
    frame = list(bytes.fromhex("03 50 00 0B 00 01 00 21 07 01 90 65 04 A5 5A 00"))
    frame[6] = level | (0x80 if charging else 0)
    return frame


@contextmanager
def fixture(frames=(), inventory=None, *, short=False, error_at=None):
    bus = SimpleNamespace(frames=list(frames), opened=[], closed=[], writes=[], reads=[], events=[])

    class Handle:
        def open_path(self, path):
            self.path = path
            bus.opened.append(path)
            if error_at == "open":
                raise OSError("private-device-path")

        def send_feature_report(self, frame):
            # A strict allowlist: reset, configuration, pairing, OTA, UUID,
            # online and any other request fail, even if encoded as features.
            assert list(frame) == REQUEST, "unexpected device command"
            bus.writes.append(list(frame))
            bus.events.append("set")
            if error_at == "set":
                raise OSError("private-device-path")
            return len(frame) - int(short)

        def get_feature_report(self, report_id, length):
            assert (report_id, length) == (3, 64), "unexpected feature query"
            bus.reads.append((report_id, length))
            bus.events.append("get")
            if error_at == "get":
                raise OSError("private-device-path")
            return bus.frames.pop(0) if bus.frames else []

        def close(self):
            bus.closed.append(self.path)
            if error_at == "close":
                raise OSError("private-device-path")

        # No write/read/configuration APIs: attempted use fails the test.

    bus.device = Handle
    with patch.object(H, "hid", bus), \
            patch.object(H.hidlist, "enumerate", return_value=[entry()] if inventory is None else inventory), \
            patch.object(E, "time", SimpleNamespace(sleep=lambda delay: bus.events.append(delay))):
        yield bus


class EweadnS9ProTests(unittest.TestCase):
    def test_empty_inventory_and_missing_backend_have_reasons(self):
        for backend_missing in (False, True):
            with self.subTest(backend_missing=backend_missing), fixture(inventory=[]) as bus, \
                    patch.object(H, "hid", None if backend_missing else bus):
                provider = P()
                self.assertEqual(provider.poll(), [])
                self.assertIn("no eligible S9 PRO collection or HID backend", provider.diagnostics()[0])
                self.assertEqual(bus.opened, [])

    def test_refusal_identifies_feature_proof_without_private_text(self):
        for proof, error, expected in (("caps", None, "proof=caps"),
                                       ("failed", "long item", "descriptor=long item"),
                                       ("failed", "private-path", "descriptor=unknown")):
            info = entry(feature_report_sizes=None, feature_report_proof=proof,
                         report_descriptor_error=error)
            with self.subTest(proof=proof, error=error), fixture(inventory=[info]) as bus:
                provider = P()
                self.assertEqual(provider.poll(), [])
                diagnostic = " ".join(provider.diagnostics())
                self.assertIn("FF00:0001 Feature 03 length unproven", diagnostic)
                self.assertIn(expected, diagnostic)
                self.assertIn("not opened; nothing sent", diagnostic)
                self.assertNotIn("private-path", diagnostic)
                self.assertEqual(bus.opened, [])

    def test_byte_exact_battery_request_and_exchange(self):
        self.assertEqual(E.make_request(), REQUEST)
        self.assertEqual(len(REQUEST), 64)
        self.assertEqual(sum(REQUEST[2:]) & 255, REQUEST[1])
        for level, charging in ((0, False), (0, True), (73, False), (100, True)):
            with self.subTest(level=level, charging=charging), fixture([reply(level, charging)]) as bus:
                status, = P().poll()
            self.assertEqual(bus.writes, [REQUEST])
            self.assertEqual(bus.reads, [(3, 64)])
            self.assertEqual(bus.events, ["set", 0.100, "get"])
            self.assertEqual(bus.opened, bus.closed)
            self.assertEqual((status.name, status.kind, status.source, status.verification_level),
                             ("EWEADN S9 PRO 8K", "mouse", "eweadn_s9pro", "C"))
            self.assertEqual((status.level, status.charging, status.charging_known), (level, charging, True))

    def test_all_battery_bit_patterns(self):
        for value in range(256):
            with self.subTest(value=value):
                frame = reply()
                frame[6] = value
                expected = (value & 127, bool(value & 128), "") if value & 127 <= 100 else None
                self.assertEqual(E.parse_reply(frame), expected)

    def test_issue315_short_reply_exchange(self):
        for level, charging in ((23, False), (98, True), (1, True), (100, False)):
            with self.subTest(level=level, charging=charging), fixture([short_reply(level, charging)]) as bus:
                status, = P().poll()
                self.assertEqual((status.level, status.charging, status.charging_known), (level, charging, True))
                self.assertEqual(bus.writes, [REQUEST])
                self.assertEqual(bus.reads, [(3, 64)])
                self.assertEqual(bus.events, ["set", 0.100, "get"])
                self.assertEqual(bus.opened, bus.closed)

    def test_short_reply_battery_bit_patterns(self):
        for value in range(256):
            with self.subTest(value=value):
                frame = short_reply()
                frame[6] = value
                level = value & 0x7F
                expected = (level, bool(value & 0x80), "") if 1 <= level <= 100 else None
                self.assertEqual(E.parse_reply(frame), expected)

    def test_short_reply_bad_headers_absence_and_invalid_levels_are_discarded(self):
        frames = [short_reply()[:-1], short_reply() + [0], [0] * 16]
        for index, values in ((0, (0, 2, 9)), (1, (0, 0x20, 0x51, 0xFF)),
                              (2, (1, 0xFF)), (5, (0, 2, 0x35, 0xFF)),
                              (6, (0, 0x80, 101, 127, 229, 255))):
            for value in values:
                frame = short_reply()
                frame[index] = value
                frames.append(frame)
        for frame in frames:
            with self.subTest(frame=frame), fixture([frame]) as bus:
                self.assertIsNone(E.parse_reply(frame))
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.writes, [REQUEST])
                self.assertEqual(bus.reads, [(3, 64)])
                self.assertEqual(bus.opened, bus.closed)

    def test_malformed_replies_and_silence_do_not_trigger_fallback_commands(self):
        frames = [None, [], [0] * 64, [3] + [0] * 63, reply()[:-1], reply() + [0], REQUEST]
        for index, values in ((0, (0, 2, 9)), (2, (1, 255)), (3, (0, 6, 59, 255)),
                              (4, (1, 255)), (6, (101, 127, 229, 255))):
            for value in values:
                frame = reply()
                frame[index] = value
                frames.append(frame)
        for frame in frames:
            with self.subTest(frame=frame), fixture([frame]) as bus:
                self.assertIsNone(E.parse_reply(frame))
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.writes, [REQUEST])
                self.assertEqual(bus.reads, [(3, 64)])
                self.assertEqual(bus.opened, bus.closed)

    def test_sdk_data_length_and_no_invented_type_offset_or_checksum(self):
        for length in (7, 10, 58):
            frame = reply()
            frame[1], frame[3], frame[5], frame[-1] = 0xA5, length, 0x42, 0xEF
            self.assertEqual(E.parse_reply(frame), (73, False, ""))

    def test_either_page_is_selected_by_proof_not_inventory_order(self):
        for page, other_page in ((0xFF00, 0xFF06), (0xFF06, 0xFF00)):
            proven = entry(usage_page=page)
            other = entry(usage_page=other_page, path=b"other", feature_report_sizes={"4": 64})
            for infos in ([proven, other], [other, proven]):
                with self.subTest(page=page, infos=infos), fixture([reply()], infos) as bus:
                    self.assertEqual(len(P().poll()), 1)
                    self.assertEqual(bus.opened, [proven["path"]])
                    self.assertEqual(bus.writes, [REQUEST])

    def test_zero_or_multiple_proven_collections_never_open(self):
        a, b = entry(), entry(usage_page=0xFF06, path=b"s9-ff06")
        for infos in ([], [a, b], [b, a], [a, dict(a, path=b"duplicate")],
                      [dict(a, feature_report_sizes=None), dict(b, feature_report_sizes=None)],
                      [dict(a, feature_report_sizes={"4": 64}), dict(b, feature_report_sizes={"3": 63})]):
            with self.subTest(infos=infos), fixture([reply()], infos) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual((bus.opened, bus.writes, bus.reads), ([], [], []))

    def test_wrong_identity_missing_or_incompatible_descriptor_never_opens(self):
        changes = [dict(feature_report_length=n) for n in (None, True, 0, 63, 65, 4097)]
        changes += [dict(feature_report_sizes=sizes) for sizes in
                    (None, {}, {3: 64}, {"3": 63}, {"3": 65}, {"4": 64}, {"3": 64.0},
                     {"3": 64, "4": True}, {"3": 64, "4": 65})]
        changes += [dict(product_id=pid) for pid in (0x062F, 0x103D, 0x106E, 0x1029)]
        changes += [dict(vendor_id=0x089D), dict(usage_page=1), dict(usage_page=0xFF60),
                    dict(usage=2), dict(path=b""), dict(physical_id=""),
                    dict(physical_id="collection:unknown")]
        for change in changes:
            with self.subTest(change=change), fixture([reply()], [entry(**change)]) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual((bus.opened, bus.writes, bus.reads), ([], [], []))

    def test_per_report_proof_allows_another_feature_id_with_larger_capacity(self):
        info = entry(feature_report_length=128, feature_report_sizes={"3": 64, "9": 128})
        with fixture([reply()], [info]) as bus:
            self.assertEqual(len(P().poll()), 1)
            self.assertEqual(bus.reads, [(3, 64)])
            self.assertEqual(bus.writes, [REQUEST])

    def test_receivers_are_selected_independently_and_unrelated_collections_ignored(self):
        infos = [entry(), entry(usage_page=0xFF06, path=b"second", physical_id="receiver-b"),
                 entry(usage_page=1, usage=2, path=b"mouse"),
                 entry(usage_page=1, usage=6, path=b"keyboard"),
                 entry(product_id=0x103D, path=b"other-model")]
        with fixture([reply(73), reply(24)], infos) as bus:
            statuses = P().poll()
            self.assertEqual([s.level for s in statuses], [73, 24])
            self.assertEqual(len({s.key for s in statuses}), 2)
            self.assertEqual(bus.opened, [b"s9-ff00", b"second"])
            self.assertEqual(bus.writes, [REQUEST, REQUEST])

    def test_short_write_and_io_errors_close_without_retry_or_private_diagnostics(self):
        for options in [dict(short=True)] + [dict(error_at=s) for s in ("open", "set", "get", "close")]:
            provider = P()
            with self.subTest(options=options), fixture(**options) as bus:
                self.assertEqual(provider.poll(), [])
                self.assertEqual(bus.opened, bus.closed)
                self.assertLessEqual(len(bus.writes), 1)
                self.assertLessEqual(len(bus.reads), 1)
                if options.get("short") or options.get("error_at") in ("open", "set"):
                    self.assertEqual(bus.reads, [])
                self.assertNotIn("private-device-path", " ".join(provider.diagnostics()))


if __name__ == "__main__":
    unittest.main()
