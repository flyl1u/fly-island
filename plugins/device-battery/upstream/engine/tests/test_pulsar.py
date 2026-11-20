"""Tests for providers/pulsar.py. No hardware is needed.

The fake dongle is the VXE R1 Pro Max 1 kHz receiver from issue #87: 3554:f58a,
whose report lists two collections on interface 0 and 2 and six on interface 1,
with the ATK/VXE panel of the OpenMouse project (@openmouse/protocol, drivers/atk)
opening the one with usage page 0xFF02 and usage 0x0002. That panel reads the battery with command
0x04 and takes the level, the flag and the millivolts from the same three places
providers/pulsar.py does, so the fake answers only on that collection - the first
interface-1 collection stays silent, which is what the real dongle does.

The same mouse on its cable (3554:f58c) is the reporter's second report in that issue: it
lists the same eight collections, so the same rule picks ff02:0002 and the same frame
applies. The keep-window tests at the end cover the reporter's later report: after 10-15
idle minutes his mouse deep-sleeps, the receiver goes quiet, and the reading used to
vanish from the tray until long after the mouse was used again.

The Hitscan Hyperlight (3770:0200 on its receiver, 3770:0100 on the cable, #105) is
faked with its own collection list and the frames sopparus/hitscan-battery captured
from the vendor application; the same rule picks its ff02:0002 collection.

hidlist.enumerate() and hid.device() are replaced: the real ones ask Windows for
collections of real devices.

Run from the repository root:

    python -m unittest discover -s tests
"""
from contextlib import contextmanager
import os
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _hidstub  # noqa: E402, F401

from providers import pulsar as P  # noqa: E402

# (interface, usage page, usage) exactly as the reporter's diagnostics.txt lists them
SHAPE = [
    (0, 0x0001, 0x0006),
    (1, 0xFF05, 0x0000),
    (1, 0xFF03, 0x0000),
    (1, 0x000C, 0x0001),
    (1, 0x0001, 0x0080),
    (1, 0xFF02, 0x0002),
    (1, 0xFF04, 0x0002),
    (2, 0x0001, 0x0002),
]

# the Hitscan Hyperlight receiver (3770:0200) as #105's diagnostics list its collections
HITSCAN_SHAPE = [
    (1, 0xFF04, 0x0002),
    (1, 0xFF05, 0x0000),
    (1, 0xFF03, 0x0000),
    (1, 0x000C, 0x0001),
    (1, 0x0001, 0x0080),
    (1, 0xFF02, 0x0002),
    (2, 0x0001, 0x0002),
]

# the two frames the Pulsar X2 CrazyLight Mini answered on its reporter's hardware
# (#164, both checksums valid): 3710:5406 the dongle, 3710:3414 the cable
CRAZYLIGHT_DONGLE = bytes.fromhex("08 04 00 00 00 02 14 00 0d ea 00 00 00 00 00 00 3c")
CRAZYLIGHT_CABLE = bytes.fromhex("08 04 00 00 00 02 19 01 0e 52 00 00 00 00 00 00 cd")

# User-supplied 95% reply, not a maintainer hardware test. Source: Issue #592,
# snapshotted in .ai/evidence/vgn-f503-1114i/issue-592-evidence.md.
ISSUE592_F503_REPLY = bytes.fromhex("08 04 00 00 00 02 5F 00 10 05 00 00 00 00 00 00 D3")


def reply(level, power=0, mv=0, command=P.CMD_POWER, header=P.PAYLOAD_HEADER,
          break_checksum=False):
    """A 17-byte frame of the shape the dongle sends."""
    frame = [header, command] + [0x00] * 4 + [level, power] + list(mv.to_bytes(2, "big"))
    frame += [0x00] * 6
    assert len(frame) == P.PAYLOAD_LEN - 1
    ck = P.checksum(frame)
    if break_checksum:
        ck ^= 0xFF
    return bytes(frame + [ck])


class FakeCollection:
    def __init__(self, path, iface, page, usage, replies):
        self.info = {"path": path, "interface_number": iface, "usage_page": page,
                     "usage": usage}
        self.replies = list(replies)
        self.sent = []
        self.opened = 0

    def read(self, length):
        if not self.sent:
            return b""            # nothing asked yet: no stale data either
        return self.replies.pop(0) if self.replies else b""


class FakeBus:
    """The dongle, the way Windows presents it."""

    def __init__(self, vid, pid, replies=(), answering=(0xFF02, 0x0002), shape=SHAPE):
        self.vid = vid
        self.pid = pid
        self.cols = []
        for i, (iface, page, usage) in enumerate(shape):
            path = b"\\\\?\\hid#vid_%04x&pid_%04x#col%02d" % (vid, pid, i)
            mine = replies if (page, usage) == answering else ()
            self.cols.append(FakeCollection(path, iface, page, usage, mine))

    def enumerate(self, vid):
        if vid != self.vid:
            return []
        return [dict(c.info, product_id=self.pid, vendor_id=self.vid) for c in self.cols]

    def written(self):
        """(usage page, usage) of every collection a frame was written to."""
        return [(c.info["usage_page"], c.info["usage"]) for c in self.cols if c.sent]

    def device_class(self):
        bus = self

        class FakeDevice:
            def open_path(self, path):
                self.c = next(c for c in bus.cols if c.info["path"] == path)
                self.c.opened += 1

            def write(self, frame):
                self.c.sent.append(list(frame))

            def read(self, length, timeout_ms=0):
                return self.c.read(length)

            def close(self):
                pass

        return FakeDevice


