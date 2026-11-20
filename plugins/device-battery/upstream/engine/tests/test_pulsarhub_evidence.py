"""Pulsar Link 8K integration and deferred IDs; reports/descriptors are synthetic.

The #134 collection list is supplied in the task brief, not a hardware capture.
Runtime descriptor proof is still required before opening 3710:5501 for I/O.
"""
from contextlib import contextmanager
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
from catalog import load_catalog
from known_ids import build_index
from providers import pulsar as P
from test_pulsar import FakeBus, reply
import server


# Independently transcribed protocol facts, not frames captured from a device.
POWER_REQUEST = bytes.fromhex("08 04 00 00 00 00 00 00 00 00 00 00 00 00 00 00 49")
POWER_REPLIES = (
    (bytes.fromhex("08 04 00 00 00 02 49 00 0f 5b 00 00 00 00 00 00 94"), False),
    (bytes.fromhex("08 04 00 00 00 02 49 01 0f 5b 00 00 00 00 00 00 93"), True),
)
DEFERRED_RECEIVERS = (
    (0x3710, (0x5502, 0x5504, 0x5407, 0xF517, 0x5601, 0x5603)),
    (0x3554, (0x5406, 0x5502, 0x5501, 0x5504, 0x5407, 0x5601, 0x5603)),
)
# Interface numbers are synthetic; only the supplied usage pairs are evidence.
LINK8K_SHAPE = [(1, page, usage) for page, usage in
               ((1, 6), (1, 0x80), (0x0C, 1), (0xFF02, 2),
                (0xFF03, 0), (0xFF04, 2), (0xFF05, 0))]


def link8k_reply(level=73, charging=0, status=0, command=4):
    frame = bytearray(reply(level, charging, 3931, command=command))
    frame[2] = status
    frame[-1] = (0x55 - sum(frame[:-1])) & 0xFF
    return bytes(frame)


@contextmanager
def link8k_receiver(frames=(), shape=LINK8K_SHAPE):
    bus = FakeBus(0x3710, 0x5501, frames, shape=shape)
    for col in bus.cols:
        col.info.update(input_report_length=17, output_report_length=17,
                        input_report_sizes={"8": 17}, output_report_sizes={"8": 17})
    with patch.object(P.hidlist, "enumerate", side_effect=bus.enumerate), \
            patch.object(P.hid, "device", bus.device_class()), \
            patch.object(P, "output_length", side_effect=AssertionError("use descriptor proof")), \
            patch.object(P.PulsarProvider, "_pick", side_effect=AssertionError("no legacy fallback")), \
            patch.object(P, "_capture_dpi", side_effect=AssertionError("no DPI or identity commands")):
        yield bus


