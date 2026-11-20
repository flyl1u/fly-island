"""Synthetic FA6x notifications only; never run vendor code or access HID."""
import ast
from contextlib import contextmanager
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
from providers import fa6x_passive as F
from catalog import load_catalog, validate_catalog
from device_pack import BRAND_PROVIDERS
from known_ids import build_index
import server


def descriptor(pid=0xFA60, physical="usb:a", **changes):
    page, usage = (0x000A, 0) if pid == 0xFA60 else (0xFF00, 1)
    return dict({"vendor_id": 0x1D57, "product_id": pid, "physical_id": physical,
                 "path": physical.encode() + b":input", "usage_page": page, "usage": usage,
                 "input_report_length": 8, "input_report_sizes": {"3": 8}}, **changes)


def report(level=73, model=0x78, event=0x40, state=2, report_id=3, length=8):
    return ([report_id, model, event, state, level] + [0] * max(0, length - 5))[:length]


def legacy_inventory(physical="usb:a", release=0x0116):
    return [descriptor(0xFA65, physical, usage_page=0x000A, usage=0,
                       path=physical.encode() + b":state", release_number=release),
            descriptor(0xFA65, physical, path=physical.encode() + b":comm",
                       release_number=release, input_report_sizes=None)]


class PassiveBus:
    def __init__(self, inventory, frames):
        self.inventory = inventory
        self.queues = {d["path"]: [] for d in inventory}
        if inventory:
            self.queues[inventory[0]["path"]] = list(frames)
        self.opened, self.closed, self.reads = [], [], []
        self.now, self.delay = 100.0, 0
        self.fail_open = False

    def device(self):
        bus = self

        class Handle:
            path = None

            def open_path(self, path):
                self.path = path
                bus.opened.append(path)
                if bus.fail_open:
                    raise OSError("private path")

            def read(self, length, timeout_ms):
                if self.path is None or not 0 < timeout_ms <= 1500:
                    raise AssertionError("unopened or unbounded read")
                bus.reads.append((self.path, length, timeout_ms))
                queue = bus.queues.get(self.path, [])
                if queue:
                    bus.now += min(bus.delay, timeout_ms / 1000)
                    raw = queue.pop(0)
                    if isinstance(raw, Exception):
                        raise raw
                    return raw
                bus.now += timeout_ms / 1000
                return []

            def close(self):
                bus.closed.append(self.path)

            def write(self, *args):
                raise AssertionError("write forbidden")

            def send_feature_report(self, *args):
                raise AssertionError("SET_FEATURE forbidden")

            def get_feature_report(self, *args):
                raise AssertionError("GET_FEATURE forbidden")

        return Handle()


@contextmanager
def fixture(frames=(), inventory=None):
    bus = PassiveBus([descriptor()] if inventory is None else inventory, frames)
    with patch.object(F.hidlist, "enumerate", side_effect=lambda vid: bus.inventory), \
            patch.object(F, "hid", SimpleNamespace(device=bus.device)), \
            patch.object(F, "time", SimpleNamespace(monotonic=lambda: bus.now)):
        provider = F.Fa6xPassiveProvider()
        try:
            yield bus, provider
        finally:
            provider.close()


