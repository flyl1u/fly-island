"""Synthetic QHW/GLW HID fixtures. Never enumerate or open physical hardware."""
from contextlib import contextmanager
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
import server
import mchose_keyboard_hid as H
from providers import mchose, mchose_qhw_keyboard as Q, mchose_glw_keyboard as G


def entry(protocol="qhw", physical="receiver-a", **changes):
    qhw = protocol == "qhw"
    info = dict(vendor_id=0x3837, product_id=0x1015 if qhw else 0x3033,
                product_string="MCHOSE G98 V3 2.4G" if qhw else "MCHOSE G87 V2 2.4G",
                usage_page=0xFF80 if qhw else 1, usage=1 if qhw else 0,
                input_report_length=32 if qhw else 65,
                output_report_length=16 if qhw else 65,
                input_report_ids=[0x4D] if qhw else [0],
                output_report_ids=[0x4D] if qhw else [0],
                path=(physical + "-" + protocol).encode(), physical_id=physical)
    info.update(changes)
    return info


def qhw_reply(level=73, charge=0, sequence=0, size=32):
    # checkCode is deliberately not a presumed XOR: its algorithm is unknown.
    return [0x4D, 1, 3, 2, 4, 9, 0, sequence, charge, level, 0xA9] + [0] * (size - 11)


def glw_reply(command, offset, data, report_id=0, size=65):
    payload = [0xAA, command, 0, 0xA9, len(data), offset & 255, offset >> 8, 0] + list(data)
    payload += [0] * (size - 1 - len(payload))
    return ([report_id] if report_id else []) + payload


def glw_frames(level=73, charging=False, index=0, slots=(0, 1, 2, 3), report_id=0):
    base = [index, 0, *slots] + [0] * 50
    profile = slots[index] if sorted(slots) == [0, 1, 2, 3] else index
    config = [0] * 64
    config[32] = level | (0x80 if charging else 0)
    return [glw_reply(4, 0, base, report_id),
            glw_reply(5, 64 * profile, config[:56], report_id),
            glw_reply(5, 64 * profile + 56, config[56:], report_id)]


class FakeHid:
    def __init__(self, frames=(), write_result=None, read_ms=10):
        self.frames = list(frames)
        self.write_result, self.read_ms = write_result, read_ms
        self.now = 0.0
        self.opened, self.closed, self.writes, self.reads = [], [], [], []

    def device(self):
        bus = self

        class Handle:
            def open_path(self, path):
                self.path = path
                bus.opened.append(path)

            def write(self, data):
                bus.writes.append((self.path, list(data)))
                return len(data) if bus.write_result is None else bus.write_result

            def read(self, size, timeout):
                bus.reads.append((self.path, size, timeout))
                bus.now += (min(bus.read_ms, timeout) if bus.frames else timeout) / 1000
                value = bus.frames.pop(0) if bus.frames else []
                if isinstance(value, Exception):
                    raise value
                return value

            def close(self):
                bus.closed.append(self.path)

        # No feature/setting APIs: accidental calls fail these fixtures.
        return Handle()


@contextmanager
def fixture(protocol="qhw", frames=(), inventory=None, **kwargs):
    bus = FakeHid(frames, **kwargs)
    infos = [entry(protocol)] if inventory is None else inventory
    with patch.object(H, "hid", bus), patch.object(H.hidlist, "enumerate", return_value=infos), \
            patch.object(H, "time", SimpleNamespace(monotonic=lambda: bus.now)):
        yield bus


CASES = (("qhw", Q.MchoseQhwKeyboardProvider), ("glw", G.MchoseGlwKeyboardProvider))


