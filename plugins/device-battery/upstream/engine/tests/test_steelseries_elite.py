"""Tests for providers/steelseries_elite.py (SteelSeries Arctis Nova Elite). No hardware.

The fake base station has the interface 3 and 4 collections of the #138 diagnostics
(1038:2244: ffc0:0001 and ff00:0001 on interface 3, 000c:0001 on interface 4) and
behaves the way elegos/Linux-Arctis-Manager and loteran/Arctis-Sound-Manager describe:
  * one collection takes the output report 01 b0; the others refuse it, and hidapi
    returns -1 (it does not raise);
  * the answer is a set of 07 xx input reports, delivered to the collection that
    declares report id 7, which can be another one than the collection that took the
    request: 07 b7 carries the levels and the charging state, 07 b5 the power state;
  * the station can also push a 07 b7 without being asked;
  * on the real station of #138 the answer was the direct reply 01 b0 instead:
    `01 b0 00 00 01 00 1f 64 ...` with SteelSeries GG at 31 % (byte 6 = 0x1f).
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

from providers import steelseries as S  # noqa: E402
from providers import steelseries_elite as E  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Clock:
    def __init__(self):
        self.now = 1000.0

    def time(self):
        return self.now

    def sleep(self, s):
        self.now += s


def issue_138_entries(pid=0x2244):
    shape = [(3, 0xFFC0, 1), (3, 0xFF00, 1), (4, 0x000C, 1)]
    return [{"product_id": pid, "interface_number": i, "usage_page": p, "usage": u,
             "path": b"%04x:%04x" % (p, u), "product_string": "Arctis Nova Elite"}
            for i, p, u in shape]


def battery(level=87, spare=100, charging=0x08):
    return [0x07, 0xB7, level, spare, charging] + [0] * 59


def power(state=0x08):
    return [0x07, 0xB5, 0x00, 0x00, state] + [0] * 59


def reply(level=0x1F, spare=0x64, radio=0x00, charging=0x00):
    """The direct 01 b0 reply; the first 8 bytes are the ones #138 showed."""
    r = [0x01, 0xB0, 0x00, 0x00, 0x01, 0x00, level, spare] + [0] * 56
    r[14], r[15] = radio, charging
    return r


class Station:
    """takes: the collection that declares output report 01; answers_on: the one that
    declares input report 07. frames: what the station sends after a 01 b0 request.
    pushed: reports already waiting before anything is sent (unsolicited)."""

    def __init__(self, takes=b"ff00:0001", answers_on=b"ffc0:0001", frames=None,
                 pushed=None):
        self.takes, self.answers_on = takes, answers_on
        self.frames = [power(), battery()] if frames is None else frames
        self.inbox = {answers_on: [list(f) for f in (pushed or [])]}
        self.tried = []                   # (path, packet) of every write, taken or not
        self.writes = []                  # (path, packet) of the writes taken
        self.features = []

    def output(self, path, data):
        data = list(data)
        self.tried.append((path, data))
        if path != self.takes:
            return -1                     # hidapi: the collection has no such report
        self.writes.append((path, data))
        if data[:2] == [0x01, 0xB0]:
            self.inbox.setdefault(self.answers_on, []).extend(list(f) for f in self.frames)
        return len(data)

    def read(self, path):
        q = self.inbox.get(path) or []
        return q.pop(0) if q else []


def device_class(station):
    class FakeDevice:
        def open_path(self, path):
            self.path = path

        def set_nonblocking(self, on):
            pass

        def write(self, data):
            return station.output(self.path, data)

        def send_feature_report(self, data):
            station.features.append((self.path, list(data)))
            return len(data)

        def read(self, n, timeout=None):
            return station.read(self.path)

        def close(self):
            pass

    return FakeDevice


