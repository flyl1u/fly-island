"""Offline Lingbao fixtures: literal contributor captures and synthetic variants."""
from contextlib import contextmanager
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ENGINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE))
sys.path.insert(0, str(ENGINE / "tests"))
import _hidstub  # noqa: F401 -- before importing any provider
from providers import lingbao as L

P = L.LingbaoProvider
# Independent, complete 33-byte oracles from this repository's #171.
# Neither capture is synthesized from the provider or from the user's table.
CAPTURES = (
    bytes.fromhex("0F 00 30 02 EC 01 10 4D 35 33 36 01 06 4C 58 11 "
                  "11 01 41 00 FF 00 FF D0 00 0C 31 BE 00 5B 81 2C C8"),
    bytes.fromhex("0F 00 30 02 EB 01 10 4D 35 33 36 01 06 4C 58 11 "
                  "11 01 41 00 FF 00 FF D0 00 0C 31 BE 00 5B 81 2C C8"),
)


def entry(physical="receiver-a", **changes):
    info = dict(vendor_id=0x088D, product_id=0x052F, interface_number=1,
                product_string="Wireless-Receiver", usage_page=0xFF00, usage=1,
                feature_report_length=33, feature_report_sizes={"15": 33},
                physical_id=physical, path=(physical + "-vendor").encode())
    info.update(changes)
    return info


def reply(level=65, flag=0, **changes):
    """Synthetic mutations; only CAPTURES above are complete raw evidence."""
    frame = list(CAPTURES[0])
    frame[18], frame[19] = level, flag
    for offset, value in changes.items():
        frame[int(offset)] = value
    return frame


class FakeBus:
    def __init__(self, frames, error_at="", error_type=OSError):
        self.frames = list(frames)
        self.error_at, self.error_type = error_at, error_type
        self.calls, self.opened, self.closed, self.feature_reads = [], [], [], []
        self.forbidden = []

    def fail(self, stage):
        if self.error_at == stage:
            raise self.error_type("synthetic-private-detail")

    def device(self):
        self.calls.append("device")
        self.fail("device")
        bus = self

        class Device:
            path = None

            def open_path(self, path):
                self.path = path
                bus.calls.append("open_path")
                bus.opened.append(path)
                bus.fail("open")

            def get_feature_report(self, report_id, length):
                bus.calls.append("get_feature_report")
                bus.feature_reads.append((self.path, report_id, length))
                bus.fail("get")
                return bus.frames.pop(0) if bus.frames else []

            def close(self):
                bus.calls.append("close")
                bus.closed.append(self.path)
                bus.fail("close")

            def __getattr__(self, name):
                def forbidden(*args, **kwargs):
                    bus.forbidden.append(name)
                    raise AssertionError("unexpected HID method: " + name)
                return forbidden

        return Device()


@contextmanager
def fixture(frames=(), inventory=None, **options):
    bus = FakeBus(frames, **options)
    with patch.object(L, "hid", SimpleNamespace(device=bus.device)), \
            patch.object(L.hidlist, "enumerate", return_value=[entry()] if inventory is None else inventory):
        try:
            yield bus
        finally:
            # Always check, including refusal/error branches: send/write and
            # every method except open_path/GetFeature/close must remain zero.
            if bus.forbidden:
                raise AssertionError("forbidden HID calls: " + repr(bus.forbidden))