class KeyboardMatchingTests(unittest.TestCase):
    def test_every_required_identity_field_is_mandatory(self):
        for protocol, factory in CASES:
            for field in ("vendor_id", "product_id", "product_string", "usage_page", "usage", "path",
                          "input_report_length", "output_report_length", "input_report_ids", "output_report_ids"):
                info = entry(protocol)
                del info[field]
                with self.subTest(protocol=protocol, field=field), fixture(protocol, inventory=[info]) as bus:
                    provider = factory()
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual(bus.opened, [])
                    self.assertEqual(bus.writes, [])
                    self.assertIn("nothing sent", " ".join(provider.diagnostics()))

    def test_wrong_identity_and_all_other_collections_never_open(self):
        mutations = [dict(vendor_id=0x5253), dict(product_id=0x9999),
                     dict(product_string="MCHOSE K99 V3 2.4G"),
                     dict(product_string="MCHOSE G87 V2 2.4G "),
                     dict(usage_page=0xFF31, usage=0x74), dict(usage_page=0xFF70, usage=0x71),
                     dict(usage_page=0xFF81, usage=1), dict(usage_page=1, usage=6),
                     dict(usage_page=1, usage=2), dict(usage_page=0x0C, usage=1)]
        for protocol, factory in CASES:
            for mutation in mutations:
                with self.subTest(protocol=protocol, mutation=mutation), fixture(
                        protocol, inventory=[entry(protocol, **mutation)]) as bus:
                    self.assertEqual(factory().poll(), [])
                    self.assertEqual(bus.opened, [])

    def test_unknown_wrong_or_ambiguous_caps_never_send(self):
        for protocol, factory in CASES:
            for mutation in (dict(input_report_length=None), dict(output_report_length=None),
                             dict(input_report_length=10), dict(output_report_length=8),
                             dict(input_report_length=4097), dict(output_report_length=4097),
                             dict(input_report_ids=[]), dict(output_report_ids=[]),
                             dict(input_report_ids=[0, 0x4D]), dict(output_report_ids=[0, 0x4D]),
                             dict(output_report_ids=[0x33]), dict(input_report_ids=[256])):
                with self.subTest(protocol=protocol, mutation=mutation), fixture(
                        protocol, inventory=[entry(protocol, **mutation)]) as bus:
                    self.assertEqual(factory().poll(), [])
                    self.assertEqual(bus.writes, [])
                    self.assertEqual(bus.opened, [])
        for length in (64, 66):
            with fixture("glw", inventory=[entry("glw", output_report_length=length)]) as bus:
                self.assertEqual(G.MchoseGlwKeyboardProvider().poll(), [])
                self.assertEqual(bus.opened, [])
        with fixture(inventory=[entry(input_report_ids=[0])]) as bus:
            self.assertEqual(Q.MchoseQhwKeyboardProvider().poll(), [])
            self.assertEqual(bus.opened, [])

    def test_duplicate_eligible_collections_reject_even_if_one_has_bad_caps(self):
        for protocol, factory in CASES:
            for other in ({}, {"input_report_length": None}):
                with self.subTest(protocol=protocol, other=other), fixture(protocol, inventory=[
                        entry(protocol), entry(protocol, path=b"second", **other)]) as bus:
                    self.assertEqual(factory().poll(), [])
                    self.assertEqual(bus.opened, [])

    def test_wrong_collection_does_not_receive_valid_query(self):
        for protocol, factory in CASES:
            frames = [qhw_reply()] if protocol == "qhw" else glw_frames()
            with self.subTest(protocol=protocol), fixture(protocol, frames, [
                    entry(protocol, path=b"wrong", usage_page=0xFF31, usage=0x74), entry(protocol)]) as bus:
                status, = factory().poll()
                self.assertEqual(status.level, 73)
                self.assertEqual(bus.opened, [entry(protocol)["path"]])

    def test_two_proven_physical_receivers_stay_separate(self):
        for protocol, factory in CASES:
            frames = [qhw_reply(20), qhw_reply(90, sequence=1)] if protocol == "qhw" else glw_frames(20) + glw_frames(90)
            with self.subTest(protocol=protocol), fixture(protocol, frames,
                    [entry(protocol, "one"), entry(protocol, "two")]):
                statuses = factory().poll()
                self.assertEqual([s.level for s in statuses], [20, 90])
                self.assertEqual(len({s.key for s in statuses}), 2)

    def test_unresolved_multiple_candidates_are_not_assumed_separate_devices(self):
        for protocol, factory in CASES:
            for physical in ("", "collection:unknown"):
                with self.subTest(protocol=protocol, physical=physical), fixture(protocol, inventory=[
                        entry(protocol, physical, path=b"one"), entry(protocol, physical, path=b"two")]) as bus:
                    self.assertEqual(factory().poll(), [])
                    self.assertEqual(bus.opened, [])

    def test_mouse_fallback_is_blocked_for_both_pids_on_every_collection(self):
        inventory = [entry(protocol, usage_page=page, product_string="unknown")
                     for protocol, _ in CASES for page in (0xFF31, 0xFF70, 0xFF80, 0xFF81)]
        with patch.object(mchose.hidlist, "enumerate", return_value=inventory), \
                patch.object(mchose.MchoseProvider, "_read_collection") as read:
            self.assertEqual(mchose.MchoseProvider().poll(), [])
            read.assert_not_called()


