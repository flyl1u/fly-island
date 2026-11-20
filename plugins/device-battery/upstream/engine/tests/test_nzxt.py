"""Tests for providers/nzxt.py. No hardware and no CAM needed.

The frames are the ones CAM 4.76.5 exchanged with the reporter's NZXT Lift
Elite in the USBPcap captures of issue #148. Eight of the telemetry reads are
fixtures here: three wireless (77 %, 76 %, and the last one with flags byte
82), three from the charging session (byte 22's low bit set while the charging
cable was in), and two with the mouse on its USB cable (id 1e71:2129, 84 %).
The collection shape is the reporter's diagnostics dump (1e71:2101: the
ffca:0001 vendor collection plus the mouse's and the dongle's others).

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

from providers import nzxt as N  # noqa: E402


def telem(level=76, mv=0x0FFD, flags=0x86, extra=0x00F3, charge=0x00, b21=0x1E, b10=0xFF):
    """A telemetry reply as captured, with the fields under test adjustable."""
    r = bytearray(64)
    r[:4] = bytes([0x4E, 0x02, 0x97, 0x00])
    r[4:7] = bytes([0x01, 0x40, 0x01])
    r[7] = flags
    r[8:10] = mv.to_bytes(2, "big")
    r[10] = b10
    r[11:13] = bytes([0x40, 0x01])
    r[13:15] = extra.to_bytes(2, "little")
    r[15:17] = bytes([0x43, 0x00])
    r[17:19] = level.to_bytes(2, "little")
    r[19:21] = bytes([0x64, 0x00])
    r[21:23] = bytes([b21, charge])
    r[23:25] = bytes([0x08, 0x00])
    r[25:27] = bytes([0x40, 0x01])
    return bytes(r)


# the exact bytes of captured replies: three wireless and three from the
# charging session (the cable went in after the wireless ones were taken)
CAP_77 = bytes.fromhex("4e 02 97 00 01 40 01 86 0f fd ff 40 01 f6 00 43 00 4d 00"
                       " 64 00 1e 00 08 00 40 01") + bytes(37)
CAP_76 = bytes.fromhex("4e 02 97 00 01 40 01 86 0f fd ff 40 01 f3 00 43 00 4c 00"
                       " 64 00 1e 00 08 00 40 01") + bytes(37)
CAP_76B = bytes.fromhex("4e 02 97 00 01 40 01 82 0f fc ff 40 01 f3 00 43 00 4c 00"
                        " 64 00 1e 00 08 00 40 01") + bytes(37)
CAP_CHARGE_77 = bytes.fromhex("4e 02 97 00 01 40 01 1c 10 fc ff 40 01 f6 00 43 00 4d 00"
                              " 64 00 1e 01 08 00 40 01") + bytes(37)
CAP_CHARGE_78 = bytes.fromhex("4e 02 97 00 01 40 01 31 10 2b 01 40 01 f9 00 43 00 4e 00"
                              " 64 00 1c 01 08 00 40 01") + bytes(37)
CAP_78_FREE = bytes.fromhex("4e 02 97 00 01 40 01 9b 0f fc ff 40 01 f9 00 43 00 4e 00"
                            " 64 00 1e 00 08 00 40 01") + bytes(37)
CAP_WIRED_84 = bytes.fromhex("4e 02 97 00 01 40 01 ac 0f fc ff 40 01 0c 01 43 00 54 00"
                             " 64 00 1f 01 08 00 40 01") + bytes(37)
CAP_WIRED_CHARGE_84 = bytes.fromhex("4e 02 97 00 01 40 01 31 10 fc ff 40 01 0c 01 43 00 54 00"
                                    " 64 00 1f 01 08 00 40 01") + bytes(37)

ACK = bytes([0x4E, 0xE5] + [0x00] * 62)


class FakeCollection:
    """pre: frames read before the write (drain); post: frames read after it."""

    def __init__(self, pre=(), post=()):
        self.pre = list(pre)
        self.post = list(post)
        self.opened = 0
        self.written = []

    def read(self):
        # pre = frames that arrived before the provider sent its request (stale);
        # post = frames that only come after it - the write is what gates them.
        if self.written:
            return self.post.pop(0) if self.post else []
        return self.pre.pop(0) if self.pre else []


def fake_device_class(cols, order_log, write_result=None, write_raises=False):
    class FakeDevice:
        def open_path(self, path):
            self.c = cols[path]
            self.c.opened += 1
            order_log.append(path)

        def read(self, n, timeout):
            return self.c.read()

        def write(self, buf):
            self.c.written.append(bytes(buf))
            if write_raises:
                raise OSError("refused")
            return len(buf) if write_result is None else write_result

        def close(self):
            pass
    return FakeDevice


def receiver_entries(prefix=b"dev"):
    # the dongle's collections as the reporter's diagnostics dump lists them
    shape = [(0, 0x0001, 0x02), (1, 0xFFCA, 0x0001), (2, 0x000C, 0x0001),
             (2, 0xFF01, 0x0002), (2, 0x0001, 0x06)]
    return [{"product_id": N.RECEIVER_PID, "interface_number": i, "usage_page": p,
             "usage": u, "path": prefix + b"-%d-%04x-%d" % (i, p, n),
             "product_string": "NZXT Lift Elite Dongle"}
            for n, (i, p, u) in enumerate(shape)]


def wired_entries(prefix=b"wdev"):
    # the mouse on its USB cable: the same collection shape, id 1e71:2129
    shape = [(0, 0x0001, 0x02), (1, 0xFFCA, 0x0001), (2, 0x000C, 0x0001)]
    return [{"product_id": N.CABLE_PID, "interface_number": i, "usage_page": p,
             "usage": u, "path": prefix + b"-%d-%04x-%d" % (i, p, n),
             "product_string": "NZXT Lift Elite"}
            for n, (i, p, u) in enumerate(shape)]


class PollTest(unittest.TestCase):
    def setUp(self):
        self._saved = (N.hid, N.hidlist, N.time)
        self.now = [1000.0]
        N.time = types.SimpleNamespace(time=lambda: self.now[0], sleep=lambda s: None)
        self.provider = N.NzxtProvider()
        self.order = []

    def tearDown(self):
        N.hid, N.hidlist, N.time = self._saved

    def poll(self, entries, cols, **kwargs):
        N.hid = types.SimpleNamespace(device=fake_device_class(cols, self.order, **kwargs))
        N.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        return self.provider.poll()

    def cols(self, entries, pre=(), post=(ACK, CAP_76)):
        first = N.candidates(entries)[0]
        return {e["path"]: FakeCollection(pre, post if e["path"] == first["path"] else ())
                for e in entries}

    # ---------------------------------------------------------------- parsing

    def test_the_captured_frames_decode(self):
        self.assertEqual(N.parse_telemetry(CAP_77), (77, 4093, False))
        self.assertEqual(N.parse_telemetry(CAP_76), (76, 4093, False))
        self.assertEqual(N.parse_telemetry(CAP_76B), (76, 4092, False))

    def test_the_charging_frames_decode(self):
        self.assertEqual(N.parse_telemetry(CAP_CHARGE_77), (77, 4348, True))
        self.assertEqual(N.parse_telemetry(CAP_CHARGE_78), (78, 4139, True))
        self.assertEqual(N.parse_telemetry(CAP_78_FREE), (78, 4092, False))

    def test_the_wired_frames_decode(self):
        self.assertEqual(N.parse_telemetry(CAP_WIRED_84), (84, 4092, True))
        self.assertEqual(N.parse_telemetry(CAP_WIRED_CHARGE_84), (84, 4348, True))

    def test_the_fixtures_are_the_captured_bytes(self):
        self.assertEqual(CAP_77, telem(level=77, mv=0x0FFD, flags=0x86, extra=0x00F6))
        self.assertEqual(CAP_76, telem(level=76, mv=0x0FFD, flags=0x86, extra=0x00F3))
        self.assertEqual(CAP_76B, telem(level=76, mv=0x0FFC, flags=0x82, extra=0x00F3))
        self.assertEqual(CAP_CHARGE_77,
                         telem(level=77, mv=0x10FC, flags=0x1C, extra=0x00F6, charge=0x01))
        self.assertEqual(CAP_CHARGE_78,
                         telem(level=78, mv=0x102B, flags=0x31, extra=0x00F9,
                               charge=0x01, b21=0x1C, b10=0x01))
        self.assertEqual(CAP_78_FREE,
                         telem(level=78, mv=0x0FFC, flags=0x9B, extra=0x00F9))
        self.assertEqual(CAP_WIRED_84,
                         telem(level=84, mv=0x0FFC, flags=0xAC, extra=0x010C,
                               charge=0x01, b21=0x1F))
        self.assertEqual(CAP_WIRED_CHARGE_84,
                         telem(level=84, mv=0x10FC, flags=0x31, extra=0x010C,
                               charge=0x01, b21=0x1F))

    def test_the_request_is_the_captured_request(self):
        self.assertEqual(N.REQUEST, bytes([0x4E, 0x02, 0x81, 0x00, 0xB0]) + bytes(59))

    def test_a_level_above_100_is_refused(self):
        self.assertIsNone(N.parse_telemetry(telem(level=101)))
        self.assertIsNone(N.parse_telemetry(telem(level=0x400)))

    def test_other_replies_are_not_telemetry(self):
        ack = bytes([0x4E, 0xE5] + [0x00] * 62)
        self.assertIsNone(N.parse_telemetry(ack))
        other = bytearray(CAP_76)
        other[2] = 0x90                      # a different property's reply
        self.assertIsNone(N.parse_telemetry(bytes(other)))
        self.assertIsNone(N.parse_telemetry(CAP_76[:12]))
        self.assertIsNone(N.parse_telemetry(b""))

    # ---------------------------------------------------------------- polling

    def test_the_captured_mouse_is_read_and_the_request_is_sent(self):
        entries = receiver_entries()
        cols = self.cols(entries)
        out = self.poll(entries, cols)
        self.assertEqual(len(out), 1)
        s = out[0]
        self.assertEqual((s.key, s.name, s.level, s.charging, s.online, s.source, s.kind),
                         ("nzxt:2101", "NZXT Lift Elite", 76, False, True,
                          "nzxt", "mouse"))
        first = N.candidates(entries)[0]
        self.assertEqual(cols[first["path"]].written, [N.REQUEST])

    def test_the_charging_cable_reads_as_charging(self):
        entries = receiver_entries()
        cols = self.cols(entries, post=(ACK, CAP_CHARGE_77))
        out = self.poll(entries, cols)
        self.assertEqual((out[0].level, out[0].charging), (77, True))

    def test_the_wired_mouse_reads_too(self):
        # the same mouse on the cable is the same icon: keyed on the receiver id
        entries = wired_entries()
        cols = self.cols(entries, post=(ACK, CAP_WIRED_84))
        out = self.poll(entries, cols)
        self.assertEqual((out[0].key, out[0].level, out[0].charging),
                         ("nzxt:2101", 84, True))

    def test_both_ids_at_once_are_one_icon_preferring_charging(self):
        entries = wired_entries() + receiver_entries()
        cols = {e["path"]: FakeCollection(post=(ACK, CAP_WIRED_84 if
                                                e["product_id"] == N.CABLE_PID else CAP_76))
                for e in entries}
        out = self.poll(entries, cols)
        self.assertEqual([(s.key, s.name, s.level, s.charging, s.online) for s in out],
                         [("nzxt:2101", "NZXT Lift Elite", 84, True, True)])

    def test_one_silent_id_does_not_add_a_greyed_twin(self):
        # the mouse is on its cable: the receiver stays silent while the cable
        # answers - one icon, not a fresh one plus a greyed twin (review by
        # @ahmedkhursheed23)
        entries = wired_entries() + receiver_entries()

        def fresh_cols():
            return {e["path"]: FakeCollection(post=(ACK, CAP_CHARGE_77)
                                              if e["product_id"] == N.CABLE_PID else ())
                    for e in entries}

        self.poll(entries, fresh_cols())             # the first poll sets the kept value
        out = self.poll(entries, fresh_cols())
        self.assertEqual([(s.key, s.level, s.charging, s.online) for s in out],
                         [("nzxt:2101", 77, True, True)])
        self.assertTrue(any("pid=2101: no reply" in line
                            for line in self.provider.diagnostics()))

    def test_both_silent_keeps_one_greyed_icon(self):
        entries = wired_entries() + receiver_entries()
        live = {e["path"]: FakeCollection(post=(ACK, CAP_76))
                if e["product_id"] == N.RECEIVER_PID else FakeCollection()
                for e in entries}
        self.poll(entries, live)
        out = self.poll(entries, {e["path"]: FakeCollection() for e in entries})
        self.assertEqual([(s.key, s.level, s.online) for s in out],
                         [("nzxt:2101", 76, False)])

    def test_the_ack_is_skipped_and_junk_ignored(self):
        entries = receiver_entries()
        junk = bytearray(CAP_76)
        junk[2] = 0x90
        cols = self.cols(entries, post=(ACK, bytes(junk), CAP_77))
        out = self.poll(entries, cols)
        self.assertEqual(out[0].level, 77)

    def test_a_stale_frame_is_drained_before_the_request(self):
        entries = receiver_entries()
        cols = self.cols(entries, pre=(CAP_77,), post=(ACK, CAP_76))
        out = self.poll(entries, cols)
        self.assertEqual(out[0].level, 76)
        self.assertTrue(any("drained stale" in line for line in self.provider.diagnostics()))

    def test_a_refused_write_reports_itself(self):
        entries = receiver_entries()
        out = self.poll(entries, self.cols(entries), write_raises=True)
        self.assertEqual(out, [])
        self.assertTrue(any("refused" in line for line in self.provider.diagnostics()))

    def test_a_write_that_fails_with_minus_one_reports_itself(self):
        entries = receiver_entries()
        out = self.poll(entries, self.cols(entries), write_result=-1)
        self.assertEqual(out, [])
        self.assertTrue(any("refused" in line for line in self.provider.diagnostics()))

    def test_no_reply_gives_nothing(self):
        entries = receiver_entries()
        out = self.poll(entries, self.cols(entries, post=(ACK,)))
        self.assertEqual(out, [])
        self.assertTrue(any("no telemetry reply" in line
                            for line in self.provider.diagnostics()))

    def test_silence_keeps_the_last_level_greyed_out(self):
        entries = receiver_entries()
        self.poll(entries, self.cols(entries))
        self.now[0] += 60
        out = self.poll(entries, self.cols(entries, post=()))
        self.assertEqual((out[0].level, out[0].online), (76, False))

    def test_silence_after_the_keep_window_drops_the_device(self):
        entries = receiver_entries()
        self.poll(entries, self.cols(entries))
        self.now[0] += N.ASLEEP_KEEP + 1
        out = self.poll(entries, self.cols(entries, post=()))
        self.assertEqual(out, [])

    def test_no_dongle_gives_nothing(self):
        out = self.poll([], {})
        self.assertEqual(out, [])

    def test_the_keyboard_id_is_not_claimed(self):
        entries = receiver_entries() + [
            {"product_id": 0x2131, "interface_number": 1, "usage_page": 0xFFCA,
             "usage": 0x0001, "path": b"dev-kb", "product_string": "NZXT KEYBOARD"}]
        cols = self.cols(entries)
        out = self.poll(entries, cols)
        self.assertEqual([s.key for s in out], ["nzxt:2101"])
        self.assertEqual(cols[b"dev-kb"].written, [])

    # ---------------------------------------------------------------- order

    def test_candidates_pick_only_the_vendor_collection(self):
        cand = N.candidates(receiver_entries())
        self.assertEqual([(d["usage_page"], d["usage"]) for d in cand], [(0xFFCA, 0x0001)])

    def test_the_answered_collection_is_tried_first_next_poll(self):
        entries = receiver_entries()
        second = dict(entries[1], path=b"dev-b", interface_number=3)
        entries.append(second)
        first_cand, second_cand = N.candidates(entries)
        cols = {e["path"]: FakeCollection()
                for e in entries}
        cols[second_cand["path"]] = FakeCollection(post=(ACK, CAP_76))
        self.poll(entries, cols)
        self.order.clear()
        self.poll(entries, cols)
        self.assertEqual(self.order[0], second_cand["path"])
        self.assertNotEqual(first_cand["path"], second_cand["path"])


if __name__ == "__main__":
    unittest.main()
