"""Tests for providers/logitech_centurion.py (Logitech G PRO X 2 LIGHTSPEED). No hardware.

The fake receiver speaks the Centurion protocol the way Solaar (base.py, device.py) and
HeadsetControl (logitech_centurion_protocol.hpp) expect it: direct requests to the
receiver's own features, and bridge requests that the receiver acknowledges and the
headset answers. Its feature layout is the one in Solaar's dump of a real PRO X 2
(docs/devices/PRO X 2 LIGHTSPEED 0AF7.text): bridge at receiver index 3, battery at
headset index 4.
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

from providers import logitech_centurion as L  # noqa: E402


class Clock:
    def __init__(self):
        self.now = 1000.0

    def time(self):
        return self.now

    def sleep(self, s):
        self.now += s


def out_frame(payload):
    return L.frame(list(payload))


class Receiver:
    """mode: "on", "off" (acks only), "legacy" (no 0x0104 in the headset)."""

    RX = [0x0000, 0x0001, 0x0100, 0x0003, 0x010A]

    def __init__(self, clock, level=80, state=0, mode="on", noise=()):
        self.clock = clock
        self.level, self.state, self.mode = level, state, mode
        self.hs = [0x0000, 0x0001, 0x0101, 0x0100, 0x0104, 0x010A, 0x0108, 0x0604, 0x0602, 0x0636]
        if mode == "legacy":
            self.hs[4] = 0x0105                               # no battery feature
        self.queue = [list(r) for r in noise]
        self.writes = []

    def write(self, data):
        data = list(data)
        self.writes.append(data)
        if data[:10] == L.LEGACY_REQUEST:
            self.queue += [[0x51, 0x03] + [0] * 62,
                           [0x51, 0x0B, 0, 0, 0, 0, 0, 0, 0x04, 0, self.level, 0,
                            0x02 if self.state else 0] + [0] * 51]
            return len(data)
        p = L.payload_of(data)
        if p[0] == 3 and p[1] == 0x11:                        # bridge
            sub = p[4:4 + (p[2] << 8 | p[3])]
            self.queue.append(out_frame([3, 0x11]))           # the receiver's ack
            if self.mode == "off":
                return len(data)
            idx, fn = sub[1], sub[2] & 0xF0
            d = self.answer(self.hs, idx, fn, sub[3:])
            if d is None:
                self.queue.append(out_frame([3, 0x10, 0, 4, 0x00, 0xFF, idx]))
            else:
                self.queue.append(out_frame([3, 0x10, 0, 3 + len(d), 0x00, idx, sub[2]] + d))
        else:                                                 # direct
            d = self.answer(self.RX, p[0], p[1] & 0xF0, p[2:])
            self.queue.append(out_frame([p[0], p[1]] + (d or [])))
        return len(data)

    def answer(self, table, idx, fn, params):
        if idx == 0 and fn == 0x00:                           # Root: where is feature X?
            want = params[0] << 8 | params[1]
            return [table.index(want)] if want in table else [0]
        if idx == 1 and fn == 0x00:
            return [len(table)]
        if idx == 1 and fn == 0x10:
            f = table[params[0]]
            return [params[0], f >> 8, f & 0xFF, 0]
        if idx < len(table) and table[idx] == 0x0104 and fn == 0x00:
            return [self.level, 0, self.state]
        return None

    def read(self, timeout_ms):
        if self.queue:
            return self.queue.pop(0)
        self.clock.now += timeout_ms / 1000
        return []


class FakeBus:
    def __init__(self, devs):
        self.devs = devs

    def device_class(self):
        bus = self

        class FakeDevice:
            def open_path(self, path):
                self.d = bus.devs[path]

            def write(self, data):
                return self.d.write(data)

            def read(self, n, timeout_ms=0):
                return self.d.read(timeout_ms)

            def close(self):
                pass

        return FakeDevice


def issue_103_entries(pid=0x0AF7):
    return [{"product_id": pid, "interface_number": 3, "usage_page": p, "usage": 1,
             "path": b"%04x" % p, "product_string": "PRO X 2 LIGHTSPEED"}
            for p in (0xFF13, 0xFFA0, 0x000C)]


class CenturionTest(unittest.TestCase):
    def setUp(self):
        self._saved = (L.hid, L.hidlist, L.time)
        self.clock = Clock()
        L.time = types.SimpleNamespace(time=self.clock.time, sleep=self.clock.sleep)
        self.provider = L.LogitechCenturionProvider()

    def tearDown(self):
        L.hid, L.hidlist, L.time = self._saved

    def poll(self, rx, entries=None):
        entries = issue_103_entries() if entries is None else entries
        L.hid = types.SimpleNamespace(device=FakeBus({b"ffa0": rx}).device_class())
        L.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        return self.provider.poll()

    def test_issue_103(self):
        rx = Receiver(self.clock, level=80)
        res = self.poll(rx)
        self.assertEqual([(r.name, r.level, r.charging, r.online, r.kind) for r in res],
                         [("Logitech G PRO X 2 LIGHTSPEED", 80, False, True, "headset")])

    def test_frames_are_headsetcontrols(self):
        # direct, as Solaar frames it: len counts the unpadded request + the flags byte
        self.assertEqual(L.direct_frame(0, 0x00, [0x00, 0x01])[:8],
                         [0x51, 0x05, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00])
        self.assertEqual(set(L.direct_frame(0, 0x00, [0x00, 0x01])[7:]), {0})
        self.assertEqual(len(L.direct_frame(0, 0x00)), 64)
        # bridge to headset feature 4 (the battery): HeadsetControl's fixed legacy frame is
        # this frame with software id 0x0A instead of 0x01 in both function bytes
        b = L.bridge_frame(3, 4, 0x00)
        self.assertEqual(b[:10], [0x51, 0x08, 0x00, 0x03, 0x11, 0x00, 0x03, 0x00, 0x04, 0x01])
        swapped = [x if i not in (4, 9) else (x & 0xF0) | 0x0A for i, x in enumerate(b[:10])]
        self.assertEqual(swapped, L.LEGACY_REQUEST)

    def test_only_reading_functions_are_sent(self):
        rx = Receiver(self.clock)
        self.poll(rx)
        self.poll(rx)
        for w in rx.writes:
            p = L.payload_of(w)
            if p[0] == 3 and p[1] == 0x11:
                sub_index, fn = p[5], p[6] & 0xF0
                feature = rx.hs[sub_index]
                self.assertIn((feature, fn), {(0x0000, 0x00), (0x0001, 0x00), (0x0001, 0x10),
                                              (0x0104, 0x00)})
            else:
                self.assertIn((rx.RX[p[0]], p[1] & 0xF0), {(0x0000, 0x00), (0x0001, 0x00),
                                                           (0x0001, 0x10)})

    def test_discovery_runs_once(self):
        rx = Receiver(self.clock)
        self.poll(rx)
        n = len(rx.writes)
        self.poll(rx)
        self.assertEqual(len(rx.writes) - n, 1)               # only the battery request

    def test_charging_states(self):
        for state, flag in ((0, False), (1, True), (2, True), (3, True), (4, False)):
            self.provider = L.LogitechCenturionProvider()
            res = self.poll(Receiver(self.clock, state=state))
            self.assertEqual([r.charging for r in res], [flag], state)

    def test_headset_off_gives_no_icon_and_is_discovered_later(self):
        rx = Receiver(self.clock, mode="off")
        self.assertEqual(self.poll(rx), [])
        self.assertIn("did not answer", " ".join(self.provider.diagnostics()))
        rx.mode = "on"
        self.assertEqual([r.level for r in self.poll(rx)], [80])

    def test_headset_switched_off_after_a_reading_leaves_the_tray(self):
        rx = Receiver(self.clock)
        self.poll(rx)
        rx.mode = "off"
        self.assertEqual(self.poll(rx), [])

    def test_level_above_100_is_refused(self):
        self.assertEqual(self.poll(Receiver(self.clock, level=0xC8)), [])

    def test_firmware_without_the_battery_feature_uses_the_fixed_request(self):
        rx = Receiver(self.clock, level=55, state=1, mode="legacy")
        res = self.poll(rx)
        self.assertEqual([(r.level, r.charging) for r in res], [(55, True)])
        self.assertEqual(rx.writes[-1][:10], L.LEGACY_REQUEST)

    def test_legacy_power_off_report(self):
        rx = Receiver(self.clock, mode="legacy")
        rx.write = lambda data, orig=rx.write: (
            rx.queue.append([0x51, 0x05, 0, 0, 0, 0, 0x00] + [0] * 57)
            if list(data[:10]) == L.LEGACY_REQUEST else orig(data))
        self.assertEqual(self.poll(rx), [])
        self.assertIn("headset off", " ".join(self.provider.diagnostics()))

    def test_legacy_skips_other_events(self):
        rx = Receiver(self.clock, level=55, mode="legacy")
        orig = rx.write

        def write(data):
            if list(data[:10]) == L.LEGACY_REQUEST:
                rx.queue.append([0x51, 0x0B, 0, 0, 0, 0, 0, 0, 0x07, 0, 9, 0, 0] + [0] * 51)
            return orig(data)
        rx.write = write
        self.assertEqual([r.level for r in self.poll(rx)], [55])

    def test_headset_notifications_and_stale_replies_are_not_the_answer(self):
        rx = Receiver(self.clock, level=77)
        orig = rx.write

        def write(data):
            n = orig(data)
            p = L.payload_of(list(data))
            if p[0] == 3 and p[1] == 0x11 and p[5] == 4:      # the battery request
                rx.queue[1:1] = [
                    out_frame([3, 0x10, 0, 4, 0xFF, 4, 0x01, 5]),         # a notification
                    out_frame([3, 0x10, 0, 4, 0x00, 4, 0x11, 6]),         # another function
                ]
            return n
        rx.write = write
        self.assertEqual([r.level for r in self.poll(rx)], [77])

    def test_features_are_discovered_again_after_an_error(self):
        rx = Receiver(self.clock)
        self.poll(rx)
        rx.hs[4] = 0x0105                                     # e.g. new firmware: index 4 moved
        orig_answer = rx.answer
        rx.answer = lambda table, idx, fn, params: (
            None if table is rx.hs and idx == 4 else orig_answer(table, idx, fn, params))
        self.assertEqual(self.poll(rx), [])                    # rejected: forget the table
        rx.answer = orig_answer
        rx.hs[4] = 0x0104
        n = len(rx.writes)
        self.assertEqual([r.level for r in self.poll(rx)], [80])
        self.assertGreater(len(rx.writes) - n, 1)              # discovery ran again

    def test_other_frames_are_skipped(self):
        noise = [[0x11, 0xFF, 0x00] + [0] * 61, out_frame([0x07, 0x01, 0x05])]
        rx = Receiver(self.clock, level=64, noise=noise)
        self.assertEqual([r.level for r in self.poll(rx)], [64])

    def test_a_reply_for_another_function_is_not_taken(self):
        # a late reply to FeatureSet "count" (fn 0) must not answer "feature n" (fn 0x10)
        stale = out_frame([1, 0x01, 9])
        rx = Receiver(self.clock, level=77)
        orig = rx.write

        def write(data):
            n = orig(data)
            p = L.payload_of(list(data))
            if p[0] == 1 and p[1] == 0x11:
                rx.queue.insert(0, stale)
            return n
        rx.write = write
        self.assertEqual([r.level for r in self.poll(rx)], [77])

    def test_a_receiver_error_reply_ends_the_attempt(self):
        rx = Receiver(self.clock)
        orig = rx.write

        def write(data):
            p = L.payload_of(list(data))
            if p[0] == 0:
                rx.queue.append(out_frame([0xFF, 0x00, 0x01, 0x05]))
                return len(data)
            return orig(data)
        rx.write = write
        self.assertEqual(self.poll(rx), [])
        self.assertIn("error", " ".join(self.provider.diagnostics()))

    def test_only_the_ffa0_collection_of_0af7_is_opened(self):
        rx = Receiver(self.clock)
        entries = issue_103_entries(0x0AFB) + [dict(issue_103_entries()[0])]
        self.assertEqual(self.poll(rx, entries), [])
        self.assertEqual(rx.writes, [])


if __name__ == "__main__":
    unittest.main()
