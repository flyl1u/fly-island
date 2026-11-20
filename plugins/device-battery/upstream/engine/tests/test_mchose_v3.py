"""Synthetic HID around OpenMouse's V3 fixtures and captured Ultra+ data block.

The input framing is reconstructed from the pinned codec, not a Pro capture.
No reference JavaScript is imported/executed and no physical HID is opened.
"""
from contextlib import contextmanager
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
from _feedback import feedback_inventory
from battery_hid import parse_report_descriptor
from providers import mchose as M


# src/drivers/mchose/v3-hid.test.ts: 87%, discharging; 14-byte device info.
DISCHARGING = bytes.fromhex(
    "4d 01 01 0e 00 09 00 00 37 38 33 40 03 01 00 04 20 00 01 00 57 02 08"
).ljust(64, b"\x00")
# docs/mchose-protocol.md: captured Ultra+ payload, 85%, charging. Its 4026
# reply PID is NOT a model name, and the extra two payload bytes are retained.
CHARGING = bytes.fromhex(
    "4d 01 01 10 00 09 00 00 37 38 26 40 04 00 00 00 00 10 02 01 55 00 08 e4 df"
).ljust(64, b"\x00")
# #276's 24-byte prefix plus the reporter's stated XOR A1; zero padding is
# reconstructed for the 64-byte transport, not a complete captured report.
ULTRA_42 = bytes.fromhex(
    "4d 01 01 10 00 09 00 00 37 38 26 40 04 00 00 00 00 10 02 00 2a 00 08 e4 a1"
).ljust(64, b"\x00")
REQUEST = bytes.fromhex("4d 01 01 00 00 09 00 00 08").ljust(64, b"\x00")
BUSY = bytes.fromhex("4d 01 01 01 00 09 00 00 ff f6").ljust(64, b"\x00")
REFUSAL = bytes.fromhex("4d 01 00 00 00 00 00 ff").ljust(64, b"\x00")


def edited(frame=DISCHARGING, **fields):
    data = bytearray(frame)
    for offset, value in fields.items():
        data[int(offset)] = value
    if data[2] == 1 and 8 + data[3] < len(data):
        checksum = 0
        for byte in data[2:8 + data[3]]:
            checksum ^= byte
        data[8 + data[3]] = checksum
    return bytes(data)


def inventory(pid=0x1018):
    return [dict(d, product_id=pid, input_report_length=64, output_report_length=64,
                 input_report_sizes={"77": 64}, output_report_sizes={"77": 64},
                 input_report_proof="caps", output_report_proof="caps")
            for d in feedback_inventory(24)
            if (d["vendor_id"], d["product_id"]) == (0x3837, 0x1018)]


def alternate_inventory(instance="synthetic-a", pid=0x1018):
    # Synthetic two-TLC descriptor, NOT a capture from #493 or #496. The
    # reported FF01 layout is simulated; FF0B's real 4D placement is unknown.
    descriptor = bytes.fromhex(
        "06 01 ff 09 01 a1 01 75 08 95 28 85 11 81 02 85 13 91 02 c0 "
        "06 0b ff 09 c4 a1 01 75 08 95 3f 85 4d 81 02 91 02 c0")
    collections = parse_report_descriptor(descriptor)
    parent = rf"pnp:usb\vid_3837&pid_{pid:04x}\{instance}"
    return [dict(vendor_id=0x3837, product_id=pid, physical_id=parent,
                 path=rf"\\?\hid#vid_3837&pid_{pid:04x}&mi_01&col{index:02d}#{instance}".encode(),
                 usage_page=page, usage=usage, product_string="MCHOSE V3 synthetic receiver",
                 input_report_length=max(sizes["input"].values()),
                 output_report_length=max(sizes["output"].values()),
                 input_report_sizes=sizes["input"], output_report_sizes=sizes["output"],
                 input_report_proof="descriptor", output_report_proof="descriptor",
                 declared_report_sizes=sizes)
            for index, ((page, usage), sizes) in enumerate(collections.items(), 1)]


