"""Synthetic replies derived from VGN HUB's oc handler; no hardware captures."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
from providers import vgn_dragonfly3 as V
from test_new_brands import entry as hid_entry, fixture as hid_fixture

P = V.VgnDragonfly3Provider


def entry(**changes):
    return hid_entry(P, **changes)


def reply(level=73, wired=0):
    # No source-defined response marker at byte 0; only command 30 correlates.
    return [0, 0x30] + [0] * 6 + [level, wired] + [0] * 54


def fixture(frames=(), inventory=None, **kwargs):
    return hid_fixture(P, frames, inventory, **kwargs)


class VgnDragonfly3Tests(unittest.TestCase):
    def test_request_and_synthetic_reply_boundaries(self):
        expected = [0, 0x55, 0x30] + [0] * 62
        self.assertEqual(V.make_request(), expected)
        for level in (0, 73, 100):
            with self.subTest(level=level), fixture([reply(level)]) as bus:
                status, = P().poll()
            self.assertEqual((status.level, status.kind, status.verification_level), (level, "mouse", "C"))
            self.assertFalse(status.charging_known)
            self.assertEqual(bus.writes, [(entry()["path"], expected)])
            self.assertEqual(bus.reads[0][0], 64)
            self.assertEqual(bus.opened, bus.closed)

    def test_invalid_length_command_level_and_echo_are_rejected(self):
        wrong_command = reply()
        wrong_command[1] = 0xFA
        for frame in ([], reply()[:-1], reply() + [0], [0] + reply(),
                      wrong_command, reply(-1), reply(101), reply(255), V.make_request()[1:]):
            with self.subTest(frame=frame), fixture([frame]) as bus:
                self.assertIsNone(V.parse_reply(frame))
                self.assertEqual(P().poll(), [])
                self.assertEqual(len(bus.writes), 1)
                self.assertEqual(bus.opened, bus.closed)

    def test_wired_and_silent_devices_produce_no_reading(self):
        for frames in ([], [reply(73, 1)]):
            with self.subTest(frames=frames), fixture(frames) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(len(bus.writes), 1)
                self.assertEqual(bus.opened, bus.closed)

    def test_unproven_or_ambiguous_reports_never_open_or_send(self):
        changes = [dict(input_report_length=n) for n in (None, True, 64, 66)]
        changes += [dict(output_report_length=n) for n in (None, True, 64, 66)]
        for direction in ("input", "output"):
            changes += [{direction + "_report_sizes": sizes} for sizes in
                        (None, {}, {"1": 65}, {"0": 64}, {"0": 65, "1": 65})]
        changes += [dict(path=b""), dict(physical_id="collection:unknown")]
        inventories = [[entry(**change)] for change in changes]
        inventories.append([entry(), entry(path=b"duplicate")])
        for inventory in inventories:
            with self.subTest(inventory=inventory), fixture([reply()], inventory) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.opened, [])
                self.assertEqual(bus.writes, [])

    def test_other_identities_and_collection_are_excluded(self):
        changes = [dict(product_id=pid) for pid in (0x1001, 0x1A03, 0x2A01, 0xFFFF)]
        changes += [dict(vendor_id=0x3554), dict(usage_page=0xFF05, usage=2), dict(usage=1)]
        for change in changes:
            with self.subTest(change=change), fixture([reply()], [entry(**change)]) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.opened, [])
                self.assertEqual(bus.writes, [])


if __name__ == "__main__":
    unittest.main()
