"""Synthetic FA09 rejection/BY fixtures; no real HID or vendor code."""
from contextlib import contextmanager
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from test_mchose_by_keyboard import M, P, entry, identity, reply, notification
from test_new_brands import FakeHid, H
from providers.vgn_beiying import VgnBeiyingProvider


def aula_entry(physical="receiver-a", **changes):
    info = dict(input_report_length=0, output_report_length=0,
                input_report_sizes={}, output_report_sizes={},
                feature_report_length=8, feature_report_sizes={"6": 8})
    return entry(physical, **(info | changes))


def aula_reply(level=64):
    # Synthetic variant of the eight-byte user-reported frame; unknown bytes
    # intentionally carry no charging or checksum semantics.
    return [6, 0x87, 2, level, 0x64, 0x64, 0xAB, 0x82]


class FeatureHid(FakeHid):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.feature_writes, self.feature_reads = [], []

    def device(self):
        handle = super().device()

        def send(packet):
            self.feature_writes.append((handle.path, bytes(packet)))
            if self.error_at == "feature_write":
                raise OSError("private-device-path")
            return len(packet) if self.write_result is None else self.write_result

        def get(report_id, length):
            self.feature_reads.append((handle.path, report_id, length))
            if self.error_at == "feature_read":
                raise ValueError("private-device-path")
            return self.frames.pop(0) if self.frames else []

        handle.send_feature_report, handle.get_feature_report = send, get
        return handle


@contextmanager
def aula_fixture(frames=(), inventory=None, **kwargs):
    bus = FeatureHid(frames, **kwargs)
    infos = [aula_entry()] if inventory is None else inventory
    with patch.object(H, "hid", bus), \
            patch.object(H.hidlist, "enumerate", side_effect=lambda vid=0: [
                d for d in infos if not vid or d["vendor_id"] == vid]), \
            patch.object(H, "time", SimpleNamespace(monotonic=lambda: bus.now)):
        yield bus