class EliteTest(unittest.TestCase):
    def setUp(self):
        self._saved = (E.hid, E.hidlist, E.time)
        self.clock = Clock()
        E.time = types.SimpleNamespace(time=self.clock.time, sleep=self.clock.sleep)
        self.provider = E.SteelSeriesEliteProvider()

    def tearDown(self):
        E.hid, E.hidlist, E.time = self._saved

    def poll(self, station, entries=None):
        entries = issue_138_entries() if entries is None else entries
        E.hid = types.SimpleNamespace(device=device_class(station))
        E.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        return self.provider.poll()

    def levels(self, res):
        return [(r.level, r.charging) for r in res]

    # ---- the exchange ----------------------------------------------------------
    def test_issue_138(self):
        station = Station()
        res = self.poll(station)
        self.assertEqual([(r.key, r.name, r.level, r.charging, r.online, r.source, r.kind)
                          for r in res],
                         [("steelseries:2244", "Arctis Nova Elite", 87, False, True,
                           "steelseries", "headset")])

    def test_the_request_is_01_b0_as_a_64_byte_output_report(self):
        station = Station()
        self.poll(station)
        self.assertEqual(station.writes, [(b"ff00:0001", [0x01, 0xB0] + [0] * 62)])
        self.assertEqual(station.features, [])
        for _, pkt in station.tried:
            self.assertEqual(pkt, [0x01, 0xB0] + [0] * 62)

    def test_charging(self):
        station = Station(frames=[power(), battery(level=40, charging=0x02)])
        self.assertEqual(self.levels(self.poll(station)), [(40, True)])

    def test_discharging(self):
        station = Station(frames=[power(), battery(level=40, charging=0x08)])
        self.assertEqual(self.levels(self.poll(station)), [(40, False)])

    def test_cable_charging_power_state(self):
        station = Station(frames=[power(0x02), battery(level=40, charging=0x08)])
        self.assertEqual(self.levels(self.poll(station)), [(40, True)])

    def test_standby_still_shows_the_level(self):
        station = Station(frames=[power(0x04), battery(level=33)])
        self.assertEqual(self.levels(self.poll(station)), [(33, False)])

    def test_the_spare_battery_is_ignored(self):
        for spare in (0, 5, 100, 0xFF):
            station = Station(frames=[power(), battery(level=61, spare=spare)])
            self.assertEqual(self.levels(self.poll(station)), [(61, False)])

    def test_level_0_and_100(self):
        for level in (0, 100):
            station = Station(frames=[power(), battery(level=level)])
            self.assertEqual(self.levels(self.poll(station)), [(level, False)])

    def test_a_level_above_100_is_refused(self):
        for level in (101, 0xFF):
            station = Station(frames=[power(), battery(level=level)])
            self.assertEqual(self.poll(station), [])

    def test_headset_offline_gives_no_reading(self):
        for frames in ([power(0x01), battery(level=50)], [battery(level=50), power(0x01)]):
            station = Station(frames=frames)
            self.assertEqual(self.poll(station), [])
            self.assertTrue(any("off or out of range" in line
                                for line in self.provider.diagnostics()))

    def test_battery_frame_without_power_frame(self):
        station = Station(frames=[battery(level=72)])
        self.assertEqual(self.levels(self.poll(station)), [(72, False)])

    def test_other_reports_are_ignored(self):
        other = [[0x01, 0xB0, 0x01, 0x00, 0x04, 0x01, 0x50],             # reply, too short
                 [0x01, 0xB1] + [0] * 62,                                  # not the b0 reply
                 [0x07, 0xB8, 0x03] + [0] * 61,                            # ANC level
                 [0x07, 0x45, 0x64, 0x64] + [0] * 60,                      # ChatMix
                 [0x06, 0xB7, 0x32, 0x00, 0x02] + [0] * 59,                # not report 07
                 [0x07, 0xB7]]                                              # too short
        station = Station(frames=other + [power(), battery(level=44)])
        self.assertEqual(self.levels(self.poll(station)), [(44, False)])
        station = Station(frames=other)
        self.assertEqual(self.poll(station), [])

    def test_no_reply_gives_no_level(self):
        station = Station(frames=[])
        self.assertEqual(self.poll(station), [])
        self.assertTrue(any("no battery level" in line for line in self.provider.diagnostics()))

    # ---- the direct 01 b0 reply (what the #138 station sent) ---------------------
    def test_issue_138_direct_reply(self):
        station = Station(frames=[reply()])
        res = self.poll(station)
        self.assertEqual([(r.key, r.level, r.charging, r.online) for r in res],
                         [("steelseries:2244", 31, False, True)])
        self.assertTrue(any("01 b0 reply on ffc0:0001: 01 b0 00 00 01 00 1f 64" in line
                            for line in self.provider.diagnostics()))

    def test_direct_reply_charging(self):
        station = Station(frames=[reply(level=55, charging=0x02)])
        self.assertEqual(self.levels(self.poll(station)), [(55, True)])
        station = Station(frames=[reply(level=55, charging=0x08)])
        self.assertEqual(self.levels(self.poll(station)), [(55, False)])

    def test_direct_reply_on_the_cable(self):
        station = Station(frames=[reply(level=55, radio=0x02)])
        self.assertEqual(self.levels(self.poll(station)), [(55, True)])

    def test_direct_reply_headset_off(self):
        station = Station(frames=[reply(level=0, radio=0x01)])
        self.assertEqual(self.poll(station), [])
        self.assertTrue(any("off or out of range" in line
                            for line in self.provider.diagnostics()))

    def test_direct_reply_level_above_100_is_refused(self):
        station = Station(frames=[reply(level=0xFF, radio=0x08)])
        self.assertEqual(self.poll(station), [])

    def test_direct_reply_spare_battery_is_not_the_level(self):
        station = Station(frames=[reply(level=12, spare=100, radio=0x08)])
        self.assertEqual(self.levels(self.poll(station)), [(12, False)])

    def test_direct_reply_logs_bytes_14_and_15(self):
        station = Station(frames=[reply(radio=0x08, charging=0x08)])
        self.poll(station)
        self.assertTrue(any(line.endswith("00 00 00 00 00 00 08 08 00") for line in
                            self.provider.diagnostics() if "01 b0 reply" in line))

    def test_frames_are_logged_in_hex(self):
        station = Station()
        self.poll(station)
        diag = "\n".join(self.provider.diagnostics())
        self.assertIn("07 b7 57 64 08", diag)
        self.assertIn("07 b5 00 00 08", diag)
        self.assertIn("[SteelSeries] pid=2244 'Arctis Nova Elite'", diag)

    # ---- the collections -------------------------------------------------------
    def test_the_answer_is_read_on_another_collection(self):
        for takes, answers_on in ((b"ff00:0001", b"ffc0:0001"), (b"ffc0:0001", b"ff00:0001"),
                                  (b"ffc0:0001", b"ffc0:0001")):
            self.provider = E.SteelSeriesEliteProvider()
            station = Station(takes=takes, answers_on=answers_on,
                              frames=[power(), battery(level=58)])
            self.assertEqual(self.levels(self.poll(station)), [(58, False)])
            self.assertEqual([p for p, _ in station.writes], [takes])

    def test_a_refused_write_returns_minus_one_and_the_next_collection_is_tried(self):
        station = Station(takes=b"ff00:0001")
        self.poll(station)
        self.assertEqual([p for p, _ in station.tried], [b"ffc0:0001", b"ff00:0001"])
        diag = "\n".join(self.provider.diagnostics())
        self.assertIn("refused by ffc0:0001", diag)
        self.assertIn("taken by ff00:0001", diag)

    def test_the_collection_that_took_it_is_remembered(self):
        station = Station(takes=b"ff00:0001")
        self.poll(station)
        station.tried = []
        self.assertEqual(self.levels(self.poll(station)), [(87, False)])
        self.assertEqual([p for p, _ in station.tried], [b"ff00:0001"])

    def test_a_remembered_collection_that_refuses_is_forgotten(self):
        station = Station(takes=b"ffc0:0001")
        self.poll(station)
        station.takes = b"ff00:0001"
        station.tried = []
        self.assertEqual(self.levels(self.poll(station)), [(87, False)])
        # the one that just refused is not asked twice
        self.assertEqual([p for p, _ in station.tried], [b"ffc0:0001", b"ff00:0001"])
        station.tried = []
        self.poll(station)
        self.assertEqual([p for p, _ in station.tried], [b"ff00:0001"])

    def test_a_write_that_raises_counts_as_refused(self):
        station = Station(takes=b"ff00:0001")

        def output(path, data, orig=station.output):
            if path == b"ffc0:0001":
                raise OSError("The parameter is incorrect")
            return orig(path, data)

        station.output = output
        self.assertEqual(self.levels(self.poll(station)), [(87, False)])

    def test_only_vendor_collections_of_interface_3_get_the_request(self):
        entries = issue_138_entries() + [
            {"product_id": 0x2244, "interface_number": 4, "usage_page": 0xFF00, "usage": 2,
             "path": b"if4-ff00", "product_string": ""},
            {"product_id": 0x2244, "interface_number": 3, "usage_page": 0x000C, "usage": 1,
             "path": b"if3-000c", "product_string": ""}]
        station = Station(takes=None, frames=[])
        self.poll(station, entries)
        self.assertEqual(sorted(p for p, _ in station.tried), [b"ff00:0001", b"ffc0:0001"])

    def test_unsolicited_battery_frame(self):
        # no collection takes the request, but the station pushes 07 b7 by itself
        station = Station(takes=None, pushed=[battery(level=66, charging=0x02)])
        self.assertEqual(self.levels(self.poll(station)), [(66, True)])
        self.assertEqual(station.writes, [])

    def test_unsolicited_frame_before_the_answer(self):
        station = Station(pushed=[battery(level=66)], frames=[power(), battery(level=67)])
        self.assertIn(self.levels(self.poll(station))[0][0], (66, 67))

    def test_nothing_for_other_product_ids(self):
        for pid in (0x2246, 0x2247, 0x2249, 0x2270, 0x22A1):
            station = Station()
            self.assertEqual(self.poll(station, issue_138_entries(pid)), [])
            self.assertEqual(station.tried, [])

    def test_the_read_window_is_bounded(self):
        station = Station(frames=[])
        start = self.clock.now
        self.poll(station)
        self.assertLessEqual(self.clock.now - start, E.READ_WINDOW + 0.1)


