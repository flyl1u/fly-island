"""Synthetic offline OMNI fixtures, not captured hardware replies."""
from contextlib import contextmanager
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ENGINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE))
sys.path.insert(0, str(ENGINE / "tests"))
import _hidstub  # noqa: F401 -- before importing any provider
from providers import asus_omni as A

P = A.AsusOmniProvider
# Independent literal oracle; never built from provider constants/functions.
REQUEST = bytes.fromhex("03 12 07") + bytes(61)


def entry(physical="receiver-a", **changes):
    info = dict(vendor_id=0x0B05, product_id=0x1ACE, interface_number=2,
                usage_page=0xFF01, usage=1, physical_id=physical,
                path=(r"\\?\hid#vid_0b05&pid_1ace&mi_02&col03#" + physical).encode(),
                input_report_length=64, output_report_length=64,
                input_report_sizes={"3": 64}, output_report_sizes={"3": 64},
                input_report_proof="caps", output_report_proof="caps")
    info.update(changes)
    return info


def reply(level=77, charging=0):
    frame = [0] * 64
    frame[:3] = [3, 0x12, 7]
    # Adjacent bytes deliberately differ from the battery/charging fields.
    frame[4], frame[5], frame[6], frame[9], frame[10] = 31, level, 91, 0, charging
    return frame


class FakeBus:
    def __init__(self, frames, error_at="", error_type=OSError, written=64):
        self.frames = list(frames)
        self.error_at, self.error_type, self.written = error_at, error_type, written
        self.calls, self.opened, self.closed, self.writes, self.reads = [], [], [], [], []
        self.forbidden = []

    def fail(self, stage):
        if self.error_at == stage:
            raise self.error_type("synthetic-private-detail")

    def device(self):
        self.calls.append("device")
        self.fail("device")
        bus = self

        class Device:
            path = None

            def open_path(self, path):
                self.path = path
                bus.calls.append("open_path")
                bus.opened.append(path)
                bus.fail("open")

            def write(self, data):
                bus.calls.append("write")
                bus.writes.append((self.path, bytes(data)))
                bus.fail("write")
                return bus.written

            def read(self, length, timeout):
                bus.calls.append("read")
                bus.reads.append((self.path, length, timeout))
                bus.fail("read")
                return bus.frames.pop(0) if bus.frames else []

            def close(self):
                bus.calls.append("close")
                bus.closed.append(self.path)
                bus.fail("close")

            def __getattr__(self, name):
                def forbidden(*args, **kwargs):
                    bus.forbidden.append(name)
                    raise AssertionError("unexpected HID method: " + name)
                return forbidden

        return Device()


@contextmanager
def fixture(frames=(), inventory=None, **options):
    bus = FakeBus(frames, **options)
    with patch.object(A, "hid", SimpleNamespace(device=bus.device)), \
            patch.object(A.hidlist, "enumerate", return_value=[entry()] if inventory is None else inventory):
        try:
            yield bus
        finally:
            if bus.forbidden:
                raise AssertionError("forbidden HID calls: " + repr(bus.forbidden))
            for _, data in bus.writes:
                if (data != REQUEST or len(data) != 64
                        or data.startswith(bytes.fromhex("01 A0"))
                        or data.startswith(bytes.fromhex("03 7D"))):
                    raise AssertionError("only the literal battery query is allowed")
            if any((length, timeout) != (64, 300) for _, length, timeout in bus.reads):
                raise AssertionError("unexpected read budget")


