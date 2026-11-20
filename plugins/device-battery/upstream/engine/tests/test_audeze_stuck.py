"""Tests for the stuck Audeze dongle: it answers every packet with an empty echo of the
request, so the battery never arrives although the headset is on. No hardware: the
dongle is a fake that answers like the real one did.

Run from the repository root:

    python -m unittest discover -s tests
"""
import os
import sys
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import _hidstub  # noqa: E402, F401

from providers import audeze  # noqa: E402

PATH = b"\\\\?\\hid#vid_3329&pid_4b18&mi_00&col02#x"


def echo(req):
    """What the stuck 4B18 dongle answered: 07 00 <byte 2 of the request> 00 ..."""
    return [audeze.REPORT_ID_IN, 0x00, req[2]] + [0] * (audeze.MSG_SIZE - 3)


def battery(level):
    return ([audeze.REPORT_ID_IN, 0x05, 0x5D, 0x07, 0x00] + list(audeze.BATTERY_MARKER)
            + [level] + [0] * (audeze.MSG_SIZE - 10))


class FakeDongle:
    """Answers each request with echo() while stuck, else with the battery."""

    def __init__(self, stuck, level=80):
        self.stuck, self.level, self.last = stuck, level, None

    def open_path(self, path):
        pass

    def write(self, data):
        self.last = list(data)
        return len(data)

    def get_input_report(self, report_id, size):
        if self.last is None:
            return []
        req, self.last = self.last, None
        return echo(req) if self.stuck else battery(self.level)

    def close(self):
        pass


def ifaces(product="Audeze Maxwell HID", pid=0x4B18):
    return [{"product_id": pid, "serial_number": "0000000000000000", "path": PATH,
             "usage_page": 0xFF13, "usage": 0x0001, "interface_number": 0,
             "product_string": product}]


class StuckDongleTests(unittest.TestCase):
    def setUp(self):
        self.dongle = FakeDongle(stuck=True)
        self.infos = ifaces()
        for p in (mock.patch.object(audeze.hid, "device", lambda: self.dongle),
                  mock.patch.object(audeze.hidlist, "enumerate", lambda vid: self.infos),
                  mock.patch.object(audeze.time, "sleep", lambda s: None)):
            p.start()
            self.addCleanup(p.stop)
        self.p = audeze.AudezeProvider()

    def test_echo_only(self):
        self.assertTrue(audeze.echo_only([bytes(echo([6, 8, 0x80]))] * 5))
        self.assertTrue(audeze.echo_only([bytes(echo([6, 8, 0x00]))] + [bytes(echo([6, 8, 0x80]))] * 4))
        self.assertFalse(audeze.echo_only([bytes(echo([6, 8, 0x80]))] * 4))          # too few
        self.assertFalse(audeze.echo_only([bytes(echo([6, 8, 0x80]))] * 4 + [bytes(battery(80))]))
        self.assertFalse(audeze.echo_only([]))

    def test_first_stuck_poll_shows_nothing(self):
        self.assertEqual(self.p.poll(), [])
        self.assertTrue(any("empty echo" in line for line in self.p.diagnostics()))

    def test_second_stuck_poll_shows_the_hint(self):
        self.p.poll()
        res = self.p.poll()
        self.assertEqual(len(res), 1)
        st = res[0]
        self.assertEqual((st.key, st.name, st.level, st.online, st.approx),
                         ("audeze:0000000000000000", "Audeze Maxwell", None, True, audeze.STUCK_TEXT))

    def test_replug_brings_the_level_back_under_the_same_key(self):
        self.p.poll()
        stuck_key = self.p.poll()[0].key
        self.dongle.stuck = False
        res = self.p.poll()
        self.assertEqual([(s.key, s.level, s.approx) for s in res], [(stuck_key, 80, "")])
        # and the count starts over: one stuck poll after that shows nothing again
        self.dongle.stuck = True
        self.assertEqual(self.p.poll(), [])

    def test_switched_off_headset_is_not_called_stuck(self):
        self.infos = ifaces("Audeze Maxwell Dongle", pid=0x4B19)
        self.p.poll()
        self.assertEqual(self.p.poll(), [])

    def test_a_headset_that_answers_is_not_stuck(self):
        self.dongle.stuck = False
        for _ in range(3):
            res = self.p.poll()
        self.assertEqual([s.level for s in res], [80])


class ZeroAtPowerOnTests(unittest.TestCase):
    """Right after power-on the headset reports 0% for a moment (measured on a 4B18)."""

    def setUp(self):
        self.dongle = FakeDongle(stuck=False, level=0)
        self.infos = ifaces()
        self.now = 1000.0
        for p in (mock.patch.object(audeze.hid, "device", lambda: self.dongle),
                  mock.patch.object(audeze.hidlist, "enumerate", lambda vid: self.infos),
                  mock.patch.object(audeze.time, "sleep", lambda s: None),
                  mock.patch.object(audeze.time, "time", lambda: self.now)):
            p.start()
            self.addCleanup(p.stop)
        self.p = audeze.AudezeProvider()

    def test_zero_right_after_power_on_is_not_a_reading(self):
        res = self.p.poll()
        self.assertEqual([(s.level, s.approx) for s in res], [(None, audeze.WAKING_TEXT)])
        self.assertTrue(self.p.pending)             # the app re-checks in 3 s, not 60
        self.now += 3
        self.dongle.level = 80
        res = self.p.poll()
        self.assertEqual([(s.level, s.approx) for s in res], [(80, "")])
        self.assertFalse(self.p.pending)

    def test_zero_after_the_grace_period_is_believed(self):
        self.p.poll()
        self.now += audeze.ZERO_GRACE + 1
        self.assertEqual([s.level for s in self.p.poll()], [0])
        self.assertFalse(self.p.pending)

    def test_switching_off_and_on_starts_a_new_grace_period(self):
        self.dongle.level = 80
        self.p.poll()
        self.now += 600
        self.infos = []                             # off: no answer (here: not enumerated)
        self.p.poll()
        self.infos = ifaces()
        self.dongle.level = 0
        self.now += 60
        self.assertEqual([s.level for s in self.p.poll()], [None])

    def test_a_real_level_is_shown_at_once(self):
        self.dongle.level = 55
        self.assertEqual([s.level for s in self.p.poll()], [55])


if __name__ == "__main__":
    unittest.main()
