"""Exact feedback identities; F505 replays a maintainer capture, others synthetic."""
from contextlib import contextmanager
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
from _feedback import feedback_inventory
from test_pulsar import FakeBus, reply
from test_mchose_keyboards import fixture as keyboard_fixture, glw_frames
from providers import pulsar as P, mchose_glw_keyboard as G
from catalog import load_catalog, verification_for
from known_ids import build_index
import server


SUPPORTED = ((55, 0xFB56, "Dragonfly F2 Master+"),
             (47, 0xF58E, "VXE Mouse 1K Dongle"))
STRICT_RECEIVERS = SUPPORTED + ((49, 0xF505, "VGN Dragonfly 4K Receiver"),)
POWER_REQUEST = [0x08, 0x04] + [0] * 14 + [0x49]
F505_REPLY = bytes.fromhex("08 04 00 00 00 02 23 00 0e b6 00 00 00 00 00 00 60")


@contextmanager
def receiver(issue, pid, replies=(), length=17, inventory=None):
    infos = inventory if inventory is not None else [
        d for d in feedback_inventory(issue)
        if (d["vendor_id"], d["product_id"]) == (0x3554, pid)]
    bus = FakeBus(0x3554, pid, replies=replies,
                  shape=[(d["interface_number"], d["usage_page"], d["usage"]) for d in infos])
    for col, info in zip(bus.cols, infos):
        col.info["product_string"] = info["product_string"]
    lengths = {col.info["path"]: length if (col.info["usage_page"], col.info["usage"]) == P.CONTROL_USAGE
               else 17 for col in bus.cols}
    with patch.object(P.hidlist, "enumerate", side_effect=bus.enumerate), \
            patch.object(P.hid, "device", bus.device_class()), \
            patch.object(P, "output_length", side_effect=lengths.get), \
            patch.object(P.PulsarProvider, "_pick", side_effect=AssertionError("no legacy fallback")):
        yield bus


