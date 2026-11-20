"""Tests for providers/am_infinity.py. No hardware is needed.

The fake receiver has the collections of the AM Infinity unit from the
diagnostics report in issue #72 (3151:5007; 'ffff:0001' on interface 1 and
'ffff:0002' on interface 2), and answers the reference's status exchange:
a zero-payload F7 poll out on feature report 0, then the charge in feature
report 5 ('05 00 00 64 01 01 01 02' = 100 % on Windows).

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

from providers import am_infinity as A  # noqa: E402

# frames, as the device returns them through hidapi on Windows
WIN100 = [0x05, 0x00, 0x00, 0x64, 0x01, 0x01, 0x01, 0x02]
UNNUM100 = [0x00, 0x00, 0x64, 0x01, 0x01, 0x01, 0x02]
# the junk a wireless reconnect can return: byte 3 would read 99 % without
# the zero-padding check
JUNK = [0x05, 0xAD, 0x04, 0x63, 0x01, 0x01, 0x01, 0x02]


class FakeCollection:
    """replies: queue of frames, each padded to 65 bytes; None = all-zero."""

    def __init__(self, replies=(None,)):
        self.replies = list(replies)
        self.sent = []
        self.opened = 0

    def reply(self):
        if not self.sent:
            return [0x00] * 65
        frame = self.replies.pop(0) if self.replies else None
        if frame is None:
            return [0x00] * 65
        return list(frame) + [0x00] * (65 - len(frame))


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


def infinity_entries(pid=A.PID):
    # the six collections of the AM Infinity receiver in the #72 diagnostics
    shape = [(0, 0x0001, 0x02), (1, 0x000C, 0x01), (1, 0x0001, 0x80),
             (1, 0xFFFF, 0x01), (1, 0x0001, 0x06), (2, 0xFFFF, 0x02)]
    return [{"product_id": pid, "interface_number": i, "usage_page": p, "usage": u,
             "path": b"am-%d-%04x-%02x" % (i, p, u), "product_string": "AM INFINITY 8K MOUSE"}
            for i, p, u in shape]


class PollTest(unittest.TestCase):
    def setUp(self):
        self._saved = (A.hid, A.hidlist, A.time)
        A.time = types.SimpleNamespace(time=time.time, sleep=lambda s: None)
        self.provider = A.AmInfinityProvider()

    def tearDown(self):
        A.hid, A.hidlist, A.time = self._saved

    def poll(self, entries, cols):
        A.hid = types.SimpleNamespace(device=fake_device_class(cols))
        A.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        return self.provider.poll()

    def cols(self, entries, replies=(None,)):
        return {e["path"]: FakeCollection(replies) for e in entries}

    def test_receiver_reports_the_windows_frame(self):
        entries = infinity_entries()
        cols = self.cols(entries, replies=(WIN100,))
        res = self.poll(entries, cols)
        self.assertEqual([(r.key, r.name, r.level, r.charging, r.online, r.kind) for r in res],
                         [("am_infinity", "AM Infinity 8K Mouse", 100, False, True, "mouse")])

    def test_only_ffff_0002_gets_the_poll(self):
        entries = infinity_entries()
        cols = self.cols(entries, replies=(WIN100,))
        self.poll(entries, cols)
        touched = [n for n, e in enumerate(entries) if cols[e["path"]].opened]
        self.assertEqual(touched, [5])                 # not the ffff:0001 on interface 1
        self.assertEqual(cols[entries[5]["path"]].sent,
                         [[0x00, 0xF7] + [0x00] * 63])  # one 65-byte zero-payload poll

    def test_unnumbered_frame_reads_byte_2(self):
        entries = infinity_entries()
        res = self.poll(entries, self.cols(entries, replies=(UNNUM100,)))
        self.assertEqual([(r.level, r.online) for r in res], [(100, True)])

    def test_charge_is_clamped_to_100(self):
        entries = infinity_entries()
        frame = [0x05, 0x00, 0x00, 0xFA, 0x01, 0x01, 0x01, 0x02]   # 250, the reference clamps
        res = self.poll(entries, self.cols(entries, replies=(frame,)))
        self.assertEqual([r.level for r in res], [100])

    def test_zero_charge_is_unknown_not_0(self):
        entries = infinity_entries()
        res = self.poll(entries, self.cols(entries, replies=(None,)))
        self.assertEqual(res, [])
        self.assertEqual(self.provider._diag[-1], "    no charge in the status report "
                         "(mouse off or asleep, or the 2.4G link is not up)")

    def test_junk_frame_is_refused(self):
        entries = infinity_entries()
        res = self.poll(entries, self.cols(entries, replies=(JUNK, JUNK)))
        self.assertEqual(res, [])

    def test_second_buffer_length_is_tried(self):
        entries = infinity_entries()
        cols = self.cols(entries, replies=(JUNK, WIN100))    # 65 gets junk, 67 answers
        res = self.poll(entries, cols)
        self.assertEqual([r.level for r in res], [100])
        self.assertEqual([len(p) for p in cols[entries[5]["path"]].sent], [65, 67])

    def test_missing_collection_sends_nothing(self):
        entries = [e for e in infinity_entries() if e["usage_page"] != 0xFFFF]
        cols = self.cols(entries)
        self.assertEqual(self.poll(entries, cols), [])
        self.assertTrue(all(not c.opened for c in cols.values()))

    def test_other_pids_are_ignored(self):
        entries = [dict(e, product_id=0x5008) for e in infinity_entries()]
        cols = self.cols(entries)
        self.assertEqual(self.poll(entries, cols), [])
        self.assertTrue(all(not c.opened for c in cols.values()))

    def test_silent_receiver_keeps_the_last_value_greyed(self):
        entries = infinity_entries()
        cols = self.cols(entries, replies=(WIN100,))
        self.poll(entries, cols)
        for c in cols.values():
            c.replies = [None]
            c.sent.clear()
        res = self.poll(entries, cols)
        self.assertEqual([(r.level, r.online) for r in res], [(100, False)])
        self.provider._last = (100, time.time() - A.ASLEEP_KEEP)
        self.assertEqual(self.poll(entries, cols), [])


if __name__ == "__main__":
    unittest.main()