class LingbaoTests(unittest.TestCase):
    def test_literal_captures_parse_and_only_get_feature_once(self):
        for capture in CAPTURES:
            self.assertEqual(len(capture), 33)
            for container in (bytes, bytearray, list, tuple):
                with self.subTest(capture=capture, container=container), fixture([container(capture)]) as bus:
                    self.assertEqual(L.parse_reply(container(capture)), (65, False, ""))
                    status, = P().poll()
                    self.assertEqual((status.name, status.level, status.source, status.kind),
                                     ("Lingbao M1 Pro", 65, "lingbao", "mouse"))
                    self.assertEqual(status.verification_level, "C")
                    self.assertFalse(status.charging_known or status.connection_known or status.cached)
                    self.assertIsNone(status.measured_at_utc)
                    self.assertIsNone(status.queried_at_utc)
                    self.assertIsNone(status.dpi)
                    self.assertEqual(bus.calls, ["device", "open_path", "get_feature_report", "close"])
                    self.assertEqual(bus.feature_reads, [(entry()["path"], 15, 33)])
                    self.assertEqual(bus.opened, bus.closed)

    def test_synthetic_table_changes_and_charging_placeholder(self):
        provider = P()
        for level, flag in ((65, 0), (100, 1), (68, 0), (66, 0), (100, 1), (1, 0), (100, 0)):
            with self.subTest(level=level, flag=flag), fixture([reply(level, flag)]) as bus:
                statuses = provider.poll()
                self.assertEqual([s.level for s in statuses], [] if flag else [level])
                self.assertEqual(provider.diagnostics(), ["charging placeholder; no new reading"] if flag else [])
                self.assertEqual(len(bus.feature_reads), 1)
                self.assertEqual(bus.opened, bus.closed)

    def test_unproven_header_and_byte21_never_become_extra_state_gates(self):
        for value in (0, 1, 2, 255):
            frame = reply(**{"1": value, "2": value, "3": value, "4": value, "21": value})
            with fixture([frame]):
                status, = P().poll()
                self.assertEqual(status.level, 65)
                self.assertFalse(status.charging_known or status.connection_known)

    def test_wrong_identity_interface_product_and_collection_never_open(self):
        cases = [dict(vendor_id=0x089D), dict(product_id=0), dict(product_string=None),
                 dict(product_string=""), dict(product_string="Wireless-Receiver "),
                 dict(product_string="wireless-receiver"), dict(usage_page=1), dict(usage=2)]
        for field in ("vendor_id", "product_id", "interface_number", "usage_page", "usage"):
            cases += [{field: value} for value in (None, True, False, "1", [], {}, -1, 0)]
            cases += [{field: float(entry()[field])}]
        cases += [dict(interface_number=2)]
        for changes in cases:
            with self.subTest(changes=changes), fixture([reply()], [entry(**changes)]) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.calls, [])

    def test_unknown_parent_or_path_and_missing_identity_fields_never_open(self):
        cases = [dict(physical_id=value) for value in (None, "", " ", 1, True, [], {},
                                                       "collection:fixture", "COLLECTION:fixture")]
        cases += [dict(path=value) for value in (None, b"", "", " ", b" ", 33, True, [], {})]
        inventories = [[entry(**changes)] for changes in cases]
        for field in entry():
            info = entry()
            del info[field]
            inventories.append([info])
        for inventory in inventories:
            with self.subTest(inventory=inventory), fixture([reply()], inventory) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.calls, [])

    def test_only_exact_unique_feature_map_can_authorize_open(self):
        cases = [dict(feature_report_length=n) for n in (None, 0, True, 32, 34, 64, "33", 33.0)]
        cases += [dict(feature_report_sizes=m) for m in (None, {}, [], {15: 33}, {"0F": 33},
                  {"15": True}, {"15": 33.0}, {"15": "33"}, {"15": 32}, {"14": 33},
                  {"15": 33, "16": 2}, {"15": 33, "0": 33})]
        cases += [dict(feature_report_sizes=None, feature_report_proof="caps",
                       declared_report_sizes={"feature": {"15": 33}})]
        for changes in cases:
            with self.subTest(changes=changes), fixture([reply()], [entry(**changes)]) as bus:
                provider = P()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(bus.calls, [])
                self.assertEqual(provider.diagnostics(), ["Feature 0F/33 unproven; not opened"])

    def test_duplicate_collection_rejected_before_individual_gates(self):
        for changes in ({}, dict(interface_number=2), dict(product_string="wrong"),
                        dict(feature_report_sizes=None), dict(usage=True)):
            infos = [entry(), entry(path=b"second-collection", **changes)]
            with self.subTest(changes=changes), fixture([reply()], infos) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.calls, [])

    def test_invalid_frames_and_short_reads_never_retry(self):
        invalid = [None, True, 33, 33.0, "x" * 33, {}, object(), iter(reply()),
                   [], [0] * 33, reply()[:-1], reply() + [0]]
        invalid += [reply(level=n) for n in (0, 101, 255)]
        invalid += [reply(flag=n) for n in (2, 255)]
        invalid += [reply(**{str(i): 0}) for i in (0, 7, 8, 9, 10, 13, 14)]
        for offset in range(33):
            invalid += [reply(**{str(offset): n}) for n in (True, False, -1, 256, 65.0, "65", None, [], {})]
        for frame in invalid:
            with self.subTest(frame=frame), fixture([frame, reply()]) as bus:
                self.assertIsNone(L.parse_reply(frame))
                provider = P()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.diagnostics(), ["invalid battery reply; no new reading"])
                self.assertEqual(bus.feature_reads, [(entry()["path"], 15, 33)])
                self.assertEqual(len(bus.frames), 1)
                self.assertEqual(bus.opened, bus.closed)

    def test_factory_open_get_and_close_exceptions_use_fixed_diagnostics(self):
        for stage in ("device", "open", "get", "close"):
            for error_type in (OSError, ValueError, RuntimeError, TypeError):
                with self.subTest(stage=stage, error_type=error_type), fixture(
                        [reply()], error_at=stage, error_type=error_type) as bus:
                    provider = P()
                    statuses = provider.poll()
                    self.assertEqual([s.level for s in statuses], [65] if stage == "close" else [])
                    self.assertEqual(provider.diagnostics(), ["HID handle close failed" if stage == "close"
                                                              else "battery I/O failed"])
                    self.assertEqual(bus.opened, bus.closed)
                    self.assertLessEqual(len(bus.feature_reads), 1)
                    self.assertNotIn("synthetic-private-detail", str(provider.diagnostics()))

    def test_missing_backend_and_enumeration_failure_never_query(self):
        with patch.object(L, "hid", None), patch.object(L.hidlist, "enumerate") as enum:
            provider = P()
            self.assertEqual(provider.poll(), [])
            self.assertEqual(provider.diagnostics(), ["HID backend unavailable"])
            enum.assert_not_called()
        with fixture([reply()]) as bus, patch.object(L.hidlist, "enumerate", side_effect=OSError("private")):
            provider = P()
            self.assertEqual(provider.poll(), [])
            self.assertEqual(provider.diagnostics(), ["enumeration failed"])
            self.assertEqual(bus.calls, [])

    def test_independent_parents_keep_separate_keys_and_only_vendor_collection_opens(self):
        infos = [entry("one"), entry("two"), entry("one", usage_page=1, path=b"keyboard")]
        with fixture([reply(65), reply(68)], infos) as bus:
            statuses = P().poll()
            self.assertEqual([s.level for s in statuses], [65, 68])
            self.assertEqual([s.physical_id for s in statuses], ["one", "two"])
            self.assertEqual(len({s.key for s in statuses}), 2)
            self.assertEqual(bus.opened, [infos[0]["path"], infos[1]["path"]])
            self.assertEqual(bus.opened, bus.closed)
            self.assertEqual([(r, n) for _, r, n in bus.feature_reads], [(15, 33), (15, 33)])


if __name__ == "__main__":
    unittest.main()
