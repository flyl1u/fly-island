"""Tests for providers/hyperx_cloud3.py. No hardware is needed.

The fake dongle answers as LennardKittner/HyperHeadset's cloud_iii_wireless code
describes: report 0x66, the command echo, then the battery percent at byte 4. The
tests cover how the request reaches the dongle: cython-hidapi's write() and
send_feature_report() return -1 on failure instead of raising, and hid.device.error()
then gives the Windows error text.

Run from the repository root:

    python -m unittest discover -s tests
"""
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _hidstub  # noqa: E402, F401

from providers import hyperx_cloud3 as H  # noqa: E402

PATH = b"\\\\?\\hid#vid_03f0&pid_05b7&mi_03&col01#8&1234abcd&0&0000#{4d1e55b2-f16f-11cf-88cb-001111000030}"

# hidapi 0.14's Windows text for ERROR_INVALID_FUNCTION.
INCORRECT_FUNCTION = "WriteFile: (0x00000001) Incorrect function."

# The #155 capture's Core replies, verbatim: NGENUITY wrote `66 89` and the dongle
# answered `66 89 0e d7 30 ...` (48 %); `66 8a` -> `66 8a 00 00` (off the cable).
CAPTURED_BATTERY = [0x66, 0x89, 0x0E, 0xD7, 0x30] + [0] * 57
CAPTURED_CHARGING_OFF = [0x66, 0x8A, 0x00, 0x00] + [0] * 58

# The Core dongle's two interface-3 collections (consumer control + the vendor page),
# same path shape as the Cloud III Wireless one above.
CORE_PATH_CONSUMER = PATH.replace(b"05b7", b"0995")
CORE_PATH_VENDOR = PATH.replace(b"05b7", b"0995").replace(b"col01", b"col02")


class FakeDongle:
    """write / feature: how that call answers.
    "ok"     accepted (returns the length, as hidapi does)
    "-1"     returns -1, as cython-hidapi does on failure
    "raise"  raises OSError with `error_text`
    """

    def __init__(self, write="ok", feature="ok", error_text=INCORRECT_FUNCTION,
                 level=80, charging=1):
        self.write_mode = write
        self.feature_mode = feature
        self.error_text = error_text
        self.level = level
        self.charging = charging
        self.writes = []
        self.features = []
        self.pending = []
        self.opened = []

    # hid.device API
    def open_path(self, path):
        self.opened.append(path)

    def close(self):
        pass

    def error(self):
        return self.error_text

    def _answer(self, packet):
        cmd = packet[1]
        r = [H.REPORT_ID, cmd] + [0] * 60
        if cmd == H.CMD_BATTERY:
            r[2], r[4] = 1, self.level
        elif cmd == H.CMD_CHARGING:
            r[2] = self.charging
        self.pending.append(r)

    def _do(self, mode, packet):
        if mode == "raise":
            raise OSError(self.error_text)
        if mode == "-1":
            return -1
        self._answer(packet)
        return len(packet)

    def write(self, packet):
        self.writes.append(list(packet))
        return self._do(self.write_mode, packet)

    def send_feature_report(self, packet):
        self.features.append(list(packet))
        return self._do(self.feature_mode, packet)

    def read(self, n, timeout_ms=0):
        return self.pending.pop(0) if self.pending else []


class Base(unittest.TestCase):
    def setUp(self):
        self._saved = (H.hid, H.hidlist, H.time)
        H.time = types.SimpleNamespace(sleep=lambda s: None)

    def tearDown(self):
        H.hid, H.hidlist, H.time = self._saved

    def poll(self, dongle):
        H.hid = types.SimpleNamespace(device=lambda: dongle)
        entry = {"product_id": 0x05B7, "path": PATH, "interface_number": 3,
                 "usage_page": H.USAGE_PAGE, "usage": H.USAGE}
        H.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: [entry])
        p = H.HyperXCloud3Provider()
        out = p.poll()
        return out, p.diagnostics()

    def poll_entries(self, dongle, entries):
        H.hid = types.SimpleNamespace(device=lambda: dongle)
        H.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        p = H.HyperXCloud3Provider()
        return p.poll(), p.diagnostics()

    def poll_fakes(self, fakes, entries):
        """One fake per path, for the polls where two connection ids answer at once."""
        holder = {}

        class MultiDevice:
            def open_path(self, path):
                if path not in fakes:
                    raise OSError("cannot open")
                holder["impl"] = fakes[path]

            def write(self, packet):
                return holder["impl"].write(packet)

            def send_feature_report(self, packet):
                return holder["impl"].send_feature_report(packet)

            def read(self, n, timeout_ms=0):
                return holder["impl"].read(n, timeout_ms)

            def error(self):
                return holder["impl"].error()

            def close(self):
                pass

        H.hid = types.SimpleNamespace(device=MultiDevice)
        H.hidlist = types.SimpleNamespace(enumerate=lambda vid=0: list(entries))
        p = H.HyperXCloud3Provider()
        return p.poll(), p.diagnostics()


