"""Synthetic passive Rapoo inputs only; no hardware or vendor code execution."""
from contextlib import contextmanager
from pathlib import Path
import ast
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
from providers import rapoo as R
from catalog import load_catalog, validate_catalog
from known_ids import build_index
import battery_hid
import server
from test_battery_caps import FakeApi, caps


def descriptor(pid=0x1412, physical="usb:receiver-a", **changes):
    return dict({"vendor_id": 0x24AE, "product_id": pid,
                 "physical_id": physical, "path": physical.encode() + b":control",
                 "usage_page": 0xFF00, "usage": 2,
                 "input_report_length": 19, "input_report_sizes": {"7": 19}}, **changes)


def report(level=73, state=1, report_id=7, length=19):
    raw = [report_id] + [0] * (length - 1)
    raw[7:9] = [state, level]
    return raw


class PassiveBus:
    def __init__(self, inventory, frames):
        self.inventory = inventory
        self.frames = list(frames)
        self.opened = []
        self.closed = []
        self.reads = []
        self.forbidden = []
        self.now = 100.0
        self.delay = 0

    def device(self):
        bus = self

        class Handle:
            path = None

            def open_path(self, path):
                self.path = path
                bus.opened.append(path)

            def read(self, length, timeout_ms):
                if self.path is None or not 0 < timeout_ms <= 1500:
                    raise AssertionError("unopened/unbounded read")
                bus.reads.append((length, timeout_ms))
                if bus.frames:
                    bus.now += min(bus.delay, timeout_ms / 1000)
                    frame = bus.frames.pop(0)
                    if isinstance(frame, Exception):
                        raise frame
                    return frame
                bus.now += timeout_ms / 1000
                return []

            def close(self):
                bus.closed.append(self.path)

            def write(self, *args):
                bus.forbidden.append("write")
                raise AssertionError("passive provider attempted a write")

            def send_feature_report(self, *args):
                bus.forbidden.append("send_feature_report")
                raise AssertionError("passive provider attempted SET_FEATURE")

            def get_feature_report(self, *args):
                bus.forbidden.append("get_feature_report")
                raise AssertionError("passive provider attempted GET_FEATURE")

        return Handle()


@contextmanager
def fixture(frames=(), inventory=None):
    bus = PassiveBus([descriptor()] if inventory is None else inventory, frames)
    with patch.object(R.hidlist, "enumerate", side_effect=lambda vid: bus.inventory), \
            patch.object(R.hid, "device", side_effect=bus.device), \
            patch.object(R.time, "monotonic", side_effect=lambda: bus.now):
        yield bus
    if bus.forbidden:
        raise AssertionError(bus.forbidden)


