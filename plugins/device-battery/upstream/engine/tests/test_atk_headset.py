"""ATK N9 V2 fixtures from static protocol facts; no hardware or vendor code."""
from contextlib import contextmanager
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
import battery_hid as H
from providers import atk_headset as A, pulsar
from test_new_brands import FakeHid

P = A.AtkHeadsetProvider
REQUEST = [0x55, 0x65, 0x01] + [0] * 61


def entry(physical="receiver-a", **changes):
    info = dict(vendor_id=0x373B, product_id=0x1262, usage_page=0xFF90, usage=1,
                input_report_length=64, output_report_length=64,
                input_report_sizes={"85": 64}, output_report_sizes={"85": 64},
                path=(physical + "-ff90").encode(), physical_id=physical,
                product_string="ATK N9V2 ULTIMATE dongle", serial_number="same-serial")
    info.update(changes)
    return info


def reply(level=73, state=0x02, length=64, command=0x65):
    return [0x55, command, level, state] + [0] * (length - 4)


def disconnected(length=64):
    return [0x55, 0x0A, 0x01] + [0] * (length - 3)


@contextmanager
def fixture(frames=(), inventory=None, **kwargs):
    bus = FakeHid(frames, **kwargs)
    infos = [entry()] if inventory is None else inventory
    with patch.object(H, "hid", bus), \
            patch.object(H.hidlist, "enumerate", side_effect=lambda vid=0: [
                d for d in infos if not vid or d["vendor_id"] == vid]), \
            patch.object(H, "time", SimpleNamespace(monotonic=lambda: bus.now)):
        yield bus