class AulaFa09Tests(unittest.TestCase):
    def test_disproven_feature06_values_never_open_or_query(self):
        for level in (100, 64, 48):
            with self.subTest(level=level), aula_fixture([aula_reply(level)]) as bus:
                provider = P()
                self.assertEqual(provider.poll(), [], "Feature06 byte3 is not a battery reading")
                self.assertEqual(bus.opened, [])
                self.assertEqual((bus.writes, bus.reads, bus.feature_writes, bus.feature_reads),
                                 ([], [], [], []))
                self.assertIn("Feature06 battery path disabled: field does not track battery; nothing sent",
                              provider.diagnostics())
                self.assertNotIn("receiver-a", str(provider.diagnostics()))

    def assert_no_io(self, bus):
        self.assertEqual((bus.opened, bus.closed, bus.writes, bus.reads,
                          bus.feature_writes, bus.feature_reads), ([], [], [], [], [], []))

    def test_feature_only_with_unproven_ff02_never_produces_card_in_either_order(self):
        ff04 = aula_entry(path=b"feature-ff04")
        ff02 = entry(path=b"by-ff02", usage_page=0xFF02, input_report_sizes=None)
        for factories in ((P, VgnBeiyingProvider), (VgnBeiyingProvider, P)):
            with self.subTest(order=factories), aula_fixture([aula_reply()], [ff02, ff04]) as bus:
                self.assertEqual([s for factory in factories for s in factory().poll()], [])
                self.assert_no_io(bus)

    def test_feature_frames_including_malformed_values_never_open_or_query(self):
        frames = [aula_reply(level) for level in (1, 48, 64, 99, 100)]
        frames += [None, [], aula_reply()[:-1], aula_reply() + [0],
                   bytes.fromhex("06 87 00 00 01 00 02 00"), M.make_request(), identity()]
        for offset, value in ((0, 0), (0, 0x13), (1, 0x88), (3, 0), (3, -1),
                              (3, 101), (3, 255), (3, True), (3, 64.0), (7, 256)):
            frame = aula_reply()
            frame[offset] = value
            frames.append(frame)
        for frame in frames:
            with self.subTest(frame=frame), aula_fixture([frame]) as bus:
                self.assertEqual(P().poll(), [])
                self.assert_no_io(bus)

    def test_unproven_feature_or_absent_io_caps_never_open_or_send(self):
        defects = [dict(feature_report_length=n) for n in (None, 0, 7, 8.0, 9, 20)]
        defects += [dict(feature_report_sizes=s) for s in
                    (None, {}, {"6": 7}, {"6": 8.0}, {"6": 9}, {"7": 8}, {6: 8}, {"6": 8, "7": 8})]
        for direction in ("input", "output"):
            defects += [{direction + "_report_length": n} for n in (None, False, 8, 20)]
            defects += [{direction + "_report_sizes": sizes} for sizes in (None, {"19": 20})]
        defects += [dict(vendor_id=0x41E4, product_id=0x2001),
                    dict(vendor_id=0x05AC, product_id=0x024F),
                    dict(product_id=0xFA07), dict(usage_page=0xFF02), dict(usage=1),
                    dict(path=b""), dict(physical_id="collection:unknown"),
                    dict(product_string="AULA F87")]
        inventories = [[aula_entry(**d)] for d in defects]
        inventories += [[aula_entry(), aula_entry(path=b"duplicate")],
                        [aula_entry(), entry(path=b"second-by-endpoint")]]
        for infos in inventories:
            with self.subTest(infos=infos), aula_fixture([aula_reply()], infos) as bus:
                self.assertEqual(P().poll(), [])
                self.assert_no_io(bus)

    def test_proven_by_wins_if_feature_exists_and_never_falls_back(self):
        mixed = entry(feature_report_length=8, feature_report_sizes={"6": 8})
        for frames, count in (([identity(), reply()], 1), ([], 0), ([identity(), reply(0)], 0)):
            with self.subTest(frames=frames), aula_fixture(frames, [mixed]) as bus:
                statuses = P().poll()
                self.assertEqual(len(statuses), count)
                self.assertTrue(all(not status.unconfirmed for status in statuses))
                self.assertEqual(bus.feature_writes, [])
                self.assertEqual(bus.feature_reads, [])
                self.assertTrue(all(frame in (M.identity_request(), M.make_request())
                                    for _, frame in bus.writes))

    def test_g75pro_ff02_precedes_feature06_and_failure_never_falls_back(self):
        infos = [aula_entry(path=b"ff04-feature"), entry(path=b"ff02-by", usage_page=0xFF02)]
        # Canonical model fixture; unlike #476's raw 05 frame, bytes 5..10
        # contain the exact G75 Pro code. Notification padding is synthetic.
        for frames, level in (([identity("030000000115"), notification()], 95), ([], None),
                              ([identity("030000000115"), notification(0)], None),
                              ([identity("030000000115"), reply(0)], None)):
            for factories in ((P, VgnBeiyingProvider), (VgnBeiyingProvider, P)):
                with self.subTest(frames=frames, order=factories), aula_fixture(frames, infos) as bus:
                    statuses = [s for factory in factories for s in factory().poll()]
                    self.assertEqual(len(statuses), int(level is not None))
                    if level is not None:
                        self.assertEqual((statuses[0].name, statuses[0].level), ("MCHOSE G75 Pro", level))
                        self.assertTrue(statuses[0].charging_known)
                        self.assertFalse(statuses[0].charging)
                        self.assertFalse(statuses[0].unconfirmed)
                    self.assertEqual(bus.opened, [b"ff02-by"])
                    self.assertEqual(bus.opened, bus.closed)
                    self.assertEqual((bus.feature_reads, bus.feature_writes), ([], []))
                    self.assertEqual([frame for _, frame in bus.writes],
                                     [M.identity_request(), M.make_request()] if frames
                                     else [M.identity_request()])

    def test_issue476_raw_identity_is_unknown_but_fa09_generic4a_remains_readable(self):
        infos = [aula_entry(path=b"ff04-feature"), entry(path=b"ff02-by", usage_page=0xFF02)]
        # Complete raw literals from #476, without inserting or shifting bytes.
        model476 = list(bytes.fromhex("13 05 01 00 03 00 00 00 01 15 00 00 00 00 00 00 00 00 00 00"))
        battery476 = list(bytes.fromhex("13 4A 01 00 02 64 01 00 00 00 00 00 00 00 00 00 00 00 00 00"))
        self.assertEqual(bytes(model476[5:11]).hex(), "000000011500")
        self.assertIsNone(M.parse_model(model476), "raw #476 identity must not be guessed as G75 Pro")
        for battery, level in ((battery476, 100), (notification(0), None), (reply(0), None)):
            for factories in ((P, VgnBeiyingProvider), (VgnBeiyingProvider, P)):
                with self.subTest(battery=battery, order=factories), \
                        aula_fixture([model476, battery], infos) as bus:
                    statuses = [s for factory in factories for s in factory().poll()]
                    self.assertEqual(len(statuses), int(level is not None))
                    if level is not None:
                        status, = statuses
                        self.assertEqual((status.name, status.level), ("2.4G 无线键盘（3554:FA09）", 100))
                        self.assertFalse(status.charging_known)
                        self.assertFalse(status.charging)
                        self.assertFalse(status.unconfirmed)
                    self.assertEqual(bus.opened, [b"ff02-by"])
                    self.assertEqual(bus.opened, bus.closed)
                    self.assertEqual((bus.feature_reads, bus.feature_writes), ([], []))
                    self.assertEqual([frame for _, frame in bus.writes],
                                     [M.identity_request(), M.make_request()])

    def test_duplicate_or_unproven_ff02_with_feature_only_ff04_never_opens(self):
        ff04 = aula_entry(path=b"feature-ff04")
        ff02 = entry(path=b"by-ff02", usage_page=0xFF02)
        inventories = [[ff04, ff02, dict(ff02, path=b"duplicate-ff02")],
                       [ff04, dict(ff04, path=b"duplicate-ff04"), ff02]]
        for direction in ("input", "output"):
            inventories += [[ff04, dict(ff02, **{direction + "_report_sizes": sizes})]
                            for sizes in (None, {}, {"19": 19}, {"18": 20}, {"19": 20, "20": 20})]
        for infos in inventories:
            with self.subTest(infos=infos), aula_fixture([identity(), reply()], infos) as bus:
                self.assertEqual(P().poll(), [])
                self.assert_no_io(bus)

    def test_failures_never_send_dangerous_commands_or_retry_in_same_poll(self):
        for options in (dict(error_at="open"), dict(error_at="feature_write"),
                        dict(error_at="feature_read"), dict(write_result=-1),
                        dict(write_result=0), dict(write_result=7)):
            with self.subTest(options=options), aula_fixture([aula_reply()], **options) as bus:
                provider = P()
                self.assertEqual(provider.poll(), [])
                self.assert_no_io(bus)
                self.assertNotIn("private-device-path", str(provider.diagnostics()))

    def test_repeated_polls_and_replug_never_retry_disabled_feature_path(self):
        provider = P()
        for now, frames in ((0, []), (5, []), (60, [aula_reply()]), (66, []),
                            (180, [aula_reply()]), (187, [aula_reply()]), (188, [aula_reply(70)])):
            with self.subTest(now=now), aula_fixture(frames) as bus:
                bus.now = now
                self.assertEqual(provider.poll(), [])
                self.assert_no_io(bus)
        with aula_fixture([]):
            provider.poll()
            provider.poll()
        with aula_fixture([], []):
            provider.poll()
        with aula_fixture([aula_reply()]) as bus:
            self.assertEqual(provider.poll(), [])
            self.assert_no_io(bus)

    def test_disabled_feature_receiver_does_not_block_by_or_leak_state(self):
        for reverse in (False, True):
            infos = [aula_entry("aula"), entry("by")]
            frames = [identity(), reply(63, 0x10)]
            if reverse:
                infos.reverse()
            with self.subTest(reverse=reverse), aula_fixture(frames, infos) as bus:
                statuses = {s.physical_id: s for s in P().poll()}
                self.assertEqual(set(statuses), {"by"})
                self.assertEqual(statuses["by"].name, "MCHOSE X75 V2")
                self.assertTrue(statuses["by"].charging)
                self.assertTrue(statuses["by"].charging_known)
                self.assertFalse(statuses["by"].unconfirmed)
                self.assertEqual((bus.feature_writes, bus.feature_reads), ([], []))
                self.assertEqual(bus.opened, [entry("by")["path"]])
                self.assertEqual([f for _, f in bus.writes], [M.identity_request(), M.make_request()])


if __name__ == "__main__":
    unittest.main()
