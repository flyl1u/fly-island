"""Batch-3 HID fixtures: no physical devices, wall-clock waits or settings I/O."""
from contextlib import contextmanager
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _hidstub  # noqa: F401
import battery_hid as H
from providers import eweadn as E, flydigi as F, g3m as G

CASES = ((G, G.G3mProvider), (E, E.EweadnProvider), (F, F.FlydigiProvider))


def entry(factory, physical="receiver-a", **changes):
    inp = 33 if factory is E.EweadnProvider else factory.input_bounds[0]
    sizes = {str(factory.output_id): factory.output_bytes}
    if factory is F.FlydigiProvider:
        sizes["8"] = 13  # Published APEX5 descriptor's second output report.
    info = dict(vendor_id=factory.vid, product_id=next(iter(factory.pids)),
                usage_page=factory.collection[0], usage=factory.collection[1],
                input_report_length=inp, output_report_length=factory.output_bytes,
                input_report_sizes={str(factory.input_id): inp}, output_report_sizes=sizes,
                path=(physical + "-vendor").encode(), physical_id=physical,
                product_string="fixture", serial_number="same-serial")
    info.update(changes)
    return info


def reply(module, level=60, **changes):
    if module is G:
        frame = [4, 0, 0, 0x1A, 6, 0, 0, 0, level] + [0] * 55
    elif module is E:
        frame = [0x30, 0, 1, 11] + list(b"M156") + [0, 0, 0, 0, 0, level, 1] + [0] * 17
    else:
        frame = [4, 0x5A, 0xA5, 1, 1, 0, 0x80, 2, 0, 0, 0, 0, level // 20] + [0] * 19
    for offset, value in changes.items():
        frame[int(offset)] = value
    return frame


class FakeHid:
    def __init__(self, frames=(), write_result=None, read_ms=10, error_at=None):
        self.frames = list(frames)
        self.write_result, self.read_ms, self.error_at = write_result, read_ms, error_at
        self.now = 0.0
        self.opened, self.writes, self.reads, self.closed = [], [], [], []

    def device(self):
        bus = self

        class Handle:
            def open_path(self, path):
                self.path = path
                bus.opened.append(path)
                if bus.error_at == "open":
                    raise OSError("private-path")

            def write(self, packet):
                bus.writes.append((self.path, list(packet)))
                if bus.error_at == "write":
                    raise OSError("private-path")
                return len(packet) if bus.write_result is None else bus.write_result

            def read(self, length, timeout_ms):
                bus.reads.append((length, timeout_ms))
                bus.now += (min(bus.read_ms, timeout_ms) if bus.frames else timeout_ms) / 1000
                if bus.error_at == "read":
                    raise OSError("private-path")
                return bus.frames.pop(0) if bus.frames else []

            def close(self):
                bus.closed.append(self.path)

        # No feature/settings API; accidental writes outside the request fail.
        return Handle()


@contextmanager
def fixture(factory, frames=(), inventory=None, **kwargs):
    bus = FakeHid(frames, **kwargs)
    with patch.object(H, "hid", bus), \
            patch.object(H.hidlist, "enumerate", return_value=[entry(factory)] if inventory is None else inventory), \
            patch.object(H, "time", SimpleNamespace(monotonic=lambda: bus.now)):
        yield bus


class NewBrandsTests(unittest.TestCase):
    def test_normal_levels_and_only_exact_read_request(self):
        requests = {G: [4, 0x20, 0, 0x1A, 6] + [0] * 59,
                    E: [0, 0x30] + [0] * 31,
                    F: [3, 0x5A, 0xA5, 1, 2, 3] + [0] * 26}
        for module, factory in CASES:
            for level in (0, 20, 40, 60, 80, 100):
                with self.subTest(provider=factory.name, level=level), fixture(factory, [reply(module, level)]) as bus:
                    status, = factory().poll()
                    self.assertEqual((status.level, status.kind, status.verification_level),
                                     (level, "gamepad" if module is F else "mouse", "C"))
                    self.assertEqual(bool(status.approx), module is F)
                    if module is F:
                        self.assertEqual(status.approx, f"about {level}% ({level // 20}/5)")
                    self.assertEqual(status.charging_known, module is F)
                    self.assertFalse(status.charging)
                    self.assertTrue(status.connection_known)
                    self.assertEqual(bus.writes, [(entry(factory)["path"], requests[module])])
                    self.assertEqual(bus.opened, bus.closed)

    def test_unknown_or_incompatible_caps_never_open_or_send(self):
        for module, factory in CASES:
            bad = [dict(input_report_length=None), dict(output_report_length=None),
                   dict(input_report_length=0), dict(output_report_length=0),
                   dict(input_report_length=True), dict(output_report_length=factory.output_bytes + 1),
                   dict(output_report_length=factory.output_bytes - 1),
                   dict(input_report_length=factory.input_bounds[0] - 1),
                   dict(input_report_length=factory.input_bounds[1] + 1),
                   dict(input_report_sizes=None), dict(output_report_sizes=None),
                   dict(input_report_sizes={}), dict(output_report_sizes={}),
                   dict(input_report_sizes={"99": entry(factory)["input_report_length"]}),
                   dict(output_report_sizes={"99": factory.output_bytes}),
                   dict(output_report_sizes={str(factory.output_id): factory.output_bytes - 1}),
                   dict(input_report_sizes={str(factory.input_id): 14}),
                   dict(output_report_sizes={str(factory.output_id): factory.output_bytes, "99": 4097})]
            for changes in bad:
                with self.subTest(provider=factory.name, changes=changes), fixture(
                        factory, [reply(module)], [entry(factory, **changes)]) as bus:
                    self.assertEqual(factory().poll(), [])
                    self.assertEqual(bus.opened, [])
                    self.assertEqual(bus.writes, [])

    def test_wrong_ids_collections_and_ambiguous_paths_are_not_selected(self):
        for module, factory in CASES:
            bad = [dict(vendor_id=0), dict(product_id=0), dict(usage=99),
                   dict(usage_page=1), dict(path=b""), dict(physical_id="collection:private")]
            bad += ([dict(product_id=0x5088)] if module is G else
                    [dict(usage_page=0xFF00, usage=0), dict(vendor_id=0x088D, product_id=0x062E)]
                    if module is E else [dict(usage_page=0xFFEE), dict(product_id=0x6001)])
            inventories = [[entry(factory, **changes)] for changes in bad]
            inventories.append([entry(factory), entry(factory, path=b"second-matching-collection")])
            inventories.append([entry(factory, physical=""), entry(factory, physical="", path=b"unknown-parent")])
            for inventory in inventories:
                with self.subTest(provider=factory.name, inventory=inventory), fixture(
                        factory, [reply(module)], inventory) as bus:
                    self.assertEqual(factory().poll(), [])
                    self.assertEqual(bus.opened, [])
                    self.assertEqual(bus.writes, [])

    def test_bad_collection_does_not_hide_good_one_and_receivers_stay_separate(self):
        for module, factory in CASES:
            inventory = [entry(factory, "one", usage_page=1), entry(factory, "one"), entry(factory, "two")]
            with self.subTest(provider=factory.name), fixture(factory, [reply(module, 20), reply(module, 80)], inventory) as bus:
                statuses = factory().poll()
                self.assertEqual([s.level for s in statuses], [20, 80])
                self.assertEqual(len({s.key for s in statuses}), 2)
                self.assertEqual(bus.opened, [entry(factory, p)["path"] for p in ("one", "two")])
            with fixture(factory, [reply(module, 80), reply(module, 20)], list(reversed(inventory))):
                self.assertEqual({s.key for s in factory().poll()}, {s.key for s in statuses})

    def test_malformed_and_wrong_replies_never_turn_into_zero(self):
        mutations = {
            G: ({"0": 0}, {"3": 0xFF}, {"3": 0xAA}, {"7": 0xFE}, {"7": 0xFF}, {"8": 101}, {"8": 255}),
            E: ({"0": 0xD1}, {"1": 2}, {"3": 0}, {"3": 10}, {"3": 255}, {"4": 0}, {"13": 101}, {"14": 0}, {"14": 255}),
            F: ({"0": 3}, {"1": 0}, {"2": 0}, {"3": 0xEF}, {"4": 2}, {"5": 1}, {"6": 0x81}, {"7": 0}, {"7": 3}, {"12": 6}, {"12": 15}, {"12": 0x25}, {"12": 0xFF})}
        for module, factory in CASES:
            valid = reply(module)
            invalid = [[], [0] * len(valid), valid[:-1], valid + [0], module.make_request()]
            invalid += [reply(module, **changes) for changes in mutations[module]]
            if module is E:
                for identity in (b"M302", b"m156", b"M15\x00"):
                    wrong = valid.copy()
                    wrong[4:8] = identity
                    invalid.append(wrong)
                invalid.append([0] + valid)  # Never inject a report-ID slot into unnumbered input.
            for frame in invalid:
                with self.subTest(provider=factory.name, frame=frame), fixture(factory, [frame]) as bus:
                    self.assertEqual(factory().poll(), [])
                    self.assertEqual(len(bus.writes), 1)
                    self.assertEqual(bus.opened, bus.closed)

    def test_invalid_packet_followed_by_valid_uses_one_query(self):
        for module, factory in CASES:
            with self.subTest(provider=factory.name), fixture(factory, [[0] * 4, reply(module)]) as bus:
                self.assertEqual(len(factory().poll()), 1)
                self.assertEqual(len(bus.writes), 1)
                self.assertEqual(len(bus.reads), 2)

    def test_s9_actual_descriptor_length_controls_input_without_assuming_33(self):
        for payload_size in (15, 16, 32, 33):
            size = payload_size + 1
            frame = (reply(E) + [0])[:payload_size]
            inventory = [entry(E.EweadnProvider, input_report_length=size, input_report_sizes={"0": size})]
            with self.subTest(size=payload_size), fixture(E.EweadnProvider, [frame], inventory) as bus:
                self.assertEqual([s.level for s in E.EweadnProvider().poll()], [60])
                self.assertEqual(bus.reads[0][0], payload_size)
        inventory = [entry(E.EweadnProvider, input_report_sizes={"0": 33, "1": 15})]
        with fixture(E.EweadnProvider, [reply(E)], inventory) as bus:
            self.assertEqual(E.EweadnProvider().poll(), [])
            self.assertEqual(bus.writes, [])

    def test_mouse_charging_fields_remain_unknown(self):
        for module, factory, offset in ((G, G.G3mProvider, 9), (E, E.EweadnProvider, 12)):
            for flag in (0, 1, 2, 255):
                with fixture(factory, [reply(module, **{str(offset): flag})]):
                    status, = factory().poll()
                    self.assertFalse(status.charging_known)

    def test_apex_charging_sentinel_never_becomes_percentage(self):
        for raw in (0x10, 0x15, 0x16, 0x1F):
            with self.subTest(raw=raw), fixture(F.FlydigiProvider, [reply(F, **{"12": raw})]):
                status, = F.FlydigiProvider().poll()
                self.assertIsNone(status.level)
                self.assertTrue(status.level_unavailable)
                self.assertTrue(status.charging)
                self.assertTrue(status.charging_known)
        with fixture(F.FlydigiProvider, [reply(F, **{"7": 1})]):
            self.assertEqual(len(F.FlydigiProvider().poll()), 1)

    def test_silence_and_noise_are_bounded(self):
        for _, factory in CASES:
            for frames, read_ms in (([], 10), ([[0] * 3] * 100, 0), ([[0] * 3] * 100, 240)):
                with self.subTest(provider=factory.name, read_ms=read_ms), fixture(factory, frames, read_ms=read_ms) as bus:
                    self.assertEqual(factory().poll(), [])
                    self.assertLessEqual(bus.now, 1.001)
                    self.assertLessEqual(len(bus.reads), 32)
                    self.assertTrue(all(0 < timeout <= 1000 for _, timeout in bus.reads))

    def test_io_failures_close_and_short_writes_do_not_read_or_retry(self):
        for module, factory in CASES:
            for written in (-1, 0, factory.output_bytes - 1):
                with fixture(factory, [reply(module)], write_result=written) as bus:
                    self.assertEqual(factory().poll(), [])
                    self.assertEqual(len(bus.writes), 1)
                    self.assertEqual(bus.reads, [])
                    self.assertEqual(bus.opened, bus.closed)
            for error_at in ("open", "write", "read"):
                with fixture(factory, error_at=error_at) as bus:
                    provider = factory()
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual(bus.opened, bus.closed)
                    self.assertNotIn("private-path", " ".join(provider.diagnostics()))


if __name__ == "__main__":
    unittest.main()
