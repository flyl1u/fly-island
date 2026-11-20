"""Tests for providers/hyperx_cloud3s.py (HyperX Cloud III S Wireless). No hardware.

The fake dongle has the six collections of the #106 diagnostics and behaves the way
NGENUITY's USB captures (HyperHeadset #36 / PR #42) and the #106 test show:
  * only one collection takes output report 0x0C; the others refuse it, and hidapi
    returns -1 (it does not raise);
  * a feature report with the same bytes is taken and ignored (no answer) - what the
    first version of this provider sent in #106;
  * the answer is an input report 0x0C, delivered to the collection that declares it,
    which can be another one than the collection that took the request.
A fake clock replaces time.

Run from the repository root:

    python -m unittest discover -s tests
"""
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _hidstub  # noqa: E402, F401

from providers import hyperx_cloud3s as H  # noqa: E402


class Clock:
    def __init__(self):
        self.now = 1000.0

    def time(self):
        return self.now

    def sleep(self, s):
        self.now += s


def issue_106_entries(pid=0x02CC):
    shape = [(0x000C, 1), (0xFF13, 1), (0x000B, 5), (0xFFC0, 0x0202), (0x01C0, 1), (0x170F, 0x0202)]
    return [{"product_id": pid, "interface_number": 3, "usage_page": p, "usage": u,
             "path": b"%04x:%04x" % (p, u), "product_string": "HyperX Cloud III S Wireless"}
            for p, u in shape]


class Dongle:
    """takes: the collection that declares output report 0x0C; answers_on: the one
    that declares input report 0x0C. level None = the headset is off (0xFF)."""

    def __init__(self, takes=b"ff13:0001", answers_on=b"ff13:0001", level=62, charge=0,
                 silent=False):
        self.takes, self.answers_on = takes, answers_on
        self.level, self.charge, self.silent = level, charge, silent
        self.inbox = {}                   # path -> queued input reports
        self.writes = []                  # (path, packet)
        self.features = []
        self.opened = []

    def output(self, path, data):
        if path != self.takes:
            return -1                     # hidapi: the collection has no such report
        data = list(data)
        self.writes.append((path, data))
        if self.silent:
            return len(data)
        cmd = data[5]
        value = {H.CMD_BATTERY: self.level, H.CMD_CHARGING: self.charge}.get(cmd)
        r = [0x0C, 0x02, 0x03, 0x01, 0x00, cmd, 0xFF if value is None else value] + [0] * 57
        self.inbox.setdefault(self.answers_on, []).append(r)
        return len(data)

    def feature(self, path, data):
        self.features.append((path, list(data)))
        return len(data)                  # taken, never answered

    def read(self, path):
        q = self.inbox.get(path) or []
        return q.pop(0) if q else []


class FakeBus:
    def __init__(self, dongle):
        self.dongle = dongle

    def device_class(self):
        dongle = self.dongle

        class FakeDevice:
            def open_path(self, path):
                self.path = path
                dongle.opened.append(path)

            def set_nonblocking(self, on):
                pass

            def write(self, data):
                return dongle.output(self.path, data)

            def send_feature_report(self, data):
                return dongle.feature(self.path, data)

            def read(self, n):
                return dongle.read(self.path)

            def close(self):
                pass

        return FakeDevice