class ExistingProviderTest(unittest.TestCase):
    """The Nova 7 / Nova 5 provider must leave 1038:2244 alone (it would send 00 b0)."""

    def setUp(self):
        self._saved = (S.hid, S.hidlist, S.TIMEOUT)
        S.TIMEOUT = 0.05

    def tearDown(self):
        S.hid, S.hidlist, S.TIMEOUT = self._saved

    def test_the_nova_provider_does_not_touch_the_elite(self):
        station = Station()
        opened = []
        cls = device_class(station)

        class Tracking(cls):
            def open_path(self, path):
                opened.append(path)
                super().open_path(path)

        S.hid = types.SimpleNamespace(device=Tracking)
        S.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: issue_138_entries())
        self.assertEqual(S.SteelSeriesProvider().poll(), [])
        self.assertEqual(opened, [])
        self.assertEqual(station.tried, [])
        self.assertNotIn(0x2244, S.MODELS)
        self.assertNotIn(0x2244, S.MOUSE_MODELS)
        self.assertNotIn(0x2244, S.CLASSIC_MODELS)


class RegistrationTest(unittest.TestCase):
    def test_the_provider_is_registered(self):
        import providers
        self.assertIs(providers.SteelSeriesEliteProvider, E.SteelSeriesEliteProvider)
        from server import PROVIDERS
        self.assertEqual([entry for entry in PROVIDERS if entry[1] == "SteelSeriesEliteProvider"],
                         [("steelseries_elite", "SteelSeriesEliteProvider")])


if __name__ == "__main__":
    unittest.main()
