"""Tests for providers/wlmouse.py. No hardware is needed.

The HID layer is replaced: a fake receiver whose 0xFFFF collections answer or stay
silent, and a fake clock, so a walk runs without real waiting. The backoff of #62
item 5 - a switched-off mouse is not walked on every poll - is pinned by counting
how often the silent receiver is walked.

Run from the repository root:

    python -m unittest discover -s tests
"""
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _hidstub  # noqa: E402, F401

from providers import wlmouse as W  # noqa: E402

RECEIVER_PID = 0xA880                    # Beast X Max, the confirmed one
CABLE_PID = 0xA881                       # stands in for "a second device appeared"


def path_for(pid, iface):
    return (f"\\\\?\\hid#vid_36a7&pid_{pid:04x}&mi_{iface:02x}"
            f"#7&8f0a1b2c&0&0000#{{4d1e55b2-f16f-11cf-88cb-001111000030}}").encode()


def entry(pid, iface, usage_page=0xFFFF, usage=0x0000, product="WLmouse Beast X Max"):
    return {"product_id": pid, "interface_number": iface, "usage_page": usage_page,
            "usage": usage, "path": path_for(pid, iface), "product_string": product}


def feature_reply(batt=90, chg=1):
    return [0xA1, 0x00, 0x02, 0x02, 0x00, 0x83, chg, batt] + [0] * 57


def heartbeat(batt=90, chg=0):
    return [0x03, 0x00, batt, chg] + [0] * 60


class Clock:
    def __init__(self):
        self.now = 1000.0

    def time(self):
        return self.now

    def sleep(self, s):
        self.now += s


class FakePuck:
    """One fake HID device behind a path: feature answers and heartbeat frames."""

    def __init__(self, feature=None, beats=None):
        self.feature = feature          # what get_feature_report returns
        self.beats = list(beats or [])  # frames handed out by read()
        self.sends = 0
        self.opens = 0


class FakeBus:
    def __init__(self, pucks, clock):
        self.pucks = pucks              # {path: FakePuck}
        self.clock = clock

    def device_class(self):
        bus = self

        class FakeDevice:
            def open_path(self, path):
                if path not in bus.pucks:
                    raise OSError("cannot open")
                self.puck = bus.pucks[path]
                self.puck.opens += 1

            def set_nonblocking(self, on):
                pass

            def send_feature_report(self, data):
                self.puck.sends += 1
                return len(data)

            def get_feature_report(self, rid, length):
                return self.puck.feature if self.puck.feature else []

            def read(self, n):
                if self.puck.beats:
                    frame = self.puck.beats.pop(0)
                    bus.clock.now += 0.02
                    return frame
                return []

            def close(self):
                pass

        return FakeDevice


class ProviderTest(unittest.TestCase):
    def setUp(self):
        self._saved = (W.hid, W.hidlist, W.time)
        self.clock = Clock()
        W.time = types.SimpleNamespace(time=self.clock.time, sleep=self.clock.sleep)
        self.provider = W.WLmouseProvider()

    def tearDown(self):
        W.hid, W.hidlist, W.time = self._saved

    def poll(self, entries, pucks):
        bus = FakeBus(pucks, self.clock)
        W.hid = types.SimpleNamespace(device=bus.device_class())
        W.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        return self.provider.poll()


# ------------------------------------------------------------------ parse
class ParseTest(unittest.TestCase):
    def test_feature_reply(self):
        self.assertEqual(W.parse_feature(feature_reply(90, 1)), (90, True))
        self.assertEqual(W.parse_feature(feature_reply(0, 0)), (0, False))
        self.assertEqual(W.parse_feature(feature_reply(101, 1)), (None, None))
        self.assertEqual(W.parse_feature([0] * 65), (None, None))
        self.assertEqual(W.parse_feature([]), (None, None))

    def test_heartbeat(self):
        self.assertEqual(W.parse_heartbeat(heartbeat(90, 0)), (90, False))
        self.assertEqual(W.parse_heartbeat(heartbeat(100, 1)), (100, True))
        self.assertEqual(W.parse_heartbeat([0x02, 0x00, 90, 0]), (None, None))
        self.assertEqual(W.parse_heartbeat([]), (None, None))