class Cloud3STest(unittest.TestCase):
    def setUp(self):
        self._saved = (H.hid, H.hidlist, H.time)
        self.clock = Clock()
        H.time = types.SimpleNamespace(time=self.clock.time, sleep=self.clock.sleep)
        self.provider = H.HyperXCloud3SProvider()

    def tearDown(self):
        H.hid, H.hidlist, H.time = self._saved

    def poll(self, dongle, entries=None):
        entries = issue_106_entries() if entries is None else entries
        H.hid = types.SimpleNamespace(device=FakeBus(dongle).device_class())
        H.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        return self.provider.poll()

    def test_issue_106(self):
        dongle = Dongle(level=90)
        res = self.poll(dongle)
        self.assertEqual([(r.name, r.level, r.charging, r.online, r.kind, r.key) for r in res],
                         [("HyperX Cloud III S Wireless", 90, False, True, "headset", "hyperx:02cc")])
        self.assertEqual(dongle.writes[0][1], [0x0C, 0x02, 0x03, 0x01, 0x00, 0x06] + [0] * 58)
        self.assertEqual(dongle.writes[1][1][:6], [0x0C, 0x02, 0x03, 0x01, 0x00, 0x48])

    def test_output_reports_only_never_feature_reports(self):
        # the first version sent feature reports: the dongle took them and never answered
        dongle = Dongle()
        self.poll(dongle)
        self.poll(dongle)
        self.assertEqual(dongle.features, [])
        for _, pkt in dongle.writes:
            self.assertEqual(pkt[3], 0x01)          # 01 = get; 00 would set a value
            self.assertIn(pkt[5], (H.CMD_BATTERY, H.CMD_CHARGING))

    def test_the_answer_is_read_on_another_collection(self):
        dongle = Dongle(takes=b"ffc0:0202", answers_on=b"ff13:0001", level=55)
        self.assertEqual([r.level for r in self.poll(dongle)], [55])

    def test_a_refused_write_returns_minus_one_and_the_next_collection_is_tried(self):
        for target in (b"ffc0:0202", b"170f:0202", b"000c:0001"):
            self.provider = H.HyperXCloud3SProvider()
            dongle = Dongle(takes=target, answers_on=target)
            self.assertEqual([r.level for r in self.poll(dongle)], [62], target)
            self.assertEqual({p for p, _ in dongle.writes}, {target})

    def test_vendor_pages_first_and_the_collection_is_remembered(self):
        dongle = Dongle(takes=b"ffc0:0202", answers_on=b"ffc0:0202")
        self.poll(dongle)
        self.assertIn("refused by ff13:0001", " ".join(self.provider.diagnostics()))
        self.assertNotIn("000c:0001", " ".join(self.provider.diagnostics()))
        self.poll(dongle)
        self.assertNotIn("refused", " ".join(self.provider.diagnostics()))

    def test_charging_and_fully_charged(self):
        for state, flag in ((0, False), (1, True), (2, True), (7, False)):
            self.provider = H.HyperXCloud3SProvider()
            res = self.poll(Dongle(charge=state))
            self.assertEqual([r.charging for r in res], [flag], state)

    def test_switched_off_headset_gives_no_icon(self):
        self.assertEqual(self.poll(Dongle(level=None)), [])        # the dongle answers 0xFF

    def test_a_silent_dongle_gives_no_icon_and_says_what_to_do(self):
        self.assertEqual(self.poll(Dongle(silent=True)), [])
        self.assertIn("plug it in again", " ".join(self.provider.diagnostics()))

    def test_a_level_above_100_is_refused(self):
        self.assertEqual(self.poll(Dongle(level=0xC8)), [])

    def test_other_reports_before_the_reply_are_skipped(self):
        dongle = Dongle()
        dongle.inbox[b"ff13:0001"] = [[0x0F, 0x01] + [0] * 62, [0x05, 0x02] + [0] * 62,
                                      [0x0C, 0, 0, 0, 0, 0x04, 1] + [0] * 57]     # a mute reply
        self.assertEqual([r.level for r in self.poll(dongle)], [62])

    def test_a_charging_reply_is_not_taken_for_the_battery(self):
        dongle = Dongle(level=62, charge=1)
        dongle.inbox[b"ff13:0001"] = [[0x0C, 0x02, 0x03, 0x01, 0x00, 0x48, 1] + [0] * 57,
                                      [0x0D, 0, 0, 0, 10, 1] + [0] * 58]
        self.assertEqual([(r.level, r.charging) for r in self.poll(dongle)], [(62, True)])

    def test_a_battery_notification_is_a_reading(self):
        self.assertEqual(H.parse([0x0D, 0, 0, 0, 1, 55, 0]), ("battery", 55))
        self.assertEqual(H.parse([0x0D, 0, 0, 0, 10, 1, 0]), ("charging", 1))
        self.assertIsNone(H.parse([0x0D, 0, 0, 0, 3, 1, 0]))         # mute
        self.assertIsNone(H.parse([0x0C, 0, 0, 0, 0, 0x06, 0xFF]))

    def test_cloud_iii_ids_are_not_touched(self):
        dongle = Dongle()
        entries = [dict(e, product_id=0x05B7) for e in issue_106_entries()]
        self.assertEqual(self.poll(dongle, entries), [])
        self.assertEqual(dongle.opened, [])


if __name__ == "__main__":
    unittest.main()