class FakeHid:
    def __init__(self, replies, fail=None):
        self.replies = list(replies)
        self.fail = fail
        self.opened, self.sent, self.reads = [], [], []
        self.closed = 0

    def open_path(self, path):
        self.opened.append(path)
        if self.fail == "open":
            raise OSError("open failed")

    def write(self, frame):
        self.sent.append(bytes(frame))
        if self.fail == "write":
            raise OSError("write failed")
        return 63 if self.fail == "short" else len(frame)

    def read(self, size, timeout):
        self.reads.append((size, timeout))
        if self.fail == "read":
            raise OSError("read failed")
        return self.replies.pop(0) if self.replies else []

    def close(self):
        self.closed += 1

    def send_feature_report(self, frame):
        raise AssertionError("V3 must never send V2/A5 feature reports")

    def get_feature_report(self, *args):
        raise AssertionError("V3 must never read V2/A5 feature reports")


@contextmanager
def fixture(replies=(), infos=None, fail=None):
    infos = inventory() if infos is None else infos
    bus = FakeHid(replies, fail)
    with patch.object(M.hidlist, "enumerate", side_effect=lambda vid: [
            d for d in infos if d["vendor_id"] == vid]), \
            patch.object(M.hid, "device", return_value=bus), \
            patch.object(M.MchoseProvider, "_read_collection", side_effect=AssertionError("no V2")), \
            patch.object(M.MchoseProvider, "_read_g7", side_effect=AssertionError("no G7")), \
            patch.object(M.MchoseProvider, "_read_a5", side_effect=AssertionError("no A5")):
        yield bus


