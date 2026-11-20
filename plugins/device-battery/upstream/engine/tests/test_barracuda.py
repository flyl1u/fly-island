"""Tests for providers/barracuda.py. No hardware is needed.

The fake receiver records every frame written to it and answers the 'P','A'
queries with 'P','I' replies laid out the way the provider parses them. A
headset that is switched off is a receiver that accepts writes and never
answers. time.sleep is replaced, so the tests count reads and writes rather
than wall-clock time.

Run from the repository root:

    python -m unittest discover -s tests
"""
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _hidstub  # noqa: E402, F401

from providers import barracuda as B  # noqa: E402

PATH = b"\\\\?\\hid#vid_1532&pid_053a&mi_03&col01#x"


def reply(cmd, value):
    r = [0x00] * 64
    r[0], r[1], r[2] = 0x01, 0x80, 0x0A
    r[3], r[4] = B.MARKER_REPLY
    r[5] = 0x08
    r[13], r[14], r[15], r[16] = cmd, 0x01, 1, value
    return r


class FakeReceiver:
    """answers: {cmd: value} for a headset that is on, None when it is off.
    write_results: what write() returns, one per call (then len(frame))."""

    def __init__(self, answers=None, write_results=()):
        self.answers = answers
        self.write_results = list(write_results)
        self.written = []
        self.reads = 0
        self.pending = []

    def device_class(self):
        rx = self

        class FakeDevice:
            def open_path(self, path):
                pass

            def write(self, frame):
                rx.written.append(bytes(frame))
                if rx.write_results:
                    return rx.write_results.pop(0)
                if rx.answers is not None and frame[7] == B.TYPE_QUERY and frame[8] in rx.answers:
                    rx.pending.append(reply(frame[8], rx.answers[frame[8]]))
                return len(frame)

            def read(self, n, timeout=0):
                rx.reads += 1
                return rx.pending.pop(0) if rx.pending else []

            def close(self):
                pass
        return FakeDevice

    def queries(self, cmd):
        return sum(1 for f in self.written if f[7] == B.TYPE_QUERY and f[8] == cmd)

    def remotes(self):
        return [f[9] for f in self.written if f[7] == B.TYPE_REMOTE and f[8] == B.CMD_REMOTE]


class ReadBatteryTest(unittest.TestCase):
    def setUp(self):
        self._saved = (B.hid, B.time)
        self.sleeps = []
        B.time = types.SimpleNamespace(sleep=self.sleeps.append)

    def tearDown(self):
        B.hid, B.time = self._saved

    def run_read(self, rx):
        B.hid = types.SimpleNamespace(device=rx.device_class())
        diag = []
        return B.read_battery(PATH, diag), diag

    def test_headset_on(self):
        rx = FakeReceiver({B.CMD_BATTERY: 77, B.CMD_CHARGING: 1})
        (res, _) = self.run_read(rx)
        self.assertEqual(res, ("ok", 77, True))
        self.assertEqual(rx.remotes(), [1, 0])

    def test_headset_off_skips_the_charging_query(self):
        rx = FakeReceiver(None)
        (res, diag) = self.run_read(rx)
        self.assertEqual(res, ("offline", None, False))
        self.assertIn("    no battery reply", diag)
        self.assertEqual(rx.queries(B.CMD_BATTERY), B.ATTEMPTS)
        self.assertEqual(rx.queries(B.CMD_CHARGING), 0)
        # remote mode is still switched off again, as before
        self.assertEqual(rx.remotes(), [1, 0])

    def test_headset_off_costs_one_query_of_reads(self):
        rx = FakeReceiver(None)
        self.run_read(rx)
        # one query = ATTEMPTS x (1 drain read + 6 reads of REPLY_TIMEOUT_MS), plus one
        # drain read for each of the two remote-mode frames; no second query
        self.assertEqual(rx.reads, B.ATTEMPTS * (1 + 6) + 2)

    def test_failed_write_is_retried_for_remote_mode(self):
        # hidapi returns -1 from write() instead of raising
        rx = FakeReceiver({B.CMD_BATTERY: 50, B.CMD_CHARGING: 0}, write_results=[-1])
        (res, diag) = self.run_read(rx)
        self.assertEqual(res, ("ok", 50, False))
        self.assertEqual(rx.remotes(), [1, 1, 0])
        self.assertEqual(self.sleeps[0], 0.15)
        self.assertTrue(any("write" in line for line in diag))

    def test_receiver_that_rejects_every_write_sends_no_queries(self):
        rx = FakeReceiver({B.CMD_BATTERY: 50}, write_results=[-1] * B.WAKE_ATTEMPTS)
        (res, diag) = self.run_read(rx)
        self.assertEqual(res, ("offline", None, False))
        self.assertIn("    receiver does not accept commands", diag)
        self.assertEqual(rx.queries(B.CMD_BATTERY), 0)
        self.assertEqual(rx.remotes(), [1] * B.WAKE_ATTEMPTS)

    def test_failed_query_write_stops_that_query(self):
        # remote mode on succeeds, then the battery query write fails
        rx = FakeReceiver(None, write_results=[len(B.frame_remote(True)), -1])
        (res, _) = self.run_read(rx)
        self.assertEqual(res, ("offline", None, False))
        self.assertEqual(rx.queries(B.CMD_BATTERY), 1)


class PollTest(unittest.TestCase):
    def setUp(self):
        from providers import hidlist
        self._saved = (B.hid, hidlist.enumerate, B.time)
        B.time = types.SimpleNamespace(sleep=lambda s: None)
        hidlist.enumerate = lambda vid=0: [{"product_id": B.PID, "usage_page": B.USAGE_PAGE_VENDOR,
                                            "usage": 1, "path": PATH}]

    def tearDown(self):
        from providers import hidlist
        B.hid, hidlist.enumerate, B.time = self._saved

    def test_headset_off_shows_the_offline_icon(self):
        rx = FakeReceiver(None)
        B.hid = types.SimpleNamespace(device=rx.device_class())
        res = B.BarracudaProvider().poll()
        self.assertEqual([(r.key, r.name, r.level, r.charging, r.online, r.source, r.kind) for r in res],
                         [("barracuda:053a", "Razer Barracuda Pro (2.4 GHz)", None, False, False,
                           "barracuda", "headset")])


if __name__ == "__main__":
    unittest.main()
