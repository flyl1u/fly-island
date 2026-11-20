"""Synthetic 100C candidate regressions, not A5 V2 hardware captures.

The A7 upstream flags=09 example informs the no-connected-bit gate only.
Every frame, topology attestation and clock below is manufactured offline.
"""
from pathlib import Path
import json
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401, E402
from providers import mchose as M  # noqa: E402


PATH = r"\\?\hid#vid_3837&pid_100c&mi_02&col03#synthetic-a5v2"
CFU = r"\\?\hid#vid_3837&pid_100c&mi_02&col04#synthetic-a5v2"
PARENT = r"pnp:usb\vid_3837&pid_100c\synthetic-a5v2"
NAME = "MCHOSE A5 V2 Ultra"
KEY = "mchose:3837:100c"


def inventory(length=21):
    proof = {"paths": [PATH, CFU], "parent": PARENT, "collection": PATH}
    common = dict(vendor_id=0x3837, product_id=0x100C, product_string=NAME,
                  physical_id=PARENT, a5v2_descriptor_complete=True,
                  a5v2_topology=proof)
    return [dict(common, path=PATH.encode(), usage_page=0xFF01, usage=1,
                 feature_report_length=length, feature_report_sizes={"17": length},
                 feature_report_proof="caps"),
            dict(common, path=CFU.encode(), usage_page=0xFF0B, usage=0x104)]


def reply(length=21, *, level=41, charge=0, vid=0x3837, pid=0x4021,
          flags=0x09, firmware=0x04022E05, scratch=0):
    payload = (vid.to_bytes(2, "little") + pid.to_bytes(2, "little")
               + firmware.to_bytes(4, "little") + bytes([flags, level, charge]))
    return bytes([0x11, 0xF9]) + bytes(n ^ 0xFF for n in payload) + bytes([scratch]) * (length - 13)


class Clock:
    def __init__(self):
        self.now = 0.0
        self.sleeps = []
        self.extra_sleep = 0.0

    def monotonic(self):
        return self.now

    def time(self):
        return 1000 + self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds + self.extra_sleep


class Device:
    def __init__(self, frames=(), *, set_result=None):
        self.frames = iter(frames)
        self.set_result = set_result
        self.opens, self.sent, self.gets = [], [], []
        self.closed = 0
        self.on_open = self.on_set = self.on_get = lambda: None

    def open_path(self, path):
        self.opens.append(path)
        self.on_open()

    def close(self):
        self.closed += 1

    def send_feature_report(self, frame):
        self.sent.append(bytes(frame))
        self.on_set()
        if isinstance(self.set_result, Exception):
            raise self.set_result
        return len(frame) if self.set_result is None else self.set_result

    def get_feature_report(self, report, length):
        self.gets.append((report, length))
        self.on_get()
        frame = next(self.frames, b"")
        if isinstance(frame, Exception):
            raise frame
        return frame