PRIVATE_PATH = b"\\\\?\\hid#PRIVATE-PATH#PRIVATE-SERIAL"
PRIVATE_TEXT = "PRIVATE-EXCEPTION PRIVATE-PRODUCT PRIVATE-SERIAL"
POWER_REQUEST = tuple(bytes.fromhex("08 04 00 00 00 00 00 00 00 00 00 00 00 00 00 00 49"))


def diagnostic_info(vid=0x3554, pid=0xF517, **changes):
    """#323's identity; path, report sizes and replies are synthetic."""
    info = dict(vendor_id=vid, product_id=pid, path=PRIVATE_PATH,
                interface_number=1, usage_page=0xFF02, usage=2,
                product_string="EWEADN 8K PRIVATE-PRODUCT", serial_number="PRIVATE-SERIAL",
                physical_id="PRIVATE-PHYSICAL", input_report_length=17,
                output_report_length=17, input_report_sizes={"8": 17},
                output_report_sizes={"8": 17})
    return dict(info, **changes)


def length_calls(info, *lengths):
    return [(("length", info["path"]), length) for length in lengths]


def battery_calls(info, frames=(), success=False, failure=None):
    """The original exchange, including its no-close-on-open-error behavior."""
    error = OSError(PRIVATE_TEXT)
    calls = [(("device",), None), (("open", info["path"]), error if failure == "open" else None)]
    if failure == "open":
        return calls
    calls.append((("read", 17, 30), error if failure == "drain" else b""))
    if failure != "drain":
        calls.append((("write", POWER_REQUEST), error if failure == "write" else 17))
        if failure != "write":
            if failure == "read":
                calls.append((("read", 17, 250), error))
            else:
                for index, frame in enumerate(frames):
                    calls.append((("read", 17, 250), frame))
                    if not success or index < len(frames) - 1:
                        calls.append((("sleep", 0.02), None))
                if not success and len(frames) < 4:
                    calls.append((("read", 17, 250), b""))
    calls.append((("close",), None))
    return calls


class ScriptedBatteryHid:
    """Reject every unexpected open, length probe, read, write, delay or close."""
    def __init__(self, script):
        self.pending = list(script)
        self.calls = []

    def step(self, *call):
        self.calls.append(call)
        if not self.pending:
            raise AssertionError(f"unexpected HID call: {call!r}")
        expected, result = self.pending.pop(0)
        if call != expected:
            raise AssertionError(f"expected {expected!r}, got {call!r}")
        if isinstance(result, Exception):
            raise result
        return result

    def device(self):
        self.step("device")
        return types.SimpleNamespace(
            open_path=lambda path: self.step("open", path),
            read=lambda length, timeout: self.step("read", length, timeout),
            write=lambda frame: self.step("write", tuple(frame)),
            close=lambda: self.step("close"))


@contextmanager
def diagnostic_hid(infos, script):
    bus = ScriptedBatteryHid(script)
    clock = types.SimpleNamespace(time=P.time.time, monotonic=P.time.monotonic,
                                  sleep=lambda delay: bus.step("sleep", delay))
    with mock.patch.object(P.hidlist, "enumerate", side_effect=lambda vid=0: [
            info for info in infos if not vid or info["vendor_id"] == vid]), \
            mock.patch.object(P.hid, "device", side_effect=bus.device), \
            mock.patch.object(P, "output_length", side_effect=lambda path: bus.step("length", path)), \
            mock.patch.object(P, "time", clock):
        yield bus
        if bus.calls != [call for call, _result in script]:
            # The reader intentionally ignores close exceptions. An extra close
            # must still fail this fixture even if its assertion was swallowed.
            raise AssertionError(f"HID trace changed: {bus.calls!r}")
        if bus.pending:
            raise AssertionError(f"missing HID calls: {bus.pending!r}")


