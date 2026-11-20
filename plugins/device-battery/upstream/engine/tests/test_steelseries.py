"""Tests for providers/steelseries.py. No hardware is needed.

The tests replace the HID layer with fake dongles that answer as HeadsetControl and
the Linux driver describe. Replies marked "hardware" were captured from a real
Arctis Nova 7 (1038:22A1).

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


# ------------------------------------------------------------------ fake dongles
class FakeBus:
    """paths: {path: responder}. A responder gets the written request (a list) and
    returns the list of reports the dongle sends back (can be empty)."""

    def __init__(self, paths):
        self.paths = paths
        self.queues = {p: [] for p in paths}
        self.writes = []            # (path, request) of every write

    def device_class(self):
        bus = self

        class FakeDevice:
            def open_path(self, path):
                if path not in bus.paths:
                    raise OSError("cannot open")
                self.path = path

            def write(self, data):
                bus.writes.append((self.path, list(data)))
                bus.queues[self.path] += bus.paths[self.path](list(data))
                return len(data)

            def read(self, n, timeout=None):
                q = bus.queues[self.path]
                return q.pop(0) if q else []

            def close(self):
                pass

        return FakeDevice


def entry(pid, iface, page, path, usage=1):
    return {"product_id": pid, "interface_number": iface, "usage_page": page, "usage": usage,
            "path": path, "product_string": ""}


def answer(reply, request=None):
    """A responder that sends `reply` (to `request` only, if given)."""
    return lambda req: [list(reply)] if request is None or req[:len(request)] == request else []


class SteelSeriesTestCase(unittest.TestCase):
    def setUp(self):
        self._saved = (S.hid, S.hidlist, S.TIMEOUT)
        S.TIMEOUT = 0.05

    def tearDown(self):
        S.hid, S.hidlist, S.TIMEOUT = self._saved

    def use(self, entries, paths):
        self.bus = FakeBus(paths)
        S.hid = types.SimpleNamespace(device=self.bus.device_class())
        S.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        return self.bus

    def poll(self, entries, paths):
        self.use(entries, paths)
        p = S.SteelSeriesProvider()
        return p.poll(), p


# ------------------------------------------------------------------ Nova 7 (hardware)
class Nova7HardwareTests(SteelSeriesTestCase):
    def nova7(self, reply):
        return self.poll([entry(0x22A1, 3, 0xFFC0, b"n7")], {b"n7": answer(reply)})[0]

    def test_on_battery(self):
        [st] = self.nova7([0xB0, 0x03, 0x49, 0x03, 0x1E, 0x64, 0, 0])      # hardware
        self.assertEqual((st.level, st.charging, st.kind), (73, False, "headset"))

    def test_charging(self):
        [st] = self.nova7([0xB0, 0x03, 0x45, 0x01, 0x22, 0x64, 0, 0])      # hardware
        self.assertEqual((st.level, st.charging), (69, True))

    def test_headset_off(self):
        self.assertEqual(self.nova7([0xB0, 0x02, 0x49, 0x00, 0x64, 0x64, 0, 0]), [])   # hardware

    def test_headset_switching_on_shows_nothing(self):
        """Link byte 02, status byte 03, and the old level 0x49: not connected yet."""
        self.assertEqual(self.nova7([0xB0, 0x02, 0x49, 0x03, 0x1E, 0x64, 0, 0]), [])   # hardware

    def test_other_report_first(self):
        paths = {b"n7": lambda req: [[0x01, 0x00, 0x63, 0x02], [0xB0, 0x03, 0x49, 0x03]]}
        [st] = self.poll([entry(0x22A1, 3, 0xFFC0, b"n7")], paths)[0]
        self.assertEqual(st.level, 73)


# ------------------------------------------------------------------ b0 models
class B0ParserTests(unittest.TestCase):
    CASES = [
        # parser, reply, (level, charging, online)
        (S.parse_nova7, [0xB0, 0x03, 100, 0x02], (100, True, True)),     # status 02 = charging
        (S.parse_nova7_discrete, [0xB0, 0x03, 3, 0x03], (75, False, True)),
        (S.parse_nova7_discrete, [0xB0, 0x02, 3, 0x03], (None, False, False)),
        (S.parse_nova5, [0xB0, 0x01, 0, 60, 0x01], (60, True, True)),
        (S.parse_nova5, [0xB0, 0x02, 0, 60, 0x00], (None, False, False)),
        (S.parse_arctis7_plus, [0xB0, 0x03, 2, 0x01], (50, True, True)),
        (S.parse_arctis7_plus, [0xB0, 0x01, 2, 0x00], (None, False, False)),   # off
        (S.parse_arctis7_plus, [0xB0, 0x03, 9, 0x00], (100, False, True)),     # capped
        (S.parse_gamebuds, [0xB0, 0, 0, 0x03, 0x03, 80, 60], (60, False, True)),
        (S.parse_gamebuds, [0xB0, 0, 0, 0x03, 0x02, 80, 0], (80, False, True)),   # right in case
        (S.parse_gamebuds, [0xB0, 0, 0, 0x02, 0x02, 0, 0], (None, False, False)),
        (S.parse_gamebuds, [0x01, 0, 0, 0x03, 0x03, 80, 60], (None, False, False)),  # not b0
    ]

    def test_parsers(self):
        for parse, reply, expected in self.CASES:
            with self.subTest(parser=parse.__name__, reply=reply):
                self.assertEqual(parse(reply), expected)

    def test_new_models_in_table(self):
        for pid in (0x220A, 0x22A7, 0x2298, 0x2269, 0x226D, 0x220E, 0x2212, 0x2216, 0x2236, 0x230A, 0x2317):
            self.assertIn(pid, S.MODELS)


# ---------------------------------------------------------------- GameBuds X
class GameBudsXTests(SteelSeriesTestCase):
    """The GameBuds X (1038:2317) speaks the GameBuds exchange."""

    def test_lower_active_bud_is_the_level(self):
        [st] = self.poll([entry(0x2317, 3, 0xFFC0, b"gbx")],
                         {b"gbx": answer([0xB0, 0, 0, 0x03, 0x03, 80, 60])})[0]
        self.assertEqual((st.name, st.level, st.kind), ("Arctis GameBuds X", 60, "headset"))

    def test_both_buds_in_the_case_gives_no_reading(self):
        out = self.poll([entry(0x2317, 3, 0xFFC0, b"gbx")],
                        {b"gbx": answer([0xB0, 0, 0, 0x02, 0x02, 0, 0])})[0]
        self.assertEqual(out, [])


# ------------------------------------------------------------------ older Arctis
class ClassicTests(SteelSeriesTestCase):
    def test_arctis1(self):
        [st], _ = self.poll([entry(0x12B3, 3, 0xFF43, b"a1", 0x0202)],
                            {b"a1": answer([0x06, 0x12, 0x00, 85, 0, 0, 0, 0], [0x06, 0x12])})
        self.assertEqual((st.name, st.level, st.kind), ("Arctis 1 Wireless", 85, "headset"))

    def test_arctis1_off(self):
        out, _ = self.poll([entry(0x12B3, 3, 0xFF43, b"a1", 0x0202)],
                           {b"a1": answer([0x06, 0x12, 0x01, 85, 0, 0, 0, 0])})
        self.assertEqual(out, [])

    def test_arctis7_2018_connected(self):
        def dongle(req):
            if req[:2] == [0x06, 0x14]:
                return [[0x06, 0x14, 0x03, 0]]
            if req[:2] == [0x06, 0x18]:
                return [[0x06, 0x18, 104, 0]]          # overreports: capped at 100
            return []
        [st], _ = self.poll([entry(0x12AD, 5, 0xFF00, b"a7")], {b"a7": dongle})
        self.assertEqual(st.level, 100)

    def test_arctis7_2018_off_does_not_ask_level(self):
        bus_paths = {b"a7": answer([0x06, 0x14, 0x01, 0], [0x06, 0x14])}
        out, _ = self.poll([entry(0x12AD, 5, 0xFF00, b"a7")], bus_paths)
        self.assertEqual(out, [])
        self.assertEqual([req[:2] for _, req in self.bus.writes], [[0x06, 0x14]])

    def test_arctis7_zero_level_is_no_reading(self):
        out, _ = self.poll([entry(0x1260, 5, 0xFF00, b"a7")],
                           {b"a7": answer([0x06, 0x18, 0, 0], [0x06, 0x18])})
        self.assertEqual(out, [])

    def test_arctis9(self):
        [st], _ = self.poll([entry(0x12C2, 0, 0xFF00, b"a9")],
                            {b"a9": answer([0xAA, 0x01, 0, 0x7F, 0x01], [0x00, 0x20])})
        self.assertEqual((st.level, st.charging), ((0x7F - 0x64) * 100 // 54, True))

    def test_arctis9_off(self):
        out, _ = self.poll([entry(0x12C2, 0, 0xFF00, b"a9")], {b"a9": answer([0x55, 0, 0, 0, 0])})
        self.assertEqual(out, [])

    def test_pro_wireless(self):
        def dongle(req):
            return [[0x04, 0]] if req[:2] == [0x41, 0xAA] else [[3]] if req[:2] == [0x40, 0xAA] else []
        [st], _ = self.poll([entry(0x1290, 0, 0xFF00, b"pw")], {b"pw": dongle})
        self.assertEqual(st.level, 75)
        self.assertEqual({len(req) for _, req in self.bus.writes}, {31})

    def test_pro_wireless_off(self):
        out, _ = self.poll([entry(0x1290, 0, 0xFF00, b"pw")], {b"pw": answer([0x02, 0])})
        self.assertEqual(out, [])
        self.assertEqual(len(self.bus.writes), 1, "no level request while the headset is off")

    def test_wrong_reply_is_never_a_level(self):
        """A report that does not echo the request is not read, whatever it contains."""
        out, _ = self.poll([entry(0x12B3, 3, 0xFF43, b"a1", 0x0202)],
                           {b"a1": answer([0x06, 0x13, 0x00, 85, 0, 0, 0, 0])})
        self.assertEqual(out, [])

    def test_remembers_the_collection_that_answered(self):
        entries = [entry(0x12AD, 5, 0xFF00, b"wrong"), entry(0x12AD, 5, 0xFF01, b"right")]
        def right(req):
            return [[0x06, 0x14, 0x03, 0]] if req[:2] == [0x06, 0x14] else [[0x06, 0x18, 70, 0]]
        bus = self.use(entries, {b"wrong": lambda req: [], b"right": right})
        p = S.SteelSeriesProvider()
        p.poll()
        bus.writes.clear()
        [st] = p.poll()
        self.assertEqual(st.level, 70)
        self.assertEqual({path for path, _ in bus.writes}, {b"right"})


# ------------------------------------------------------------- Nova Pro Wireless
def nova_pro_reply(code=5, state=0x08, length=16):
    """A base station's battery reply: nine-step level code in byte 6, state in byte 15."""
    r = [0x00] * max(length, 16)
    r[0], r[6], r[15] = 0xB0, code, state
    return r[:length]