class A5V2Tests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        timer = patch.object(M, "time", self.clock)
        timer.start()
        self.addCleanup(timer.stop)
        self.provider = M.MchoseProvider()

    def poll(self, dev, infos=None):
        infos = inventory() if infos is None else infos
        with patch.object(M.hidlist, "enumerate", side_effect=lambda vid: [
                d for d in infos if d["vendor_id"] == vid]), \
             patch.object(M.hid, "device", return_value=dev), \
             patch.object(M.MchoseProvider, "_read_collection", side_effect=AssertionError("legacy")), \
             patch.object(M.MchoseProvider, "_read_a5", side_effect=AssertionError("first A5")), \
             patch.object(M.MchoseProvider, "_read_v3", side_effect=AssertionError("V3")), \
             patch.object(M.MchoseProvider, "_read_g7", side_effect=AssertionError("G7")):
            return self.provider.poll()

    def assert_no_io(self, infos):
        dev = Device([reply(), reply()])
        self.assertEqual(self.poll(dev, infos), [])
        self.assertEqual((dev.opens, dev.sent, dev.gets), ([], [], []))
        self.assertNotIn(KEY, self.provider._last)

    def test_exact_21_and_65_buffers_get_parameters_and_battery_only_status(self):
        for length in (21, 65):
            with self.subTest(length=length):
                dev = Device([reply(length), reply(length)])
                status, = self.poll(dev, inventory(length))
                self.assertEqual((status.key, status.name, status.level, status.charging,
                                  status.online, status.kind, status.dpi),
                                 (KEY, NAME, 41, False, True, "mouse", None))
                request = b"\x11\xf9" + b"\xff" * 19 + b"\x00" * (length - 21)
                self.assertEqual(dev.sent, [request, request])
                self.assertEqual(dev.gets, [(0x11, length)] * 2)
                self.assertEqual(dev.opens, [PATH.encode()])
                self.assertEqual(dev.closed, 1)
                self.assertEqual(self.clock.sleeps[-2:], [0.09, 0.09])

    def test_valid_zero_and_hundred_nonzero_charge_and_mouse_pid_not_receiver(self):
        for level, charge in ((0, 0), (100, 7)):
            with self.subTest(level=level):
                frame = reply(level=level, charge=charge, pid=0x0021, flags=0)
                status, = self.poll(Device([frame, frame]))
                self.assertEqual((status.level, status.charging), (level, bool(charge)))

    def test_two_consecutive_meaningful_payloads_ignore_scratch(self):
        dev = Device([reply(scratch=1), reply(scratch=255)])
        self.assertEqual(self.poll(dev)[0].level, 41)
        self.assertEqual(len(dev.gets), 2)

    def test_changed_meaningful_fields_restart_stability(self):
        for changed in (reply(level=42), reply(firmware=7), reply(flags=0x19), reply(charge=2)):
            with self.subTest(changed=changed):
                self.clock.now = 0
                dev = Device([reply(), changed, changed])
                self.assertEqual(len(self.poll(dev)), 1)
                self.assertEqual(len(dev.gets), 3)

    def test_invalid_frame_and_get_exception_reset_previous(self):
        for invalid in (b"", reply(65), OSError("private-path serial payload"), RuntimeError("private-path")):
            with self.subTest(invalid=type(invalid).__name__):
                self.clock.now = 0
                dev = Device([reply(), invalid, reply(), reply()])
                self.assertEqual(len(self.poll(dev)), 1)
                self.assertEqual(len(dev.gets), 4)

    def test_rejected_frames_never_publish_and_stop_at_twenty(self):
        good = reply()
        bad = [b"", None, bytes(21), b"\x11\xf9" + b"\xff" * 19,
               bytes([0x12]) + good[1:], good[:1] + b"\xf8" + good[2:],
               reply(vid=0x5253), reply(vid=0x41E4), reply(pid=0), reply(level=101),
               good[:-1], good + b"\x00", reply(65), reply(66), [0x11, -1] + [0] * 19]
        for frame in bad:
            with self.subTest(frame=repr(frame)[:30]):
                self.clock.now = 0
                dev = Device([frame] * 25)
                self.assertEqual(self.poll(dev), [])
                self.assertEqual((len(dev.sent), len(dev.gets), dev.closed), (20, 20, 1))
                self.assertLessEqual(self.clock.now, 2.0)

    def test_set_failure_negative_or_short_write_stops_without_get_and_closes(self):
        for result in (-1, 0, 20, 22, 21.0, OSError("private-path serial payload"), RuntimeError("private-path")):
            with self.subTest(result=type(result).__name__):
                dev = Device([reply(), reply()], set_result=result)
                self.assertEqual(self.poll(dev), [])
                self.assertEqual((len(dev.sent), dev.gets, dev.closed), (1, [], 1))
                self.assertNotIn("private-path", " ".join(self.provider.diagnostics()))

    def test_open_failure_closes_and_uses_fixed_diagnostics(self):
        dev = Device()
        def fail():
            raise OSError("private-path serial payload")
        dev.on_open = fail
        self.assertEqual(self.poll(dev), [])
        self.assertEqual((dev.sent, dev.closed), ([], 1))
        self.assertNotIn("private-path", " ".join(self.provider.reader_diagnostics()))

    def test_soft_deadline_checks_after_open_set_sleep_and_get(self):
        for phase in ("open", "set", "sleep", "get"):
            with self.subTest(phase=phase):
                self.clock.now = 0
                self.clock.extra_sleep = 0
                dev = Device([reply()] * 25)
                def expire():
                    self.clock.now = 2.0
                if phase == "sleep":
                    self.clock.extra_sleep = 2.0
                else:
                    setattr(dev, "on_" + phase, expire)
                before = len(self.clock.sleeps)
                self.assertEqual(self.poll(dev), [])
                counts = {"open": (0, 0, 0), "set": (1, 0, 0),
                          "sleep": (1, 0, 1), "get": (1, 1, 1)}
                self.assertEqual((len(dev.sent), len(dev.gets), len(self.clock.sleeps) - before),
                                 counts[phase])
                self.assertEqual(dev.closed, 1)

    def test_native_elapsed_time_prevents_extra_pairs_or_truncated_wait(self):
        dev = Device([reply(level=40 + i % 2) for i in range(25)])
        dev.on_get = lambda: setattr(self.clock, "now", self.clock.now + 0.3)
        self.assertEqual(self.poll(dev), [])
        self.assertEqual((len(dev.sent), len(dev.gets)), (6, 5))
        self.assertLessEqual(self.clock.now, 2.0)

    def test_failure_discards_only_candidate_old_reading_and_missing_device_too(self):
        self.assertEqual(len(self.poll(Device([reply(), reply()]))), 1)
        self.provider._last["mchose"] = (63, False, self.clock.time())
        out = self.poll(Device())
        self.assertNotIn(KEY, self.provider._last)
        self.assertEqual([(s.key, s.level, s.online) for s in out], [("mchose", 63, False)])
        self.provider._last[KEY] = (41, False, self.clock.time())
        self.poll(Device(), [])
        self.assertNotIn(KEY, self.provider._last)

    def test_previous_never_survives_next_poll(self):
        first = Device([b""] * 19 + [reply()])
        self.assertEqual(self.poll(first), [])
        dev = Device([reply()] + [b""] * 19)
        self.assertEqual(self.poll(dev), [])
        self.assertEqual(len(dev.gets), 20)

    def test_no_proof_or_inconsistent_identity_topology_and_lengths_mean_zero_io(self):
        edits = [dict(a5v2_topology=None), dict(a5v2_descriptor_complete=False),
                 dict(feature_report_proof="descriptor"), dict(feature_report_length=65),
                 dict(feature_report_sizes=None), dict(feature_report_sizes={"18": 21}),
                 dict(feature_report_sizes={"17": 21, "18": 65}),
                 dict(feature_report_sizes={17: 21}), dict(feature_report_sizes={"017": 21}),
                 dict(feature_report_sizes={"17": True}), dict(feature_report_length=21.0),
                 dict(feature_report_sizes={"17": 20}), dict(product_string=NAME + "+"),
                 dict(physical_id="collection:" + PATH), dict(vendor_id=14391.0),
                 dict(product_id=4108.0), dict(product_id=0x100B), dict(usage_page=0), dict(usage=1.0),
                 dict(path=PATH.replace("100c", "100b").encode()),
                 dict(physical_id=PARENT.replace("100c", "100b"))]
        for edit in edits:
            with self.subTest(edit=edit):
                infos = inventory()
                infos[0].update(edit)
                self.assert_no_io(infos)
        for length in (0, 20, 22, 64, 66):
            self.assert_no_io(inventory(length))

    def test_missing_duplicate_or_multi_parent_collections_cannot_use_proof(self):
        infos = inventory()
        for changed in ([infos[0]], [infos[1]], infos + [dict(infos[0])],
                        [infos[0], dict(infos[1], physical_id=PARENT + "-other")],
                        [infos[0], dict(infos[1], product_string="Other mouse")],
                        [infos[0], dict(infos[1], a5v2_topology=None)]):
            self.assert_no_io(changed)

    def test_other_proven_ids_are_not_sent_and_trimmed_name_is_accepted(self):
        infos = inventory()
        infos[0]["feature_report_sizes"]["18"] = 13
        for info in infos:
            info["product_string"] = "  " + NAME + "  "
        dev = Device([reply(), reply()])
        self.assertEqual(len(self.poll(dev, infos)), 1)
        self.assertTrue(all(f[0:2] == b"\x11\xf9" for f in dev.sent))

    def test_proof_survives_ipc_physical_scope_and_c_grade_normalization(self):
        from isolation import wire_encode, wire_decode
        import server
        infos = json.loads(json.dumps(inventory(65), default=wire_encode), object_hook=wire_decode)
        dev = Device([reply(65), reply(65)])
        with patch.object(M.hid, "device", return_value=dev), \
             patch.object(M.MchoseProvider, "_read_collection", side_effect=AssertionError("legacy")):
            status, = server.scoped_poll(self.provider, infos, PARENT)
        self.assertEqual((status.physical_id, status.legacy_key, status.level), (PARENT, KEY, 41))
        public = server.normalise(status, None, server.utcnow())
        self.assertEqual(public["verificationLevel"], "C")
        self.assertIn("待本项目实机验证", public["verificationLabel"])
        self.assertIsNone(public["dpi"])
        self.assertEqual(dev.opens, [PATH.encode()])
        self.assertEqual(self.provider.reader_diagnostics(), ["A5V2 stable_reply_C_pending_hardware"])

    def test_catalog_fixed_identity_is_c_level_and_statically_indexed(self):
        import catalog
        import known_ids
        rows = [d for d in known_ids.build_index()["devices"]
                if (d["provider"], d["vendorId"], d["productId"]) == ("mchose", 0x3837, 0x100C)]
        self.assertEqual(len(rows), 1)
        row, = rows
        self.assertEqual((row["name"], row["kind"], row.get("requiresModelMatch")), (NAME, "mouse", True))
        reader, = [r for r in catalog.load_catalog()["readers"] if r["provider"] == "mchose"]
        self.assertEqual(reader["verificationLevel"], "C")
        catalog.validate_catalog()


if __name__ == "__main__":
    unittest.main()