class AtkHeadsetTests(unittest.TestCase):
    def test_only_battery_frame_and_v2_state_semantics(self):
        self.assertEqual(A.make_request(), REQUEST)
        for pid, name in ((0x1262, "ATK N9 V2 Ultimate"), (0x12D6, "ATK N9 V2 ULTRA")):
            for state in (0x02, 0x03, 0x04):
                for level in (0, 73, 100):
                    with self.subTest(pid=pid, state=state, level=level), fixture(
                            [reply(level, state)], [entry(product_id=pid)]) as bus:
                        status, = P().poll()
                    self.assertEqual((status.name, status.level, status.charging, status.kind),
                                     (name, level, state == 3, "headset"))
                    self.assertTrue(status.online)
                    self.assertTrue(status.connection_known)
                    self.assertTrue(status.charging_known)
                    self.assertEqual(status.verification_level, "C")
                    self.assertEqual(status.approx, "")
                    self.assertEqual(bus.writes, [(entry()["path"], REQUEST)])
                    self.assertEqual(bus.reads[0][0], 64)
                    self.assertEqual(bus.opened, bus.closed)

    def test_input_length_is_descriptor_proven_not_assumed_from_output(self):
        for length in (22, 32, 64):
            info = entry(input_report_length=length, input_report_sizes={"85": length})
            with self.subTest(length=length), fixture([reply(length=length)], [info]) as bus:
                status, = P().poll()
            self.assertEqual(status.level, 73)
            self.assertEqual(bus.reads[0][0], length)
            self.assertEqual(bus.writes, [(info["path"], REQUEST)])
        # A parser-valid 22-byte packet is still rejected on a proven 64-byte report.
        with fixture([reply(length=22)]) as bus:
            self.assertEqual(P().poll(), [])
        self.assertEqual(bus.reads[0][0], 64)

    def test_malformed_headers_states_percentages_and_echo_are_rejected(self):
        bad_id = reply()
        bad_id[0] = 0x41
        frames = ([], reply(length=21), reply(length=65), bad_id, reply(command=0xAA),
                  reply(-1), reply(101), reply(255), reply(state=0), reply(state=1),
                  reply(state=5), reply(state=0x1A), reply(state=0xFF), REQUEST)
        for frame in frames:
            with self.subTest(frame=frame[:4], length=len(frame)):
                self.assertIsNone(A.parse_reply(frame))
                with fixture([frame]) as bus:
                    self.assertEqual(P().poll(), [])
                self.assertEqual(bus.writes, [(entry()["path"], REQUEST)])
                self.assertEqual(bus.opened, bus.closed)

    def test_silence_and_off_stop_without_reading_or_retry(self):
        for frames in ([], [reply(0, 0x1A), reply()], [disconnected(), reply()]):
            with self.subTest(frames=frames), fixture(frames) as bus:
                self.assertEqual(P().poll(), [])
            self.assertEqual(len(bus.reads), 1)
            self.assertEqual(bus.writes, [(entry()["path"], REQUEST)])
            self.assertEqual(bus.opened, bus.closed)
            self.assertLessEqual(bus.now, 1.001)

    def test_unrelated_or_malformed_frames_do_not_trigger_other_commands(self):
        frames = [reply(command=command) for command in
                  (0x01, 0x02, 0x03, 0x04, 0x05, 0x07, 0x08, 0x09,
                   0x0E, 0x0F, 0x10, 0x21, 0x22, 0x23, 0x24, 0x55, 0x68, 0x69, 0xAA)]
        frames += [reply()[:4], REQUEST, reply(101), reply(state=0), reply(62)]
        with fixture(frames) as bus:
            status, = P().poll()
        self.assertEqual(status.level, 62)
        # No EQ, lighting, reset, key-event, pairing, firmware or feature calls.
        self.assertEqual(bus.writes, [(entry()["path"], REQUEST)])
        self.assertEqual(len(bus.opened), 1)
        self.assertEqual(bus.opened, bus.closed)

    def test_reconnect_event_alone_never_becomes_a_battery_reading(self):
        connected = disconnected()
        connected[2] = 0
        with fixture([connected]) as bus:
            self.assertEqual(P().poll(), [])
        self.assertEqual(bus.writes, [(entry()["path"], REQUEST)])

    def test_continuous_reports_are_bounded_by_deadline_and_read_count(self):
        for read_ms in (0, 240):
            with self.subTest(read_ms=read_ms), fixture(
                    [reply(command=0xAA)] * 100, read_ms=read_ms) as bus:
                self.assertEqual(P().poll(), [])
            self.assertLessEqual(bus.now, 1.001)
            self.assertLessEqual(len(bus.reads), 32)
            self.assertTrue(all(0 < timeout <= 1000 for _, timeout in bus.reads))
            self.assertEqual(bus.writes, [(entry()["path"], REQUEST)])

    def test_unproven_or_incompatible_report_ids_and_lengths_never_open(self):
        changes = [dict(input_report_length=n) for n in (None, True, 0, 21, 65)]
        changes += [dict(output_report_length=n) for n in (None, True, 0, 63, 65)]
        for direction in ("input", "output"):
            changes += [{direction + "_report_sizes": sizes} for sizes in
                        (None, {}, {"65": 64}, {"85": 63}, {"85": True},
                         {"85": 64, "65": 65}, {"85": 64, "65": 0})]
        for change in changes:
            with self.subTest(change=change), fixture([reply()], [entry(**change)]) as bus:
                self.assertEqual(P().poll(), [])
            self.assertEqual(bus.opened, [])
            self.assertEqual(bus.writes, [])

    def test_wrong_identity_collection_or_ambiguous_receiver_never_opens(self):
        changes = [dict(product_id=pid) for pid in (0x1204, 0x1258, 0x1261, 0x12D4, 0x12D5, 0x1278)]
        changes += [dict(vendor_id=0x291D), dict(vendor_id=0x3554),
                    dict(usage_page=0xFF82), dict(usage_page=0xFF02, usage=2),
                    dict(usage_page=0x000C), dict(usage=2), dict(path=b""),
                    dict(physical_id="collection:unresolved")]
        inventories = [[entry(**change)] for change in changes]
        inventories.append([entry(), entry(path=b"second-ff90")])
        for inventory in inventories:
            with self.subTest(inventory=inventory), fixture([reply()], inventory) as bus:
                self.assertEqual(P().poll(), [])
            self.assertEqual(bus.opened, [])
            self.assertEqual(bus.writes, [])

    def test_firmware_collection_does_not_hide_the_battery_collection(self):
        info = entry()
        other = entry(usage_page=0xFF82, input_report_sizes={"65": 64},
                      output_report_sizes={"65": 64}, path=b"firmware-ff82")
        with fixture([reply()], [other, info]) as bus:
            self.assertEqual(len(P().poll()), 1)
        self.assertEqual(bus.opened, [info["path"]])
        self.assertEqual(bus.writes, [(info["path"], REQUEST)])

    def test_same_model_receivers_stay_separate_despite_shared_serial(self):
        infos = [entry("one"), entry("two")]
        with fixture([reply(20), reply(90)], infos):
            first = P().poll()
        with fixture([reply(90), reply(20)], list(reversed(infos))):
            second = P().poll()
        self.assertEqual([status.level for status in first], [20, 90])
        self.assertEqual(len({status.key for status in first}), 2)
        self.assertEqual({status.key for status in first}, {status.key for status in second})

    def test_short_write_and_io_failures_close_without_retry(self):
        for written in (-1, 0, 63):
            with self.subTest(written=written), fixture([reply()], write_result=written) as bus:
                self.assertEqual(P().poll(), [])
            self.assertEqual(len(bus.writes), 1)
            self.assertEqual(bus.reads, [])
            self.assertEqual(bus.opened, bus.closed)
        for stage in ("open", "write", "read"):
            provider = P()
            with self.subTest(stage=stage), fixture([reply()], error_at=stage) as bus:
                self.assertEqual(provider.poll(), [])
            self.assertEqual(bus.opened, bus.closed)
            self.assertLessEqual(len(bus.writes), 1)
            self.assertNotIn("private-path", " ".join(provider.diagnostics()))

    def test_requested_headsets_never_receive_the_pulsar_mouse_fallback(self):
        # Adversarial mouse-like metadata must not override the known headset ID.
        for pid in (0x1204, 0x1262, 0x12D6):
            info = entry(product_id=pid, usage_page=0xFF02, usage=2,
                         input_report_length=17, output_report_length=17,
                         input_report_sizes={"8": 17}, output_report_sizes={"8": 17})
            with self.subTest(pid=pid), fixture([reply()], [info]) as bus, \
                    patch.object(pulsar, "hid", bus), \
                    patch.object(pulsar, "output_length", return_value=17) as lengths:
                self.assertEqual(pulsar.PulsarProvider().poll(), [])
                self.assertEqual(P().poll(), [])
            lengths.assert_not_called()
            self.assertEqual(bus.opened, [])
            self.assertEqual(bus.writes, [])


if __name__ == "__main__":
    unittest.main()
