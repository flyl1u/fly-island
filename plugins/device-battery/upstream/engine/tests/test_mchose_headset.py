"""V9 PRO / Turbo+ protocol fixtures; HID, topology and time are simulated."""
from contextlib import contextmanager
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
from providers import mchose_headset as M
from providers import mchose as Mouse


def entry(physical="receiver-a", **changes):
    info = dict(vendor_id=0x291D, product_id=0x385D, usage_page=0xFF90, usage=1,
                input_report_length=64, output_report_length=64,
                path=(physical + "-ff90").encode(), physical_id=physical,
                product_string="V9 PRO", serial_number="")
    info.update(changes)
    return info


def reply(level=20, state=0x02, command=0x65):
    return [0x55, command, level, state] + [0] * 60


def firmware_reply(version=(0, 0, 0, 8)):
    return [0xAA, 0x01] + list(version) + [0] * 58


def firmware_entry(physical="receiver-a", **changes):
    return entry(physical, **(dict(usage_page=0xFF22, input_report_length=0,
                                 output_report_length=0, feature_report_length=64,
                                 feature_report_sizes={"170": 64},
                                 path=(physical + "-ff22").encode()) | changes))


def pro_inventory(physical="receiver-a"):
    return [firmware_entry(physical), entry(physical)]


def turbo_inventory():
    """The six interface-0 collections in the user's #61 hardware capture."""
    return [entry("turbo", vendor_id=0x3837, product_id=0x600A,
                  product_string="MCHOSE V9 Turbo+", manufacturer_string="C-Media Electronics Inc",
                  interface_number=0, usage_page=page, input_report_length=inp,
                  output_report_length=out, path=f"turbo-{page:04x}".encode())
            for page, inp, out in ((0xFF21, 2, 2), (0xFF22, 0, 0), (0x000C, 3, 0),
                                   (0x000B, 3, 3), (0xFF90, 64, 64), (0xFF82, 64, 64))]


class FakeHid:
    def __init__(self, frames=(), write_result=64, read_ms=10,
                 firmware_frames=None, feature_write_result=64, open_errors=None):
        self.frames = list(frames)
        self.firmware_frames = None if firmware_frames is None else list(firmware_frames)
        self.feature_write_result = feature_write_result
        self.open_errors = open_errors or {}
        self.write_result = write_result
        self.read_ms = read_ms
        self.now = 0.0
        self.opened, self.writes, self.reads, self.closed = [], [], [], []
        self.feature_writes, self.feature_reads, self.sleeps = [], [], []

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds

    def device(self):
        bus = self

        class Handle:
            def open_path(self, path):
                self.path = path
                bus.opened.append(path)
                if path in bus.open_errors:
                    raise bus.open_errors[path]

            def write(self, packet):
                bus.writes.append((self.path, list(packet)))
                return bus.write_result

            def send_feature_report(self, packet):
                bus.feature_writes.append((self.path, list(packet)))
                if isinstance(bus.feature_write_result, Exception):
                    raise bus.feature_write_result
                return bus.feature_write_result

            def get_feature_report(self, report_id, length):
                bus.feature_reads.append((self.path, report_id, length))
                value = (firmware_reply() if bus.firmware_frames is None
                         else bus.firmware_frames.pop(0) if bus.firmware_frames else [])
                if isinstance(value, Exception):
                    raise value
                return value

            def read(self, length, timeout_ms):
                bus.reads.append((self.path, length, timeout_ms))
                bus.now += (min(bus.read_ms, timeout_ms) if bus.frames else timeout_ms) / 1000
                value = bus.frames.pop(0) if bus.frames else []
                if isinstance(value, Exception):
                    raise value
                return value

            def close(self):
                bus.closed.append(self.path)

        return Handle()


@contextmanager
def fixture(frames=(), inventory=None, **kwargs):
    bus = FakeHid(frames, **kwargs)
    infos = pro_inventory() if inventory is None else inventory
    with patch.object(M, "hid", bus), \
            patch.object(M.hidlist, "enumerate", side_effect=lambda vid=0: [
                d for d in infos if not vid or d["vendor_id"] == vid]), \
            patch.object(M, "time", SimpleNamespace(monotonic=lambda: bus.now, sleep=bus.sleep)), \
            patch("topology.usb_parent", return_value=None):
        yield bus