# ------------------------------------------------------------------ polling
class PollTest(ProviderTest):
    def test_no_receiver_costs_nothing(self):
        t0 = self.clock.now
        self.assertEqual(self.poll([], {}), [])
        self.assertEqual(self.clock.now, t0)

    def test_a_silent_receiver_is_walked_every_fifth_poll(self):
        # #62 item 5: with the mouse off, each walk costs ~2.75 s of fake time
        # (0.75 s of refusals + the 2 s listen); polls 1-3 walk, 4-7 are skipped,
        # poll 8 walks again.
        puck = FakePuck()
        pucks = {path_for(RECEIVER_PID, 0): puck}
        entries = [entry(RECEIVER_PID, 0)]
        for i in range(8):
            t0 = self.clock.now
            res = self.poll(entries, pucks)
            self.assertEqual(res, [], f"poll {i + 1}")
            if i < 3 or i == 7:
                self.assertGreaterEqual(self.clock.now - t0, 2.0, f"poll {i + 1} walked")
            else:
                self.assertLess(self.clock.now - t0, 0.01, f"poll {i + 1} skipped")
        self.assertEqual(puck.sends, 4)          # one send per walk: polls 1-3 and 8

    def test_a_reading_keeps_the_rate_and_a_stale_one_backs_off(self):
        puck = FakePuck(feature=feature_reply(85, 0))
        pucks = {path_for(RECEIVER_PID, 0): puck}
        entries = [entry(RECEIVER_PID, 0)]
        for _ in range(2):                        # a reading arrives: every poll walks
            res = self.poll(entries, pucks)
            self.assertEqual([(r.level, r.online) for r in res], [(85, True)])
        self.assertEqual(puck.sends, 2)
        self.provider._last["wlmouse"] = (85, False, self.clock.now)
        # the mouse goes quiet: the greyed value shows and every poll still walks
        puck.feature = None
        walked = puck.sends
        for i in range(4):
            self.clock.now += 60                  # a poll a minute while it is fresh
            res = self.poll(entries, pucks)
            self.assertEqual([(r.level, r.online) for r in res], [(85, False)], f"poll {i}")
        self.assertEqual(puck.sends, walked + 4)
        # past ASLEEP_KEEP the icon is gone and the walk backs off
        self.clock.now += 60
        t0 = self.clock.now
        self.assertEqual(self.poll(entries, pucks), [])
        self.assertLess(self.clock.now - t0, 0.01)
        t0 = self.clock.now
        self.assertEqual(self.poll(entries, pucks), [])
        self.assertLess(self.clock.now - t0, 0.01)

    def test_the_backoff_ends_when_the_mouse_answers_again(self):
        puck = FakePuck()
        pucks = {path_for(RECEIVER_PID, 0): puck}
        entries = [entry(RECEIVER_PID, 0)]
        for _ in range(4):                        # enter the skip regime
            self.poll(entries, pucks)
        t0 = self.clock.now
        self.assertEqual(self.poll(entries, pucks), [])
        self.assertLess(self.clock.now - t0, 0.01)
        puck.feature = feature_reply(77, 1)       # it answers on the next walk
        res = []
        for _ in range(5):                        # within one backoff period
            res = self.poll(entries, pucks)
            if res:
                break
        self.assertEqual([(r.level, r.charging, r.online) for r in res], [(77, True, True)])
        res = self.poll(entries, pucks)           # and keeps the full rate again
        self.assertEqual([(r.level, r.online) for r in res], [(77, True)])

    def test_a_new_device_is_walked_at_once(self):
        puck = FakePuck()
        pucks = {path_for(RECEIVER_PID, 0): puck}
        entries = [entry(RECEIVER_PID, 0)]
        for _ in range(4):                        # enter the skip regime
            self.poll(entries, pucks)
        t0 = self.clock.now
        self.assertEqual(self.poll(entries, pucks), [])
        self.assertLess(self.clock.now - t0, 0.01)
        # the charging cable appears: the very next poll walks again
        cable = FakePuck(feature=feature_reply(91, 1))
        pucks[path_for(CABLE_PID, 0)] = cable
        res = self.poll(entries + [entry(CABLE_PID, 0)], pucks)
        self.assertEqual([(r.level, r.charging, r.online) for r in res], [(91, True, True)])
        self.assertEqual(cable.sends, 1)


if __name__ == "__main__":
    unittest.main()