class CompXBatchTests(unittest.TestCase):
    def test_new_receivers_only_query_power_and_remain_unverified(self):
        for issue, pid, name in SUPPORTED:
            for level in (0, 73, 100):
                for charging in (False, True):
                    with self.subTest(pid=pid, level=level, charging=charging), \
                            receiver(issue, pid, [reply(level, int(charging), 3931)]) as bus:
                        provider = P.PulsarProvider()
                        device, = provider.poll()
                        self.assertEqual((device.name, device.level, device.charging, device.kind),
                                         (name, level, charging, "mouse"))
                        self.assertEqual(bus.written(), [P.CONTROL_USAGE])
                        self.assertEqual(sum(col.opened for col in bus.cols), 1)
                        self.assertEqual([f for col in bus.cols for f in col.sent], [POWER_REQUEST])
                        self.assertIn("待实机验证", " ".join(provider.diagnostics()))
                        public = server.normalise(device, None, server.utcnow())
                        self.assertEqual(public["verificationLevel"], "C")
                        self.assertIsNone(public["dpi"])

    def test_unknown_or_wrong_output_length_never_opens_or_sends(self):
        for issue, pid, _ in STRICT_RECEIVERS:
            for length in (None, 0, 16, 18, 64, 65):
                with self.subTest(pid=pid, length=length), receiver(issue, pid, [reply(73)], length) as bus:
                    self.assertEqual(P.PulsarProvider().poll(), [])
                    self.assertEqual(sum(col.opened for col in bus.cols), 0)
                    self.assertEqual(bus.written(), [])

    def test_wrong_collections_never_open_or_send_even_with_17_bytes(self):
        for issue, pid, _ in STRICT_RECEIVERS:
            infos = [d for d in feedback_inventory(issue) if d["product_id"] == pid]
            siblings = [d for d in infos if (d["usage_page"], d["usage"]) != P.CONTROL_USAGE]
            inventories = [siblings] + [[dict(infos[0], usage_page=page, usage=usage)]
                                        for page, usage in ((0xFF02, 1), (0xFF04, 2),
                                                            (0xFF05, 0), (1, 2))]
            for inventory in inventories:
                with self.subTest(pid=pid, inventory=inventory), \
                        receiver(issue, pid, [reply(73)], inventory=inventory) as bus:
                    self.assertEqual(P.PulsarProvider().poll(), [])
                    self.assertEqual(sum(col.opened for col in bus.cols), 0)
                    self.assertEqual(bus.written(), [])

    def test_silent_or_invalid_reply_never_falls_back(self):
        for issue, pid, _ in STRICT_RECEIVERS:
            for frames in ([], [reply(73, break_checksum=True)], [reply(101)],
                           [reply(73, command=0x0A)], [reply(73)[:-1]]):
                with self.subTest(pid=pid, frames=frames), receiver(issue, pid, frames) as bus:
                    self.assertEqual(P.PulsarProvider().poll(), [])
                    self.assertEqual(sum(col.opened for col in bus.cols), 1)
                    self.assertEqual([f for col in bus.cols for f in col.sent], [POWER_REQUEST])

    def test_sleep_keeps_history_but_missing_descriptor_drops_it(self):
        for issue, pid, name in SUPPORTED:
            with self.subTest(pid=pid), receiver(issue, pid, [reply(73)]):
                provider = P.PulsarProvider()
                self.assertTrue(provider.poll()[0].online)
                stale, = provider.poll()
                self.assertEqual((stale.name, stale.level, stale.online, stale.wake_on_input),
                                 (name, 73, False, True))
                with patch.object(P, "output_length", return_value=None):
                    self.assertEqual(provider.poll(), [])

    def test_f505_maintainer_capture_queries_only_strict_control_collection(self):
        with receiver(49, 0xF505, [F505_REPLY]) as bus:
            provider = P.PulsarProvider()
            device, = provider.poll()
            self.assertEqual((device.name, device.level, device.charging, device.kind),
                             ("VGN Dragonfly 4K Receiver", 35, False, "mouse"))
            self.assertEqual(P.voltage_mv(F505_REPLY), 3766)
            self.assertIn("3766 mV", " ".join(provider.diagnostics()))
            self.assertIn("本项目维护者实机确认", " ".join(provider.diagnostics()))
            self.assertEqual(sum(col.opened for col in bus.cols), 1)
            self.assertEqual(bus.written(), [P.CONTROL_USAGE])
            self.assertEqual([f for col in bus.cols for f in col.sent], [POWER_REQUEST])

    def test_f505_evidence_is_scoped_to_maintainers_single_model_reading(self):
        catalog = load_catalog()
        self.assertNotIn("vgn_f505_observed", [e["id"] for e in catalog["observedUnsupported"]])
        entry, = [e for e in catalog["readers"] if e["provider"] == "pulsar"]
        evidence, = entry["modelEvidence"]
        self.assertEqual((entry["verificationLevel"], evidence["verificationLevel"]), ("C", "A"))
        self.assertEqual((evidence["vendorId"], evidence["productId"]), ("3554", "F505"))
        self.assertIn("单次", evidence["notes"])
        self.assertIn("未测", evidence["notes"])

    def test_k99_cannot_borrow_g87_protocol_even_with_valid_synthetic_caps(self):
        infos = [dict(d, input_report_length=65, output_report_length=65,
                      input_report_ids=[0], output_report_ids=[0])
                 for d in feedback_inventory(43) if d["product_id"] == 0x3033]
        self.assertTrue(any((d["usage_page"], d["usage"]) == (1, 0) for d in infos))
        with keyboard_fixture("glw", glw_frames(), inventory=infos) as bus:
            self.assertEqual(G.MchoseGlwKeyboardProvider().poll(), [])
            self.assertEqual(bus.opened, [])
            self.assertEqual(bus.writes, [])

    def test_offline_index_contains_only_supported_models(self):
        entries = {(d["vendorId"], d["productId"]): d for d in build_index()["devices"]}
        for _, pid, _ in STRICT_RECEIVERS:
            with self.subTest(pid=pid):
                entry = entries[(0x3554, pid)]
                self.assertEqual((entry["provider"], entry["kind"]), ("pulsar", "mouse"))
                self.assertEqual(verification_for(entry["provider"])[0], "C")
        self.assertEqual(entries[(0x3554, 0xF505)]["name"], "VGN Dragonfly 4K Receiver")
        self.assertEqual(entries[(0x3837, 0x3033)]["name"], "MCHOSE G87 V2")


if __name__ == "__main__":
    unittest.main()
