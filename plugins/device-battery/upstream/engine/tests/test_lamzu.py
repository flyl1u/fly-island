"""Tests for providers/lamzu.py. No hardware is needed.

The fake dongle has the collections of a real LAMZU Maya X 8K Dongle (373E:001E)
from a diagnostics report, and answers the feature report exchange:
00 00 02 02 00 83 out, a1 00 02 02 00 83 <charging> <battery %> back.

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

from providers import lamzu as L  # noqa: E402


class FakeCollection:
    """answer: None = never answers (asleep); else (charging, battery %)."""

    def __init__(self, answer=(0, 81)):
        self.answer = answer
        self.sent = []
        self.opened = 0

    def reply(self):
        if not self.sent or self.answer is None:
            return [0x00] * 65
        chg, batt = self.answer
        return [0x00, 0xA1, 0x00, 0x02, 0x02, 0x00, 0x83, chg, batt] + [0x00] * 56


def fake_device_class(cols):
    class FakeDevice:
        def open_path(self, path):
            self.c = cols[path]
            self.c.opened += 1

        def send_feature_report(self, data):
            self.c.sent.append(list(data))
            return len(data)

        def get_feature_report(self, report_id, n):
            return self.c.reply()

        def close(self):
            pass
    return FakeDevice


def maya_x_entries(pid=L.DONGLE, prefix=b"dongle"):
    # the collections of the LAMZU Maya X 8K Dongle in a real diagnostics report
    shape = [(0, 0x0001, 0x02), (1, 0x000C, 0x01), (1, 0x0001, 0x06), (1, 0x0001, 0x80),
             (1, 0xFFA0, 0x01), (1, 0xFFFF, 0x01), (2, 0xFFFF, 0x00)]
    return [{"product_id": pid, "interface_number": i, "usage_page": p, "usage": u,
             "path": prefix + b"-%d-%04x-%d" % (i, p, n), "product_string": "LAMZU Maya X 8K Dongle"}
            for n, (i, p, u) in enumerate(shape)]


class PollTest(unittest.TestCase):
    def setUp(self):
        self._saved = (L.hid, L.hidlist, L.time)
        L.time = types.SimpleNamespace(time=time.time, sleep=lambda s: None)
        self.provider = L.LamzuProvider()

    def tearDown(self):
        L.hid, L.hidlist, L.time = self._saved

    def poll(self, entries, cols):
        L.hid = types.SimpleNamespace(device=fake_device_class(cols))
        L.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        return self.provider.poll()

    def cols(self, entries, answer=(0, 81)):
        return {e["path"]: FakeCollection(answer) for e in entries}

    def test_dongle(self):
        entries = maya_x_entries()
        cols = self.cols(entries)
        res = self.poll(entries, cols)
        self.assertEqual([(r.key, r.name, r.level, r.charging, r.online, r.kind) for r in res],
                         [("lamzu", "LAMZU Maya X", 81, False, True, "mouse")])

    def test_only_interface_2_usage_page_ffff_gets_the_request(self):
        entries = maya_x_entries()
        cols = self.cols(entries)
        self.poll(entries, cols)
        touched = [n for n, e in enumerate(entries) if cols[e["path"]].opened]
        self.assertEqual(touched, [6])            # not the ffff:0001 one on interface 1
        self.assertEqual(cols[entries[6]["path"]].sent,
                         [[0x00, 0x00, 0x00, 0x02, 0x02, 0x00, 0x83] + [0x00] * 58])

    def test_no_such_collection_sends_nothing(self):
        entries = [e for e in maya_x_entries() if e["interface_number"] != 2]
        cols = self.cols(entries)
        self.assertEqual(self.poll(entries, cols), [])
        self.assertTrue(all(not c.opened for c in cols.values()))

    def test_charging(self):
        entries = maya_x_entries()
        res = self.poll(entries, self.cols(entries, answer=(1, 64)))
        self.assertEqual([(r.level, r.charging) for r in res], [(64, True)])

    def test_cable_is_asked_first_and_wins(self):
        dongle = maya_x_entries()
        cable = maya_x_entries(L.WIRED, b"cable")
        cols = {**self.cols(dongle, answer=(0, 70)), **self.cols(cable, answer=(1, 71))}
        res = self.poll(dongle + cable, cols)
        self.assertEqual([(r.level, r.charging) for r in res], [(71, True)])
        self.assertFalse(any(c.sent for p, c in cols.items() if p.startswith(b"dongle")))

    def test_sleeping_mouse_keeps_its_last_value_greyed(self):
        entries = maya_x_entries()
        cols = self.cols(entries)
        self.poll(entries, cols)
        for c in cols.values():
            c.answer = None
        res = self.poll(entries, cols)
        self.assertEqual([(r.level, r.online) for r in res], [(81, False)])
        self.provider._last = (81, False, time.time() - L.ASLEEP_KEEP)
        self.assertEqual(self.poll(entries, cols), [])

    def test_other_pids_are_ignored(self):
        e = [dict(maya_x_entries()[6], product_id=0x0010)]
        cols = self.cols(e)
        self.assertEqual(self.poll(e, cols), [])
        self.assertEqual(cols[e[0]["path"]].opened, 0)


if __name__ == "__main__":
    unittest.main()