class WritePath(Base):
    def test_write_accepted(self):
        d = FakeDongle(write="ok")
        out, diag = self.poll(d)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].level, 80)
        self.assertTrue(out[0].charging)
        self.assertEqual(d.features, [])

    def test_write_minus_one_then_feature_report_accepted(self):
        d = FakeDongle(write="-1", feature="ok")
        out, diag = self.poll(d)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].level, 80)
        self.assertTrue(out[0].charging)
        # The same packet goes out as a feature report, for both commands.
        self.assertEqual(d.features, d.writes)
        self.assertEqual([f[1] for f in d.features], [H.CMD_BATTERY, H.CMD_CHARGING])
        self.assertTrue(any("retrying as a feature report" in line for line in diag), diag)
        self.assertTrue(any("feature report accepted" in line for line in diag), diag)

    def test_write_minus_one_and_feature_minus_one(self):
        d = FakeDongle(write="-1", feature="-1")
        out, diag = self.poll(d)
        self.assertEqual(out, [])
        self.assertEqual(len(d.features), 1)
        self.assertFalse(any("feature report accepted" in line for line in diag), diag)
        self.assertTrue(any(line.strip().startswith("feature report ->") for line in diag), diag)

    def test_write_minus_one_other_error_no_fallback(self):
        # Only "Incorrect function" means the dongle wants a feature report.
        d = FakeDongle(write="-1", error_text="WriteFile: (0x0000001F) A device attached "
                                             "to the system is not functioning.")
        out, diag = self.poll(d)
        self.assertEqual(out, [])
        self.assertEqual(d.features, [])
        self.assertTrue(any("not functioning" in line for line in diag), diag)

    def test_write_raises_incorrect_function_then_feature_report(self):
        d = FakeDongle(write="raise", feature="ok")
        out, diag = self.poll(d)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].level, 80)
        self.assertEqual(len(d.features), 2)

    def test_write_raises_other_error_no_fallback(self):
        d = FakeDongle(write="raise", error_text="device disconnected")
        out, diag = self.poll(d)
        self.assertEqual(out, [])
        self.assertEqual(d.features, [])


class Cloud3Issue186(Base):
    """The user's 0FCC output exchange, including its original icon identity."""

    @staticmethod
    def entries(pid):
        path = PATH.replace(b"05b7", f"{pid:04x}".encode())
        return [dict(vendor_id=H.HP_VID, product_id=pid, interface_number=3,
                     path=path + suffix, usage_page=page, usage=usage)
                for suffix, page, usage in ((b"-consumer", 0x000C, 1),
                                            (b"-telephony", 0x000B, 5),
                                            (b"-vendor", 0xFF13, 1))]

    def test_user_replies_follow_the_same_output_exchange_as_05b7(self):
        class CapturedDongle(FakeDongle):
            def _answer(self, packet):
                self.pending.append([0x66, 0x89, 0x0F, 0xCF, 0x5A]
                                    if packet[1] == 0x89 else [0x66, 0x8A, 0x00])

        for pid in (0x05B7, 0x0FCC):
            with self.subTest(pid=pid):
                dongle = CapturedDongle()
                entries = self.entries(pid)
                out, _ = self.poll_entries(dongle, entries)
                self.assertEqual([(s.key, s.name, s.level, s.charging) for s in out],
                                 [("hyperx:05b7", "HyperX Cloud III Wireless", 90, False)])
                self.assertEqual(dongle.writes, [[0x66, command] + [0] * 60
                                                for command in (0x89, 0x8A)])
                self.assertEqual(dongle.features, [])
                self.assertEqual(set(dongle.opened), {entries[-1]["path"]})

    def test_0fcc_and_05b7_share_one_icon(self):
        out, _ = self.poll_entries(FakeDongle(level=90, charging=0),
                                   self.entries(0x05B7) + self.entries(0x0FCC))
        self.assertEqual([(s.key, s.level) for s in out], [("hyperx:05b7", 90)])

    def test_offline_index_automatically_includes_the_new_pid_at_level_c(self):
        from pathlib import Path
        from catalog import load_catalog
        from known_ids import build_index

        for index in (build_index(), build_index(engine_root=Path(H.__file__).parents[1])):
            rows = [row for row in index["devices"] if row["provider"] == "hyperx_cloud3"]
            self.assertEqual({(row["vendorId"], row["productId"]) for row in rows},
                             {(0x03F0, pid) for pid in (0x05B7, 0x0C9D, 0x0FCC, 0x0795, 0x0995)})
            row, = [row for row in rows if row["productId"] == 0x0FCC]
            self.assertEqual((row["name"], row["kind"]), ("HyperX Cloud III Wireless", "headset"))
        reader, = [reader for reader in load_catalog()["readers"] if reader["provider"] == H.HyperXCloud3Provider.name]
        self.assertEqual(reader["verificationLevel"], "C")


