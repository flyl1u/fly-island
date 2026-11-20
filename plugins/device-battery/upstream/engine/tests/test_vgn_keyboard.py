"""VGN HUB request and maintainer reply fixtures; no physical HID I/O."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
from providers import g3m as G, vgn_keyboard as V
from test_new_brands import entry as hid_entry, fixture as hid_fixture

P = V.VgnKeyboardProvider


def entry(physical="receiver-a", **changes):
    changes.setdefault("product_string", "Wireless Gaming Keyboard")
    return hid_entry(P, physical, **changes)


def reply(level=93, **changes):
    frame = [4, 0, 0, 0x1A, 6, 0, 0, 0, level] + [0] * 55
    for offset, value in changes.items():
        frame[int(offset)] = value
    return frame


def fixture(frames=(), inventory=None, **kwargs):
    return hid_fixture(P, frames, [entry()] if inventory is None else inventory, **kwargs)


class VgnKeyboardTests(unittest.TestCase):
    def test_official_request_and_maintainer_93_percent_reply(self):
        expected = [0x04, 0x00, 0x00, 0x1A, 0x06] + [0] * 59
        self.assertEqual(V.make_request(), expected)
        self.assertEqual(V.parse_reply(bytes.fromhex("04 00 00 1a 06 00 00 00 5d") + bytes(55)),
                         (93, False, ""))
        with fixture([reply()]) as bus:
            status, = P().poll()
        self.assertEqual((status.level, status.kind, status.source, status.verification_level),
                         (93, "keyboard", "vgn_keyboard", "A"))
        self.assertEqual(status.name, "Wireless Gaming Keyboard")
        self.assertFalse(status.charging_known)
        self.assertTrue(status.connection_known)
        self.assertEqual(bus.writes, [(entry()["path"], expected)])
        self.assertEqual(bus.reads[0][0], 64)
        self.assertEqual(bus.opened, bus.closed)

    def test_product_string_and_empty_name_fallback(self):
        for product in ("VGN V98 PRO 2.4G Dongle", "", None):
            with self.subTest(product=product), fixture([reply()], [entry(product_string=product)]):
                status, = P().poll()
            self.assertEqual(status.name, product or "VGN 2.4G 键盘")

    def test_sleep_reply_has_no_reading_or_rejection_and_closes_handle(self):
        sleeping = reply(0, **{"3": 0xFF})
        self.assertIsNone(V.parse_reply(sleeping))
        provider = P()
        with fixture([sleeping]) as bus:
            self.assertEqual(provider.poll(), [])
        self.assertEqual(provider.diagnostics(),
                         ["device asleep/offline; no new reading; connection unknown"])
        self.assertEqual(len(bus.writes), 1)
        self.assertEqual(len(bus.reads), 1)
        self.assertEqual(bus.opened, bus.closed)

    def test_silence_produces_no_reading(self):
        with fixture() as bus:
            self.assertEqual(P().poll(), [])
        self.assertEqual(len(bus.writes), 1)
        self.assertEqual(bus.opened, bus.closed)

    def test_bad_length_report_command_parameter_and_percentage_are_rejected(self):
        frames = [[], reply()[:-1], reply() + [0], reply(**{"0": 3}),
                  reply(**{"3": 0xAA}), reply(**{"4": 7}), reply(-1), reply(101), reply(255)]
        for frame in frames:
            with self.subTest(frame=frame):
                self.assertIsNone(V.parse_reply(frame))
            with self.subTest(frame=frame), fixture([frame]) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(len(bus.writes), 1)
                self.assertEqual(bus.opened, bus.closed)

    def test_echo_is_ignored_without_retrying_request(self):
        self.assertIsNone(V.parse_reply(V.make_request()))
        with fixture([V.make_request()]) as bus:
            self.assertEqual(P().poll(), [])
            self.assertEqual(len(bus.writes), 1)
        with fixture([V.make_request(), reply()]) as bus:
            self.assertEqual([s.level for s in P().poll()], [93])
            self.assertEqual(len(bus.writes), 1)
            self.assertEqual(len(bus.reads), 2)

    def test_percentage_boundaries_when_reply_is_not_an_echo(self):
        # Byte 7 is not a verified charging field; a nonzero byte distinguishes
        # a real 0% response from the otherwise identical request echo.
        for level in (0, 100):
            with self.subTest(level=level), fixture([reply(level, **{"7": 1})]):
                status, = P().poll()
                self.assertEqual(status.level, level)
                self.assertFalse(status.charging_known)

    def test_unproven_reports_or_ambiguous_collection_never_open_or_send(self):
        defects = [dict(input_report_length=None), dict(output_report_length=None),
                   dict(input_report_length=63), dict(input_report_length=65),
                   dict(output_report_length=63), dict(output_report_length=65),
                   dict(input_report_sizes=None), dict(output_report_sizes=None),
                   dict(input_report_sizes={"3": 64}), dict(output_report_sizes={"3": 64}),
                   dict(input_report_sizes={"4": 63}), dict(output_report_sizes={"4": 63}),
                   dict(path=b""), dict(physical_id="collection:unknown")]
        inventories = [[entry(**changes)] for changes in defects]
        inventories.append([entry(), entry(path=b"duplicate-eligible")])
        for inventory in inventories:
            with self.subTest(inventory=inventory), fixture([reply()], inventory) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.opened, [])
                self.assertEqual(bus.writes, [])

    def test_other_pids_vids_and_collections_never_open_or_send(self):
        defects = [dict(product_id=pid) for pid in (0x706E, 0x5055, 0xFFFF)]
        defects += [dict(vendor_id=0x3554), dict(usage_page=1), dict(usage=0x0091)]
        for changes in defects:
            with self.subTest(changes=changes), fixture([reply()], [entry(**changes)]) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.opened, [])
                self.assertEqual(bus.writes, [])

    def test_g3m_and_vgn_select_only_their_own_pid_and_request(self):
        mouse = hid_entry(G.G3mProvider, "mouse-receiver")
        keyboard = entry("keyboard-receiver")
        inventory = [mouse, keyboard]
        for factory, expected_info, expected_request in (
                (P, keyboard, [4, 0, 0, 0x1A, 6] + [0] * 59),
                (G.G3mProvider, mouse, [4, 0x20, 0, 0x1A, 6] + [0] * 59)):
            with self.subTest(provider=factory.name), hid_fixture(factory, [reply()], inventory) as bus:
                status, = factory().poll()
                self.assertEqual(status.level, 93)
                self.assertEqual(bus.opened, [expected_info["path"]])
                self.assertEqual(bus.writes, [(expected_info["path"], expected_request)])


if __name__ == "__main__":
    unittest.main()