class PulsarHubEvidenceTests(unittest.TestCase):
    def test_existing_request_matches_web_battery_frame_byte_for_byte(self):
        self.assertEqual(bytes(P.make_request()), POWER_REQUEST)
        self.assertEqual(sum(POWER_REQUEST) & 0xFF, 0x55)

    def test_existing_parser_matches_normal_web_fields_on_synthetic_replies(self):
        for frame, charging in POWER_REPLIES:
            with self.subTest(charging=charging):
                self.assertEqual(P.parse_power(frame), (73, charging))
                self.assertEqual(P.voltage_mv(frame), 3931)
                self.assertIsNone(P.parse_power(frame[:-1]))
                damaged = bytearray(frame)
                damaged[-1] ^= 1
                self.assertIsNone(P.parse_power(damaged))

    def test_deferred_receivers_never_open_even_with_guessed_compx_descriptors(self):
        # None of these shapes is evidence about the real receiver. Even the
        # plausible FF02:0002 / 17-byte shape must not grant protocol support.
        for vid, pids in DEFERRED_RECEIVERS:
            for pid in pids:
                for page, usage in ((0xFF02, 2), (0xFF02, 1), (0xFF04, 2), (1, 2)):
                    for length in (None, 0, 16, 17, 18, 64):
                        with self.subTest(vid=vid, pid=pid, collection=(page, usage), length=length):
                            bus = FakeBus(vid, pid, shape=[(1, page, usage)])
                            with patch.object(P.hidlist, "enumerate", side_effect=bus.enumerate), \
                                    patch.object(P, "output_length", return_value=length), \
                                    patch.object(P.hid, "device") as device:
                                self.assertEqual(P.PulsarProvider().poll(), [])
                                device.assert_not_called()
                            self.assertEqual(bus.written(), [])

    def test_deferred_ids_are_not_registered_or_promoted_to_level_c(self):
        index = {(entry["vendorId"], entry["productId"])
                 for entry in build_index()["devices"] if entry["provider"] == "pulsar"}
        for vid, pids in DEFERRED_RECEIVERS:
            for pid in pids:
                with self.subTest(vid=vid, pid=pid):
                    self.assertNotIn((vid, pid), index)
                    self.assertNotIn(pid, P.PIDS[vid])
                    self.assertNotIn((vid, pid), P.DPI_MODELS)

    def test_link8k_fields_status_and_exact_charging_flag(self):
        for level in (0, 1, 73, 100):
            for charging in (0, 1, 2, 0x80, 0xFF):
                frame = link8k_reply(level, charging)
                with self.subTest(level=level, charging=charging):
                    self.assertEqual(P.parse_link8k_power(frame), (level, charging == 1))
                    self.assertEqual(P.voltage_mv(frame), 3931)
        for status in (1, 2, 0xFF):
            self.assertIsNone(P.parse_link8k_power(link8k_reply(status=status)))
        # Existing supported models retain their status/charging interpretation.
        frame = link8k_reply(charging=2, status=1)
        self.assertEqual(P.parse_power(frame), (73, True))

    def test_link8k_invalid_frames_fail_closed(self):
        good = link8k_reply()
        damaged = bytearray(good)
        damaged[-1] ^= 1
        frames = [None, b"", good[:-1], good + b"\x00", bytes(damaged),
                  link8k_reply(101), link8k_reply(255), reply(73, header=7)]
        frames += [link8k_reply(command=cmd) for cmd in (1, 2, 3, 5, 7, 9, 10, 0xF0)]
        for frame in frames:
            with self.subTest(frame=frame):
                self.assertIsNone(P.parse_link8k_power(frame))

    def test_link8k_queries_only_power_on_the_proven_control_collection(self):
        for flag in (0, 1, 2, 0xFF):
            with self.subTest(flag=flag), link8k_receiver([link8k_reply(charging=flag)]) as bus:
                provider = P.PulsarProvider()
                device, = provider.poll()
                self.assertEqual((device.key, device.name, device.level, device.charging),
                                 ("pulsar:37105501", "Pulsar Link 8K Dongle", 73, flag == 1))
                self.assertEqual(bus.written(), [(0xFF02, 2)])
                self.assertEqual(sum(col.opened for col in bus.cols), 1)
                self.assertEqual([bytes(f) for col in bus.cols for f in col.sent], [POWER_REQUEST])
                public = server.normalise(device, None, server.utcnow())
                self.assertEqual(public["verificationLevel"], "C")
                self.assertIsNone(public["dpi"])
                self.assertIsNone(device.dpi_target)
                self.assertIn("待实机验证", " ".join(provider.diagnostics()))

    def test_link8k_does_not_stop_at_a_failed_status_reply(self):
        with link8k_receiver([link8k_reply(99, 1, status=1), link8k_reply(38, 2)]) as bus:
            device, = P.PulsarProvider().poll()
            self.assertEqual((device.level, device.charging), (38, False))
            self.assertEqual([bytes(f) for col in bus.cols for f in col.sent], [POWER_REQUEST])

    def test_link8k_bad_or_silent_replies_never_trigger_setup_or_dangerous_commands(self):
        frames = [[], [link8k_reply(status=1)], [link8k_reply(101)],
                  [link8k_reply()[:-1]], [reply(73, break_checksum=True)]]
        frames += [[link8k_reply(command=cmd)] for cmd in (1, 2, 3, 5, 7, 9, 10, 0xF0)]
        for replies in frames:
            with self.subTest(replies=replies), link8k_receiver(replies) as bus:
                self.assertEqual(P.PulsarProvider().poll(), [])
                self.assertEqual([bytes(f) for col in bus.cols for f in col.sent], [POWER_REQUEST])
                self.assertEqual(sum(col.opened for col in bus.cols), 1)

    def test_link8k_missing_wrong_or_ambiguous_collection_never_opens(self):
        shapes = [[d for d in LINK8K_SHAPE if d[1:] != (0xFF02, 2)],
                  LINK8K_SHAPE + [(1, 0xFF02, 2)]]
        shapes += [[(1, page, usage)] for page, usage in
                   ((0xFF02, 1), (0xFF04, 2), (0xFF05, 0), (1, 6))]
        for shape in shapes:
            with self.subTest(shape=shape), link8k_receiver([link8k_reply()], shape) as bus:
                self.assertEqual(P.PulsarProvider().poll(), [])
                self.assertEqual(sum(col.opened for col in bus.cols), 0)
                self.assertEqual(bus.written(), [])

    def test_link8k_both_report_ids_and_exact_lengths_must_be_proven(self):
        for direction in ("input", "output"):
            defects = [(direction + "_report_length", n) for n in (None, 0, 16, 18, 64, "17")]
            defects += [(direction + "_report_sizes", sizes) for sizes in
                        (None, {}, {"0": 17}, {"7": 17}, {"8": 16}, {"8": 18},
                         {"8": "17"}, {"8": 17, "9": 17})]
            for key, value in defects:
                with self.subTest(key=key, value=value), link8k_receiver([link8k_reply()]) as bus:
                    control = next(col for col in bus.cols if col.info["usage_page"] == 0xFF02)
                    if value is None:
                        control.info.pop(key)
                    else:
                        control.info[key] = value
                    self.assertEqual(P.PulsarProvider().poll(), [])
                    self.assertEqual(sum(col.opened for col in bus.cols), 0)
                    self.assertEqual(bus.written(), [])

    def test_link8k_sleep_history_requires_descriptor_to_remain_proven(self):
        with link8k_receiver([link8k_reply()]) as bus:
            provider = P.PulsarProvider()
            self.assertTrue(provider.poll()[0].online)
            stale, = provider.poll()
            self.assertEqual((stale.level, stale.online, stale.wake_on_input), (73, False, True))
            for col in bus.cols:
                col.info.pop("input_report_sizes")
            self.assertEqual(provider.poll(), [])
            self.assertEqual([bytes(f) for col in bus.cols for f in col.sent], [POWER_REQUEST] * 2)

    def test_issue592_f503_registered_in_server_and_index_as_level_c_battery_only(self):
        self.assertIn(0x3554, server.PROVIDER_VIDS["pulsar"])
        self.assertIn((0x3554, 0xF503), P.STRICT_COMPX_IDS)
        self.assertNotIn((0x3554, 0xF503), P.DPI_MODELS)
        bus = FakeBus(0x3554, 0xF503, shape=[(1, 0xFF02, 2)])
        self.assertEqual(server.recognized_candidate_count("pulsar", bus.enumerate(0x3554)), 1)
        entry, = [d for d in build_index()["devices"]
                  if (d["vendorId"], d["productId"]) == (0x3554, 0xF503)]
        self.assertEqual((entry["provider"], entry["kind"], entry["name"]),
                         ("pulsar", "mouse", "VGN F1 Moba F503"))
        reader, = [d for d in load_catalog()["readers"] if d["provider"] == "pulsar"]
        self.assertEqual(reader["verificationLevel"], "C")
        self.assertIn("3554:F503", reader["matchScope"])
        self.assertIn("#592", reader["matchScope"])

    def test_link8k_registered_in_server_and_index_as_level_c_battery_only(self):
        self.assertIn(0x3710, server.PROVIDER_VIDS["pulsar"])
        self.assertNotIn(0x3710, server.DPI_PROVIDERS["pulsar"])
        self.assertNotIn((0x3710, 0x5501), P.DPI_MODELS)
        bus = FakeBus(0x3710, 0x5501)
        self.assertEqual(server.recognized_candidate_count("pulsar", bus.enumerate(0x3710)), 1)
        entry, = [d for d in build_index()["devices"]
                  if (d["vendorId"], d["productId"]) == (0x3710, 0x5501)]
        self.assertEqual((entry["provider"], entry["kind"], entry["name"]),
                         ("pulsar", "mouse", "Pulsar Link 8K Dongle"))
        catalog = load_catalog()
        self.assertNotIn("pulsar_link_8k_5501_observed", [d["id"] for d in catalog["observedUnsupported"]])
        reader, = [d for d in catalog["readers"] if d["provider"] == "pulsar"]
        self.assertEqual(reader["verificationLevel"], "C")
        self.assertIn("3710:5501", reader["matchScope"])


if __name__ == "__main__":
    unittest.main()