class VgnF503EvidenceTests(unittest.TestCase):
    def setUp(self):
        # Only the ID, product string, interface and FF02:0002/output=17 are
        # reported facts; paths and per-report maps in this fake are synthetic.
        self.info = diagnostic_info(pid=0xF503, product_string="VGN Mouse 2.4G Receiver")

    def test_issue592_f503_capture_reads_only_the_existing_power_query(self):
        self.assertEqual(len(ISSUE592_F503_REPLY), 17)
        self.assertEqual(sum(ISSUE592_F503_REPLY) & 0xFF, 0x55)
        self.assertEqual(P.parse_power(ISSUE592_F503_REPLY), (95, False))
        self.assertEqual(tuple(P.make_request()), POWER_REQUEST)
        script = length_calls(self.info, 17, 17) + battery_calls(self.info, [ISSUE592_F503_REPLY], True)
        with diagnostic_hid([self.info], script):
            provider = P.PulsarProvider()
            status, = provider.poll()
        self.assertEqual((status.key, status.name, status.level, status.charging, status.online, status.kind),
                         ("pulsar:3554f503", "VGN Mouse 2.4G Receiver", 95, False, True, "mouse"))
        self.assertEqual((status.dpi, status.dpi_target), (None, None))
        self.assertEqual(provider.reader_diagnostics(), ["valid battery reply"])
        self.assertIn("待实机验证", " ".join(provider.diagnostics()))

    def test_issue592_f503_unproven_reports_and_siblings_never_open(self):
        sibling = dict(self.info, path=b"PRIVATE-SIBLING", usage_page=0xFF04)
        for length in (None, 0, 16, 18, 64):
            with self.subTest(length=length), \
                    diagnostic_hid([sibling, self.info], length_calls(self.info, length)):
                provider = P.PulsarProvider()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.reader_diagnostics(), ["output=17 unproven; nothing sent"])
        for page, usage in ((0xFF02, 1), (0xFF04, 2), (0xFF05, 0), (0xFF05, 2), (1, 2)):
            wrong = dict(self.info, usage_page=page, usage=usage)
            with self.subTest(collection=(page, usage)), diagnostic_hid([wrong], []):
                provider = P.PulsarProvider()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.reader_diagnostics(), ["FF02:0002 missing; nothing sent"])

    def test_issue592_f503_invalid_replies_and_sleep_events_give_no_reading(self):
        damaged = bytearray(ISSUE592_F503_REPLY)
        damaged[-1] ^= 1
        # The exact 08 03 event payload is not supplied; full event frames here
        # are synthetic, including a plausible but unrelated percentage.
        cases = [[], [ISSUE592_F503_REPLY[:-1]], [bytes(damaged)], [reply(101)], [reply(255)],
                 [reply(95, header=7)], [b"\x08\x03"], [reply(100, command=0x03)]]
        for frames in cases:
            script = length_calls(self.info, 17, 17) + battery_calls(self.info, frames)
            with self.subTest(frames=frames), diagnostic_hid([self.info], script):
                provider = P.PulsarProvider()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.reader_diagnostics(), ["no valid battery reply; connection unknown"])

    def test_issue592_f503_existing_percentage_boundaries_remain_valid(self):
        # Synthetic endpoint values; Issue #592 supplied only the 95% capture.
        for level in (0, 100):
            script = length_calls(self.info, 17, 17) + battery_calls(self.info, [reply(level)], True)
            with self.subTest(level=level), diagnostic_hid([self.info], script):
                status, = P.PulsarProvider().poll()
                self.assertEqual((status.level, status.online), (level, True))

    def test_issue592_f503_sleep_keeps_history_and_wake_skips_events(self):
        provider = P.PulsarProvider()
        script = length_calls(self.info, 17, 17) + battery_calls(self.info, [ISSUE592_F503_REPLY], True)
        with diagnostic_hid([self.info], script):
            fresh, = provider.poll()
        self.assertTrue(fresh.online)
        history = dict(provider._last)
        for frames in ([], [b"\x08\x03"], [reply(100, command=0x03)]):
            script = length_calls(self.info, 17, 17) + battery_calls(self.info, frames)
            with self.subTest(frames=frames), diagnostic_hid([self.info], script):
                stale, = provider.poll()
                self.assertEqual((stale.level, stale.charging, stale.online, stale.wake_on_input),
                                 (95, False, False, True))
                self.assertEqual(provider._last, history)
        frames = [reply(100, command=0x03), ISSUE592_F503_REPLY]
        script = length_calls(self.info, 17, 17) + battery_calls(self.info, frames, True)
        with diagnostic_hid([self.info], script):
            awake, = provider.poll()
        self.assertEqual((awake.level, awake.charging, awake.online, awake.wake_on_input),
                         (95, False, True, False))
        self.assertEqual(provider.reader_diagnostics(), ["valid battery reply"])

    def test_issue592_f503_does_not_admit_neighboring_3554_pids(self):
        for pid in (0xF502, 0xF504):
            with self.subTest(pid=pid), diagnostic_hid([dict(self.info, product_id=pid)], []):
                self.assertEqual(P.PulsarProvider().poll(), [])