class V3ProtocolTests(unittest.TestCase):
    def test_synthetic_1018_ff01_41_uses_unique_proven_ff0b_4d64(self):
        infos = alternate_inventory()
        with fixture([CHARGING], infos) as bus:
            provider = M.MchoseProvider()
            statuses = provider.poll()
            self.assertEqual([(s.level, s.charging) for s in statuses], [(85, True)])
            self.assertEqual(bus.opened, [infos[1]["path"]])
            self.assertEqual(bus.sent, [REQUEST])
            self.assertEqual(bus.closed, 1)

    def test_alternate_is_allowed_when_primary_absent_or_completely_excludes_4d(self):
        for primary in (None, {"input_report_length": 64, "output_report_length": 64,
                               "input_report_sizes": {"17": 64}, "output_report_sizes": {"19": 64}},
                        {"input_report_sizes": None, "output_report_sizes": None}):
            infos = alternate_inventory()
            if primary is None:
                infos = infos[1:]
            else:
                infos[0].update(primary)
                infos[0].pop("declared_report_sizes")
            with self.subTest(primary=primary), fixture([DISCHARGING], infos) as bus:
                self.assertEqual(M.MchoseProvider().poll()[0].level, 87)
                self.assertEqual(bus.opened, [infos[-1]["path"]])
                self.assertEqual(bus.sent, [REQUEST])

    def test_proven_primary_wins_even_with_ambiguous_or_unknown_alternates(self):
        infos = alternate_inventory()
        infos[0].update(input_report_length=64, output_report_length=64,
                        input_report_sizes={"77": 64}, output_report_sizes={"77": 64})
        for alternates in ([infos[1]], [infos[1], dict(infos[1], path=b"duplicate")],
                           [dict(infos[1], input_report_sizes=None)]):
            with self.subTest(alternates=alternates), fixture([CHARGING], [infos[0]] + alternates) as bus:
                self.assertEqual(M.MchoseProvider().poll()[0].level, 85)
                self.assertEqual(bus.opened, [infos[0]["path"]])
                self.assertEqual(bus.sent, [REQUEST])

    def test_primary_unknown_partial_or_contradictory_is_not_absence(self):
        cases = [dict(input_report_length=64, output_report_length=64,
                      input_report_sizes=None, output_report_sizes=None),
                 dict(input_report_length=None), dict(input_report_length=True),
                 dict(input_report_length=41.0), dict(path=b""),
                 dict(input_report_sizes={"77": 64}),
                 dict(input_report_sizes={"17": 40}),
                 dict(input_report_sizes={"17": True}),
                 dict(input_report_sizes={"17": 41, "18": None}),
                 dict(input_report_sizes={"17": 41, "18": 42}),
                 dict(input_report_sizes={"17": 41, "018": 41}),
                 dict(input_report_sizes={"17": 41, "256": 41}),
                 dict(input_report_sizes={}),
                 dict(report_descriptor_error="collection maximum mismatch"),
                 dict(report_descriptor_error="caps/descriptor disagreement"),
                 dict(input_report_length=128, output_report_length=128,
                      input_report_sizes={"77": 64, "78": 128},
                      output_report_sizes={"77": 64, "78": 128})]
        for changes in cases:
            infos = alternate_inventory()
            infos[0].pop("declared_report_sizes")
            infos[0].update(changes)
            with self.subTest(changes=changes), fixture([CHARGING], infos) as bus:
                self.assertEqual(M.MchoseProvider().poll(), [])
                self.assertEqual((bus.opened, bus.sent, bus.reads), ([], [], []))

    def test_duplicate_primary_or_alternate_never_selects_first(self):
        for duplicate in (0, 1):
            infos = alternate_inventory()
            infos.append(dict(infos[duplicate], path=infos[duplicate]["path"] + b"-duplicate",
                              input_report_sizes=None))
            with self.subTest(duplicate=duplicate), fixture([CHARGING], infos) as bus:
                provider = M.MchoseProvider()
                self.assertEqual(provider.poll(), [])
                diagnostic = " ".join(provider.reader_diagnostics())
                self.assertIn("FF01:0001" if duplicate == 0 else "FF0B:00C4", diagnostic)
                self.assertIn("ambiguous", diagnostic)
                self.assertEqual((bus.opened, bus.sent, bus.reads), ([], [], []))

    def test_alternate_requires_complete_both_direction_proof(self):
        for direction in ("input", "output"):
            cases = [{direction + "_report_length": n} for n in (None, True, 0, 41, 63, 65, 64.0)]
            cases += [{direction + "_report_sizes": sizes} for sizes in (
                None, {}, {"76": 64}, {"77": 41}, {"77": 64.0}, {"77": True},
                {"77": 64, "78": None}, {"77": 64, "78": True}, {"77": 64, "78": 65},
                {"77": 64, "078": 64}, {77: 64}, {"77": 64, "256": 64})]
            cases += [{direction + "_report_proof": proof} for proof in (None, "failed", "partial")]
            cases += [dict(report_descriptor_error="caps/descriptor disagreement"),
                      dict(declared_report_sizes={"input": {"17": 41}, "output": {"19": 41}})]
            for changes in cases:
                infos = alternate_inventory()
                infos[1].update(changes)
                with self.subTest(direction=direction, changes=changes), fixture([CHARGING], infos) as bus:
                    provider = M.MchoseProvider()
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual((bus.opened, bus.sent, bus.reads), ([], [], []))
                    self.assertIn("collection=FF0B:00C4", " ".join(provider.reader_diagnostics()))

    def test_alternate_requires_exact_usb_identity_path_parent_and_usage(self):
        cases = [dict(physical_id=value) for value in (
            None, "", "collection:private", "receiver-a", "pnp:bthledevice\\private",
            r"pnp:usb\vid_3837&pid_1014\private", r"pnp:usb\vid_3837&pid_1018&mi_01\private",
            r"pnp:usb\vid_3837&pid_1018\other-parent")]
        cases += [dict(path=value) for value in (
            None, b"", True, b"private-path", b"\xff", b"\\\\?\\bthledevice#vid_3837&pid_1018#private",
            b"\\\\?\\hid#vid_3837&pid_1014#private", b"\\\\?\\hid#vid_3838&pid_1018#private")]
        cases += [dict(usage_page=0xFF02), dict(usage=0x104), dict(usage=1),
                  dict(usage_page=float(0xFF0B)), dict(usage=float(0xC4))]
        for changes in cases:
            infos = alternate_inventory()
            infos[1].update(changes)
            with self.subTest(changes=changes), fixture([CHARGING], infos) as bus:
                self.assertEqual(M.MchoseProvider().poll(), [])
                self.assertEqual((bus.opened, bus.sent, bus.reads), ([], [], []))
        for pid in (0x1014, 0x1019):
            infos = alternate_inventory(pid=pid)
            with self.subTest(pid=pid), fixture([CHARGING], infos) as bus:
                self.assertIsNone(M.MchoseProvider()._pick_v3(infos))
                self.assertEqual((bus.opened, bus.sent, bus.reads), ([], [], []))
        for identity in (dict(vendor_id=0x5253), dict(product_id=True), dict(vendor_id=14391.0)):
            infos = [dict(d, **identity) for d in alternate_inventory()]
            with self.subTest(identity=identity), fixture([CHARGING], infos) as bus:
                self.assertIsNone(M.MchoseProvider()._pick_v3(infos))
                self.assertEqual((bus.opened, bus.sent, bus.reads), ([], [], []))

    def test_alternate_keeps_full_frame_validation_and_never_pads_41_byte_replies(self):
        broken_checksum = bytearray(CHARGING)
        broken_checksum[24] ^= 1
        invalid = [bytes(broken_checksum), CHARGING[:41], CHARGING[1:], CHARGING + b"\0",
                   BUSY, REFUSAL, REQUEST, bytes(64)]
        invalid += [edited(**{str(offset): value}) for offset, value in (
            (0, 0x11), (1, 2), (2, 2), (3, 13), (3, 56), (4, 1), (5, 0),
            (8, 0x53), (9, 0x52), (18, 0), (20, 101))]
        for frame in (CHARGING, DISCHARGING, ULTRA_42) + tuple(invalid):
            infos = alternate_inventory()
            with self.subTest(frame=frame.hex()), fixture([frame], infos) as bus:
                statuses = M.MchoseProvider().poll()
                self.assertEqual(len(statuses), int(frame in (CHARGING, DISCHARGING, ULTRA_42)))
                self.assertEqual(bus.sent, [REQUEST])
                self.assertEqual(bus.opened, [infos[1]["path"]])
                self.assertEqual(bus.closed, 1)

    def test_alternate_one_write_budget_and_failed_poll_never_refreshes_cache(self):
        infos = alternate_inventory()
        provider = M.MchoseProvider()
        with fixture([CHARGING], infos):
            self.assertTrue(provider.poll()[0].online)
        before = dict(provider._last)
        for fail in (None, "open", "write", "short", "read"):
            with self.subTest(fail=fail), fixture([BUSY], infos, fail) as bus:
                stale, = provider.poll()
                self.assertFalse(stale.online)
                self.assertEqual(provider._last, before)
                self.assertEqual(bus.opened, [infos[1]["path"]])
                self.assertEqual(bus.sent, [] if fail == "open" else [REQUEST])
                self.assertEqual(bus.closed, 1)
        for frames, clock, expected_reads in (([bytes(64)] * 100, 1, 32),
                                              ([bytes(64)] * 100, [0, 0.5, 1.6], 1)):
            kwargs = dict(side_effect=clock) if isinstance(clock, list) else dict(return_value=clock)
            with fixture(frames, infos) as bus, patch.object(M.time, "monotonic", **kwargs):
                self.assertFalse(provider.poll()[0].online)
                self.assertEqual(provider._last, before)
                self.assertEqual((bus.sent, len(bus.reads)), ([REQUEST], expected_reads))
        infos[1]["output_report_sizes"] = None
        with fixture([], infos) as bus:
            self.assertEqual(provider.poll(), [])
            self.assertEqual((bus.opened, bus.sent, bus.reads), ([], [], []))

    def test_1014_user_reply_uses_only_v3_and_the_product_name(self):
        infos = [dict(vendor_id=0x3837, product_id=0x1014, path=f"collection-{n}".encode(),
                      usage_page=page, usage=usage, product_string="generic receiver",
                      input_report_length=64, output_report_length=64,
                      input_report_sizes={"77": 64}, output_report_sizes={"77": 64})
                 for n, (page, usage) in enumerate(((1, 2), (1, 6), (12, 1),
                                                    (0xFF0B, 0xC4), (0xFF01, 1)))]
        self.assertEqual(M.parse_v3(ULTRA_42), (42, False))
        bad_xor = bytearray(ULTRA_42)
        bad_xor[24] ^= 1
        invalid = (bytes(bad_xor), edited(ULTRA_42, **{"20": 101}),
                   edited(ULTRA_42, **{"3": 56}), ULTRA_42[:24], b"")
        for frame in (ULTRA_42,) + invalid:
            with self.subTest(frame=frame), fixture([frame], infos) as bus:
                provider = M.MchoseProvider()
                result = provider.poll()
                self.assertEqual(bus.sent, [REQUEST])
                self.assertEqual(bus.opened, [b"collection-4"])
                self.assertIn("C / 待实机验证", " ".join(provider.diagnostics()))
                self.assertNotIn("#276", " ".join(provider.reader_diagnostics()))
                if frame == ULTRA_42:
                    device, = result
                    self.assertEqual((device.name, device.level, device.charging),
                                     ("generic receiver", 42, False))
                else:
                    self.assertEqual(result, [])

    def test_both_v3_ids_require_report_proof_and_explain_refusals(self):
        for pid in (0x1018, 0x1014):
            for direction in ("input", "output"):
                for sizes in (None, {}, {"76": 64}, {"77": 63}, {"77": 64.0},
                              {"77": 64, "78": True}, {"77": 64, "78": 65}):
                    infos = [dict(d, **{direction + "_report_sizes": sizes,
                                       direction + "_report_proof": "failed",
                                       "report_descriptor_error": "get_report_descriptor unavailable"})
                             for d in inventory(pid)]
                    with self.subTest(pid=pid, direction=direction, sizes=sizes), fixture([], infos) as bus:
                        provider = M.MchoseProvider()
                        self.assertEqual(provider.poll(), [])
                        self.assertEqual((bus.opened, bus.sent), ([], []))
                        diagnostic = " ".join(provider.reader_diagnostics())
                        self.assertIn(direction + " report 4D/64 length unproven", diagnostic)
                        self.assertIn("proof=caps+descriptor failed", diagnostic)
                        self.assertIn("descriptor=get_report_descriptor unavailable", diagnostic)
                        self.assertIn("not opened; nothing sent", diagnostic)

    def test_v3_ambiguous_collection_and_missing_path_never_open(self):
        info = next(d for d in inventory(0x1014) if d["usage_page"] == 0xFF01)
        for infos, reason in (([info, dict(info, path=b"duplicate")], "ambiguous"),
                              ([dict(info, path=b"")], "path unresolved")):
            with self.subTest(reason=reason), fixture([], infos) as bus:
                provider = M.MchoseProvider()
                self.assertEqual(provider.poll(), [])
                self.assertIn(reason, " ".join(provider.reader_diagnostics()))
                self.assertEqual((bus.opened, bus.sent), ([], []))

    def test_request_and_upstream_power_vectors(self):
        self.assertEqual(M.make_v3_request(), REQUEST)
        self.assertEqual(M.parse_v3(DISCHARGING), (87, False))
        self.assertEqual(M.parse_v3(CHARGING), (85, True))
        for level in (0, 100):
            self.assertEqual(M.parse_v3(edited(**{"20": level})), (level, False))

    def test_checksum_free_reply_and_nonzero_charging(self):
        self.assertEqual(M.parse_v3(edited(**{"2": 0})), (87, False))
        self.assertEqual(M.parse_v3(edited(**{"19": 2})), (87, True))

    def test_invalid_frames_and_disconnected_mouse_are_not_readings(self):
        broken_checksum = bytearray(DISCHARGING)
        broken_checksum[22] ^= 1
        cases = [b"", bytes(64), DISCHARGING[:63], DISCHARGING + b"\0",
                 DISCHARGING[1:], bytes(broken_checksum), REQUEST, BUSY, REFUSAL]
        cases += [edited(**{str(offset): value}) for offset, value in (
            (0, 0x11), (1, 2), (2, 2), (3, 13), (3, 56), (3, 255),
            (4, 1), (5, 0), (8, 0x53), (9, 0x52), (18, 0), (20, 101))]
        for frame in cases:
            with self.subTest(frame=frame.hex()):
                self.assertIsNone(M.parse_v3(frame))

    def test_only_power_is_sent_to_the_exact_collection(self):
        for reply, expected in ((DISCHARGING, (87, False)), (CHARGING, (85, True))):
            with self.subTest(expected=expected), fixture([reply]) as bus:
                provider = M.MchoseProvider()
                device, = provider.poll()
                self.assertEqual((device.level, device.charging), expected)
                self.assertEqual((device.name, device.online, device.source, device.kind),
                                 ("MCHOSE A7 V3 Pro", True, "mchose", "mouse"))
                self.assertIsNone(device.dpi)
                self.assertEqual(bus.sent, [REQUEST])
                self.assertEqual(bus.opened, [next(d["path"] for d in inventory()
                                                  if d["usage_page"] == 0xFF01)])
                self.assertEqual(bus.closed, 1)
                self.assertTrue(all(size == 64 and 0 < timeout <= 1500 for size, timeout in bus.reads))
                self.assertIn("待实机验证", "\n".join(provider.diagnostics()))

    def test_names_use_sibling_strings_and_never_reply_pid(self):
        for pid, product, fallback in (
                (0x1014, "MCHOSE K7 V2 Ultra+", "MCHOSE A7 V3 Ultra+"),
                (0x1018, "MCHOSE A5 V3 Ultra+(3955)", "MCHOSE V3 8K 接收器")):
            infos = inventory(pid)
            infos[0]["product_string"] = " " + product + " "
            for info in infos[1:]:
                info["product_string"] = " "
            with self.subTest(pid=pid, product=product), fixture([CHARGING], infos) as bus:
                provider = M.MchoseProvider()
                self.assertEqual(provider.poll()[0].name, product)
                self.assertEqual(bus.sent, [REQUEST])
                self.assertNotIn(product, " ".join(provider.reader_diagnostics()))
                self.assertNotIn("#276", " ".join(provider.reader_diagnostics()))
            for blank in ("", "   ", None):
                for info in infos:
                    info["product_string"] = blank
                with self.subTest(pid=pid, blank=blank), fixture([CHARGING], infos) as bus:
                    self.assertEqual(M.MchoseProvider().poll()[0].name, fallback)
                    self.assertEqual(bus.sent, [REQUEST])

    def test_unknown_or_wrong_lengths_never_open_or_send(self):
        for field in ("input_report_length", "output_report_length"):
            for length in (None, 0, 63, 65, 128):
                infos = [dict(d, **{field: length}) for d in inventory()]
                with self.subTest(field=field, length=length), fixture([CHARGING], infos) as bus:
                    self.assertEqual(M.MchoseProvider().poll(), [])
                    self.assertEqual((bus.opened, bus.sent), ([], []))

    def test_wrong_collection_or_vendor_never_uses_v3(self):
        for changes in ({"usage_page": 0xFF0B}, {"usage": 2}, {"vendor_id": 0x9999}):
            infos = [dict(d, **changes) for d in inventory()]
            with self.subTest(changes=changes), fixture([CHARGING], infos) as bus:
                self.assertEqual(M.MchoseProvider().poll(), [])
                self.assertEqual((bus.opened, bus.sent), ([], []))

    def test_bad_or_unrelated_input_can_precede_valid_answer(self):
        with fixture([bytes(64), edited(**{"4": 0xF0}), CHARGING]) as bus:
            self.assertEqual(M.MchoseProvider().poll()[0].level, 85)
            self.assertEqual(bus.sent, [REQUEST])
            self.assertEqual(len(bus.reads), 3)

    def test_invalid_reply_busy_refusal_and_silence_never_try_v2_or_siblings(self):
        for frames in ([], [BUSY], [REFUSAL], [REQUEST], [bytes(64)],
                       [edited(**{"18": 0})], [edited(**{"20": 101})]):
            with self.subTest(frames=frames), fixture(frames) as bus:
                self.assertEqual(M.MchoseProvider().poll(), [])
                self.assertEqual(bus.sent, [REQUEST])
                self.assertEqual(len(bus.opened), 1)
                self.assertEqual(bus.closed, 1)

    def test_io_errors_and_short_writes_close_without_fallback(self):
        for fail in ("open", "write", "short", "read"):
            with self.subTest(fail=fail), fixture([CHARGING], fail=fail) as bus:
                self.assertEqual(M.MchoseProvider().poll(), [])
                self.assertEqual(bus.closed, 1)
                self.assertEqual(bus.sent, [] if fail == "open" else [REQUEST])
                if fail != "read":
                    self.assertEqual(bus.reads, [])

    def test_input_noise_has_a_read_limit_and_a_deadline(self):
        with fixture([bytes(64)] * 100) as bus, patch.object(M.time, "monotonic", return_value=1):
            self.assertEqual(M.MchoseProvider().poll(), [])
            self.assertEqual(len(bus.reads), 32)
            self.assertEqual(bus.sent, [REQUEST])
        with fixture([bytes(64)] * 100) as bus, \
                patch.object(M.time, "monotonic", side_effect=[0, 0.5, 1.6]):
            self.assertEqual(M.MchoseProvider().poll(), [])
            self.assertEqual(bus.reads, [(64, 1000)])

    def test_silence_keeps_only_offline_cache_and_lost_caps_drop_it(self):
        with fixture([CHARGING]) as bus:
            provider = M.MchoseProvider()
            self.assertTrue(provider.poll()[0].online)
            cached, = provider.poll()
            self.assertEqual((cached.level, cached.online), (85, False))
            self.assertEqual(bus.sent, [REQUEST, REQUEST])
        infos = [dict(d, output_report_length=None) for d in inventory()]
        with fixture([], infos) as bus:
            self.assertEqual(provider.poll(), [])
            self.assertEqual(bus.sent, [])

    def test_v3_and_v2_have_separate_keys(self):
        self.assertEqual(len({M.device_key(0x3837, pid) for pid in (0x1018, 0x1014, 0x100B)}), 3)


if __name__ == "__main__":
    unittest.main()