class QhwProtocolTests(unittest.TestCase):
    def test_level_charge_full_and_exact_read_only_request(self):
        for level in (0, 1, 73, 100):
            for charge in (0, 1, 2):
                with self.subTest(level=level, charge=charge), fixture(frames=[qhw_reply(level, charge)]) as bus:
                    provider = Q.MchoseQhwKeyboardProvider()
                    status, = provider.poll()
                    self.assertEqual((status.level, status.charging, status.kind), (level, charge == 1, "keyboard"))
                    self.assertTrue(status.charging_known)
                    self.assertEqual(bus.writes[0][1], [0x4D, 1, 3, 0, 4, 9, 0, 0, 0x0E] + [0] * 7)
                    self.assertEqual(bus.closed, bus.opened)
                    self.assertIn("checksum unconfirmed", " ".join(provider.diagnostics()))

    def test_actual_descriptor_lengths_drive_io_not_the_sdk_maximum(self):
        for inp, out in ((11, 9), (65, 65)):
            with self.subTest(inp=inp, out=out), fixture(frames=[qhw_reply(size=inp)], inventory=[
                    entry(input_report_length=inp, output_report_length=out)]) as bus:
                self.assertEqual(len(Q.MchoseQhwKeyboardProvider().poll()), 1)
                self.assertEqual(len(bus.writes[0][1]), out)
                self.assertEqual(bus.reads[0][1], inp)

    def test_sequence_echo_changes_and_wraps(self):
        provider = Q.MchoseQhwKeyboardProvider()
        provider.sequence = 255
        for seq in (255, 0, 1):
            with self.subTest(seq=seq), fixture(frames=[qhw_reply(sequence=seq)]) as bus:
                self.assertEqual(len(provider.poll()), 1)
                self.assertEqual(bus.writes[0][1][7:9], [seq, 0x0E ^ seq])

    def test_rejects_all_header_misalignments_and_out_of_range_fields(self):
        bad = [qhw_reply()[:-1], qhw_reply() + [0], qhw_reply()[1:], [0] + qhw_reply()[:-1]]
        for index, value in ((0, 0x4E), (1, 2), (2, 1), (3, 3), (4, 5), (5, 8),
                             (6, 1), (7, 1), (8, 3), (9, 101), (9, 255)):
            frame = qhw_reply()
            frame[index] = value
            bad.append(frame)
        for frame in bad:
            with self.subTest(frame=frame[:11], length=len(frame)), fixture(frames=[frame]):
                self.assertEqual(Q.MchoseQhwKeyboardProvider().poll(), [])
        with fixture(frames=bad + [qhw_reply()]) as bus:
            self.assertEqual(len(Q.MchoseQhwKeyboardProvider().poll()), 1)
            self.assertEqual(len(bus.writes), 1)