class PulsarDiagnosticTests(unittest.TestCase):
    def test_issue323_unproven_length_has_safe_reason_without_opening(self):
        info = diagnostic_info()
        with diagnostic_hid([info], length_calls(info, None)):
            provider = P.PulsarProvider()
            self.assertEqual(provider.poll(), [])
        self.assertEqual(provider.reader_diagnostics(), ["output=17 unproven; nothing sent"])

    def test_strict_and_dynamic_collection_refusals_do_not_probe_lengths(self):
        for vid, pid in sorted(P.STRICT_COMPX_IDS) + [(0x373B, 0x120A)]:
            with self.subTest(vid=vid, pid=pid):
                info = diagnostic_info(vid, pid, usage_page=0xFF04)
                with diagnostic_hid([info], []):
                    provider = P.PulsarProvider()
                    self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.reader_diagnostics(), ["FF02:0002 missing; nothing sent"])

    def test_existing_strict_length_rejections_have_no_additional_probes(self):
        for vid, pid in sorted(P.STRICT_COMPX_IDS) + [(0x373B, 0x120A)]:
            for length in (None, 0, 16, 18, 64):
                with self.subTest(vid=vid, pid=pid, length=length):
                    info = diagnostic_info(vid, pid)
                    with diagnostic_hid([info], length_calls(info, length)):
                        provider = P.PulsarProvider()
                        self.assertEqual(provider.poll(), [])
                    self.assertEqual(provider.reader_diagnostics(), ["output=17 unproven; nothing sent"])

    def test_strict_selection_still_uses_the_first_fitting_control(self):
        first = diagnostic_info(path=b"PRIVATE-FIRST")
        selected = diagnostic_info(path=b"PRIVATE-SELECTED")
        sibling = diagnostic_info(path=b"PRIVATE-SIBLING", usage_page=0xFF04)
        script = length_calls(first, 64) + length_calls(selected, 17, 17)
        with diagnostic_hid([sibling, first, selected], script + battery_calls(selected, [reply(73)], True)):
            provider = P.PulsarProvider()
            status, = provider.poll()
        self.assertEqual((status.level, status.online, status.dpi, status.dpi_target), (73, True, None, None))
        self.assertEqual(provider.reader_diagnostics(), ["valid battery reply"])

    def test_link8k_refusals_use_existing_collection_and_descriptor_checks(self):
        good = diagnostic_info(*P.LINK8K_ID)
        cases = [([dict(good, usage_page=0xFF04)], "FF02:0002 missing or ambiguous; nothing sent"),
                 ([good, dict(good, path=b"PRIVATE-DUPLICATE")], "FF02:0002 missing or ambiguous; nothing sent"),
                 ([dict(good, path=b"")], "collection path unresolved; nothing sent")]
        for direction in ("input", "output"):
            for defect in ({direction + "_report_length": None},
                           {direction + "_report_length": 64},
                           {direction + "_report_sizes": {"7": 17}},
                           {direction + "_report_sizes": {"8": 17, "9": 17}}):
                cases.append(([dict(good, **defect)], "report-8 input/output lengths unproven; nothing sent"))
        for infos, reason in cases:
            with self.subTest(infos=infos), diagnostic_hid(infos, []):
                provider = P.PulsarProvider()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(provider.reader_diagnostics(), [reason])

    def test_open_drain_write_and_read_failures_preserve_original_trace(self):
        for identity in ((0x3554, 0xF517), (0x3554, 0xF58A), P.LINK8K_ID):
            for failure, reason in (("open", "battery open failed"), ("drain", "battery read failed"),
                                    ("write", "battery write failed"), ("read", "battery read failed")):
                info = diagnostic_info(*identity)
                script = [] if identity == P.LINK8K_ID else length_calls(info, 17, 17)
                with self.subTest(identity=identity, failure=failure), \
                        diagnostic_hid([info], script + battery_calls(info, failure=failure)):
                    provider = P.PulsarProvider()
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual(provider.reader_diagnostics(), [reason])
                    self.assertIn("PRIVATE-EXCEPTION", " ".join(provider.diagnostics()))

    def test_silence_and_invalid_replies_have_bounded_neutral_reason(self):
        frames = [[], [reply(101)], [reply(73, break_checksum=True)], [b"\x08\x04\x00"],
                  [reply(73, command=0x0A)] * 4]
        for identity in ((0x3554, 0xF517), (0x3554, 0xF58A), P.LINK8K_ID):
            for replies in frames:
                info = diagnostic_info(*identity)
                script = [] if identity == P.LINK8K_ID else length_calls(info, 17, 17)
                with self.subTest(identity=identity, replies=replies), \
                        diagnostic_hid([info], script + battery_calls(info, replies)):
                    provider = P.PulsarProvider()
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual(provider.reader_diagnostics(), ["no valid battery reply; connection unknown"])

    def test_invalid_then_valid_reply_has_only_success_diagnostic(self):
        info = diagnostic_info()
        frames = [reply(73, command=0x0A), reply(42, 1)]
        with diagnostic_hid([info], length_calls(info, 17, 17) + battery_calls(info, frames, True)):
            provider = P.PulsarProvider()
            status, = provider.poll()
        self.assertEqual((status.level, status.charging, status.online), (42, True, True))
        self.assertEqual(provider.reader_diagnostics(), ["valid battery reply"])

    def test_legacy_length_skips_and_unknown_length_selection_are_unchanged(self):
        control = diagnostic_info(pid=0xF58A)
        fallback = dict(control, path=b"PRIVATE-FALLBACK", usage_page=0xFF05)
        script = length_calls(control, 64, 64, 64, 64) + length_calls(fallback, None, None)
        with diagnostic_hid([control, fallback], script + battery_calls(fallback, [reply(61)], True)):
            provider = P.PulsarProvider()
            self.assertEqual(provider.poll()[0].level, 61)
        self.assertEqual(provider.reader_diagnostics(), ["valid battery reply"])

    def test_legacy_missing_control_does_not_block_the_original_fallback(self):
        info = diagnostic_info(pid=0xF58A, usage_page=0xFF05)
        with diagnostic_hid([info], length_calls(info, 17, 17, 17) + battery_calls(info)):
            provider = P.PulsarProvider()
            self.assertEqual(provider.poll(), [])
        self.assertEqual(provider.reader_diagnostics(), ["legacy FF02:0002 missing; fallback selected",
                                                       "no valid battery reply; connection unknown"])

    def test_legacy_incompatible_lengths_still_query_the_original_control(self):
        info = diagnostic_info(pid=0xF58A)
        with diagnostic_hid([info], length_calls(info, 64, 64, 64, 64, 64) + battery_calls(info, failure="write")):
            provider = P.PulsarProvider()
            self.assertEqual(provider.poll(), [])
        self.assertIn("legacy output length incompatible", provider.reader_diagnostics())
        self.assertIn("battery write failed", provider.reader_diagnostics())

    def test_each_poll_clears_diagnostics_without_changing_history(self):
        info = diagnostic_info()
        provider = P.PulsarProvider()
        self.assertEqual(provider.reader_diagnostics(), [])
        with diagnostic_hid([info], length_calls(info, None)):
            self.assertEqual(provider.poll(), [])
        with diagnostic_hid([info], length_calls(info, 17, 17) + battery_calls(info, [reply(73, 1)], True)):
            fresh, = provider.poll()
        self.assertEqual(provider.reader_diagnostics(), ["valid battery reply"])
        previous = dict(provider._last)
        with diagnostic_hid([info], length_calls(info, 17, 17) + battery_calls(info)):
            cached, = provider.poll()
        self.assertEqual((fresh.level, fresh.online, cached.level, cached.online, cached.wake_on_input),
                         (73, True, 73, False, True))
        self.assertEqual(provider._last, previous)
        self.assertEqual(provider.reader_diagnostics(), ["no valid battery reply; connection unknown"])
        copied = provider.reader_diagnostics()
        copied.append(PRIVATE_TEXT)
        self.assertNotIn(PRIVATE_TEXT, provider.reader_diagnostics())
        with diagnostic_hid([], []):
            self.assertEqual(provider.poll(), [])
        self.assertEqual(provider.reader_diagnostics(), [])
        self.assertEqual(provider._last, {})