class MchoseHeadsetTests(unittest.TestCase):
    def setUp(self):
        self.provider = M.MchoseHeadsetProvider()

    def test_discharge_and_exact_output_request(self):
        for level in (0, 20, 90, 100):
            with self.subTest(level=level), fixture([reply(level)]) as bus:
                status, = self.provider.poll()
                self.assertEqual((status.level, status.charging, status.online, status.kind),
                                 (level, False, True, "headset"))
                self.assertTrue(status.charging_known)
                self.assertEqual(bus.writes, [(entry()["path"], [0x55, 0x65, 1] + [0] * 61)])
                self.assertEqual(bus.reads[0][:2], (entry()["path"], 64))
                self.assertEqual(bus.closed, bus.opened)

    def test_external_power_hides_even_frozen_invalid_percentage(self):
        for state in (0x00, 0x03):
            for level in (20, 90, 100, 255):
                with self.subTest(state=state, level=level), fixture([reply(level, state)]):
                    status, = self.provider.poll()
                    self.assertIsNone(status.level)
                    self.assertTrue(status.level_unavailable)
                    self.assertTrue(status.charging)
                    self.assertTrue(status.charging_known)
                    self.assertTrue(status.online)

    def test_off_is_explicitly_disconnected_not_zero(self):
        with fixture([reply(0, 0x1A)]):
            status, = self.provider.poll()
        self.assertIsNone(status.level)
        self.assertFalse(status.online)
        self.assertTrue(status.connection_known)
        self.assertFalse(status.charging_known)

    def test_unknown_state_and_invalid_percentage_are_diagnosed(self):
        for frame, expected in ((reply(90, 0x04), "state=0x04"), (reply(101), "level=101")):
            with self.subTest(frame=frame[:4]), fixture([frame]):
                self.assertEqual(self.provider.poll(), [])
                self.assertIn(expected, " ".join(self.provider.diagnostics()))

    def test_unrelated_and_malformed_reports_are_skipped_on_same_handle(self):
        for invalid in (reply(command=0x11), [0x65, 90, 2] + [0] * 61,
                        reply()[:4], reply()[:-1], reply() + [0]):
            with self.subTest(frame=invalid[:4], size=len(invalid)), fixture([invalid, reply(90)]) as bus:
                self.assertEqual([s.level for s in self.provider.poll()], [90])
                self.assertEqual(bus.opened.count(entry()["path"]), 1)
                self.assertEqual(len(bus.writes), 1)
                self.assertEqual(len(bus.reads), 2)

    def test_timeout_has_no_connection_evidence(self):
        with fixture() as bus:
            self.assertEqual(self.provider.poll(), [])
            self.assertLessEqual(bus.now, 1.301)
            self.assertEqual(bus.opened, bus.closed)
        self.assertIn("connection unknown", " ".join(self.provider.diagnostics()))

    def test_continuous_noise_cannot_extend_deadline(self):
        with fixture([reply(command=0x11)] * 100, read_ms=240) as bus:
            self.assertEqual(self.provider.poll(), [])
            self.assertLessEqual(bus.now, 1.301)
            self.assertLessEqual(len(bus.reads), 5)
            self.assertTrue(all(0 < timeout <= 1000 for _, _, timeout in bus.reads))
            self.assertLess(bus.reads[-1][2], bus.reads[0][2])

    def test_fast_noise_is_bounded_too(self):
        with fixture([reply(command=0x11)] * 100, read_ms=0) as bus:
            self.assertEqual(self.provider.poll(), [])
            self.assertLessEqual(len(bus.reads), 32)

    def test_unknown_or_wrong_caps_never_open_or_send(self):
        for inp, out in ((None, None), (None, 64), (64, None), (0, 64), (64, 0),
                         (63, 64), (64, 63), (65, 64), (64, 65)):
            with self.subTest(input=inp, output=out), fixture(
                    [reply()], [entry(input_report_length=inp, output_report_length=out)]) as bus:
                self.assertEqual(self.provider.poll(), [])
                self.assertEqual(bus.opened, [])
                self.assertEqual(bus.writes, [])
                self.assertIn("nothing sent", " ".join(self.provider.diagnostics()))

    def test_wrong_identity_or_collection_never_selected(self):
        for changes in (dict(usage_page=0xFF22), dict(usage_page=0xFF82), dict(usage=2),
                        dict(vendor_id=0x3837, product_id=0x385D), dict(product_id=0x600A),
                        dict(vendor_id=0x3837, product_id=0x6008), dict(product_id=0x6008),
                        dict(vendor_id=0x5253)):
            with self.subTest(changes=changes), fixture([reply()], [entry(**changes)]) as bus:
                self.assertEqual(self.provider.poll(), [])
                self.assertEqual(bus.opened, [])
                self.assertEqual(bus.writes, [])

    def test_wrong_collections_do_not_hide_eligible_one(self):
        inventory = [entry(path=b"ff22", usage_page=0xFF22),
                     entry(path=b"ff82", usage_page=0xFF82), entry()]
        inventory[0] = firmware_entry()
        with fixture([reply()], inventory) as bus:
            self.assertEqual(len(self.provider.poll()), 1)
            self.assertEqual(bus.opened, [firmware_entry()["path"], entry()["path"]])

    def test_two_same_model_receivers_have_distinct_stable_keys(self):
        inventory = pro_inventory("one") + pro_inventory("two")
        with fixture([reply(20), reply(90)], inventory):
            statuses = self.provider.poll()
        self.assertEqual([s.level for s in statuses], [20, 90])
        self.assertEqual(len({s.key for s in statuses}), 2)
        with fixture([reply(90), reply(20)], list(reversed(inventory))):
            self.assertEqual({s.key for s in self.provider.poll()}, {s.key for s in statuses})

    def test_missing_physical_parent_uses_exact_path_not_shared_serial(self):
        # Without a shared parent, a PRO feature sibling cannot safely be
        # associated. Turbo still supports exact-path grouping as before.
        with fixture([reply(20), reply(90)], [
                entry(physical, vendor_id=0x3837, product_id=0x600A, physical_id="")
                for physical in ("one", "two")]):
            self.assertEqual(len({s.key for s in self.provider.poll()}), 2)

    def test_failed_or_short_write_does_not_read_or_retry(self):
        for written in (-1, 0, 63):
            with self.subTest(written=written), fixture([reply()], write_result=written) as bus:
                self.assertEqual(self.provider.poll(), [])
                self.assertEqual(len(bus.writes), 1)
                self.assertEqual(bus.reads, [])
                self.assertEqual(bus.closed, bus.opened)

    def test_io_failure_closes_handle(self):
        with fixture([OSError("fixture failure")]) as bus:
            self.assertEqual(self.provider.poll(), [])
            self.assertEqual(bus.closed, bus.opened)
            self.assertIn("fixture failure", " ".join(self.provider.diagnostics()))

    def test_turbo_capture_reads_80_only_on_ff90_with_lighting_present(self):
        # Lighting caps here are adversarial mock values, not claimed capture facts.
        lighting = entry("lighting", vendor_id=0x3837, product_id=0x6008,
                         product_string="V9 Turbo", manufacturer_string="wch.cn")
        inventory = [lighting] + list(reversed(turbo_inventory()))
        with fixture([reply(80), reply(80)], inventory) as bus, patch.object(Mouse, "hid", bus):
            mouse = Mouse.MchoseProvider()
            for _ in range(2):
                self.assertEqual(mouse.poll(), [])
                status, = self.provider.poll()
                self.assertEqual((status.name, status.level, status.charging, status.online, status.kind),
                                 ("MCHOSE V9 Turbo+", 80, False, True, "headset"))
            self.assertEqual(bus.opened, [b"turbo-ff90"] * 2)
            self.assertEqual(bus.writes, [(b"turbo-ff90", [0x55, 0x65, 1] + [0] * 61)] * 2)
            self.assertEqual(bus.closed, bus.opened)
        diagnostics = " ".join(mouse.diagnostics())
        self.assertIn("600a V9 Turbo+ headset reserved", diagnostics)
        self.assertIn("6008 V9 Turbo lighting device", diagnostics)

    def test_turbo_wrong_caps_or_collection_never_fall_back_to_mouse_or_siblings(self):
        for changes in (dict(input_report_length=None), dict(output_report_length=None),
                        dict(input_report_length=0), dict(output_report_length=0),
                        dict(input_report_length=63), dict(output_report_length=63),
                        dict(input_report_length=65), dict(output_report_length=65),
                        dict(usage_page=0xFF01), dict(usage=2)):
            inventory = turbo_inventory()
            next(d for d in inventory if d["usage_page"] == 0xFF90).update(changes)
            with self.subTest(changes=changes), fixture([reply(80)], inventory) as bus, \
                    patch.object(Mouse, "hid", bus):
                self.assertEqual(Mouse.MchoseProvider().poll(), [])
                self.assertEqual(self.provider.poll(), [])
                self.assertEqual(bus.opened, [])
                self.assertEqual(bus.writes, [])
                self.assertIn("nothing sent", " ".join(self.provider.diagnostics()))

    def test_lighting_never_receives_commands_even_with_mouse_or_headset_caps(self):
        for page in (0xFF01, 0xFF90, 0xFF82):
            inventory = [entry("lighting", vendor_id=0x3837, product_id=0x6008, usage_page=page)]
            with self.subTest(page=page), fixture([reply(80)], inventory) as bus, \
                    patch.object(Mouse, "hid", bus):
                self.assertEqual(Mouse.MchoseProvider().poll(), [])
                self.assertEqual(self.provider.poll(), [])
                self.assertEqual(bus.opened, [])
                self.assertEqual(bus.writes, [])

    def test_turbo_inherits_unverified_external_power_and_off_semantics(self):
        for state in (0x00, 0x03, 0x1A):
            with self.subTest(state=state), fixture([reply(80, state)], turbo_inventory()):
                status, = self.provider.poll()
                self.assertIsNone(status.level)
                self.assertTrue(status.level_unavailable)
                self.assertTrue(status.connection_known)
                self.assertEqual(status.charging, state != 0x1A)
                self.assertEqual(status.charging_known, state != 0x1A)
                self.assertEqual(status.online, state != 0x1A)

    def test_pro_and_turbo_keep_distinct_names_and_identities(self):
        with fixture([reply(20), reply(80)], pro_inventory() + turbo_inventory()):
            statuses = self.provider.poll()
        self.assertEqual([(s.name, s.level) for s in statuses],
                         [("MCHOSE V9 PRO", 20), ("MCHOSE V9 Turbo+", 80)])
        self.assertEqual(len({s.key for s in statuses}), 2)

    def test_receiver_firmware_gate_and_exact_read_only_feature_query(self):
        for version, allowed in (((0, 0, 0, 0), False), ((0, 0, 0, 7), False),
                                 ((0, 0, 0, 8), True), ((0, 0, 0, 9), True),
                                 ((0, 0, 1, 0), True), ((0, 0, 0, 10), True)):
            with self.subTest(version=version), fixture(
                    [reply(90)], firmware_frames=[firmware_reply(version)]) as bus:
                self.provider = M.MchoseHeadsetProvider()
                statuses = self.provider.poll()
                self.assertEqual([s.level for s in statuses], [90] if allowed else [])
                self.assertEqual(bus.feature_writes,
                                 [(firmware_entry()["path"], [0xAA, 1, 1] + [0] * 61)])
                self.assertEqual(bus.feature_reads, [(firmware_entry()["path"], 0xAA, 64)])
                self.assertEqual(bus.sleeps, [0.3])
                self.assertEqual(bus.writes, [(entry()["path"], M.make_request())] if allowed else [])
                self.assertEqual(bus.opened, bus.closed)
                if not allowed:
                    self.assertIn("接收器固件低于 0008，官方驱动也不支持电量",
                                  " ".join(self.provider.diagnostics()))

    def test_firmware_unknown_invalid_or_echo_queries_battery_and_caches_unknown(self):
        frames = (None, [], firmware_reply()[:6], firmware_reply()[:-1], firmware_reply() + [0],
                  [0xAA, 2] + [0] * 62, [0xAB, 1] + [0] * 62,
                  [0xAA, 1, True, 0, 0, 8] + [0] * 58,
                  [0xAA, 1, 256, 0, 0, 8] + [0] * 58,
                  [0xAA, 1, 1, 0, 0, 0] + [0] * 58,
                  OSError("private path must not be logged"), ValueError("invalid feature read"))
        for frame in frames:
            with self.subTest(frame=frame), fixture([reply(90), reply(70)], firmware_frames=[frame]) as bus:
                self.provider = M.MchoseHeadsetProvider()
                for level in (90, 70):
                    self.assertEqual([s.level for s in self.provider.poll()], [level])
                    diagnostics = " ".join(self.provider.diagnostics())
                    self.assertIn("接收器固件版本未知，按原方式查询", diagnostics)
                    self.assertNotIn("不发电量查询", diagnostics)
                self.assertEqual(bus.writes, [(entry()["path"], M.make_request())] * 2)
                self.assertEqual(len(bus.feature_writes), 1)
                self.assertEqual(len(bus.feature_reads), 1)
                self.assertEqual(bus.opened, bus.closed)
                self.assertNotIn("private path", diagnostics)

    def test_unproven_firmware_collection_keeps_battery_query_without_feature_io(self):
        invalid = [[], [firmware_entry(), firmware_entry(path=b"duplicate")]]
        invalid.extend([firmware_entry(**change)] for change in (
            dict(feature_report_length=None), dict(feature_report_length=63),
            dict(feature_report_sizes=None), dict(feature_report_sizes={"170": 63}),
            dict(feature_report_sizes={"171": 64}), dict(feature_report_sizes={"170": 64.0}),
            dict(path=b""),
            dict(usage_page=0xFF82), dict(usage=2), dict(physical_id="other"),
            dict(vendor_id=0x3837, product_id=0x600A)))
        for siblings in invalid:
            with self.subTest(siblings=siblings), fixture([reply(90), reply(70)], [entry()] + siblings) as bus:
                self.provider = M.MchoseHeadsetProvider()
                for level in (90, 70):
                    self.assertEqual([s.level for s in self.provider.poll()], [level])
                    self.assertIn("接收器固件版本未知，按原方式查询", " ".join(self.provider.diagnostics()))
                self.assertEqual(bus.opened, [entry()["path"]] * 2)
                self.assertEqual(bus.writes, [(entry()["path"], M.make_request())] * 2)
                self.assertEqual((bus.feature_writes, bus.feature_reads), ([], []))

    def test_failed_or_short_firmware_write_skips_feature_read_but_queries_battery(self):
        for written in (-1, 0, 63, OSError("private feature path")):
            with self.subTest(written=written), fixture(
                    [reply(90), reply(70)], feature_write_result=written) as bus:
                self.provider = M.MchoseHeadsetProvider()
                for level in (90, 70):
                    self.assertEqual([s.level for s in self.provider.poll()], [level])
                    self.assertIn("接收器固件版本未知，按原方式查询", " ".join(self.provider.diagnostics()))
                self.assertEqual(len(bus.feature_writes), 1)
                self.assertEqual((bus.feature_reads, bus.sleeps), ([], []))
                self.assertEqual(bus.writes, [(entry()["path"], M.make_request())] * 2)
                self.assertEqual(bus.opened, bus.closed)

    def test_firmware_handle_creation_or_open_failure_keeps_battery_query(self):
        with fixture([reply(90)]) as bus, patch.object(
                bus, "device", side_effect=[OSError("private creation error"), bus.device()]):
            self.assertEqual([s.level for s in self.provider.poll()], [90])
            self.assertEqual(bus.writes, [(entry()["path"], M.make_request())])
            self.assertEqual(bus.feature_writes, [])
            self.assertIn("接收器固件版本未知，按原方式查询", " ".join(self.provider.diagnostics()))
        self.provider = M.MchoseHeadsetProvider()
        with fixture([reply(90)], open_errors={firmware_entry()["path"]: OSError("private open error")}) as bus:
            self.assertEqual([s.level for s in self.provider.poll()], [90])
            self.assertEqual(bus.writes, [(entry()["path"], M.make_request())])
            self.assertEqual(bus.feature_writes, [])
            self.assertEqual(bus.opened, bus.closed)
            self.assertNotIn("private", " ".join(self.provider.diagnostics()))

    def test_firmware_result_is_cached_until_receiver_removal(self):
        for frame, allowed in ((firmware_reply((0, 0, 0, 7)), False), (firmware_reply(), True), ([], True)):
            with self.subTest(frame=frame):
                self.provider = M.MchoseHeadsetProvider()
                with fixture([reply(90), reply(70)], firmware_frames=[frame, firmware_reply()]) as bus:
                    for level in (90, 70):
                        self.assertEqual([s.level for s in self.provider.poll()], [level] if allowed else [])
                    self.assertEqual(len(bus.feature_writes), 1)
                    self.assertEqual(len(bus.feature_reads), 1)
                    self.assertEqual(bus.writes, [(entry()["path"], M.make_request())] * (2 if allowed else 0))
                with fixture(inventory=[]):
                    self.assertEqual(self.provider.poll(), [])
                with fixture([reply(80)]) as bus:
                    self.assertEqual([s.level for s in self.provider.poll()], [80])
                    self.assertEqual(len(bus.feature_writes), 1)
                    self.assertEqual(len(bus.feature_reads), 1)
                    self.assertEqual(bus.writes, [(entry()["path"], M.make_request())])

    def test_firmware_cache_distinguishes_receiver_path_changes(self):
        with fixture(firmware_frames=[firmware_reply((0, 0, 0, 7))]):
            self.assertEqual(self.provider.poll(), [])
        inventory = pro_inventory()
        inventory[1]["path"] = b"receiver-a-new-ff90"
        with fixture([reply(80)], inventory) as bus:
            self.assertEqual([s.level for s in self.provider.poll()], [80])
            self.assertEqual(len(bus.feature_writes), 1)
            self.assertEqual(bus.writes, [(b"receiver-a-new-ff90", M.make_request())])

    def test_firmware_gates_each_receiver_and_never_applies_to_turbo(self):
        inventory = pro_inventory("old") + pro_inventory("new") + pro_inventory("unknown") + turbo_inventory()
        with fixture([reply(90), reply(70), reply(80)] * 2, inventory, firmware_frames=[
                firmware_reply((0, 0, 0, 7)), firmware_reply(), []]) as bus:
            for _ in range(2):
                statuses = self.provider.poll()
                self.assertEqual([(s.physical_id, s.level) for s in statuses],
                                 [("new", 90), ("unknown", 70), ("turbo", 80)])
            self.assertEqual([path for path, _ in bus.feature_writes], [b"old-ff22", b"new-ff22", b"unknown-ff22"])
            self.assertEqual([path for path, _ in bus.writes], [b"new-ff90", b"unknown-ff90", b"turbo-ff90"] * 2)

        # Removing one receiver must not forget the still-connected receiver.
        with fixture([reply(60)], pro_inventory("new")) as bus:
            self.assertEqual([s.level for s in self.provider.poll()], [60])
            self.assertEqual(bus.feature_writes, [])
        with fixture([reply(80), reply(60)], pro_inventory("old") + pro_inventory("new")) as bus:
            self.assertEqual([s.level for s in self.provider.poll()], [80, 60])
            self.assertEqual([path for path, _ in bus.feature_writes], [b"old-ff22"])

    def test_unresolved_parent_never_borrows_another_collection_firmware(self):
        inventory = pro_inventory("one") + pro_inventory("two")
        for info in inventory:
            info.update(physical_id="", serial_number="shared-serial")
        with fixture([reply(90), reply(70)], inventory) as bus:
            statuses = self.provider.poll()
            self.assertEqual([s.level for s in statuses], [90, 70])
            self.assertEqual(len({s.key for s in statuses}), 2)
            self.assertEqual(bus.feature_writes, [])
            self.assertEqual(bus.opened, [entry("one")["path"], entry("two")["path"]])
            self.assertEqual(bus.writes, [(entry(physical)["path"], M.make_request()) for physical in ("one", "two")])


if __name__ == "__main__":
    unittest.main()