class NovaProTests(SteelSeriesTestCase):
    """The two base stations answer report id 06, on interface 3 or 4 (HeadsetControl
    asks on interface 4); the level is a nine-step code and byte 15 is the gate."""

    def poll_nova_pro(self, reply, pid=0x12E0, iface=4, page=0xFF00):
        entries = [entry(pid, iface, page, b"np")]
        return self.poll(entries, {b"np": answer(reply, request=[0x06, 0xB0])})

    def test_the_request_is_06_b0(self):
        st, _ = self.poll_nova_pro(nova_pro_reply(5, 0x08))
        self.assertEqual([(x.level, x.charging, x.kind) for x in st], [(62, False, "headset")])
        self.assertEqual([w[1] for w in self.bus.writes], [[0x06, 0xB0]])

    def test_every_step_of_the_nine_step_scale(self):
        for code, pct in enumerate([0, 12, 25, 37, 50, 62, 75, 87, 100]):
            st, _ = self.poll_nova_pro(nova_pro_reply(code, 0x08))
            self.assertEqual([(x.level, x.approx) for x in st],
                             [(pct, "about %d%%" % pct)], "code %d" % code)

    def test_the_state_byte_is_the_gate(self):
        for state in (0x00, 0x03, 0x04, 0x80, 0xFF):
            self.assertEqual(self.poll_nova_pro(nova_pro_reply(5, state))[0], [], hex(state))

    def test_headset_off_gives_no_reading(self):
        st, p = self.poll_nova_pro(nova_pro_reply(5, 0x01))
        self.assertEqual(st, [])                                  # not 0 %
        self.assertTrue(any("off or out of range" in line for line in p.diagnostics()))

    def test_cable_charging(self):
        [st] = self.poll_nova_pro(nova_pro_reply(5, 0x02))[0]
        self.assertEqual((st.level, st.charging, st.online), (62, True, True))

    def test_short_reply_is_refused(self):
        self.assertEqual(self.poll_nova_pro(nova_pro_reply(5, 0x08, length=15))[0], [])

    def test_level_code_above_8_is_refused(self):
        self.assertEqual(self.poll_nova_pro(nova_pro_reply(9, 0x08))[0], [])

    def test_interface_3_is_accepted_too(self):
        [st] = self.poll_nova_pro(nova_pro_reply(8, 0x08), iface=3)[0]
        self.assertEqual(st.level, 100)

    def test_the_x_station_is_recognised(self):
        st, _ = self.poll_nova_pro(nova_pro_reply(5, 0x08), pid=0x12E5)
        self.assertEqual([x.name for x in st], ["Arctis Nova Pro Wireless X"])

    def test_only_vendor_collections_get_the_request(self):
        """A standard (audio/consumer) collection on interface 4 is never written to."""
        bus = self.use([entry(0x12E0, 4, 0x0001, b"audio")],
                       {b"audio": answer(nova_pro_reply(), request=[0x06, 0xB0])})
        self.assertEqual(S.SteelSeriesProvider().poll(), [])
        self.assertEqual(bus.writes, [])

    def test_a_stray_report_before_the_reply_is_ignored(self):
        paths = {b"np": lambda req: [[0x01, 0x00, 0x63, 0x02], nova_pro_reply(5, 0x08)]}
        [st] = self.poll([entry(0x12E0, 4, 0xFF00, b"np")], paths)[0]
        self.assertEqual(st.level, 62)

    def test_the_nova_7_path_is_untouched_beside_it(self):
        entries = [entry(0x12E0, 4, 0xFF00, b"np"), entry(0x22A1, 3, 0xFFC0, b"n7")]
        paths = {b"np": answer(nova_pro_reply(5, 0x08), request=[0x06, 0xB0]),
                 b"n7": answer([0xB0, 0x03, 0x49, 0x03], request=[0x00, 0xB0])}
        st, _ = self.poll(entries, paths)
        self.assertEqual({x.name: x.level for x in st},
                         {"Arctis Nova Pro Wireless": 62, "Arctis Nova 7": 73})
        self.assertEqual(sorted(w[1] for w in self.bus.writes), [[0x00, 0xB0], [0x06, 0xB0]])