class PulsarTest(unittest.TestCase):
    def setUp(self):
        self._hid, self._hidlist, self._outlen = P.hid, P.hidlist, P.output_length
        self.bus = self.one_receiver()
        P.hidlist = types.SimpleNamespace(enumerate=self.bus.enumerate)
        P.hid = types.SimpleNamespace(device=self.bus.device_class())

    def tearDown(self):
        P.hid, P.hidlist, P.output_length = self._hid, self._hidlist, self._outlen

    def one_receiver(self, vid=0x3554, pid=0xF58A, replies=(), lengths=None, **kw):
        """lengths: {(usage_page, usage): OutputReportByteLength}. Unknown stays None,
        which is what Windows gives for a collection it will not classify."""
        lengths = dict(lengths or {})
        self.bus = FakeBus(vid, pid, replies, **kw)
        bus = self.bus

        def output_length(path):
            for c in bus.cols:
                if c.info["path"] == path:
                    return lengths.get((c.info["usage_page"], c.info["usage"]))
            return None

        P.output_length = output_length
        self.lengths = lengths
        P.hidlist = types.SimpleNamespace(enumerate=self.bus.enumerate)
        P.hid = types.SimpleNamespace(device=self.bus.device_class())
        return self.bus

    def test_the_r1_pro_max_receiver_is_read(self):
        bus = self.one_receiver(replies=[reply(78, 0, 3900)])
        provider = P.PulsarProvider()
        found = provider.poll()
        self.assertEqual(1, len(found))
        d = found[0]
        self.assertEqual("pulsar:3554f58a", d.key)
        self.assertEqual("VXE R1 Pro Max (2.4 GHz)", d.name)
        self.assertEqual(78, d.level)
        self.assertFalse(d.charging)
        self.assertTrue(d.online)
        self.assertEqual("mouse", d.kind)
        diag = "\n".join(provider.diagnostics())
        self.assertIn("[Pulsar] pid=3554:f58a 'VXE R1 Pro Max (2.4 GHz)'", diag)
        self.assertIn("3900 mV", diag)

    def test_unlisted_atk_exact_collection_and_length_reads_only_power(self):
        bus = self.one_receiver(vid=0x373B, pid=0x120A, replies=[reply(73)],
                                lengths={P.CONTROL_USAGE: 17})
        for col in bus.cols:
            col.info["product_string"] = "ATK A9 Air"
        found = P.PulsarProvider().poll()
        self.assertEqual([(d.key, d.name, d.level, d.online) for d in found],
                         [("pulsar:373b120a", "ATK A9 Air", 73, True)])
        self.assertEqual(bus.written(), [P.CONTROL_USAGE])
        self.assertEqual([frame for col in bus.cols for frame in col.sent], [P.make_request()])
        self.assertEqual(sum(col.opened for col in bus.cols), 1)

    def test_unlisted_atk_silence_keeps_grey_reading_and_fallback_name(self):
        self.one_receiver(vid=0x373B, pid=0x120A, replies=[reply(61)],
                          lengths={P.CONTROL_USAGE: 17})
        provider = P.PulsarProvider()
        first = provider.poll()
        self.assertEqual([(d.name, d.level) for d in first], [("ATK Mouse", 61)])
        kept = provider.poll()
        self.assertEqual([(d.key, d.level, d.online, d.wake_on_input) for d in kept],
                         [("pulsar:373b120a", 61, False, True)])

    def test_unlisted_atk_never_falls_back_to_other_collections_or_lengths(self):
        for shape, lengths in [([(1, 0xFF04, 2)], {(0xFF04, 2): 17}),
                               ([(1, 0xFF05, 2)], {(0xFF05, 2): 54}),
                               ([(1, 0xFF02, 1)], {(0xFF02, 1): 17}),
                               (SHAPE, {P.CONTROL_USAGE: 64, (0xFF04, 2): 17}),
                               (SHAPE, {})]:
            with self.subTest(shape=shape, lengths=lengths):
                bus = self.one_receiver(vid=0x373B, pid=0x120A, replies=[reply(61)],
                                        shape=shape, lengths=lengths)
                self.assertEqual(P.PulsarProvider().poll(), [])
                self.assertEqual(sum(col.opened for col in bus.cols), 0)
                self.assertEqual(bus.written(), [])

    def test_unlisted_other_vendors_are_not_opened(self):
        for vid in (0x3554, 0x3710, 0x3770, 0x1234):
            with self.subTest(vid=vid):
                bus = self.one_receiver(vid=vid, pid=0x120A, replies=[reply(61)],
                                        lengths={P.CONTROL_USAGE: 17})
                self.assertEqual(P.PulsarProvider().poll(), [])
                self.assertEqual(sum(col.opened for col in bus.cols), 0)

    def test_unlisted_atk_rejects_bad_checksum_and_level(self):
        for frame in (reply(61, break_checksum=True), reply(101)):
            with self.subTest(frame=frame):
                bus = self.one_receiver(vid=0x373B, pid=0x120A, replies=[frame],
                                        lengths={P.CONTROL_USAGE: 17})
                self.assertEqual(P.PulsarProvider().poll(), [])
                self.assertEqual([f for col in bus.cols for f in col.sent], [P.make_request()])

    def test_listed_atk_and_vxe_still_accept_unknown_output_length(self):
        for vid, pid in ((0x373B, 0x1085), (0x3554, 0xF58A)):
            with self.subTest(vid=vid, pid=pid):
                self.one_receiver(vid=vid, pid=pid, replies=[reply(61)])
                found = P.PulsarProvider().poll()
                self.assertEqual([(d.name, d.level) for d in found], [(P.PIDS[vid][pid], 61)])

    def test_the_r1_pro_max_on_its_cable_is_read(self):
        # the reporter's second report: the wired mouse is 3554:f58c, product string
        # 'VXE R1 PRO MAX', with the same eight collections as the receiver
        bus = self.one_receiver(vid=0x3554, pid=0xF58C, replies=[reply(54, 1, 4020)])
        found = P.PulsarProvider().poll()
        self.assertEqual(1, len(found))
        d = found[0]
        self.assertEqual("pulsar:3554f58c", d.key)
        self.assertEqual("VXE R1 Pro Max (wired)", d.name)
        self.assertEqual(54, d.level)
        self.assertTrue(d.charging)
        self.assertEqual([(0xFF02, 0x0002)], bus.written())

    def test_the_vendor_control_collection_is_the_one_that_gets_the_request(self):
        bus = self.one_receiver(replies=[reply(64)])
        P.PulsarProvider().poll()
        self.assertEqual([(0xFF02, 0x0002)], bus.written(),
                         "the request must go to the collection the OpenMouse ATK/VXE panel opens")

    def test_the_request_is_the_17_byte_power_query(self):
        bus = self.one_receiver(replies=[reply(64)])
        P.PulsarProvider().poll()
        c = next(c for c in bus.cols if c.sent)
        sent, = c.sent
        self.assertEqual(P.make_request(), sent)
        self.assertEqual(17, len(sent))
        self.assertEqual(P.PAYLOAD_HEADER, sent[0])
        self.assertEqual(P.CMD_POWER, sent[1])
        self.assertEqual(P.CHECKSUM_BASE, sum(sent) % 256)

    def test_the_power_flag_means_charging(self):
        self.one_receiver(replies=[reply(55, 1)])
        found = P.PulsarProvider().poll()
        self.assertTrue(found[0].charging)

    def test_a_wrong_checksum_is_refused(self):
        self.one_receiver(replies=[reply(78, 0, 3900, break_checksum=True)])
        provider = P.PulsarProvider()
        self.assertEqual([], provider.poll())
        self.assertIn("no power reply", "\n".join(provider.diagnostics()))

    def test_a_level_above_100_is_refused(self):
        self.one_receiver(replies=[reply(200)])
        self.assertEqual([], P.PulsarProvider().poll())

    def test_an_event_frame_is_skipped_and_the_reply_after_it_is_used(self):
        # the same endpoint pushes events (command 0x0a); they are not a battery reply
        self.one_receiver(replies=[reply(78, command=0x0A),
                                   reply(41),
                                   reply(78, 0, 3900)])
        found = P.PulsarProvider().poll()
        self.assertEqual(41, found[0].level)

    def test_a_short_reply_is_ignored(self):
        bus = self.one_receiver()
        bus.cols[5].replies = [b"\x08\x04\x00"]
        self.assertEqual([], P.PulsarProvider().poll())

    def test_a_sleeping_dongle_gives_no_device(self):
        self.one_receiver(replies=[])
        self.assertEqual([], P.PulsarProvider().poll())

    def test_the_captured_crazylight_frames_parse(self):
        self.assertEqual((20, False), P.parse_power(CRAZYLIGHT_DONGLE))
        self.assertEqual(3562, P.voltage_mv(CRAZYLIGHT_DONGLE))
        self.assertEqual((25, True), P.parse_power(CRAZYLIGHT_CABLE))
        self.assertEqual(3666, P.voltage_mv(CRAZYLIGHT_CABLE))

    def test_the_crazylight_mini_is_read_on_both_transports(self):
        self.one_receiver(vid=0x3710, pid=0x5406, replies=[CRAZYLIGHT_DONGLE])
        found = P.PulsarProvider().poll()
        self.assertEqual(1, len(found))
        self.assertEqual(("pulsar:37105406", "Pulsar X2 CrazyLight Mini (2.4 GHz)", 20, False),
                         (found[0].key, found[0].name, found[0].level, found[0].charging))
        self.one_receiver(vid=0x3710, pid=0x3414, replies=[CRAZYLIGHT_CABLE])
        found = P.PulsarProvider().poll()
        self.assertEqual(("pulsar:37103414", "Pulsar X2 CrazyLight Mini (wired)", 25, True),
                         (found[0].key, found[0].name, found[0].level, found[0].charging))

    def test_every_claimed_id_answers_the_same_request(self):
        for vid, pids in P.PIDS.items():
            for pid in pids:
                with self.subTest(vid=vid, pid=pid):
                    bus = FakeBus(vid, pid, [reply(33)])
                    if (vid, pid) == (0x3710, 0x5501):
                        for col in bus.cols:
                            col.info.update(input_report_length=17, output_report_length=17,
                                            input_report_sizes={"8": 17}, output_report_sizes={"8": 17})
                    # Newly admitted CompX IDs require descriptor evidence; legacy models still
                    # exercise the established unknown-length allowance here.
                    strict = (vid, pid) in ((0x3554, 0xF517), (0x3554, 0xFB56),
                                            (0x3554, 0xF58E), (0x3554, 0xF505), (0x3554, 0xF503))
                    length = 17 if strict else None
                    P.output_length = lambda path: length
                    P.hidlist = types.SimpleNamespace(enumerate=bus.enumerate)
                    P.hid = types.SimpleNamespace(device=bus.device_class())
                    found = P.PulsarProvider().poll()
                    self.assertEqual(1, len(found), "no reading for %04x:%04x" % (vid, pid))
                    self.assertEqual(33, found[0].level)
                    c = next(c for c in bus.cols if c.sent)
                    self.assertEqual(P.make_request(), c.sent[0])

    def test_the_control_collection_is_used_when_its_output_report_fits(self):
        bus = self.one_receiver(replies=[reply(64)], lengths={(0xFF02, 0x0002): 17})
        P.PulsarProvider().poll()
        self.assertEqual([(0xFF02, 0x0002)], bus.written())

    def test_a_collection_that_cannot_take_the_frame_is_skipped(self):
        # Windows refuses a 17-byte write to a collection that has no such report:
        # the keepalive report on FF02 is 64 bytes, so the frame goes to FF04 instead
        bus = self.one_receiver(replies=[reply(72)], shape=[(1, 0xFF05, 0x0000),
                                                            (1, 0xFF02, 0x0002),
                                                            (1, 0xFF04, 0x0002)],
                                answering=(0xFF04, 0x0002),
                                lengths={(0xFF05, 0x0000): 0, (0xFF02, 0x0002): 64,
                                         (0xFF04, 0x0002): 17})
        provider = P.PulsarProvider()
        found = provider.poll()
        self.assertEqual(72, found[0].level)
        self.assertEqual([(0xFF04, 0x0002)], bus.written())
        diag = "\n".join(provider.diagnostics())
        self.assertIn("ff02:0002 output=64 cannot take a 17-byte frame; skipped", diag)
        self.assertIn("output=17", diag)

    def test_the_request_goes_to_the_first_collection_that_fits_when_there_is_no_control_one(self):
        bus = self.one_receiver(replies=[reply(48)], shape=[(1, 0xFF05, 0x0000),
                                                            (1, 0xFF03, 0x0000)],
                                answering=(0xFF03, 0x0000),
                                lengths={(0xFF05, 0x0000): 8, (0xFF03, 0x0000): 17})
        found = P.PulsarProvider().poll()
        self.assertEqual(48, found[0].level)
        self.assertEqual([(0xFF03, 0x0000)], bus.written())

    def test_an_unknown_output_length_never_disqualifies_a_collection(self):
        # on a system where the caps query says nothing, the usage rule still decides
        self.one_receiver(replies=[reply(64)])
        P.PulsarProvider().poll()
        self.assertEqual([(0xFF02, 0x0002)], self.bus.written())

    def test_an_unknown_length_still_qualifies_when_the_control_collection_is_wrong(self):
        # the control collection says 8 (no 17-byte report); the next one says nothing.
        # Unknown must not disqualify it, or the frame is written to a collection that
        # refuses it and the device looks switched off
        bus = self.one_receiver(replies=[reply(66)],
                                shape=[(1, 0xFF02, 0x0002), (1, 0xFF05, 0x0000)],
                                answering=(0xFF05, 0x0000),
                                lengths={(0xFF02, 0x0002): 8})
        found = P.PulsarProvider().poll()
        self.assertEqual(66, found[0].level)
        self.assertEqual([(0xFF05, 0x0000)], bus.written())

    def test_the_diagnostic_names_the_output_length(self):
        self.one_receiver(replies=[reply(64)], lengths={(0xFF02, 0x0002): 17})
        provider = P.PulsarProvider()
        provider.poll()
        self.assertIn("ff02:0002 output=17", "\n".join(provider.diagnostics()))

    def test_an_interface_1_collection_is_used_when_the_control_one_is_absent(self):
        shape = [(1, 0xFF05, 0x0000), (1, 0x0001, 0x0080)]
        bus = self.one_receiver(replies=[reply(51)], shape=shape,
                                answering=(0xFF05, 0x0000))
        found = P.PulsarProvider().poll()
        self.assertEqual(51, found[0].level)
        self.assertEqual([(0xFF05, 0x0000)], bus.written())

    def test_a_device_that_is_not_in_the_table_is_not_queried(self):
        bus = self.one_receiver(vid=0x3554, pid=0x1234, replies=[reply(78)])
        self.assertEqual([], P.PulsarProvider().poll())
        self.assertEqual([], bus.written())

    def test_the_hitscan_receiver_is_read(self):
        bus = self.one_receiver(vid=0x3770, pid=0x0200, replies=[reply(100, 0, 4393)],
                                shape=HITSCAN_SHAPE)
        found = P.PulsarProvider().poll()
        self.assertEqual(1, len(found))
        self.assertEqual("Hitscan Hyperlight (2.4 GHz)", found[0].name)
        self.assertEqual(100, found[0].level)
        self.assertEqual("pulsar:37700200", found[0].key)
        self.assertEqual([(0xFF02, 0x0002)], bus.written())

    def test_the_hitscan_on_its_cable_is_read(self):
        self.one_receiver(vid=0x3770, pid=0x0100, replies=[reply(74, 1, 4000)],
                          shape=HITSCAN_SHAPE)
        found = P.PulsarProvider().poll()
        self.assertEqual("Hitscan Hyperlight (wired)", found[0].name)
        self.assertEqual(74, found[0].level)

    def test_the_captured_hitscan_frames_parse(self):
        """The literal frames in sopparus/hitscan-battery's NOTES.md, byte 5 being
        0x02 there - which this provider does not check, and must not. The second is
        the one that disproved the vendor app's indicator: the device answered 75
        while Hitscan Utility displayed 100."""
        for raw, level, mv in (("08040000000264001129000000000000a9", 100, 4393),
                               ("0804000000024b00107300000000000079", 75, 4211),
                               ("0804000000026400112d000000000000a5", 100, 4397)):
            frame = bytes.fromhex(raw)
            self.assertEqual((level, False), P.parse_power(frame))
            self.assertEqual(mv, P.voltage_mv(frame))


    # ------------------------------------------------- the idle mouse (#87, later report)

    def test_a_mouse_that_stops_answering_keeps_its_reading_greyed(self):
        self.one_receiver(replies=[reply(64, 1, 4020)])
        provider = P.PulsarProvider()
        with mock.patch.object(P.time, "time", return_value=1000.0):
            first = provider.poll()
        self.assertEqual(1, len(first))
        self.assertTrue(first[0].online)
        self.assertFalse(first[0].wake_on_input, "a fresh reading is not a wake candidate")
        with mock.patch.object(P.time, "time", return_value=1060.0):
            kept = provider.poll()          # idle now: the receiver goes quiet
        self.assertEqual(1, len(kept), "the reading stays while the mouse is enumerated")
        self.assertFalse(kept[0].online, "a held reading is greyed out")
        self.assertEqual((64, True), (kept[0].level, kept[0].charging))
        self.assertEqual("pulsar:3554f58a", kept[0].key)
        self.assertTrue(kept[0].wake_on_input, "the kept reading can be woken by input")

    def test_the_kept_reading_does_not_expire_while_the_receiver_is_present(self):
        # the 2026-10-03 report: a screen-off let the greyed reading expire and the
        # re-created icon came back at a new tray position - it must never expire
        self.one_receiver(replies=[reply(64)])
        provider = P.PulsarProvider()
        with mock.patch.object(P.time, "time", return_value=1000.0):
            self.assertEqual(1, len(provider.poll()))
        with mock.patch.object(P.time, "time", return_value=1000.0 + 3600.0):
            kept = provider.poll()
        self.assertEqual(1, len(kept), "the receiver is still plugged in")
        self.assertFalse(kept[0].online)
        self.assertEqual(64, kept[0].level)

    def test_an_unplugged_receiver_is_not_kept(self):
        self.one_receiver(replies=[reply(64)])
        provider = P.PulsarProvider()
        with mock.patch.object(P.time, "time", return_value=1000.0):
            self.assertEqual(1, len(provider.poll()))
        self.bus.cols.clear()               # the receiver is pulled out of the machine
        with mock.patch.object(P.time, "time", return_value=1005.0):
            self.assertEqual([], provider.poll())

    def test_the_diagnostic_says_the_reading_is_kept(self):
        self.one_receiver(replies=[reply(64)])
        provider = P.PulsarProvider()
        with mock.patch.object(P.time, "time", return_value=1000.0):
            provider.poll()
        with mock.patch.object(P.time, "time", return_value=1060.0):
            provider.poll()
        diag = "\n".join(provider.diagnostics())
        self.assertIn("did not answer", diag)
        self.assertIn("greyed", diag)


if __name__ == "__main__":
    unittest.main()