class Fa6xPassiveTests(unittest.TestCase):
    def test_sc650_unnumbered_descriptor_proof_accepts_exact_five_byte_frame(self):
        info = descriptor(input_report_length=5, input_report_sizes={"0": 5},
                          input_report_proof="descriptor")
        for level in (1, 41, 100):
            with self.subTest(level=level), \
                    fixture([report(level, model=0x8E, state=1, length=5)], [info]) as (bus, provider):
                status, = provider.poll()
                self.assertEqual((status.level, status.name, status.verification_level),
                                 (level, F.PIDS[0xFA60], "C"))
                self.assertEqual((status.charging, status.charging_known, status.cached),
                                 (False, False, False))
                self.assertEqual(bus.opened, [info["path"]])
                self.assertTrue(bus.reads)
                self.assertTrue(all(size == 5 for _, size, _ in bus.reads))
                self.assertEqual(provider.diagnostics(), [])

    def test_sc650_unnumbered_rejects_other_models_prefixes_percentages_and_lengths(self):
        info = descriptor(input_report_length=5, input_report_sizes={"0": 5},
                          input_report_proof="descriptor")
        invalid = [report(41, model=model, state=1, length=5)
                   for model in (0, 0x07, 0x76, 0x77, 0x78, 0x79, 0xE8, 0xFF)]
        invalid += [report(41, model=0x8E, event=event, state=1, length=5)
                    for event in (0, 0x41, 0xFF)]
        invalid += [report(41, model=0x8E, state=state, length=5) for state in (0, 2, 3, 0xFF)]
        invalid += [report(level, model=0x8E, state=1, length=5) for level in (0, 101, 255)]
        invalid += [report(41, model=0x8E, state=1, report_id=n, length=5) for n in (0, 4)]
        invalid += [report(41, model=0x8E, state=1, length=n) for n in (4, 6)]
        for raw in invalid:
            with self.subTest(raw=raw), fixture([raw], [info]) as (bus, provider):
                self.assertEqual(provider.poll(), [])
                self.assertEqual(bus.opened, [info["path"]])
                self.assertEqual(provider.diagnostics(), ["no battery notification; no new measurement"])

    def test_sc650_unnumbered_incomplete_proof_never_opens(self):
        changes = [{"input_report_proof": proof} for proof in (None, "caps", "caps+descriptor", "")]
        changes += [{"input_report_length": n} for n in (None, True, "5", 4, 6, 5.0)]
        changes += [{"input_report_sizes": sizes} for sizes in (
            {"0": 4}, {"0": 6}, {"0": 5.0}, {"0": "5"}, {"0": True},
            {"0": 5, "3": 5}, {"0": 5, "9": 5})]
        for change in changes:
            info = descriptor(input_report_length=5, input_report_sizes={"0": 5},
                              input_report_proof="descriptor")
            info.update(change)
            with self.subTest(change=change), \
                    fixture([report(41, model=0x8E, state=1, length=5)], [info]) as (bus, provider):
                self.assertEqual(provider.poll(), [])
                self.assertEqual((bus.opened, bus.reads), ([], []))
                self.assertEqual(provider.diagnostics(),
                                 ["unnumbered FA60 frame proof incomplete; not opened"])

    def test_sc650_unnumbered_requires_unique_fa60_collection_path_and_parent(self):
        info = descriptor(input_report_length=5, input_report_sizes={"0": 5},
                          input_report_proof="descriptor")
        changes = [{"vendor_id": 0x1D58}, {"product_id": 0xFA65},
                   {"usage_page": 0xFF00, "usage": 1}, {"usage_page": 0x000B}, {"usage": 1},
                   {"path": None}, {"path": b""},
                   {"physical_id": ""}, {"physical_id": "collection:unresolved"}]
        inventories = [[dict(info, **change)] for change in changes]
        inventories += [[info, dict(info, path=b"duplicate")],
                        [info, descriptor(0xFA65, path=b"other-candidate")]]
        for inventory in inventories:
            with self.subTest(inventory=inventory), fixture([], inventory) as (bus, provider):
                self.assertEqual(provider.poll(), [])
                self.assertEqual((bus.opened, bus.reads), ([], []))

    def test_sc650_unnumbered_proof_never_enables_fa65_web_or_legacy(self):
        web = descriptor(0xFA65, input_report_length=5, input_report_sizes={"0": 5},
                         input_report_proof="descriptor")
        legacy = legacy_inventory()
        legacy[0].update(input_report_length=5, input_report_sizes={"0": 5},
                         input_report_proof="descriptor")
        for inventory in ([web], legacy):
            with self.subTest(inventory=inventory), \
                    fixture([report(41, model=0x8E, state=1, length=5)], inventory) as (bus, provider):
                self.assertEqual(provider.poll(), [])
                self.assertEqual((bus.opened, bus.reads), ([], []))
                self.assertEqual(provider.diagnostics(), [
                    "input report 03 length unproven; proof=descriptor; "
                    "declared=out:unknown,in:00/5,feature:unknown; not opened"])

    def test_sc650_unnumbered_late_input_history_and_proof_loss_follow_passive_lifecycle(self):
        info = descriptor(input_report_length=5, input_report_sizes={"0": 5},
                          input_report_proof="descriptor")
        with fixture([], [info]) as (bus, provider):
            self.assertEqual(provider.poll(), [])
            bus.queues[info["path"]] = [report(n, model=0x8E, state=1, length=5) for n in (42, 41)]
            before = len(bus.reads)
            first, = provider.poll()
            self.assertEqual(first.level, 41)
            self.assertEqual(bus.opened, [info["path"]])
            self.assertTrue(all(timeout == 1 for _, _, timeout in bus.reads[before:]))
            bus.queues[info["path"]] = [report(91, model=0x07, state=1, length=5)]
            stale, = provider.poll()
            self.assertEqual((stale.level, stale.cached, stale.online), (41, True, False))
            self.assertEqual((stale.measured_at_utc, stale.queried_at_utc),
                             (first.measured_at_utc, first.queried_at_utc))
            bus.inventory = [dict(info, input_report_proof="caps")]
            self.assertTrue(provider.poll()[0].cached)
            self.assertEqual(bus.closed, bus.opened)
            self.assertEqual(provider.diagnostics(),
                             ["unnumbered FA60 frame proof incomplete; not opened"])
            bus.inventory = [info]
            bus.queues[info["path"]] = [report(40, model=0x8E, state=1, length=5)]
            self.assertEqual(provider.poll()[0].level, 40)
            self.assertEqual(len(bus.opened), 2)
            bus.inventory = []
            self.assertEqual(provider.poll(), [])
            self.assertEqual(bus.closed, bus.opened)

    def test_sc650_reported_prefixes_follow_passive_lifecycle(self):
        info = descriptor(input_report_length=5, input_report_sizes={"3": 5})
        with fixture([[3, 0x8E, 0x40, 1, 0x5B]], [info]) as (bus, provider):
            first, = provider.poll()
            self.assertEqual((first.level, first.name, first.verification_level),
                             (91, F.PIDS[0xFA60], "C"))
            self.assertEqual((first.charging, first.charging_known, first.cached), (False, False, False))
            bus.queues[info["path"]] = [[3, 0x8E, 0x40, 1, 0x5B], [3, 0x8E, 0x40, 1, 0x31]]
            newest, = provider.poll()
            self.assertEqual(newest.level, 49)
            stale, = provider.poll()
            self.assertEqual((stale.level, stale.cached, stale.online, stale.charging_known),
                             (49, True, False, False))
            self.assertEqual((stale.measured_at_utc, stale.queried_at_utc),
                             (newest.measured_at_utc, newest.queried_at_utc))
            self.assertEqual(bus.opened, [info["path"]])
            self.assertEqual(bus.closed, [])
            self.assertTrue(all(timeout == 1 for _, _, timeout in bus.reads[2:]))
            bus.inventory = []
            self.assertEqual(provider.poll(), [])
            self.assertEqual(bus.closed, bus.opened)

    def test_sc650_only_fa60_event40_state01_is_accepted(self):
        for pid in F.PIDS:
            for event in (0, 0x40, 0x41, 0x42, 0xFF):
                for state in (0, 1, 2, 3, 4, 255):
                    raw = report(49, model=0x8E, event=event, state=state)
                    expected = 49 if (pid, event, state) == (0xFA60, 0x40, 1) else None
                    with self.subTest(pid=pid, event=event, state=state):
                        self.assertEqual(F.parse_battery(raw, pid), expected)
                        with fixture([raw], [descriptor(pid)]) as (_, provider):
                            self.assertEqual([s.level for s in provider.poll()],
                                             [] if expected is None else [expected])
        for level in (0, 101, 255):
            self.assertIsNone(F.parse_battery(report(level, model=0x8E, state=1), 0xFA60))

    def test_sc650_actual_length_must_equal_per_id_proof_without_refreshing_history(self):
        for length in (5, 8, 19, 64, 100, 4096):
            maximum = max(128, length)
            info = descriptor(input_report_length=maximum,
                              input_report_sizes={"3": length, "9": maximum})
            invalid = [report(91, model=0x8E, state=1, length=n)
                       for n in (4, length - 1, length + 1)]
            invalid += [report(91, model=0x8E, state=1, report_id=9, length=maximum)]
            with self.subTest(length=length), fixture(invalid, [info]) as (bus, provider):
                self.assertEqual(provider.poll(), [])
                bus.queues[info["path"]] = [report(49, model=0x8E, state=1, length=length)]
                first, = provider.poll()
                self.assertEqual(first.level, 49)
                bus.queues[info["path"]] = invalid + [report(91, model=0x8E, event=0x41,
                                                           state=1, length=length)]
                stale, = provider.poll()
                self.assertTrue(stale.cached)
                self.assertEqual((stale.level, stale.measured_at_utc, stale.queried_at_utc),
                                 (49, first.measured_at_utc, first.queried_at_utc))
                self.assertTrue(all(size == maximum for _, size, _ in bus.reads))

    def test_sc650_no_per_id_proof_never_opens(self):
        for sizes, declared in ((None, "unknown"), ({}, "none"),
                                ({"9": 5}, "09/5"), ({"3": 4}, "03/4"), ({"3": 6}, "03/6")):
            info = descriptor(input_report_length=5, input_report_sizes=sizes)
            with self.subTest(sizes=sizes), fixture([[3, 0x8E, 0x40, 1, 49]], [info]) as (bus, provider):
                self.assertEqual(provider.poll(), [])
                self.assertEqual((bus.opened, bus.reads), ([], []))
                self.assertEqual(provider.diagnostics(), [
                    "input report 03 length unproven; declared=out:unknown,in:"
                    + declared + ",feature:unknown; not opened"])

    def test_fa65_web_and_legacy_unproven_diagnostics_include_proof_and_declared(self):
        for legacy in (False, True):
            infos = legacy_inventory() if legacy else [descriptor(0xFA65)]
            infos[0].update(input_report_sizes=None, input_report_proof="failed",
                            report_descriptor_error="collection maximum mismatch",
                            declared_report_sizes={"input": {"3": 4}, "output": {}, "feature": {}})
            with self.subTest(legacy=legacy), fixture([], infos) as (bus, provider):
                self.assertEqual(provider.poll(), [])
                self.assertEqual((bus.opened, bus.reads), ([], []))
                self.assertEqual(provider.diagnostics(), [
                    "input report 03 length unproven; proof=caps+descriptor failed; "
                    "descriptor=collection maximum mismatch; "
                    "declared=out:none,in:03/4,feature:none; not opened"])

    def test_fa65_proven_but_missing_or_short_report_keeps_declared_diagnostic(self):
        for proof in ("caps", "descriptor"):
            for sizes, declared in (({"4": 5}, "04/5"), ({"3": 4}, "03/4")):
                info = descriptor(0xFA65, input_report_length=max(sizes.values()),
                                  input_report_sizes=sizes, input_report_proof=proof,
                                  declared_report_sizes={"input": sizes, "output": {}, "feature": {}})
                with self.subTest(proof=proof, sizes=sizes), fixture([], [info]) as (bus, provider):
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual((bus.opened, bus.reads), ([], []))
                    self.assertEqual(provider.diagnostics(), [
                        "input report 03 length unproven; proof=" + proof
                        + "; declared=out:none,in:" + declared + ",feature:none; not opened"])

    def test_fa65_proof_diagnostics_never_echo_arbitrary_device_text(self):
        private = "PRIVATE-PATH PRIVATE-PRODUCT PRIVATE-SERIAL PRIVATE-EXCEPTION"
        for legacy in (False, True):
            for proof in ("failed", private):
                infos = legacy_inventory() if legacy else [descriptor(0xFA65)]
                infos[0].update(path=private.encode(), product_string=private, serial_number=private,
                                manufacturer_string=private, input_report_sizes=None,
                                input_report_proof=proof, report_descriptor_error=private,
                                declared_report_sizes={"output": {private: 64, "3": private},
                                                       "input": {"4": 5, private: 5, "3": True},
                                                       "feature": {private: private}})
                with self.subTest(legacy=legacy, proof=proof), fixture([], infos) as (bus, provider):
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual((bus.opened, bus.reads), ([], []))
                    expected = "input report 03 length unproven"
                    if proof == "failed":
                        expected += "; proof=caps+descriptor failed; descriptor=unknown"
                    expected += "; declared=out:unknown,in:04/5,in:unknown,feature:unknown; not opened"
                    self.assertEqual(provider.diagnostics(), [expected])
                    self.assertNotIn("PRIVATE", " ".join(provider.diagnostics()))

    def test_web_fa65_release_0118_with_extra_state_reads_only_web(self):
        web = descriptor(0xFA65, release_number=0x0118)
        extra = descriptor(0xFA65, usage_page=0x000A, usage=0, path=b"extra-state",
                           release_number=0x0118, input_report_sizes=None)
        with fixture([report(62, model=0x78, event=0x40, state=1)],
                     [web, extra]) as (bus, provider):
            self.assertEqual([s.level for s in provider.poll()], [62])
            self.assertEqual(bus.opened, [web["path"]])
            self.assertTrue(all(path == web["path"] for path, _, _ in bus.reads))
            self.assertEqual(provider.diagnostics(), [])

    def test_web_fa65_ignores_extra_state_without_valid_legacy_release(self):
        releases = ({}, *({"release_number": value} for value in (
            0x18, 0x0118, None, True, False, "22", 22.0, -234, 0x10016, 0)))
        for web_release in ({}, {"release_number": 0x0118}):
            for state_release in releases:
                web = descriptor(0xFA65, **web_release)
                extra = descriptor(0xFA65, usage_page=0x000A, usage=0, path=b"extra-state",
                                   input_report_sizes=None, **state_release)
                with self.subTest(web=web_release, state=state_release), \
                        fixture([report(62, state=1)], [web, extra]) as (bus, provider):
                    self.assertEqual([s.level for s in provider.poll()], [62])
                    self.assertEqual(bus.opened, [web["path"]])
                    self.assertTrue(all(path == web["path"] for path, _, _ in bus.reads))
                    self.assertEqual(provider.diagnostics(), [])

    def test_single_sided_legacy_release_never_falls_back_to_usable_web(self):
        for marker_side in (0, 1):
            for peer_release in ({}, {"release_number": 0x0118},
                                 {"release_number": None}, {"release_number": 0x10016}):
                infos = legacy_inventory()
                infos[1]["input_report_sizes"] = {"3": 8}
                del infos[1 - marker_side]["release_number"]
                infos[1 - marker_side].update(peer_release)
                with self.subTest(marker_side=marker_side, peer=peer_release), \
                        fixture([], infos) as (bus, provider):
                    bus.queues[infos[1]["path"]] = [report(62, state=1)]
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual((bus.opened, bus.reads), ([], []))
                    self.assertEqual(provider.diagnostics(),
                                     ["legacy FA65 release unproven; not opened"])

    def test_legacy_complete_shape_reads_only_state_collection(self):
        infos = legacy_inventory()
        with fixture([report(67, model=0x93, state=0)], infos) as (bus, provider):
            statuses = provider.poll()
            self.assertEqual([s.level for s in statuses], [67])
            self.assertEqual(bus.opened, [infos[0]["path"]])
            self.assertTrue(all(path == infos[0]["path"] for path, _, _ in bus.reads))
            self.assertEqual(provider.diagnostics(), [])

    def test_legacy_real_percentages_and_release_low_byte(self):
        for release in (0x0016, 0x0116, 0xFF16):
            for level in range(1, 101):
                state = (0, 1, 4, 0x11, 0x1F, 255)[level % 6]
                with self.subTest(release=release, level=level), \
                        fixture([report(level, model=0x93, state=state)],
                                legacy_inventory(release=release)) as (_, provider):
                    status, = provider.poll()
                    self.assertEqual((status.level, status.name, status.verification_level),
                                     (level, F.PIDS[0xFA65], "C"))
                    self.assertEqual((status.charging, status.charging_known, status.kind),
                                     (False, False, "mouse"))

    def test_legacy_rejects_web_events_other_models_and_synthetic_states(self):
        invalid = [report(model=0x93, state=0, event=n) for n in (0, 0x41, 0x42, 0xC0, 0xFF)]
        invalid += [report(model=n, state=0) for n in (0, 0x07, 0x71, 0x78, 0x90, 0x95, 255)]
        invalid += [report(model=0x93, state=state, level=level)
                    for state, level in ((2, 1), (2, 100), (3, 73), (3, 100), (0, 0), (0, 101), (0, 255))]
        invalid += [report(model=0x93, state=0, report_id=n) for n in (0, 4)]
        with fixture(invalid, legacy_inventory()) as (bus, provider):
            self.assertEqual(provider.poll(), [])
            self.assertEqual(provider.diagnostics(), ["no battery notification; no new measurement"])
            bus.queues[bus.inventory[0]["path"]] = [report(48, model=0x93, state=0)] + invalid
            status, = provider.poll()
            self.assertEqual(status.level, 48)
            self.assertEqual(provider.diagnostics(), [])
            self.assertEqual(len(bus.opened), 1)

    def test_legacy_report_length_is_proven_per_id_and_exact(self):
        for length in (5, 8, 19, 64, 100, 4096):
            infos = legacy_inventory()
            maximum = max(128, length)
            infos[0].update(input_report_length=maximum, input_report_sizes={"3": length, "9": maximum})
            invalid = [report(11, model=0x93, state=0, length=n) for n in (4, length - 1, length + 1)]
            invalid += [report(12, model=0x93, state=0, report_id=9, length=maximum)]
            with self.subTest(length=length), fixture(invalid, infos) as (bus, provider):
                self.assertEqual(provider.poll(), [])
                bus.queues[infos[0]["path"]] = [report(89, model=0x93, state=0, length=length)]
                self.assertEqual(provider.poll()[0].level, 89)
                self.assertTrue(all(size == maximum for _, size, _ in bus.reads))

    def test_legacy_both_releases_must_be_real_uint16_with_low_byte_16(self):
        for side in (0, 1):
            for release in (None, True, False, "22", 22.0, -234, 0x10016, 0, 0x0118):
                infos = legacy_inventory()
                infos[1]["input_report_sizes"] = {"3": 8}  # A usable web peer must not be tried.
                infos[side]["release_number"] = release
                with self.subTest(side=side, release=release), fixture([], infos) as (bus, provider):
                    bus.queues[infos[1]["path"]] = [report(99)]
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual(bus.opened, [])
                    self.assertIn("legacy FA65 release unproven; not opened", provider.diagnostics())
            infos = legacy_inventory()
            del infos[side]["release_number"]
            with fixture([], infos) as (bus, provider):
                self.assertEqual(provider.poll(), [])
                self.assertEqual(bus.opened, [])

    def test_legacy_missing_ambiguous_foreign_or_unresolved_peer_never_falls_back(self):
        base = legacy_inventory()
        inventories = [[base[0]], [base[1]],
                       base + [dict(base[0], path=b"extra-state", release_number=None)],
                       base + [dict(base[1], path=b"extra-comm", release_number=None)]]
        for side in (0, 1):
            for change in ({"vendor_id": 0x1D58}, {"product_id": 0xFA93}, {"product_id": 0xFA60},
                           {"usage_page": 0xFF01}, {"usage": 2}, {"physical_id": "usb:other"},
                           {"physical_id": ""}, {"physical_id": "collection:unresolved"},
                           {"path": None}, {"path": b""}, {"path": 42}, {"path": b"bad\0path"}):
                infos = [dict(d) for d in base]
                infos[side].update(change)
                inventories.append(infos)
        inventories += [[dict(d, product_id=0xFA93) for d in base],
                        [dict(d, path=b"same-path") for d in base]]
        for infos in inventories:
            with self.subTest(infos=infos), fixture([], infos) as (bus, provider):
                self.assertEqual(provider.poll(), [])
                self.assertEqual(bus.opened, [])
        provider = F.Fa6xPassiveProvider()
        self.assertIsNone(provider._pick([base[0], dict(base[1], physical_id="usb:other")]))

    def test_legacy_unproven_state_does_not_try_proven_communication_input(self):
        defects = [{"input_report_length": n} for n in (None, True, "8", 4, 4097)]
        defects += [{"input_report_sizes": sizes} for sizes in (
            None, {}, {3: 8}, {"4": 8}, {"3": True}, {"3": 4}, {"3": 7}, {"3": 9}, {"3": 8, "4": None})]
        for change in defects:
            infos = legacy_inventory()
            infos[0].update(change)
            infos[1]["input_report_sizes"] = {"3": 8}
            with self.subTest(change=change), fixture([], infos) as (bus, provider):
                bus.queues[infos[1]["path"]] = [report(99)]
                self.assertEqual(provider.poll(), [])
                self.assertEqual((bus.opened, bus.reads), ([], []))

    def test_legacy_late_notifications_drain_latest_without_reopening_or_renewing_history(self):
        infos = legacy_inventory()
        with fixture([], infos) as (bus, provider):
            self.assertEqual(provider.poll(), [])
            bus.queues[infos[0]["path"]] = [report(n, model=0x93, state=0) for n in (30, 31)]
            first, = provider.poll()
            self.assertEqual(first.level, 31)
            bus.queues[infos[0]["path"]] = [report(72, model=0x93, state=0), report(100, model=0x93, state=2)]
            newest, = provider.poll()
            self.assertEqual(newest.level, 72)
            stale, = provider.poll()
            self.assertEqual((stale.level, stale.cached, stale.online, stale.connection_known, stale.charging_known),
                             (72, True, False, False, False))
            self.assertEqual((stale.measured_at_utc, stale.queried_at_utc),
                             (newest.measured_at_utc, newest.queried_at_utc))
            self.assertEqual(bus.opened, [infos[0]["path"]])
            self.assertEqual(bus.closed, [])
            self.assertTrue(all(timeout == 1 for _, _, timeout in bus.reads[1:]))
            bus.inventory = [dict(d, release_number=None) for d in infos]
            self.assertTrue(provider.poll()[0].cached)
            self.assertEqual(bus.closed, bus.opened)
            bus.inventory = []
            self.assertEqual(provider.poll(), [])

    def test_legacy_variant_path_peer_release_and_report_proof_changes_revalidate_handle(self):
        for change in ("state_path", "peer_path", "state_release", "peer_release", "proof", "web"):
            infos = legacy_inventory()
            with self.subTest(change=change), fixture([], infos) as (bus, provider):
                provider.poll()
                updated = [dict(d) for d in infos]
                if change == "state_path":
                    updated[0]["path"] = b"new-state"
                elif change == "peer_path":
                    updated[1]["path"] = b"new-peer"
                elif change.endswith("release"):
                    updated[0 if change == "state_release" else 1]["release_number"] = 0x0216
                elif change == "proof":
                    updated[0]["input_report_sizes"] = {"3": 8, "9": 8}
                else:
                    updated = [descriptor(0xFA65, path=infos[0]["path"], release_number=0x18)]
                bus.inventory = updated
                provider.poll()
                self.assertEqual(bus.closed, [infos[0]["path"]])
                self.assertEqual(bus.opened, [infos[0]["path"], updated[0]["path"]])
                # Restore legacy on the same original state path: it must reopen.
                bus.inventory = infos
                provider.poll()
                self.assertEqual(len(bus.opened), 3)
                self.assertEqual(len(bus.closed), 2)

    def test_legacy_two_receivers_do_not_share_peers_handles_or_history(self):
        first, second = legacy_inventory(), legacy_inventory("usb:b")
        with fixture([report(13, model=0x93, state=0)], first + second) as (bus, provider):
            bus.queues[second[0]["path"]] = [report(87, model=0x93, state=0)]
            statuses = provider.poll()
            self.assertEqual([(s.physical_id, s.level) for s in statuses], [("usb:a", 13), ("usb:b", 87)])
            self.assertEqual(bus.opened, [first[0]["path"], second[0]["path"]])
            bus.inventory = first[:1] + second
            bus.queues[second[0]["path"]] = [report(88, model=0x93, state=0)]
            statuses = {s.physical_id: s for s in provider.poll()}
            self.assertTrue(statuses["usb:a"].cached)
            self.assertEqual(statuses["usb:b"].level, 88)
            self.assertIn(first[0]["path"], bus.closed)
            self.assertNotIn(second[0]["path"], bus.closed)
            bus.inventory = second
            self.assertEqual([s.physical_id for s in provider.poll()], ["usb:b"])

    def test_legacy_first_listen_and_drain_use_existing_budgets(self):
        for delay in (0, 0.3):
            with fixture([report(model=0x93, state=0, event=0x41)] * 1000,
                         legacy_inventory()) as (bus, provider):
                bus.delay = delay
                self.assertEqual(provider.poll(), [])
                self.assertLessEqual(bus.now - 100, 1.5)
                self.assertLessEqual(len(bus.reads), 32)
        with fixture([], legacy_inventory()) as (bus, provider):
            provider.poll()
            bus.queues[bus.inventory[0]["path"]] = [report(22, model=0x93, state=0)] * 1000
            before = len(bus.reads)
            self.assertEqual(provider.poll()[0].level, 22)
            self.assertEqual(len(bus.reads) - before, F.MAX_DRAIN)

    def test_exact_web_model_table_and_events(self):
        expected = {0xFA60: {0x07, 0x76, 0x77, 0x78, 0x79, 0xE8},
                    0xFA65: {0x71, 0x76, 0x77, 0x78, 0x79, 0x90}}
        self.assertEqual(F.MODELS, {**expected, 0xFA60: expected[0xFA60] | {0x8E}})
        for pid, models in expected.items():
            for model in range(256):
                for event in (0x40, 0x41):
                    with self.subTest(pid=pid, model=model, event=event):
                        self.assertEqual(F.parse_battery(report(model=model, event=event), pid),
                                         73 if model in models else None)

    def test_known_native_only_models_and_unknown_pid_are_rejected(self):
        for pid in (0xFA60, 0xFA65, 0x1013, 0xFA61):
            for model in (0x13, 0x93, 0x95):
                self.assertIsNone(F.parse_battery(report(model=model), pid))
        self.assertIsNone(F.parse_battery(report(), 0xFA61))

    def test_percent_and_charge_state_never_synthesize_a_measurement(self):
        for pid in F.PIDS:
            for level in (1, 73, 100):
                for state in (0, 1, 2, 3, 0x11, 0x1F, 255):
                    with self.subTest(pid=pid, level=level, state=state), \
                            fixture([report(level, state=state)], [descriptor(pid)]) as (bus, provider):
                        status, = provider.poll()
                        self.assertEqual((status.name, status.level, status.charging, status.charging_known),
                                         (f"2.4G 无线鼠标（1D57:{pid:04X}）", level, False, False))
                        self.assertEqual((status.kind, status.source, status.verification_level),
                                         ("mouse", "fa6x_passive", "C"))
                        self.assertTrue(status.online)
                        self.assertFalse(status.cached)
                        public = server.normalise(status, None, server.utcnow())
                        self.assertIsNone(public["charging"])
                        self.assertIsNotNone(server.valid_time(status.measured_at_utc))
                        self.assertEqual(bus.closed, [])

    def test_invalid_prefix_percent_and_length_ignored(self):
        invalid = [report(level=n) for n in (-1, 0, 101, 255)]
        invalid += [report(event=n) for n in (0, 0x42, 0xC0, 0xFF)]
        invalid += [report(report_id=n) for n in (0, 4, 7)]
        invalid += [report(model=0x13), report(length=4), report(length=7), report(length=9)]
        with fixture(invalid) as (bus, provider):
            self.assertEqual(provider.poll(), [])
            self.assertEqual(len(bus.opened), 1)
        with fixture(invalid + [report(42)]) as (_, provider):
            self.assertEqual(provider.poll()[0].level, 42)

    def test_runtime_report_length_is_not_assumed_from_prefix_or_read_buffer(self):
        for length in (5, 8, 19, 64, 100):
            info = descriptor(input_report_length=128, input_report_sizes={"3": length, "9": 128})
            frames = [report(12, length=length - 1), report(13, length=length + 1),
                      report(14, report_id=9, length=128), report(62, length=length)]
            with self.subTest(length=length), fixture(frames, [info]) as (bus, provider):
                self.assertEqual(provider.poll()[0].level, 62)
                self.assertTrue(all(size == 128 for _, size, _ in bus.reads))

    def test_initial_and_later_polls_drain_to_newest_valid_notification(self):
        with fixture([report(40), report(0), report(41, event=0x41)]) as (bus, provider):
            first, = provider.poll()
            self.assertEqual(first.level, 41)
            self.assertEqual(bus.closed, [])
            bus.queues[descriptor()["path"]] = [report(62), report(model=0), report(63), report(0)]
            before = len(bus.reads)
            newest, = provider.poll()
            self.assertEqual((newest.level, newest.cached), (63, False))
            self.assertEqual(len(bus.opened), 1)
            self.assertTrue(all(timeout == 1 for _, _, timeout in bus.reads[before:]))
            self.assertEqual(bus.closed, [])
        self.assertEqual(bus.closed, bus.opened)

    def test_silence_is_not_an_error_and_late_input_uses_kept_handle(self):
        with fixture() as (bus, provider):
            self.assertEqual(provider.poll(), [])
            self.assertLessEqual(bus.now - 100, 1.5)
            self.assertEqual(bus.closed, [])
            candidates = server.recognized_candidate_count(F.Fa6xPassiveProvider.name, bus.inventory)
            self.assertEqual(candidates, 1)
            engine = server.BatteryEngine(providers=[provider])
            engine._accept("reader", provider.name, [], server.utcnow(), "usb:a", candidates)
            self.assertEqual(engine.health["reader"]["reason"], "no_measurement")
            self.assertEqual(engine.errors, [])
            bus.queues[descriptor()["path"]] = [report(55)]
            self.assertEqual(provider.poll()[0].level, 55)
            self.assertEqual(len(bus.opened), 1)

    def test_history_keeps_original_time_and_idle_health_until_unplug(self):
        with fixture([report(61)]) as (bus, provider):
            first, = provider.poll()
            previous = server.normalise(first, None, "2026-11-06T01:00:00Z")
            for changes in ({}, {"input_report_sizes": None}, {"usage": 14},
                            {"physical_id": "collection:temporarily-unresolved"}):
                bus.inventory = [descriptor(**changes)]
                stale, = provider.poll()
                self.assertEqual((stale.level, stale.online, stale.cached, stale.wake_on_input),
                                 (61, False, True, True))
                self.assertFalse(stale.connection_known)
                self.assertFalse(stale.charging_known)
                public = server.normalise(stale, previous, "2026-11-06T02:00:00Z")
                self.assertEqual(public["measuredAtUtc"], previous["measuredAtUtc"])
                self.assertEqual(public["measurementState"], "cached")
                engine = server.BatteryEngine(providers=[provider])
                engine._accept("reader", provider.name, [stale], server.utcnow(), "usb:a", 1)
                self.assertEqual(engine.health["reader"]["reason"], "no_measurement")
                self.assertEqual(engine.errors, [])
            bus.inventory = [descriptor(), descriptor(path=b"duplicate")]
            before = len(bus.opened)
            self.assertTrue(provider.poll()[0].cached)
            self.assertEqual(len(bus.opened), before)
            bus.inventory = []
            self.assertEqual(provider.poll(), [])
            bus.inventory = [descriptor()]
            self.assertEqual(provider.poll(), [])

    def test_independent_receivers_and_removal(self):
        infos = [descriptor(), descriptor(0xFA65, physical="usb:b")]
        with fixture([report(12)], infos) as (bus, provider):
            bus.queues[infos[1]["path"]] = [report(84, model=0x90)]
            first = provider.poll()
            self.assertEqual([s.level for s in first], [12, 84])
            self.assertEqual(len({s.key for s in first}), 2)
            bus.inventory = [infos[1]]
            bus.queues[infos[1]["path"]] = [report(85)]
            current, = provider.poll()
            self.assertEqual((current.key, current.level, current.cached), (first[1].key, 85, False))
            self.assertIn(infos[0]["path"], bus.closed)
            self.assertEqual(len(provider._last), 1)

    def test_limits_bound_first_listen_and_continuous_queue(self):
        for delay in (0, 0.3):
            with fixture([report(model=0)] * 1000) as (bus, provider):
                bus.delay = delay
                self.assertEqual(provider.poll(), [])
                self.assertLessEqual(bus.now - 100, 1.5)
                self.assertLessEqual(len(bus.reads), 32)
        with fixture() as (bus, provider):
            provider.poll()
            bus.queues[descriptor()["path"]] = [report(22)] * 1000
            before = len(bus.reads)
            self.assertEqual(provider.poll()[0].level, 22)
            self.assertEqual(len(bus.reads) - before, F.MAX_DRAIN)

    def test_failed_open_or_read_closes_and_can_recover(self):
        for fail_open in (False, True):
            with fixture([OSError("private path")]) as (bus, provider):
                bus.fail_open = fail_open
                self.assertEqual(provider.poll(), [])
                self.assertEqual(bus.closed, bus.opened)
                self.assertNotIn("private path", " ".join(provider.diagnostics()))
                bus.fail_open = False
                bus.queues[descriptor()["path"]] = [report(77)]
                self.assertEqual(provider.poll()[0].level, 77)
                bus.queues[descriptor()["path"]] = [OSError("private path")]
                self.assertTrue(provider.poll()[0].cached)
                self.assertEqual(bus.closed, bus.opened)

    def test_enumeration_failure_retains_history(self):
        with fixture([report(66)]) as (_, provider):
            first, = provider.poll()
            with patch.object(F.hidlist, "enumerate", side_effect=OSError("private path")):
                stale, = provider.poll()
            self.assertEqual((stale.key, stale.level, stale.measured_at_utc, stale.cached),
                             (first.key, 66, first.measured_at_utc, True))

    def test_path_or_proven_length_change_reopens_and_proof_loss_closes(self):
        changes = [[], [descriptor(path=b"new-path")], [descriptor(input_report_sizes=None)],
                   [descriptor(input_report_length=9, input_report_sizes={"3": 9})]]
        for inventory in changes:
            with self.subTest(inventory=inventory), fixture() as (bus, provider):
                provider.poll()
                bus.inventory = inventory
                provider.poll()
                self.assertIn(descriptor()["path"], bus.closed)
                self.assertEqual(len(bus.opened), 2 if inventory and inventory[0].get("input_report_sizes") else 1)

    def test_wrong_or_ambiguous_identity_collection_and_parent_never_open(self):
        for pid in F.PIDS:
            changes = [{"vendor_id": 0x1D58}, {"product_id": 0xFA61}, {"product_id": 0x1013},
                       {"usage_page": 0x000B, "usage": 0}, {"usage_page": 0xFF01, "usage": 2},
                       {"usage": 14}, {"physical_id": ""}, {"physical_id": "collection:unresolved"},
                       {"path": b""}]
            changes += [{"usage_page": 0xFF00, "usage": 1} if pid == 0xFA60
                        else {"usage_page": 0x000A, "usage": 0}]
            inventories = [[descriptor(pid, **change)] for change in changes]
            inventories += [[], [descriptor(pid), descriptor(pid, path=b"duplicate")]]
            for inventory in inventories:
                with self.subTest(pid=pid, inventory=inventory), fixture([report()], inventory) as (bus, provider):
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual(bus.opened, [])

    def test_unproven_or_inconsistent_lengths_never_open(self):
        changes = [{"input_report_length": n} for n in (None, True, "8", 4, 4097)]
        changes += [{"input_report_sizes": sizes} for sizes in (
            None, {}, {3: 8}, {"4": 8}, {"3": True}, {"3": "8"}, {"3": 4},
            {"3": 9}, {"3": 7}, {"3": 8, "4": None})]
        for pid in F.PIDS:
            for change in changes:
                with self.subTest(pid=pid, change=change), fixture([report()], [descriptor(pid, **change)]) as (bus, provider):
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual(bus.opened, [])

    def test_ast_allows_only_open_read_close_device_operations(self):
        tree = ast.parse(Path(F.__file__).read_text(encoding="utf-8"))
        calls = [node.func for node in ast.walk(tree) if isinstance(node, ast.Call)]
        attributes = {call.attr for call in calls if isinstance(call, ast.Attribute)}
        self.assertFalse(attributes & {"write", "send_feature_report", "get_feature_report"})
        device_calls = {call.attr for call in calls if isinstance(call, ast.Attribute)
                        and isinstance(call.value, ast.Name) and call.value.id == "dev"}
        self.assertEqual(device_calls, {"open_path", "read", "close"})
        # Legacy adds a parser/identity gate, not another device-I/O call site.
        names = [call.attr for call in calls if isinstance(call, ast.Attribute)
                 and isinstance(call.value, ast.Name) and call.value.id == "dev"]
        self.assertEqual({name: names.count(name) for name in set(names)},
                         {"open_path": 1, "read": 1, "close": 2})

    def test_registration_neutral_index_and_catalog(self):
        self.assertIn(("fa6x_passive", "Fa6xPassiveProvider"), server.PROVIDERS)
        self.assertEqual(server.PROVIDER_VIDS["fa6x_passive"], (0x1D57,))
        self.assertIn("fa6x_passive", BRAND_PROVIDERS)
        self.assertNotIn("fa6x_passive", server.DPI_PROVIDERS)
        entries = [e for e in build_index()["devices"] if e["provider"] == "fa6x_passive"]
        self.assertEqual({(e["vendorId"], e["productId"], e["name"], e["kind"]) for e in entries},
                         {(0x1D57, pid, name, "mouse") for pid, name in F.PIDS.items()})
        self.assertTrue(all(e["requiresModelMatch"] for e in entries))
        reader, = [e for e in load_catalog()["readers"] if e["provider"] == "fa6x_passive"]
        self.assertEqual(reader["verificationLevel"], "C")
        self.assertEqual(validate_catalog()["errors"], [])


if __name__ == "__main__":
    unittest.main()
