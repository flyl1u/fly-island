"""Tests for providers/gwolves.py. No hardware is needed.

The fake receiver answers the feature report exchange of G-Wolves' web driver
(mouse.xyz): 00 00 02 02 00 83 out, a1 00 02 02 00 83 <charging> <battery %> back.
feature_length() is replaced, because the real one asks Windows for the report
sizes of real collections.

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

from providers import gwolves as G  # noqa: E402


class FakeCollection:
    """answer: None = never answers (asleep); else (charging, battery %)."""

    def __init__(self, feature_len, answer=(0, 77)):
        self.feature_len = feature_len
        self.answer = answer
        self.sent = []
        self.opened = 0

    def reply(self):
        if not self.sent or self.answer is None:
            return [0x00] * 65
        chg, batt = self.answer
        return [0x00, 0xA1, 0x00, 0x02, 0x02, 0x00, 0x83, chg, batt] + [0x00] * 56


class FakeBus:
    def __init__(self, cols):
        self.cols = cols

    def device_class(self):
        bus = self

        class FakeDevice:
            def open_path(self, path):
                self.c = bus.cols[path]
                self.c.opened += 1

            def send_feature_report(self, data):
                self.c.sent.append(list(data))
                return len(data)

            def get_feature_report(self, report_id, n):
                return self.c.reply()

            def close(self):
                pass

        return FakeDevice


def issue_82_entries(pid=G.RECEIVER, prefix=b"rx"):
    # the collections of the G-Wolves Receiver RS in the diagnostics of issue #82
    shape = [(0, 0x0001, 0x02), (1, 0xFF05, 0x00), (1, 0xFF03, 0x00), (1, 0x000C, 0x01),
             (1, 0x0001, 0x80), (1, 0xFF02, 0x02), (1, 0xFF04, 0x02), (1, 0xFF06, 0x02),
             (1, 0x0001, 0x02), (2, 0x0001, 0x06)]
    return [{"product_id": pid, "interface_number": i, "usage_page": p, "usage": u,
             "path": prefix + b"-%d-%04x-%d" % (i, p, n), "product_string": "G-Wolves Receiver RS"}
            for n, (i, p, u) in enumerate(shape)]


class ProviderTest(unittest.TestCase):
    def setUp(self):
        self._saved = (G.hid, G.hidlist, G.feature_length, G.time)
        G.time = types.SimpleNamespace(time=time.time, sleep=lambda s: None)
        self.provider = G.GWolvesProvider()

    def tearDown(self):
        G.hid, G.hidlist, G.feature_length, G.time = self._saved

    def poll(self, entries, cols):
        G.hid = types.SimpleNamespace(device=FakeBus(cols).device_class())
        G.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        G.feature_length = lambda path: cols[path].feature_len
        return self.provider.poll()


def receiver(entries, target_index, answer=(0, 77)):
    """Collections for `entries`: only entries[target_index] has the 65-byte feature report."""
    cols = {}
    for n, e in enumerate(entries):
        cols[e["path"]] = FakeCollection(G.FEATURE_LENGTH if n == target_index else
                                         (0 if n % 2 else 9), answer)
    return cols


class PollTest(ProviderTest):
    def test_receiver_issue_82(self):
        entries = issue_82_entries()
        cols = receiver(entries, 5)
        res = self.poll(entries, cols)
        self.assertEqual([(r.name, r.level, r.charging, r.online, r.kind) for r in res],
                         [("G-Wolves mouse", 77, False, True, "mouse")])
        target = cols[entries[5]["path"]]
        self.assertEqual(target.sent, [[0x00, 0x00, 0x00, 0x02, 0x02, 0x00, 0x83] + [0x00] * 58])

    def test_only_the_collection_with_the_64_byte_feature_report_gets_the_request(self):
        entries = issue_82_entries()
        for target in (0, 5, 7):                  # wherever Windows says the report is
            self.provider = G.GWolvesProvider()
            cols = receiver(entries, target)
            self.poll(entries, cols)
            sent = [n for n, e in enumerate(entries) if cols[e["path"]].sent]
            self.assertEqual(sent, [target])

    def test_no_such_collection_sends_nothing(self):
        entries = issue_82_entries()
        cols = receiver(entries, -99)
        self.assertEqual(self.poll(entries, cols), [])
        self.assertTrue(all(not c.sent and not c.opened for c in cols.values()))

    def test_the_collection_is_remembered(self):
        entries = issue_82_entries()
        cols = receiver(entries, 5)
        calls = []
        self.poll(entries, cols)
        G.feature_length = lambda path: calls.append(path) or cols[path].feature_len
        G.hid = types.SimpleNamespace(device=FakeBus(cols).device_class())
        self.provider.poll()
        self.assertEqual(calls, [])

    def test_charging(self):
        entries = issue_82_entries()
        res = self.poll(entries, receiver(entries, 5, answer=(1, 64)))
        self.assertEqual([(r.level, r.charging) for r in res], [(64, True)])

    def test_sleeping_mouse_keeps_its_last_value_greyed(self):
        entries = issue_82_entries()
        cols = receiver(entries, 5)
        self.poll(entries, cols)
        for c in cols.values():
            c.answer = None
        res = self.poll(entries, cols)
        self.assertEqual([(r.level, r.online) for r in res], [(77, False)])
        self.provider._last = (77, False, time.time() - G.ASLEEP_KEEP)
        self.assertEqual(self.poll(entries, cols), [])

    def test_mouse_on_the_cable_names_the_model_and_wins(self):
        rx = issue_82_entries()
        cable = issue_82_entries(0x4219, b"cable")[:1]           # WARG on its cable
        cols = {**receiver(rx, 5, answer=(0, 70)), **receiver(cable, 0, answer=(1, 71))}
        res = self.poll(rx + cable, cols)
        self.assertEqual([(r.name, r.level, r.charging) for r in res], [("G-Wolves WARG", 71, True)])
        self.assertFalse(cols[rx[5]["path"]].sent)             # the receiver is not asked

    def test_reply_without_a1_is_not_a_level(self):
        self.assertEqual(G.parse_feature([0x00, 0x00, 0x00, 0x02, 0x02, 0x00, 0x83, 0, 50]),
                         (None, None))

    def test_other_vendors_ids_are_ignored(self):
        e = [dict(issue_82_entries()[5], product_id=0x3899)]    # a G-Wolves pid in no list
        cols = {e[0]["path"]: FakeCollection(G.FEATURE_LENGTH)}
        self.assertEqual(self.poll(e, cols), [])
        self.assertEqual(cols[e[0]["path"]].opened, 0)


class TableTest(unittest.TestCase):
    def test_warg_is_known(self):
        self.assertEqual(G.WIRED[0x4219], "G-Wolves WARG")
        self.assertEqual(G.RECEIVER, 0x3854)


if __name__ == "__main__":
    unittest.main()
