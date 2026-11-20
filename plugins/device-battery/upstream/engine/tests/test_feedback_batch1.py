"""Feedback inventories with synthetic HID replies/caps, never real hardware."""
from contextlib import contextmanager
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
from _feedback import feedback_inventory
from test_pulsar import FakeBus, reply
from providers import mchose as M, pulsar as P
import known_ids
import server


@contextmanager
def scyrox(replies=(), length=17, inventory=None):
    infos = inventory if inventory is not None else [
        d for d in feedback_inventory(19) if d["vendor_id"] == 0x3554]
    bus = FakeBus(0x3554, 0xF517, replies=replies,
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


class FeedbackProtocolTests(unittest.TestCase):
    def test_scyrox_uses_only_power_on_its_control_collection(self):
        with scyrox([reply(60, 0, 3931)]) as bus:
            provider = P.PulsarProvider()
            device, = provider.poll()
        self.assertEqual((device.name, device.level, device.charging, device.kind),
                         ("Scyrox Turbo 8k dongle", 60, False, "mouse"))
        self.assertEqual(bus.written(), [P.CONTROL_USAGE])
        self.assertEqual(sum(col.opened for col in bus.cols), 1)
        self.assertEqual([frame for col in bus.cols for frame in col.sent], [P.make_request()])
        self.assertIn("待实机验证", "\n".join(provider.diagnostics()))
        public = server.normalise(device, None, server.utcnow())
        self.assertEqual(public["verificationLevel"], "C")
        self.assertIn("待本项目实机验证", public["verificationLabel"])
        self.assertIsNone(public["dpi"])

    def test_scyrox_uses_sibling_product_string_then_fallback(self):
        for missing_all in (False, True):
            with self.subTest(missing_all=missing_all):
                infos = [d for d in feedback_inventory(19) if d["vendor_id"] == 0x3554]
                for d in infos:
                    if missing_all or (d["usage_page"], d["usage"]) == P.CONTROL_USAGE:
                        d["product_string"] = "  "
                with scyrox([reply(85, 1)], inventory=infos):
                    device, = P.PulsarProvider().poll()
                self.assertEqual(device.name, "Scyrox 8K 接收器" if missing_all else "Scyrox Turbo 8k dongle")
                self.assertTrue(device.charging)

    def test_scyrox_requires_exact_known_output_length(self):
        for length in (None, 0, 16, 18, 64, 65):
            with self.subTest(length=length), scyrox([reply(60)], length=length) as bus:
                self.assertEqual(P.PulsarProvider().poll(), [])
                self.assertEqual(sum(col.opened for col in bus.cols), 0)
                self.assertEqual(bus.written(), [])

    def test_scyrox_wrong_collections_are_not_opened(self):
        for page, usage in ((0xFF02, 1), (0xFF04, 2), (0xFF03, 0), (1, 2)):
            infos = [dict(feedback_inventory(19)[1], usage_page=page, usage=usage)]
            with self.subTest(page=page, usage=usage), scyrox([reply(60)], inventory=infos) as bus:
                self.assertEqual(P.PulsarProvider().poll(), [])
                self.assertEqual(sum(col.opened for col in bus.cols), 0)

    def test_scyrox_silent_or_invalid_reply_does_not_try_another_protocol(self):
        for replies in ([], [reply(60, break_checksum=True)], [reply(101)], [reply(60, command=0x0A)]):
            with self.subTest(replies=replies), scyrox(replies) as bus:
                self.assertEqual(P.PulsarProvider().poll(), [])
                self.assertEqual(bus.written(), [P.CONTROL_USAGE])
                self.assertEqual(sum(col.opened for col in bus.cols), 1)
                self.assertEqual([f for col in bus.cols for f in col.sent], [P.make_request()])

    def test_scyrox_sleep_preserves_reading_but_losing_caps_drops_it(self):
        with scyrox([reply(60)]):
            provider = P.PulsarProvider()
            self.assertTrue(provider.poll()[0].online)
            cached, = provider.poll()
            self.assertEqual((cached.name, cached.level, cached.online, cached.wake_on_input),
                             ("Scyrox Turbo 8k dongle", 60, False, True))
            with patch.object(P, "output_length", return_value=None):
                self.assertEqual(provider.poll(), [])

    def test_compx_keyboards_do_not_receive_the_mouse_command(self):
        for issue in (22, 25):
            infos = [d for d in feedback_inventory(issue) if d["vendor_id"] == 0x3554]
            with self.subTest(issue=issue), \
                 patch.object(P.hidlist, "enumerate", side_effect=lambda vid: infos if vid == 0x3554 else []), \
                 patch.object(P, "output_length", side_effect=AssertionError("unsupported keyboard")), \
                 patch.object(P.hid, "device", side_effect=AssertionError("no keyboard probing")):
                self.assertEqual(P.PulsarProvider().poll(), [])

    def test_a7_v3_without_caps_is_not_sent_any_mchose_protocol(self):
        infos = [d for d in feedback_inventory(24) if d["product_id"] == 0x1018]
        with patch.object(M.hidlist, "enumerate", side_effect=lambda vid: infos if vid == 0x3837 else []), \
             patch.object(M.hid, "device", side_effect=AssertionError("V3 is not V2/G7/A5")):
            provider = M.MchoseProvider()
            self.assertEqual(provider.poll(), [])
            self.assertIn("input report 4D/64 length unproven", "\n".join(provider.diagnostics()))

    def test_a7_v2_still_selects_its_existing_reader(self):
        infos = [dict(d, product_id=0x100B, product_string="MCHOSE A7 V2 Ultra")
                 for d in feedback_inventory(24) if d["product_id"] == 0x1018]
        for d in infos:
            if d["usage_page"] == 0xFF0B:
                d["usage"] = 0x0104
        with patch.object(M.hidlist, "enumerate", side_effect=lambda vid: infos if vid == 0x3837 else []), \
             patch.object(M.MchoseProvider, "_read_collection", return_value=(60, 0, 0, 9)) as read, \
             patch.object(M.hid, "device", side_effect=AssertionError("no other protocol")):
            device, = M.MchoseProvider().poll()
        self.assertEqual((device.name, device.level), ("MCHOSE A7 V2 Ultra", 60))
        read.assert_called_once_with(next(d["path"] for d in infos if d["usage_page"] == 0xFF01))

    def test_only_supported_new_ids_enter_the_offline_index(self):
        rows = known_ids.build_index()["devices"]
        entries = {(d["vendorId"], d["productId"]): d for d in rows}
        entry = entries[(0x3554, 0xF517)]
        self.assertEqual((entry["provider"], entry["name"], entry["kind"]),
                         ("pulsar", "Scyrox 8K 接收器", "mouse"))
        v3 = entries[(0x3837, 0x1018)]
        self.assertEqual((v3["provider"], v3["kind"]), ("mchose", "mouse"))
        # Shared FA09 belongs to one reader, regardless of its two collections.
        keyboards = {d["provider"]: d for d in rows
                     if (d["vendorId"], d["productId"]) == (0x3554, 0xFA09)}
        self.assertEqual(set(keyboards), {"mchose_by_keyboard"})
        keyboard = keyboards["mchose_by_keyboard"]
        self.assertEqual((keyboard["provider"], keyboard["kind"]), ("mchose_by_keyboard", "keyboard"))
        self.assertEqual(keyboard["name"], "2.4G 无线键盘（3554:FA09）")
        self.assertNotIn((0x3554, 0xFA07), entries)


if __name__ == "__main__":
    unittest.main()
