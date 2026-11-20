"""Tests for the Razer keyboards with a battery in providers/razer.py. No hardware.

The values are OpenRazer's (driver/razerkbd_driver.c at 6820f9d):
razer_attr_read_charge_level() gives the transaction id, and
razer_get_report_params() gives report_index, the USB interface the commands go to.

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
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_razer import FakeBus, FakeMouse  # noqa: E402

# pid: (transaction id, report_index)
OPENRAZER_KEYBOARDS = {
    0x0258: (0x1F, 3),   # BLACKWIDOW_V3_MINI_HYPERSPEED_WIRED
    0x0271: (0x9F, 3),   # BLACKWIDOW_V3_MINI_HYPERSPEED_WIRELESS
    0x0290: (0x9F, 2),   # DEATHSTALKER_V2_PRO_WIRELESS
    0x0292: (0x1F, 3),   # DEATHSTALKER_V2_PRO_WIRED
    0x0296: (0x9F, 2),   # DEATHSTALKER_V2_PRO_TKL_WIRELESS
    0x0298: (0x1F, 3),   # DEATHSTALKER_V2_PRO_TKL_WIRED
    0x02B9: (0x1F, 3),   # BLACKWIDOW_V4_MINI_HYPERSPEED_WIRED
    0x02BA: (0x9F, 3),   # BLACKWIDOW_V4_MINI_HYPERSPEED_WIRELESS
    0x02D5: (0x9F, 2),   # BLACKWIDOW_V4_TENKEYLESS_HYPERSPEED_WIRELESS
    0x02D7: (0x1F, 3),   # BLACKWIDOW_V4_TENKEYLESS_HYPERSPEED_WIRED
}


def issue_106_entries():
    # the DeathStalker V2 Pro TKL receiver in the #106 diagnostics
    shape = [(-1, 0x000C, 1), (-1, 0x0001, 0x80), (0, 0x0001, 6), (1, 0x000C, 1),
             (1, 0x0001, 0x80), (1, 0x0001, 0), (1, 0x0001, 0), (1, 0x0001, 0),
             (1, 0x0001, 2), (1, 0x0001, 0), (1, 0x0001, 6), (2, 0x0001, 2)]
    return [{"product_id": 0x0296, "interface_number": i, "usage_page": p, "usage": u,
             "path": b"k%d-%d" % (n, i), "product_string": " DSV2Pro TKL" if i >= 0 else "",
             "serial_number": "000000000000"} for n, (i, p, u) in enumerate(shape)]


IF2 = b"k11-2"


class KeyboardPollTest(unittest.TestCase):
    def setUp(self):
        self._saved = (R.hid, R.hidlist, R.time)
        R.time = types.SimpleNamespace(time=time.time, sleep=lambda s: None)

    def tearDown(self):
        R.hid, R.hidlist, R.time = self._saved

    def poll(self, entries, devices, provider=None):
        R.hid = types.SimpleNamespace(device=FakeBus(devices).device_class())
        R.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        self.provider = provider or R.RazerProvider()
        return self.provider.poll()

    def test_deathstalker_v2_pro_tkl_issue_106(self):
        kbd = FakeMouse(tid=0x9F, raw_level=0xB5, charging=0)
        res = self.poll(issue_106_entries(), {IF2: kbd})     # only interface 2 opens
        self.assertEqual([(r.name, r.level, r.charging, r.online, r.kind) for r in res],
                         [("Razer DeathStalker V2 Pro TKL", 71, False, True, "keyboard")])
        self.assertEqual(kbd.tids, [0x9F, 0x9F])              # level, then charging

    def test_interface_2_is_asked_first(self):
        # every collection would answer: only the one OpenRazer names gets a request
        devices = {e["path"]: FakeMouse(tid=0x9F) for e in issue_106_entries()}
        self.poll(issue_106_entries(), devices)
        asked = sorted(p for p, d in devices.items() if d.tids)
        self.assertEqual(asked, [IF2])

    def test_another_interface_is_still_a_fallback(self):
        entries = issue_106_entries()
        kbd = FakeMouse(tid=0x9F, raw_level=0x80)
        other = entries[2]["path"]                            # interface 0
        devices = {IF2: FakeMouse(tid=0x00), other: kbd}      # interface 2: "not supported"
        res = self.poll(entries, devices)
        self.assertEqual([r.level for r in res], [50])

    def test_the_icon_stays_a_keyboard_while_asleep(self):
        kbd = FakeMouse(tid=0x9F)
        p = R.RazerProvider()
        self.poll(issue_106_entries(), {IF2: kbd}, p)
        # the keyboard sleeps: the receiver answers 04 (timeout)
        orig = kbd.reply

        def asleep():
            out = orig()
            out[1] = R.STATUS_TIMEOUT
            return out
        kbd.reply = asleep
        res = self.poll(issue_106_entries(), {IF2: kbd}, p)
        self.assertEqual([(r.online, r.kind) for r in res], [(False, "keyboard")])

    def test_mice_keep_their_automatic_icon(self):
        e = [{"product_id": 0x00B9, "interface_number": 0, "usage_page": 1, "usage": 2,
              "path": b"m", "product_string": "Razer Basilisk V3 X HyperSpeed",
              "serial_number": "1"}]
        res = self.poll(e, {b"m": FakeMouse(tid=0x1F)})
        self.assertEqual([r.kind for r in res], [""])


class KeyboardTableTest(unittest.TestCase):
    def test_every_keyboard_agrees_with_openrazer(self):
        for pid, (tid, iface) in OPENRAZER_KEYBOARDS.items():
            self.assertEqual(R.KNOWN[pid][1], tid, f"{pid:04X}")
            self.assertEqual(R.KEYBOARD_INTERFACE[pid], iface, f"{pid:04X}")
        self.assertEqual(set(R.KEYBOARD_INTERFACE), set(OPENRAZER_KEYBOARDS))

    def test_the_receiver_is_polled_although_its_name_has_no_wireless_word(self):
        # the product string in #106 is " DSV2Pro TKL"
        self.assertTrue(R.maybe_wireless(0x0296, " DSV2Pro TKL"))

    def test_wireless_and_wired_share_a_name(self):
        for wireless, wired in ((0x0290, 0x0292), (0x0296, 0x0298), (0x0271, 0x0258),
                                (0x02BA, 0x02B9), (0x02D5, 0x02D7)):
            self.assertEqual(R.KNOWN[wireless][0], R.KNOWN[wired][0])


if __name__ == "__main__":
    unittest.main()