class GlwProtocolTests(unittest.TestCase):
    def test_levels_charging_and_exact_three_read_only_commands(self):
        for level in (0, 1, 73, 100):
            for charging in (False, True):
                with self.subTest(level=level, charging=charging), fixture("glw", glw_frames(level, charging)) as bus:
                    status, = G.MchoseGlwKeyboardProvider().poll()
                    self.assertEqual((status.level, status.charging, status.kind), (level, charging, "keyboard"))
                    expected = [[0, 0x55, 4, 0, 0x38, 0x38, 0, 0, 0],
                                [0, 0x55, 5, 0, 0x38, 0x38, 0, 0, 0],
                                [0, 0x55, 5, 0, 0x40, 8, 0x38, 0, 0]]
                    self.assertEqual([data for _, data in bus.writes], [head + [0] * 56 for head in expected])
                    self.assertEqual([size for _, size, _ in bus.reads], [64] * 3)

    def test_active_slot_permutation_and_legacy_direct_indices(self):
        for slots in ((2, 0, 3, 1), (0, 0, 0, 0)):
            for index in range(4):
                profile = slots[index] if slots[0] == 2 else index
                with self.subTest(slots=slots, index=index), fixture("glw", glw_frames(index=index, slots=slots)) as bus:
                    self.assertEqual(len(G.MchoseGlwKeyboardProvider().poll()), 1)
                    self.assertEqual([data[6:8] for _, data in bus.writes],
                                     [[0, 0], [64 * profile, 0], [64 * profile + 56, 0]])

    def test_input_id_is_learned_not_assumed(self):
        with fixture("glw", glw_frames(report_id=7), [entry("glw", input_report_ids=[7])]) as bus:
            self.assertEqual(len(G.MchoseGlwKeyboardProvider().poll()), 1)
            self.assertEqual([size for _, size, _ in bus.reads], [65] * 3)
        for frames in (glw_frames(report_id=7), glw_frames()):
            with fixture("glw", frames):
                statuses = G.MchoseGlwKeyboardProvider().poll()
                self.assertEqual(len(statuses), 0 if frames[0][0] == 7 else 1)

    def test_bad_profile_never_repairs_or_reads_configuration(self):
        for index in (4, 255):
            frame = glw_frames()[0]
            frame[8] = index
            with self.subTest(index=index), fixture("glw", [frame]) as bus:
                provider = G.MchoseGlwKeyboardProvider()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(len(bus.writes), 1)
                self.assertEqual(bus.writes[0][1][2], 4)
                self.assertIn("no automatic repair", " ".join(provider.diagnostics()))

    def test_incomplete_or_misaligned_response_at_every_stage_is_rejected(self):
        for stage in range(3):
            for fault in ("short", "long", "logical_only", "marker", "command", "offset_low", "offset_high", "declared"):
                frames = glw_frames()
                frame = frames[stage]
                if fault == "short":
                    frames[stage] = frame[:-1]
                elif fault == "long":
                    frames[stage] = frame + [0]
                elif fault == "logical_only":
                    frames[stage] = frame[:16]
                else:
                    field = {"marker": 0, "command": 1, "offset_low": 5, "offset_high": 6, "declared": 4}[fault]
                    frame[field] ^= 1
                # End the stream at the faulty reply so subsequent stages cannot
                # accidentally be treated as an answer to this request.
                with self.subTest(stage=stage, fault=fault), fixture("glw", frames[:stage + 1]) as bus:
                    self.assertEqual(G.MchoseGlwKeyboardProvider().poll(), [])
                    self.assertEqual(len(bus.writes), stage + 1)

    def test_invalid_percentage_never_becomes_zero(self):
        for level in (101, 127):
            for charge in (False, True):
                with self.subTest(level=level, charge=charge), fixture("glw", glw_frames(level, charge)):
                    self.assertEqual(G.MchoseGlwKeyboardProvider().poll(), [])

    def test_command_builder_cannot_construct_writes_or_other_reads(self):
        for command in range(256):
            if command not in (4, 5):
                with self.subTest(command=command), self.assertRaises(ValueError):
                    G.make_request(command, 0, 56)
        for args in ((4, 64, 56), (4, 0, 8), (5, 256, 56), (5, 0, 64), (5, 1, 56)):
            with self.subTest(args=args), self.assertRaises(ValueError):
                G.make_request(*args)


class KeyboardIoTests(unittest.TestCase):
    def test_short_writes_never_read_or_retry(self):
        for protocol, factory in CASES:
            for size in (-1, 0, entry(protocol)["output_report_length"] - 1):
                with self.subTest(protocol=protocol, size=size), fixture(protocol, write_result=size) as bus:
                    self.assertEqual(factory().poll(), [])
                    self.assertEqual(len(bus.writes), 1)
                    self.assertEqual(bus.reads, [])
                    self.assertEqual(bus.closed, bus.opened)

    def test_silence_or_read_failure_returns_no_measurement(self):
        for protocol, factory in CASES:
            for frames in ([], [OSError("private path should not leak")]):
                with self.subTest(protocol=protocol, frames=frames), fixture(protocol, frames) as bus:
                    provider = factory()
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual(bus.closed, bus.opened)
                    self.assertNotIn("private path", " ".join(provider.diagnostics()))

    def test_noise_cannot_extend_deadline_or_read_limit(self):
        for protocol, factory in CASES:
            for delay in (0, 240):
                with self.subTest(protocol=protocol, delay=delay), fixture(protocol, [[0] * 5] * 100, read_ms=delay) as bus:
                    self.assertEqual(factory().poll(), [])
                    self.assertLessEqual(bus.now, 1.001)
                    self.assertLessEqual(len(bus.reads), 32 if delay == 0 else 5)
                    self.assertTrue(all(0 < timeout <= 1000 for _, _, timeout in bus.reads))


class KeyboardHealthTests(unittest.TestCase):
    def test_glw_and_qhw_health_summaries_project_product_mismatch_and_reasons(self):
        engine = server.BatteryEngine([], include_native=True)
        self.addCleanup(engine.close)
        for name, lines, expected in (
                ("mchose_glw_keyboard",
                 ["exact product name mismatch or missing: nothing sent",
                  "missing or ambiguous eligible collection: nothing sent"],
                 "product name mismatch"),
                ("mchose_qhw_keyboard",
                 ["collection mismatch or missing: nothing sent on this collection",
                  "report IDs unknown, ambiguous or incompatible: nothing sent"],
                 "report IDs unproven")):
            with self.subTest(name=name):
                engine._accept("r", name, [], server.utcnow(), "receiver-a", 1,
                               diagnostics=lines)
                self.assertEqual(engine._snapshot()["health"][0]["errorCode"], expected)


if __name__ == "__main__":
    unittest.main()