class AsusOmniTests(unittest.TestCase):
    def rejected(self, infos, reason):
        with fixture([reply()], infos) as bus:
            provider = P()
            self.assertEqual(provider.poll(), [])
            self.assertEqual(bus.calls, [])
            self.assertEqual(provider.diagnostics(), [reason])

    def test_exact_request_reply_fields_and_grade_c_mouse(self):
        self.assertEqual(bytes(A.make_request()), REQUEST)
        for container in (bytes, bytearray, list, tuple):
            for level, charging in ((1, 0), (77, 1), (100, 2), (85, 255)):
                with self.subTest(container=container, level=level, charging=charging), \
                        fixture([container(reply(level, charging))]) as bus:
                    self.assertEqual(A.parse_reply(container(reply(level, charging))), (level, charging > 0, ""))
                    status, = P().poll()
                    self.assertEqual((status.name, status.level, status.charging, status.source, status.kind),
                                     ("ROG OMNI 接收器（鼠标）", level, charging > 0, "asus_omni", "mouse"))
                    self.assertTrue(status.connection_known and status.charging_known)
                    self.assertEqual((status.physical_id, status.verification_level), ("receiver-a", "C"))
                    self.assertFalse(status.cached)
                    self.assertIsNone(status.dpi)
                    self.assertEqual(bus.writes, [(entry()["path"], REQUEST)])
                    self.assertEqual(bus.reads, [(entry()["path"], 64, 300)])
                    self.assertEqual(bus.calls, ["device", "open_path", "write", "read", "close"])

    def test_charging_depends_only_on_byte10(self):
        frame = reply(charging=0)
        frame[9] = 255
        self.assertEqual(A.parse_reply(frame), (77, False, ""))

    def test_wrong_vid_pid_and_noninteger_identity_never_open(self):
        cases = [dict(vendor_id=0x0B06), dict(product_id=0x1ACF)]
        for field in ("vendor_id", "product_id"):
            cases += [{field: n} for n in (None, True, "0B05", [], {}, float(entry()[field]))]
        for changes in cases:
            with self.subTest(changes=changes):
                self.rejected([entry(**changes)], "OMNI identity mismatch; not opened")

    def test_exact_route_and_usage_no_other_collection_fallback(self):
        cases = [dict(usage_page=page) for page in (0xFF00, 0xFF02, 0xFFC0, 0x0059, 1)]
        cases += [dict(usage=value) for value in (0, 2, True, 1.0, None)]
        cases += [dict(interface_number=n) for n in (0, 1, 3, True, 2.0, None)]
        cases += [dict(path=entry()["path"].replace(old, new)) for old, new in (
            (b"mi_02", b"mi_01"), (b"col03", b"col01"), (b"col03", b"col02"),
            (b"col03", b"col030"), (b"col03", b"col03suffix"))]
        cases += [dict(path=value) for value in (None, b"", " ", b"bad\xff", 64, [], {},
                   b"mi_02&col03", b"hid#vendor#instance&mi_02&col03", entry()["path"] + b"\0")]
        for changes in cases:
            with self.subTest(changes=changes):
                self.rejected([entry(**changes)], "OMNI collection mismatch; not opened")
        # The presence of every alternative route cannot rescue a missing Col03.
        self.rejected([entry(usage_page=page) for page in (0xFF00, 0xFF02, 0xFFC0, 0x0059)],
                      "OMNI collection mismatch; not opened")

    def test_route_case_insensitive_bytes_or_string(self):
        for path in (entry()["path"].upper(), entry()["path"].decode().upper()):
            with fixture([reply()], [entry(path=path)]) as bus:
                self.assertEqual(len(P().poll()), 1)
                self.assertEqual(bus.opened, [path])

    def test_missing_fields_never_open(self):
        for field in entry():
            info = entry()
            del info[field]
            with self.subTest(field=field), fixture([reply()], [info]) as bus:
                provider = P()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(bus.calls, [])
                self.assertTrue(provider.diagnostics())

    def test_parent_must_be_proven_and_nonempty(self):
        for physical in (None, "", " ", 1, True, [], {}, "collection:x", "COLLECTION:x"):
            with self.subTest(physical=physical):
                self.rejected([entry(physical_id=physical)], "OMNI USB parent unproven; not opened")

    def test_each_input_output_id_length_and_proof_gate_never_uses_maximum_alone(self):
        cases = []
        for direction in ("input", "output"):
            cases += [{direction + "_report_length": n} for n in (None, 0, 63, 4097, True, "64", 64.0)]
            cases += [{direction + "_report_sizes": sizes} for sizes in (
                None, {}, [], {3: 64}, {"03": 64}, {"3": 63}, {"3": 65}, {"4": 64},
                {"3": True}, {"3": 64.0}, {"3": "64"}, {"3": 64, "4": 65}, {"3": 64, "raw": 2})]
            cases += [{direction + "_report_proof": proof} for proof in (None, "failed", "maximum", [], {})]
            cases += [{direction + "_report_sizes": None, direction + "_report_proof": "descriptor",
                       "declared_report_sizes": {direction: {"3": 64}}}]
        for changes in cases:
            with self.subTest(changes=changes):
                self.rejected([entry(**changes)], "OMNI report 03/64 unproven; not opened")

    def test_other_proven_ids_do_not_replace_or_change_report03_length(self):
        info = entry(input_report_length=96, input_report_sizes={"3": 64, "4": 96},
                     output_report_length=96, output_report_sizes={"3": 64, "5": 96})
        for proof in ("caps", "descriptor"):
            info.update(input_report_proof=proof, output_report_proof=proof)
            with fixture([reply()], [info]) as bus:
                self.assertEqual(len(P().poll()), 1)
                self.assertEqual(bus.reads, [(info["path"], 64, 300)])

    def test_ambiguous_routes_refused_even_if_one_lacks_proof(self):
        for changes in ({}, dict(input_report_sizes=None), dict(output_report_sizes={"4": 64})):
            with self.subTest(changes=changes):
                self.rejected([entry(), entry(path=entry()["path"] + b"-second", **changes)],
                              "OMNI collection ambiguous; not opened")

    def test_valid_route_does_not_open_alternative_collections(self):
        infos = [entry()]
        infos += [entry(usage_page=page, path=entry()["path"].replace(b"col03", b"col02"))
                  for page in (0xFF00, 0xFF02, 0xFFC0, 0x0059)]
        with fixture([reply()], infos) as bus:
            self.assertEqual(len(P().poll()), 1)
            self.assertEqual(bus.opened, [entry()["path"]])

    def test_skip_other_reports_until_reads_two_three_or_four(self):
        other = reply()
        other[1:3] = [0x12, 8]
        for index in (2, 3, 4):
            with self.subTest(index=index), fixture([other] * (index - 1) + [reply()]) as bus:
                self.assertEqual(len(P().poll()), 1)
                self.assertEqual(len(bus.reads), index)
                self.assertEqual(len(bus.writes), 1)

    def test_fifth_packet_cannot_be_read_and_request_is_not_retried(self):
        other = reply()
        other[0] = 2
        with fixture([other] * 4 + [reply()]) as bus:
            provider = P()
            self.assertEqual(provider.poll(), [])
            self.assertEqual(provider.diagnostics(), ["OMNI no echo within read limit"])
            self.assertEqual((len(bus.reads), len(bus.writes), len(bus.frames)), (4, 1, 1))

    def test_timeout_stops_immediately_even_with_a_later_valid_frame(self):
        for timeout in ([], None, b""):
            with self.subTest(timeout=timeout), fixture([timeout, reply()]) as bus:
                provider = P()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.diagnostics(), ["OMNI no echo within read limit"])
                self.assertEqual((len(bus.reads), len(bus.writes), len(bus.frames)), (1, 1, 1))

    def test_device_error_empty_and_zero_or_out_of_range_never_create_reading(self):
        error, empty = reply(), reply()
        error[1:3], empty[1:4] = [0xFF, 0xAA], [0, 0, 0]
        cases = [(error, "OMNI device error FF AA"), (empty, "OMNI empty reply or asleep; no new reading"),
                 ([0] * 64, "OMNI empty reply or asleep; no new reading"),
                 (reply(0, 0), "OMNI zero battery; no new reading"),
                 (reply(0, 1), "OMNI zero battery; no new reading"),
                 (reply(101), "OMNI battery out of range"), (reply(255), "OMNI battery out of range")]
        for frame, reason in cases:
            with self.subTest(reason=reason, frame=frame), fixture([frame, reply()]) as bus:
                self.assertIsNone(A.parse_reply(frame))
                provider = P()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.diagnostics(), [reason])
                self.assertEqual((len(bus.reads), len(bus.writes), len(bus.frames)), (1, 1, 1))

    def test_short_long_wrong_id_and_nonbyte_frames_skipped_not_coerced(self):
        wrong_id = reply()
        wrong_id[0] = 0
        frames = [reply()[:-1], reply() + [0], wrong_id, 64, True, "x" * 64, {}, object()]
        for offset in range(64):
            for value in (None, True, False, -1, 256, 77.0, "77", [], {}):
                frame = reply()
                frame[offset] = value
                frames.append(frame)
        for frame in frames:
            with self.subTest(frame=frame), fixture([frame, reply()]) as bus:
                self.assertIsNone(A.parse_reply(frame))
                self.assertEqual(len(P().poll()), 1)
                self.assertEqual((len(bus.reads), len(bus.writes)), (2, 1))
        for length in (1, 63, 65):
            frame = (reply() + [0])[:length]
            with self.subTest(length=length), fixture([frame] * 4) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual((len(bus.reads), len(bus.writes)), (4, 1))

    def test_short_or_noninteger_write_is_failure_without_read_or_resend(self):
        for written in (None, 0, -1, 63, 65, True, 64.0):
            with self.subTest(written=written), fixture([reply()], written=written) as bus:
                provider = P()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.diagnostics(), ["OMNI battery query write failed; no retry"])
                self.assertEqual((len(bus.writes), len(bus.reads)), (1, 0))

    def test_backend_exceptions_fixed_private_safe_diagnostics_and_close(self):
        reasons = {"device": "OMNI open failed", "open": "OMNI open failed",
                   "write": "OMNI battery query write failed; no retry",
                   "read": "OMNI input read failed", "close": "OMNI HID handle close failed"}
        for stage, reason in reasons.items():
            for error_type in (OSError, ValueError, RuntimeError, TypeError):
                with self.subTest(stage=stage, error_type=error_type), \
                        fixture([reply()], error_at=stage, error_type=error_type) as bus:
                    provider = P()
                    self.assertEqual([s.level for s in provider.poll()], [77] if stage == "close" else [])
                    self.assertEqual(provider.diagnostics(), [reason])
                    self.assertEqual(bus.opened, bus.closed)
                    self.assertLessEqual(len(bus.writes), 1)
                    self.assertNotIn("synthetic-private-detail", str(provider.diagnostics()))

    def test_missing_backend_and_failed_enumeration_do_not_query(self):
        with patch.object(A, "hid", None), patch.object(A.hidlist, "enumerate") as enum:
            provider = P()
            self.assertEqual(provider.poll(), [])
            self.assertEqual(provider.diagnostics(), ["OMNI HID backend unavailable"])
            enum.assert_not_called()
        with fixture() as bus, patch.object(A.hidlist, "enumerate", side_effect=RuntimeError("private")):
            provider = P()
            self.assertEqual(provider.poll(), [])
            self.assertEqual(provider.diagnostics(), ["OMNI enumeration failed"])
            self.assertEqual(bus.calls, [])

    def test_two_parents_two_cards_and_one_request_each_per_poll(self):
        infos = [entry("one"), entry("two")]
        provider = P()
        for _ in range(2):
            with fixture([reply(77), reply(77, 1)], infos) as bus:
                statuses = provider.poll()
                self.assertEqual([s.level for s in statuses], [77, 77])
                self.assertEqual([s.physical_id for s in statuses], ["one", "two"])
                self.assertEqual(len({s.key for s in statuses}), 2)
                self.assertEqual(bus.opened, bus.closed)
                self.assertEqual(bus.writes, [(i["path"], REQUEST) for i in infos])


if __name__ == "__main__":
    unittest.main()
