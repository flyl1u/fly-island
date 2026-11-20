"""Tests for the Razer model table in providers/razer.py. No hardware is needed.

The table must agree with OpenRazer, the Linux driver that reads the battery of
these mice. OPENRAZER_CHARGE_LEVEL below is a copy of the PID -> transaction id
list in OpenRazer's razer_attr_read_charge_level() (driver/razermouse_driver.c,
commit 6820f9da16), extended with its Viper V3 Pro SE wired/wireless cases.
The poll tests replace the HID layer with a fake mouse that
answers the 90-byte feature report the way the provider expects.

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

from providers import razer as R  # noqa: E402

OPENRAZER_CHARGE_LEVEL = {
    0x001F: 0xFF,   # NAGA_EPIC
    0x0024: 0xFF,   # MAMBA_2012_WIRED
    0x0025: 0xFF,   # MAMBA_2012_WIRELESS
    0x0032: 0xFF,   # OUROBOROS
    0x003E: 0xFF,   # NAGA_EPIC_CHROMA
    0x003F: 0xFF,   # NAGA_EPIC_CHROMA_DOCK
    0x0044: 0xFF,   # MAMBA_WIRED
    0x0045: 0xFF,   # MAMBA_WIRELESS
    0x0059: 0x3F,   # LANCEHEAD_WIRED
    0x005A: 0x3F,   # LANCEHEAD_WIRELESS
    0x0062: 0x1F,   # ATHERIS_RECEIVER
    0x006F: 0x1F,   # LANCEHEAD_WIRELESS_RECEIVER
    0x0070: 0x1F,   # LANCEHEAD_WIRELESS_WIRED
    0x0072: 0x3F,   # MAMBA_WIRELESS_RECEIVER
    0x0073: 0x3F,   # MAMBA_WIRELESS_WIRED
    0x0077: 0x1F,   # PRO_CLICK_RECEIVER
    0x007A: 0xFF,   # VIPER_ULTIMATE_WIRED
    0x007B: 0xFF,   # VIPER_ULTIMATE_WIRELESS
    0x007C: 0x3F,   # DEATHADDER_V2_PRO_WIRED
    0x007D: 0x3F,   # DEATHADDER_V2_PRO_WIRELESS
    0x0080: 0x1F,   # PRO_CLICK_WIRED
    0x0083: 0xFF,   # BASILISK_X_HYPERSPEED
    0x0086: 0x1F,   # BASILISK_ULTIMATE_WIRED
    0x0088: 0x1F,   # BASILISK_ULTIMATE_RECEIVER
    0x008F: 0x1F,   # NAGA_PRO_WIRED
    0x0090: 0x1F,   # NAGA_PRO_WIRELESS
    0x0094: 0x1F,   # OROCHI_V2_RECEIVER
    0x0095: 0x1F,   # OROCHI_V2_BLUETOOTH
    0x009A: 0x1F,   # PRO_CLICK_MINI_RECEIVER
    0x009C: 0x1F,   # DEATHADDER_V2_X_HYPERSPEED
    0x009E: 0x1F,   # VIPER_MINI_SE_WIRED
    0x009F: 0x1F,   # VIPER_MINI_SE_WIRELESS
    0x00A5: 0x1F,   # VIPER_V2_PRO_WIRED
    0x00A6: 0x1F,   # VIPER_V2_PRO_WIRELESS
    0x00A7: 0x1F,   # NAGA_V2_PRO_WIRED
    0x00A8: 0x1F,   # NAGA_V2_PRO_WIRELESS
    0x00AA: 0x1F,   # BASILISK_V3_PRO_WIRED
    0x00AB: 0x1F,   # BASILISK_V3_PRO_WIRELESS
    0x00AF: 0x1F,   # COBRA_PRO_WIRED
    0x00B0: 0x1F,   # COBRA_PRO_WIRELESS
    0x00B3: 0x1F,   # HYPERPOLLING_WIRELESS_DONGLE
    0x00B4: 0x1F,   # NAGA_V2_HYPERSPEED_RECEIVER
    0x00B6: 0x1F,   # DEATHADDER_V3_PRO_WIRED
    0x00B7: 0x1F,   # DEATHADDER_V3_PRO_WIRELESS
    0x00B8: 0x1F,   # VIPER_V3_HYPERSPEED
    0x00B9: 0x1F,   # BASILISK_V3_X_HYPERSPEED
    0x00BE: 0x1F,   # DEATHADDER_V4_PRO_WIRED
    0x00BF: 0x1F,   # DEATHADDER_V4_PRO_WIRELESS
    0x00C0: 0x1F,   # VIPER_V3_PRO_WIRED
    0x00C1: 0x1F,   # VIPER_V3_PRO_WIRELESS
    0x00C2: 0x1F,   # DEATHADDER_V3_PRO_WIRED_ALT
    0x00C3: 0x1F,   # DEATHADDER_V3_PRO_WIRELESS_ALT
    0x00C4: 0x1F,   # DEATHADDER_V3_HYPERSPEED_WIRED
    0x00C5: 0x1F,   # DEATHADDER_V3_HYPERSPEED_WIRELESS
    0x00C7: 0x1F,   # PRO_CLICK_V2_VERTICAL_EDITION_WIRED
    0x00C8: 0x1F,   # PRO_CLICK_V2_VERTICAL_EDITION_WIRELESS
    0x00CB: 0x1F,   # BASILISK_V3_35K
    0x00CC: 0x1F,   # BASILISK_V3_PRO_35K_WIRED
    0x00CD: 0x1F,   # BASILISK_V3_PRO_35K_WIRELESS
    0x00D0: 0x1F,   # PRO_CLICK_V2_WIRED
    0x00D1: 0x1F,   # PRO_CLICK_V2_WIRELESS
    0x00D3: 0x1F,   # BASILISK_MOBILE_WIRED
    0x00D4: 0x1F,   # BASILISK_MOBILE_RECEIVER
    0x00D6: 0x1F,   # BASILISK_V3_PRO_35K_PHANTOM_GREEN_EDITION_WIRED
    0x00D7: 0x1F,   # BASILISK_V3_PRO_35K_PHANTOM_GREEN_EDITION_WIRELESS
    0x00DE: 0x1F,   # VIPER_V3_PRO_SE_WIRED
    0x00DF: 0x1F,   # VIPER_V3_PRO_SE_WIRELESS
}

# In OpenRazer's list, but not in the app's table on purpose (see providers/razer.py).
LEFT_OUT = {
    0x0095,   # Orochi V2 over Bluetooth: Windows' Bluetooth battery value covers it
    0x00CB,   # Basilisk V3 35K: a wired-only mouse
}


# ------------------------------------------------------------------ fake mouse
class FakeMouse:
    """One Razer HID interface. Answers the battery (07:80) and charging (07:84)
    requests with status 02 when the transaction id is `tid`, as the mice do."""

    def __init__(self, tid, raw_level=0xB5, charging=0):
        self.tid = tid
        self.values = {0x80: raw_level, 0x84: charging}
        self.tids = []          # transaction id of every request, in order
        self.request = None

    def reply(self):
        req = self.request
        out = bytearray(90)
        out[1:8] = req[1:8]
        if req[1] == self.tid:
            out[0] = R.STATUS_OK
            out[9] = self.values.get(req[7], 0)
        else:
            out[0] = R.STATUS_NOT_SUPPORTED
        return [0x00] + list(out)        # hidapi on Windows puts the report id first


class FakeBus:
    def __init__(self, mice):
        self.mice = mice                 # {path: FakeMouse}

    def device_class(self):
        bus = self

        class FakeDevice:
            def open_path(self, path):
                if path not in bus.mice:
                    raise OSError("cannot open")
                self.mouse = bus.mice[path]

            def send_feature_report(self, data):
                req = bytes(data[1:])
                self.mouse.request = req
                self.mouse.tids.append(req[1])
                return len(data)

            def get_feature_report(self, report_id, size):
                return self.mouse.reply()

            def close(self):
                pass

        return FakeDevice


def entry(pid, path, name, iface=0, page=0x0001):
    return {"product_id": pid, "interface_number": iface, "usage_page": page, "usage": 2,
            "path": path, "product_string": name, "serial_number": "000000000000"}


class PollTest(unittest.TestCase):
    def setUp(self):
        self._saved = (R.hid, R.hidlist, R.time)
        # no real waiting: the provider sleeps between a request and its reply
        R.time = types.SimpleNamespace(time=time.time, sleep=lambda s: None)

    def tearDown(self):
        R.hid, R.hidlist, R.time = self._saved

    def poll(self, entries, mice):
        bus = FakeBus(mice)
        R.hid = types.SimpleNamespace(device=bus.device_class())
        R.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        return R.RazerProvider().poll()

    def test_the_blackwidow_answers_through_its_own_collection(self):
        # The keyboard answers on a control collection that is not a vendor page, so
        # the probe order (which ranks 0001/ff00 first) must still reach it. The fake's
        # page 0059 is a stand-in: the unit test only pins that ranking does not filter.
        e = entry(0x025C, b"kbd", "Razer BlackWidow V3 Pro", iface=3, page=0x0059)
        mouse = FakeMouse(tid=0x9F, raw_level=0xB5, charging=1)      # 0xB5 -> 71%
        out = self.poll([e], {b"kbd": mouse})
        self.assertEqual(len(out), 1)
        self.assertEqual((out[0].level, out[0].charging), (round(0xB5 / 255 * 100), True))
        self.assertEqual(mouse.tids[0], 0x9F)


# ------------------------------------------------------------------ tests
class TableTest(unittest.TestCase):
    def test_every_openrazer_mouse_is_in_the_table(self):
        missing = sorted(f"{p:04X}" for p in OPENRAZER_CHARGE_LEVEL
                         if p not in R.KNOWN and p not in LEFT_OUT)
        self.assertEqual(missing, [])

    def test_transaction_ids_agree_with_openrazer(self):
        wrong = {f"{p:04X}": (f"{R.KNOWN[p][1]:02X}", f"{t:02X}")
                 for p, t in OPENRAZER_CHARGE_LEVEL.items()
                 if p in R.KNOWN and R.KNOWN[p][1] != t}
        self.assertEqual(wrong, {})

    def test_left_out_pids_stay_out(self):
        for pid in LEFT_OUT:
            self.assertNotIn(pid, R.KNOWN)

    def test_every_preferred_tid_is_also_tried_as_a_fallback(self):
        for pid, (name, tid) in R.KNOWN.items():
            self.assertIn(tid, R.TRANSACTION_IDS, f"{pid:04X} {name}")

    def test_naga_pro_and_naga_v2_pro_are_different_mice(self):
        # 008F / 0090 were called "Naga V2 Pro"; OpenRazer: NAGA_PRO_WIRED / _WIRELESS
        self.assertEqual(R.KNOWN[0x008F][0], "Razer Naga Pro")
        self.assertEqual(R.KNOWN[0x0090][0], "Razer Naga Pro")
        self.assertEqual(R.KNOWN[0x00A7][0], "Razer Naga V2 Pro")
        self.assertEqual(R.KNOWN[0x00A8][0], "Razer Naga V2 Pro")

    def test_the_blackwidow_pro_pair_is_known(self):
        # OpenRazer lists get_battery/is_charging on both the wired class (0x025A) and,
        # through inheritance, the wireless model (0x025C); the driver reads them with
        # transaction id 0x3f and 0x9f respectively.
        self.assertEqual(R.KNOWN[0x025A], ("Razer BlackWidow V3 Pro", 0x3F))
        self.assertEqual(R.KNOWN[0x025C], ("Razer BlackWidow V3 Pro", 0x9F))

    def test_wired_viper_is_not_in_the_table(self):
        # 0078 is OpenRazer's USB_DEVICE_ID_RAZER_VIPER, a wired mouse with no battery.
        # The Viper Ultimate is 007A / 007B.
        self.assertNotIn(0x0078, R.KNOWN)
        self.assertFalse(R.maybe_wireless(0x0078, "Razer Viper"))
        self.assertTrue(R.maybe_wireless(0x007B, "Razer Viper Ultimate"))

    def test_the_wireless_blackwidow_is_in_the_table(self):
        # OpenRazer's RazerBlackWidowV3ProWireless (USB_PID 0x025C) lists get_battery
        # and is_charging in METHODS; the Wired class (0x025A) lists neither.
        self.assertEqual(R.KNOWN[0x025C][0], "Razer BlackWidow V3 Pro")
        self.assertIn(R.KNOWN[0x025C][1], R.TRANSACTION_IDS)


class PollRazerTest(PollTest):
    def test_viper_v3_pro_se_uses_1f_on_both_transports(self):
        for pid in (0x00DE, 0x00DF):
            with self.subTest(pid=f"{pid:04X}"):
                self.assertEqual(R.KNOWN[pid], ("Razer Viper V3 Pro SE", 0x1F))
                mouse = FakeMouse(tid=0x1F, raw_level=0x80, charging=1)
                res = self.poll([entry(pid, b"se", "Razer Viper V3 Pro SE")], {b"se": mouse})
                self.assertEqual([(r.name, r.level, r.charging) for r in res],
                                 [("Razer Viper V3 Pro SE", 50, True)])
                self.assertEqual(mouse.tids, [0x1F, 0x1F])

    def test_unknown_pid_does_not_gain_requests_from_the_se_name(self):
        mouse = FakeMouse(tid=0x1F)
        res = self.poll([entry(0xFFFE, b"unknown", "Razer Viper V3 Pro SE")],
                        {b"unknown": mouse})
        self.assertEqual(res, [])
        self.assertEqual(mouse.tids, [])

    def test_pro_click_v2_vertical_issue_58(self):
        # The interfaces are the ones in the diagnostics report of issue #58.
        name = "Razer Pro Click V2 Vertical Edition"
        entries = [entry(0x00C8, b"if0", name, 0), entry(0x00C8, b"if1", name, 1),
                   entry(0x00C8, b"if2", name, 2)]
        mouse = FakeMouse(tid=0x1F, raw_level=0xB5)
        res = self.poll(entries, {b"if0": mouse})
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0].name, name)
        self.assertEqual(res[0].level, round(0xB5 / 255 * 100))     # 71 %
        self.assertEqual(mouse.tids[0], 0x1F)      # the first request is already right

    def test_pro_click_v2_vertical_is_not_skipped(self):
        # The name has no "wireless" word, so without a table entry the mouse was skipped.
        self.assertTrue(R.maybe_wireless(0x00C8, "Razer Pro Click V2 Vertical Edition"))
        self.assertFalse(any(w in "razer pro click v2 vertical edition" for w in R.WIRELESS_WORDS))

    def test_basilisk_x_hyperspeed_asks_with_ff_first(self):
        mouse = FakeMouse(tid=0xFF, raw_level=0xFF)
        res = self.poll([entry(0x0083, b"if0", "Razer Basilisk X HyperSpeed")], {b"if0": mouse})
        self.assertEqual([r.level for r in res], [100])
        self.assertEqual(mouse.tids[0], 0xFF)

    def test_naga_v2_pro_is_polled(self):
        mouse = FakeMouse(tid=0x1F, raw_level=0x80, charging=1)
        res = self.poll([entry(0x00A8, b"if0", "Razer Naga V2 Pro")], {b"if0": mouse})
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0].name, "Razer Naga V2 Pro")
        self.assertEqual(res[0].level, 50)
        self.assertTrue(res[0].charging)

    def test_wired_viper_gets_no_request(self):
        mouse = FakeMouse(tid=0xFF)
        res = self.poll([entry(0x0078, b"if0", "Razer Viper")], {b"if0": mouse})
        self.assertEqual(res, [])
        self.assertEqual(mouse.tids, [])


# ------------------------------------------------------------------ receiver + cable
class AsleepMouse(FakeMouse):
    """The receiver of a mouse that is not on the radio: status 04 to every request."""

    def reply(self):
        out = [0x00] + [0] * 90
        out[1] = R.STATUS_TIMEOUT
        return out


class CableTest(PollTest):
    """A mouse plugged in by cable while its receiver stays in: the cable shows up as
    another PID with the same name. The receiver then answers "not responding", and its
    greyed copy of the old level must not stay next to the live icon of the cable."""
    RECEIVER = entry(0x007B, b"rx", "Razer Viper Ultimate Dongle")
    CABLE = entry(0x007A, b"usb", "Razer Viper Ultimate")

    def poll_with(self, provider, entries, mice):
        bus = FakeBus(mice)
        R.hid = types.SimpleNamespace(device=bus.device_class())
        R.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        return provider.poll()

    def test_cable_hides_the_greyed_receiver_icon(self):
        p = R.RazerProvider()
        out = self.poll_with(p, [self.RECEIVER], {b"rx": FakeMouse(0xFF, raw_level=0x80)})
        self.assertEqual(len(out), 1)
        out = self.poll_with(p, [self.RECEIVER, self.CABLE],
                             {b"rx": AsleepMouse(0xFF), b"usb": FakeMouse(0xFF, charging=1)})
        self.assertEqual([(s.key, s.online, s.charging) for s in out],
                         [("razer:007a:000000000000", True, True)])

    def test_receiver_alone_still_keeps_its_greyed_icon(self):
        p = R.RazerProvider()
        self.poll_with(p, [self.RECEIVER], {b"rx": FakeMouse(0xFF, raw_level=0x80)})
        out = self.poll_with(p, [self.RECEIVER], {b"rx": AsleepMouse(0xFF)})
        self.assertEqual([(s.key, s.online) for s in out], [("razer:007b:000000000000", False)])

    def test_two_live_mice_of_one_model_keep_two_icons(self):
        # one on the receiver and another one on its cable: both answer
        out = self.poll([self.RECEIVER, self.CABLE],
                        {b"rx": FakeMouse(0xFF, raw_level=0x80), b"usb": FakeMouse(0xFF, charging=1)})
        self.assertEqual(len(out), 2)

    def test_second_receiver_of_one_model_keeps_its_greyed_icon(self):
        # two receivers of the same PID are two mice, not one mouse on its cable
        p = R.RazerProvider()
        rx2 = dict(self.RECEIVER, path=b"rx2", serial_number="111111111111")
        both = [self.RECEIVER, rx2]
        self.poll_with(p, both, {b"rx": FakeMouse(0xFF), b"rx2": FakeMouse(0xFF)})
        out = self.poll_with(p, both, {b"rx": FakeMouse(0xFF), b"rx2": AsleepMouse(0xFF)})
        self.assertEqual(sorted(s.online for s in out), [False, True])

    def test_devices_not_in_the_table_are_left_alone(self):
        # only KNOWN says that two PIDs are one mouse; a shared product string does not
        p = R.RazerProvider()
        a = entry(0x0B00, b"a", "Razer Wireless Thing")
        b = entry(0x0B01, b"b", "Razer Wireless Thing")
        self.poll_with(p, [a, b], {b"a": FakeMouse(0x1F), b"b": FakeMouse(0x1F)})
        out = self.poll_with(p, [a, b], {b"a": FakeMouse(0x1F), b"b": AsleepMouse(0x1F)})
        self.assertEqual(sorted(s.online for s in out), [False, True])

    def test_greyed_icons_alone_are_not_merged(self):
        # only a PID that answers hides the other one; two silent PIDs keep their icons
        p = R.RazerProvider()
        both = [self.RECEIVER, self.CABLE]
        self.poll_with(p, both, {b"rx": FakeMouse(0xFF), b"usb": FakeMouse(0xFF)})
        out = self.poll_with(p, both, {b"rx": AsleepMouse(0xFF), b"usb": AsleepMouse(0xFF)})
        self.assertEqual([s.online for s in out], [False, False])

    def test_another_model_keeps_its_greyed_icon(self):
        p = R.RazerProvider()
        other = entry(0x007D, b"da", "Razer DeathAdder V2 Pro")
        self.poll_with(p, [other], {b"da": FakeMouse(0x3F)})
        out = self.poll_with(p, [other, self.CABLE],
                             {b"da": AsleepMouse(0x3F), b"usb": FakeMouse(0xFF, charging=1)})
        self.assertEqual(sorted((s.key, s.online) for s in out),
                         [("razer:007a:000000000000", True), ("razer:007d:000000000000", False)])


if __name__ == "__main__":
    unittest.main()