# ------------------------------------------------------------------ safety
class SafetyTests(SteelSeriesTestCase):
    def test_classic_never_writes_to_standard_collections(self):
        """Keyboard, consumer and audio collections on the same interface get nothing."""
        entries = [entry(0x12C2, 0, 0x000C, b"consumer"), entry(0x12C2, 0, 0x0001, b"generic", 6),
                   entry(0x1260, 5, 0x000C, b"consumer5")]
        bus = self.use(entries, {b"consumer": answer([0xAA, 0x01, 0, 0x7F, 0]),
                                 b"generic": answer([0xAA, 0x01, 0, 0x7F, 0]),
                                 b"consumer5": answer([0x06, 0x18, 50, 0])})
        self.assertEqual(S.SteelSeriesProvider().poll(), [])
        self.assertEqual(bus.writes, [])

    def test_arctis1_needs_its_documented_collection(self):
        bus = self.use([entry(0x12B3, 3, 0xFF00, b"other")], {b"other": answer([0x06, 0x12, 0, 85])})
        self.assertEqual(S.SteelSeriesProvider().poll(), [])
        self.assertEqual(bus.writes, [])

    def test_nova_needs_ffc0(self):
        bus = self.use([entry(0x22A1, 3, 0xFF00, b"other")], {b"other": answer([0xB0, 0x03, 73, 0x03])})
        self.assertEqual(S.SteelSeriesProvider().poll(), [])
        self.assertEqual(bus.writes, [])

    def test_unknown_product_gets_nothing(self):
        bus = self.use([entry(0x1234, 3, 0xFFC0, b"x"), entry(0x1234, 0, 0xFF00, b"y")],
                       {b"x": answer([0xB0, 0x03, 73, 0x03]), b"y": answer([0xAA, 0x01, 0, 0x7F, 0])})
        self.assertEqual(S.SteelSeriesProvider().poll(), [])
        self.assertEqual(bus.writes, [])

    def test_gamedac_is_not_polled(self):
        self.assertNotIn(0x1280, S.CLASSIC_MODELS)


if __name__ == "__main__":
    unittest.main()