class Cloud2Core(Base):
    """#155: NGENUITY's own exchange with the Cloud II Core dongle, pinned verbatim."""

    def core_entries(self, pid=0x0995, tag=b""):
        # the reporter's diagnostics: the dongle on interface 3 with the consumer-control
        # and the vendor collection side by side - the vendor one is the battery endpoint
        return [{"product_id": pid, "path": CORE_PATH_CONSUMER + tag, "interface_number": 3,
                 "usage_page": 0x000C, "usage": 0x0001},
                {"product_id": pid, "path": CORE_PATH_VENDOR + tag, "interface_number": 3,
                 "usage_page": H.USAGE_PAGE, "usage": H.USAGE}]

    def test_the_captured_battery_reply_reads_48(self):
        self.assertEqual(H.parse_battery(CAPTURED_BATTERY), 48)

    def test_the_captured_charging_reply_reads_not_charging(self):
        self.assertIs(H.parse_charging(CAPTURED_CHARGING_OFF), False)

    def test_the_core_ids_are_claimed_with_their_name(self):
        self.assertEqual(H.PIDS[0x0995], "HyperX Cloud II Core Wireless")
        self.assertEqual(H.PIDS[0x0795], "HyperX Cloud II Core Wireless")

    def test_the_core_dongle_is_read_on_its_vendor_collection(self):
        d = FakeDongle(level=48, charging=0)
        out, diag = self.poll_entries(d, self.core_entries())
        self.assertEqual([(s.key, s.name, s.level, s.charging, s.source, s.kind) for s in out],
                         [("hyperx:0995", "HyperX Cloud II Core Wireless", 48, False,
                           "hyperx", "headset")])
        self.assertEqual(set(d.opened), {CORE_PATH_VENDOR})   # the consumer collection is left alone
        self.assertEqual([w[1] for w in d.writes], [H.CMD_BATTERY, H.CMD_CHARGING])

    def test_the_second_mode_alone_keeps_the_shared_icon(self):
        # one headset, one icon: the cable mode alone still reports under the shared key
        d = FakeDongle(level=48, charging=0)
        out, _ = self.poll_entries(d, self.core_entries(pid=0x0795))
        self.assertEqual([s.key for s in out], ["hyperx:0995"])

    def test_both_modes_answering_at_once_share_one_icon(self):
        # #155's test-build diagnostics: while charging, both ids answer with the same
        # values - the tray showed two identical icons, one per id
        d595 = FakeDongle(level=49, charging=1)
        d795 = FakeDongle(level=49, charging=1)
        entries = self.core_entries(0x0995) + self.core_entries(0x0795, tag=b"-cable")
        fakes = {CORE_PATH_VENDOR: d595, CORE_PATH_VENDOR + b"-cable": d795}
        out, diag = self.poll_fakes(fakes, entries)
        self.assertEqual([(s.key, s.name, s.level, s.charging) for s in out],
                         [("hyperx:0995", "HyperX Cloud II Core Wireless", 49, True)])
        self.assertTrue(any("two connection ids answered; one icon" in line
                            for line in diag))

    def test_the_charging_reading_wins_when_both_modes_answer(self):
        # whichever id answers first, the charging reading is the one kept: the first
        # fake here answers "not charging", the second says "charging" - the second wins
        d795 = FakeDongle(level=40, charging=0)
        d595 = FakeDongle(level=49, charging=1)
        entries = self.core_entries(0x0995) + self.core_entries(0x0795, tag=b"-cable")
        fakes = {CORE_PATH_VENDOR: d595, CORE_PATH_VENDOR + b"-cable": d795}
        out, _ = self.poll_fakes(fakes, entries)
        self.assertEqual([(s.key, s.level, s.charging) for s in out],
                         [("hyperx:0995", 49, True)])

    def test_the_cloud_iii_ids_share_one_icon_too(self):
        d = FakeDongle(level=80, charging=0)
        entries = [{"product_id": 0x05B7, "path": PATH, "interface_number": 3,
                    "usage_page": H.USAGE_PAGE, "usage": H.USAGE},
                   {"product_id": 0x0C9D, "path": b"other-path", "interface_number": 3,
                    "usage_page": H.USAGE_PAGE, "usage": H.USAGE}]
        out, _ = self.poll_entries(d, entries)
        self.assertEqual([s.key for s in out], ["hyperx:05b7"])


if __name__ == "__main__":
    unittest.main()
