"""Tests for providers/lofree.py. No hardware is needed.

The fake keyboard answers the transaction of Lofree's web driver on report 0x04:
start (byte 2 = 01) -> command -> answer from byte 7 -> end (byte 2 = 02).
hidapi puts the report id in front of each report, as on Windows.

Run from the repository root:

    python -m unittest discover -s tests
"""
import os
import sys
import time
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _hidstub  # noqa: E402, F401

from providers import lofree as F  # noqa: E402


def report(b2, data=(), offset=(0, 0)):
    """Input report 0x04: id, then 31 bytes; byte 2 = b2, bytes 4-5 = offset, data at 7."""
    p = [0x00, 0x00, b2, len(data), offset[0], offset[1], 0x00] + list(data)
    return [F.REPORT_ID] + p + [0x00] * (31 - len(p))


class FakeKeyboard:
    """online: answer of command AA (0 = offline); battery: answer of command 1A.
    silent: never answers. noise: reports sent before each answer."""

    def __init__(self, online=1, battery=66, silent=False, noise=(), bad_offset=False):
        self.online, self.battery, self.silent = online, battery, silent
        self.noise, self.bad_offset = list(noise), bad_offset
        self.writes, self.queue, self.opened = [], [], 0

    def on_write(self, data):
        data = list(data)
        self.writes.append(data)
        if self.silent:
            return
        b2 = data[3]
        if b2 in (F.START, F.END):
            self.queue.append(report(b2))
            return
        self.queue += [list(n) for n in self.noise]
        answer = {F.CMD_ONLINE: self.online, F.CMD_BATTERY: self.battery}[b2]
        self.queue.append(report(b2, [answer], (1, 0) if self.bad_offset else (0, 0)))

    def on_read(self):
        return self.queue.pop(0) if self.queue else []


class FakeBus:
    def __init__(self, kbds):
        self.kbds = kbds

    def device_class(self):
        bus = self

        class FakeDevice:
            def open_path(self, path):
                self.k = bus.kbds[path]
                self.k.opened += 1

            def write(self, data):
                self.k.on_write(data)
                return len(data)

            def read(self, n, timeout=None):
                return self.k.on_read()

            def close(self):
                pass

        return FakeDevice


def issue_82_entries(pid=0x0025):
    # the collections of the Lofree HYZEN67 in the diagnostics of issue #82
    shape = [(0, 0x0001, 0x06), (1, 0x0001, 0x06), (1, 0x000C, 0x01), (1, 0xFF1C, 0x92),
             (1, 0x0001, 0x02), (1, 0x0001, 0x80), (2, 0x000C, 0x01)]
    return [{"product_id": pid, "interface_number": i, "usage_page": p, "usage": u,
             "path": b"%04x-%d-%04x-%d" % (pid, i, p, n), "product_string": "HYZEN67@Lofree"}
            for n, (i, p, u) in enumerate(shape)]


VENDOR = b"0025-1-ff1c-3"


class ProviderTest(unittest.TestCase):
    def setUp(self):
        self._saved = (F.hid, F.hidlist, F.time)
        self.clock = [1000.0]
        F.time = types.SimpleNamespace(time=lambda: self.clock[0],
                                       sleep=lambda s: None)

    def tearDown(self):
        F.hid, F.hidlist, F.time = self._saved

    def poll(self, entries, kbds):
        bus = FakeBus(kbds)

        class Clocked(bus.device_class()):
            def read(inner, n, timeout=None):
                self.clock[0] += (timeout or 0) / 1000.0
                return super().read(n, timeout)

        F.hid = types.SimpleNamespace(device=Clocked)
        F.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        return F.LofreeProvider().poll()


class PollTest(ProviderTest):
    def test_hyzen_on_the_dongle_issue_82(self):
        kbd = FakeKeyboard(battery=66)
        res = self.poll(issue_82_entries(), {VENDOR: kbd})
        self.assertEqual([(r.name, r.level, r.charging, r.kind, r.source) for r in res],
                         [("Lofree HYZEN67", 66, False, "keyboard", "lofree")])
        pad = [0x00] * 28
        self.assertEqual(kbd.writes, [
            [0x04, 0x00, 0x00, 0x01] + pad,                                   # start
            [0x04, 0x00, 0x00, 0xAA, 0x00, 0x00, 0x00, 0x00] + [0x00] * 24,     # online?
            [0x04, 0x00, 0x00, 0x02] + pad,                                   # end
            [0x04, 0x00, 0x00, 0x01] + pad,
            [0x04, 0x00, 0x00, 0x1A, 0x00, 0x00, 0x00, 0x00] + [0x00] * 24,     # battery
            [0x04, 0x00, 0x00, 0x02] + pad,
        ])
        self.assertTrue(all(len(w) == 32 for w in kbd.writes))

    def test_only_the_ff1c_collection_is_opened(self):
        kbds = {e["path"]: FakeKeyboard() for e in issue_82_entries()}
        self.poll(issue_82_entries(), kbds)
        self.assertEqual([p for p, k in kbds.items() if k.opened], [VENDOR])

    def test_offline_keyboard_gives_no_icon_and_no_battery_request(self):
        kbd = FakeKeyboard(online=0)
        self.assertEqual(self.poll(issue_82_entries(), {VENDOR: kbd}), [])
        self.assertNotIn(0x1A, [w[3] for w in kbd.writes])

    def test_on_the_cable_the_dongle_is_not_read(self):
        entries = issue_82_entries() + [dict(issue_82_entries(0x0024)[3])]
        kbd = FakeKeyboard()
        self.assertEqual(self.poll(entries, {VENDOR: kbd, b"0024-1-ff1c-3": FakeKeyboard()}), [])
        self.assertEqual(kbd.opened, 0)

    def test_silent_keyboard_times_out(self):
        kbd = FakeKeyboard(silent=True)
        self.assertEqual(self.poll(issue_82_entries(), {VENDOR: kbd}), [])
        self.assertEqual([w[3] for w in kbd.writes], [0x01])      # no command without a start ack

    def test_other_reports_are_skipped(self):
        noise = [[0x01, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00],     # a key report (id 1)
                 report(0x55, [9], (3, 0))]                          # another frame, wrong offset
        res = self.poll(issue_82_entries(), {VENDOR: FakeKeyboard(battery=40, noise=noise)})
        self.assertEqual([r.level for r in res], [40])

    def test_wrong_offset_is_not_a_level(self):
        res = self.poll(issue_82_entries(), {VENDOR: FakeKeyboard(bad_offset=True)})
        self.assertEqual(res, [])

    def test_level_out_of_range_is_refused(self):
        self.assertEqual(self.poll(issue_82_entries(), {VENDOR: FakeKeyboard(battery=0xC8)}), [])

    def test_the_cable_pid_itself_is_not_read(self):
        e = [issue_82_entries(0x0024)[3]]
        kbd = FakeKeyboard()
        self.assertEqual(self.poll(e, {b"0024-1-ff1c-3": kbd}), [])
        self.assertEqual(kbd.opened, 0)


if __name__ == "__main__":
    unittest.main()