class RapooTests(unittest.TestCase):
    def test_issue_120_vt3s_fixed_usage_caps_and_passive_notification(self):
        # Windows caps for #120's Input(Data,Array): 18 bytes, fixed usage 2.
        item = dict(page=0xFF00, report=7, field=0, is_range=0,
                    usage_min=2, usage_max=2, report_count=18)
        api, descriptor_caps = FakeApi([item]), caps(ib=1, size=19)
        self.assertIsNone(battery_hid.byte_report_sizes(api, None, descriptor_caps, 0))
        sizes = battery_hid.byte_report_sizes(api, None, descriptor_caps, 0, allow_fixed_usage=True)
        self.assertEqual(sizes, {"7": 19})
        notification = list(bytes.fromhex("07 10 01 40 06 40 06 01 44 00 03 81 00 11 46 01 00 05 b1"))
        with fixture([notification], [descriptor(0x1411, input_report_sizes=sizes)]) as bus:
            status, = R.RapooProvider().poll()
            self.assertEqual((status.name, status.level, status.charging, status.charging_known),
                             ("Rapoo VT3S", 68, False, True))
            self.assertEqual(status.verification_level, "C")
            self.assertEqual(bus.opened, bus.closed)
            self.assertEqual(len(bus.opened), 1)

    def test_exact_wireless_models_parse_without_any_request(self):
        for pid, name in R.PIDS.items():
            for level in (0, 73, 100):
                for state, charging, known in ((1, False, True), (2, True, True),
                                               (3, True, True), (0, False, False),
                                               (4, False, False), (255, False, False)):
                    with self.subTest(pid=pid, level=level, state=state), \
                            fixture([report(level, state)], [descriptor(pid)]) as bus:
                        status, = R.RapooProvider().poll()
                        self.assertEqual((status.name, status.level, status.charging, status.charging_known),
                                         (name, level, charging, known))
                        self.assertEqual((status.kind, status.source, status.verification_level),
                                         ("mouse", "rapoo", "C"))
                        self.assertTrue(status.online)
                        self.assertFalse(status.cached)
                        self.assertIsNotNone(server.valid_time(status.measured_at_utc))
                        self.assertEqual(bus.opened, bus.closed)
                        self.assertEqual(len(bus.opened), 1)
                        public = server.normalise(status, None, server.utcnow())
                        self.assertEqual(public["charging"], charging if known else None)

    def test_ignores_other_reports_invalid_percent_and_wrong_length(self):
        bad = [report(report_id=6), report(report_id=8), report(101), report(255),
               report()[:8], report()[:-1], report() + [0]]
        with fixture(bad + [report(42, 2)]) as bus:
            status, = R.RapooProvider().poll()
            self.assertEqual((status.level, status.charging), (42, True))
            self.assertEqual(len(bus.reads), len(bad) + 1)

    def test_report_07_uses_its_proven_length_not_collection_maximum(self):
        info = descriptor(input_report_length=65, input_report_sizes={"7": 19, "9": 65})
        with fixture([report(report_id=9, length=65), report(64)], [info]) as bus:
            status, = R.RapooProvider().poll()
            self.assertEqual(status.level, 64)
            self.assertTrue(all(length == 65 for length, _ in bus.reads))

    def test_silence_has_no_error_and_health_is_no_measurement(self):
        with fixture() as bus:
            provider = R.RapooProvider()
            self.assertEqual(provider.poll(), [])
            self.assertLessEqual(bus.now - 100, 1.5)
            self.assertEqual(bus.closed, [])        # kept open to queue the next report
            self.assertNotIn("failed", " ".join(provider.diagnostics()))
            engine = server.BatteryEngine(providers=[provider])
            candidates = server.recognized_candidate_count("rapoo", bus.inventory)
            self.assertEqual(candidates, 1)
            engine._accept("reader", "rapoo", [], server.utcnow(), "usb:receiver-a", candidates)
            self.assertEqual((engine.health["reader"]["state"], engine.health["reader"]["reason"]),
                             ("unavailable", "no_measurement"))
            self.assertEqual(engine.errors, [])

    def test_history_retains_timestamp_and_survives_silence_until_unplug(self):
        with fixture([report(61, 3)]) as bus:
            provider = R.RapooProvider()
            first, = provider.poll()
            previous = server.normalise(first, None, "2026-11-05T01:00:00Z")
            for changes in ({}, {"input_report_sizes": None}, {"usage": 14},
                            {"physical_id": "collection:temporarily-unresolved"}):
                bus.inventory = [descriptor(**changes)]
                stale, = provider.poll()
                self.assertEqual((stale.level, stale.online, stale.cached, stale.wake_on_input),
                                 (61, False, True, True))
                self.assertEqual(stale.measured_at_utc, first.measured_at_utc)
                self.assertFalse(stale.connection_known)
                self.assertFalse(stale.charging_known)
                public = server.normalise(stale, previous, "2026-11-06T01:00:00Z")
                self.assertEqual(public["measuredAtUtc"], previous["measuredAtUtc"])
                self.assertEqual(public["measurementState"], "cached")
                self.assertIsNone(public["charging"])
                engine = server.BatteryEngine(providers=[provider])
                engine._accept("reader", "rapoo", [stale], server.utcnow(), "usb:receiver-a", 1)
                self.assertEqual(engine.health["reader"]["reason"], "no_measurement")
            bus.inventory = [descriptor(), descriptor(path=b"duplicate")]
            opened_before = len(bus.opened)
            self.assertTrue(provider.poll()[0].cached)
            self.assertEqual(len(bus.opened), opened_before)
            bus.inventory = []
            self.assertEqual(provider.poll(), [])
            bus.inventory = [descriptor()]
            self.assertEqual(provider.poll(), [])  # replug cannot revive old history

    def test_history_is_per_receiver_and_refreshes_on_next_notification(self):
        infos = [descriptor(), descriptor(physical="usb:receiver-b")]
        with fixture([report(12), report(84)], infos) as bus:
            provider = R.RapooProvider()
            first = provider.poll()
            self.assertEqual([s.level for s in first], [12, 84])
            self.assertEqual(len({s.key for s in first}), 2)
            self.assertEqual([s.level for s in provider.poll()], [12, 84])
            bus.inventory = [infos[1]]
            bus.frames = [report(85, 2)]
            current, = provider.poll()
            self.assertEqual((current.key, current.level, current.cached), (first[1].key, 85, False))
            bus.frames = []
            stale, = provider.poll()
            self.assertEqual(stale.measured_at_utc, current.measured_at_utc)
            self.assertEqual(len(provider._last), 1)

    def test_handle_stays_open_and_next_poll_drains_queued_report(self):
        with fixture() as bus:
            provider = R.RapooProvider()
            self.assertEqual(provider.poll(), [])          # first poll: brief listen only
            reads = len(bus.reads)
            bus.frames = [report(40), report(report_id=6), report(41, 2)]   # queued while idle
            status, = provider.poll()
            self.assertEqual((status.level, status.charging, status.cached), (41, True, False))
            self.assertEqual(len(bus.opened), 1)
            self.assertEqual(bus.closed, [])
            self.assertTrue(all(timeout == R.DRAIN_TIMEOUT_MS for _, timeout in bus.reads[reads:]))
            stale, = provider.poll()                       # nothing queued: history, no wait
            self.assertTrue(stale.cached)
            self.assertLess(bus.now - 100, 1.6)
            provider.close()
            self.assertEqual(bus.opened, bus.closed)

    def test_drain_is_bounded_when_reports_keep_arriving(self):
        with fixture() as bus:
            provider = R.RapooProvider()
            provider.poll()
            bus.frames = [report(report_id=6)] * 1000
            reads = len(bus.reads)
            self.assertEqual(provider.poll(), [])
            self.assertEqual(len(bus.reads) - reads, R.MAX_DRAIN)
            provider.close()

    def test_failed_read_on_kept_handle_closes_and_reopens_next_poll(self):
        with fixture() as bus:
            provider = R.RapooProvider()
            provider.poll()
            bus.frames = [OSError("fake private path")]
            self.assertEqual(provider.poll(), [])
            self.assertEqual(bus.opened, bus.closed)
            self.assertNotIn("private path", " ".join(provider.diagnostics()))
            bus.frames = [report(77)]
            status, = provider.poll()
            self.assertEqual(status.level, 77)
            self.assertEqual(len(bus.opened), 2)
            provider.close()

    def test_unplug_path_change_or_lost_proof_closes_kept_handle(self):
        for change in ([], [descriptor(path=b"usb:receiver-a:new")], [descriptor(input_report_sizes=None)]):
            with self.subTest(change=change), fixture() as bus:
                provider = R.RapooProvider()
                provider.poll()
                bus.inventory = change
                provider.poll()
                self.assertIn(b"usb:receiver-a:control", bus.closed)
                provider.close()
                self.assertEqual(sorted(bus.opened), sorted(bus.closed))

    def test_enumeration_failure_does_not_evict_history(self):
        with fixture([report(66)]):
            provider = R.RapooProvider()
            first, = provider.poll()
            with patch.object(R.hidlist, "enumerate", side_effect=OSError("fake")):
                stale, = provider.poll()
            self.assertEqual((stale.key, stale.level, stale.cached), (first.key, 66, True))

    def test_deadline_and_read_limit_even_when_other_reports_keep_arriving(self):
        for delay in (0, 0.3):
            with self.subTest(delay=delay), fixture([report(report_id=6)] * 100) as bus:
                bus.delay = delay
                self.assertEqual(R.RapooProvider().poll(), [])
                self.assertLessEqual(bus.now - 100, 1.5)
                self.assertLessEqual(len(bus.reads), 32)
                self.assertEqual(bus.opened, bus.closed)

    def test_read_failure_closes_without_sending(self):
        with fixture([OSError("fake private path")]) as bus:
            provider = R.RapooProvider()
            self.assertEqual(provider.poll(), [])
            self.assertEqual(bus.opened, bus.closed)
            self.assertNotIn("private path", " ".join(provider.diagnostics()))

    def test_unproven_or_malformed_report_sizes_never_open(self):
        changes = [{"input_report_length": n} for n in (None, True, "19", 8, 4097)]
        changes += [{"input_report_sizes": sizes} for sizes in (
            None, {}, {7: 19}, {"8": 19}, {"7": True}, {"7": "19"},
            {"7": 8}, {"7": 20}, {"7": 18}, {"7": 19, "8": None})]
        for change in changes:
            with self.subTest(change=change), fixture([report()], [descriptor(**change)]) as bus:
                self.assertEqual(R.RapooProvider().poll(), [])
                self.assertEqual(bus.opened, [])

    def test_nonunique_wrong_or_unresolved_collection_never_opens(self):
        inventories = [[], [descriptor(), descriptor(path=b"duplicate")]]
        inventories += [[descriptor(**change)] for change in (
            {"usage": 1}, {"usage": 14}, {"usage_page": 1}, {"path": b""},
            {"physical_id": ""}, {"physical_id": "collection:unresolved"})]
        for inventory in inventories:
            with self.subTest(inventory=inventory), fixture([report()], inventory) as bus:
                self.assertEqual(R.RapooProvider().poll(), [])
                self.assertEqual(bus.opened, [])

    def test_other_pids_and_vendors_never_open(self):
        for pid in (0x1601, 0x4611, 0x4612, 0x4621, 0x46A1, 0x4B15, 0x1B00, 0x1205, 0xFFFF):
            with self.subTest(pid=pid), fixture([report()], [descriptor(pid)]) as bus:
                self.assertEqual(R.RapooProvider().poll(), [])
                self.assertEqual(bus.opened, [])
        with fixture([report()], [descriptor(vendor_id=0x24AF)]) as bus:
            self.assertEqual(R.RapooProvider().poll(), [])
            self.assertEqual(bus.opened, [])

    def test_rejection_diagnostics_distinguish_collection_and_descriptor_proof(self):
        cases = [([descriptor(usage=1)], "missing or ambiguous FF00:0002 collection; not opened"),
                 ([descriptor(), descriptor(path=b"private-duplicate")],
                  "missing or ambiguous FF00:0002 collection; not opened")]
        for sizes, summary, declared in ((None, "null", "in:unknown"),
                               ({"7": None}, '{"7":null}', "in:unknown"),
                               ({"8": 19}, '{"8":19}', "in:08/19"),
                               ({"7": 8}, '{"7":8}', "in:07/8"),
                               ({"7": 19, "9": None}, '{"7":19,"9":null}', "in:07/19,in:unknown"),
                               ({"private-path": b"private-payload", "7": "private-length"},
                                '{"7":null}', "in:unknown")):
            cases.append(([descriptor(input_report_sizes=sizes)],
                          f"report 07 unproven; sizes={summary}; "
                          f"declared=out:unknown,{declared},feature:unknown; not opened"))
        for inventory, expected in cases:
            with self.subTest(expected=expected), fixture(inventory=inventory) as bus:
                provider = R.RapooProvider()
                self.addCleanup(provider.close)
                self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.diagnostics(), [expected])
                self.assertEqual(bus.opened, [])
                self.assertNotIn("private", " ".join(provider.diagnostics()))

    def test_silence_and_invalid_input_reasons_cover_listen_and_kept_handle(self):
        for kept in (False, True):
            with self.subTest(kept=kept), fixture() as bus:
                provider = R.RapooProvider()
                self.addCleanup(provider.close)
                if kept:
                    provider.poll()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.diagnostics(), ["opened; no input reports; no new measurement"])
                bus.frames = [report(report_id=6), report(101), report()[:8]]
                self.assertEqual(provider.poll(), [])
                expected = "opened; no valid report 07; seen=06/19,07/8,07/19"
                self.assertEqual(provider.diagnostics(), [expected])
                # Silence must not erase the evidence that input actually arrived.
                self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.diagnostics(), [expected])
                bus.frames = [report(63)]
                self.assertEqual(provider.poll()[0].level, 63)
                self.assertEqual(provider.diagnostics(), [])
                self.assertEqual(provider.poll()[0].level, 63)
                self.assertEqual(provider.diagnostics(), ["opened; no input reports; no new measurement"])
                self.assertEqual(len(bus.opened), 1)

    def test_invalid_report_metadata_is_bounded_and_cleared_on_reopen(self):
        with fixture([report(level=101, report_id=report_id) for report_id in range(40)]) as bus:
            provider = R.RapooProvider()
            self.addCleanup(provider.close)
            provider.poll()
            provider.poll()
            self.assertLessEqual(len(provider._seen_inputs[descriptor()["path"]]), 32)
            self.assertLess(len(provider.diagnostics()[0]), 100)
            self.assertTrue(provider.diagnostics()[0].endswith(",..."))
            provider.close()
            self.assertEqual(provider._seen_inputs, {})
            self.assertEqual(provider.poll(), [])
            self.assertEqual(provider.diagnostics(), ["opened; no input reports; no new measurement"])
            self.assertEqual(len(bus.opened), 2)

    def test_provider_has_only_open_read_close_device_operations(self):
        tree = ast.parse(Path(R.__file__).read_text(encoding="utf-8"))
        calls = {node.func.attr for node in ast.walk(tree) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name)
                 and node.func.value.id == "dev"}
        self.assertEqual(calls, {"open_path", "read", "close"})

    def test_catalog_index_and_runtime_registration_are_exact(self):
        self.assertIn(("rapoo", "RapooProvider"), server.PROVIDERS)
        self.assertEqual(server.PROVIDER_VIDS["rapoo"], (0x24AE,))
        entries = [e for e in build_index()["devices"] if e["provider"] == "rapoo"]
        self.assertEqual({(e["vendorId"], e["productId"]) for e in entries},
                         {(0x24AE, pid) for pid in (
                             0x1410, 0x1411, 0x1412, 0x1413, 0x1414, 0x1415, 0x1416, 0x1417,
                             0x1418, 0x1420, 0x1421, 0x1422, 0x1423, 0x1444, 0x144A, 0x144B,
                             0x1451, 0x1452, 0x1453, 0x1459, 0x145B, 0x145D, 0x1460, 0x1462,
                             0x1464, 0x1466, 0x1468, 0x146A, 0x146C, 0x146D, 0x146E, 0x1470,
                             0x1471, 0x1473, 0x1474, 0x1475, 0x1476, 0x1477, 0x1478, 0x14A1,
                             0x14A2, 0x14A4, 0x14A5, 0x14A6, 0x14A7, 0x14A8, 0x14A9, 0x14AA,
                             0x1B01, 0x1B02, 0x1B03, 0x1B04, 0x1B05, 0x1B06, 0x1B07, 0x1B08,
                             0x1B09, 0x1B0A, 0x1B0B, 0x1B0C, 0x1B0D, 0x1B0E, 0x1B0F, 0x1B10,
                             0x1B11, 0x1B12, 0x1B13, 0x1B14, 0x1B15,
                         )})
        reader, = [e for e in load_catalog()["readers"] if e["provider"] == "rapoo"]
        self.assertEqual(reader["verificationLevel"], "C")
        unsupported = [e for e in load_catalog()["observedUnsupported"] if e["id"].startswith("rapoo_")]
        self.assertEqual([e["match"]["productId"] for e in unsupported], ["1601"])
        self.assertFalse(unsupported[0]["compatible"])
        self.assertEqual(validate_catalog()["errors"], [])


if __name__ == "__main__":
    unittest.main()
