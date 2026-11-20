"""Replies are independent SYNTHETIC fixtures, except the verbatim #459 capture test."""
from contextlib import contextmanager
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ENGINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE))
sys.path.insert(0, str(ENGINE / "tests"))
import _hidstub  # noqa: F401 -- before any provider/server import
import battery_hid as H
from providers import zhuaudio as Z

P = Z.ZhuAudioProvider
# Complete independent 64-byte literal oracles, from official static encoding.
STATUS_REQUEST = bytes.fromhex(
    "CD 07 AA 5A CC 80 51 01 02 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00")
BATTERY_REQUEST = bytes.fromhex(
    "CD EE 80 00 06 00 FF 01 02 FE 07 AA 00 00 00 00 "
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00")
DESCRIPTOR = bytes.fromhex(
    "06 05 FF 09 01 A1 01 85 CE 09 02 15 00 26 FF 00 75 08 95 3F 81 00 "
    "85 CD 09 03 15 00 26 FF 00 75 08 95 3F 91 00 C0")


def entry(physical="receiver-a", **changes):
    info = dict(vendor_id=0x3654, product_id=0x5055, interface_number=4,
                product_string="ZhuAudio ZG4", usage_page=0xFF05, usage=1,
                input_report_length=64, output_report_length=64,
                input_report_sizes={"206": 64}, output_report_sizes={"205": 64},
                input_report_proof="caps", output_report_proof="caps",
                path=(physical + "-mi04-ff05").encode(), physical_id=physical,
                serial_number="synthetic-private-serial")
    info.update(changes)
    return info


def report(payload):
    assert len(payload) <= 63
    return bytes([0xCE]) + bytes(payload) + bytes(63 - len(payload))


def connected(state=1, *, prefixed=False):
    # Independently computed response CRCs; not the provider's crc16 function.
    crc = {0: b"\x01\x60", 1: b"\xC0\xA0", 2: b"\x80\xA1"}[state]
    payload = b"\xAA\xCC\x00\x02" + crc + bytes([2, state])
    # Hardware prefix (#459): 7 + length byte, one more than these 8 bytes.
    return report((bytes([len(payload) + 1]) if prefixed else b"") + payload)


def frame(level=70, charging=False, seq=1, cmd=7, value=None):
    # c_m's unused two bytes deliberately aren't request bytes or zero padding.
    value = bytes([level | (0x80 if charging else 0), 0x34, 0x12]) if value is None else bytes(value)
    body = bytes([cmd]) + (b"\x07" if cmd == 0xFE else b"") + value
    return bytes([0xFF, seq, len(body)]) + body + b"\xAA"


def reply(*args, **kwargs):
    return report(frame(*args, **kwargs))


def fragments(data, marker=0xEE):
    # Test-only packet constructor, independent of production encoding.
    packets = []
    for part, start in enumerate(range(0, len(data), 58)):
        chunk = data[start:start + 58]
        last = start + len(chunk) == len(data)
        total = len(data) if part == 0 else 0
        packets.append(report(bytes([marker, part | (0x80 if last else 0), 0,
                                     total & 255, total >> 8]) + chunk))
    return packets


class FakeBus:
    """Only open/write/read/close exist; any feature/reset/settings use fails."""
    def __init__(self, frames=(), read_ms=10, write_results=(), error_at=None):
        self.frames = {k: list(v) for k, v in frames.items()} if isinstance(frames, dict) else list(frames)
        self.read_ms, self.write_results, self.error_at = read_ms, list(write_results), error_at
        self.now = 0.0
        self.opened, self.writes, self.reads, self.closed = [], [], [], []
        self.on_read = None

    def device(self):
        bus = self

        class Handle:
            def open_path(self, path):
                self.path = path
                bus.opened.append(path)
                if bus.error_at == "open":
                    raise OSError("synthetic-private-path")

            def write(self, packet):
                bus.writes.append((self.path, bytes(packet)))
                if bus.error_at in ("write", "write" + str(len(bus.writes))):
                    raise OSError("synthetic-private-path")
                return bus.write_results.pop(0) if bus.write_results else len(packet)

            def read(self, length, timeout_ms):
                bus.reads.append((self.path, length, timeout_ms))
                packets = bus.frames.get(self.path, []) if isinstance(bus.frames, dict) else bus.frames
                bus.now += (bus.read_ms if packets else timeout_ms) / 1000
                if bus.on_read:
                    bus.on_read()
                if bus.error_at in ("read", "read" + str(len(bus.reads))):
                    raise OSError("synthetic-private-path")
                return packets.pop(0) if packets else []

            def close(self):
                bus.closed.append(self.path)
                if bus.error_at == "close":
                    raise OSError("synthetic-private-path")

        return Handle()


@contextmanager
def fixture(frames=(), inventory=None, **kwargs):
    bus = FakeBus(frames, **kwargs)
    with patch.object(H, "hid", bus), \
            patch.object(H.hidlist, "enumerate", return_value=[entry()] if inventory is None else inventory), \
            patch.object(Z, "time", SimpleNamespace(monotonic=lambda: bus.now)):
        yield bus


class ZhuAudioProtocolTests(unittest.TestCase):
    def test_exact_independent_literal_requests_and_arc_check(self):
        self.assertEqual(Z.status_request(), STATUS_REQUEST)
        self.assertEqual(Z.battery_request(1), BATTERY_REQUEST)
        self.assertEqual((len(STATUS_REQUEST), len(BATTERY_REQUEST)), (64, 64))
        self.assertEqual(Z.crc16(b"\x01\x02"), 0x5180)
        for seq in (0, 2, 255):
            expected = bytearray(BATTERY_REQUEST)
            expected[7] = seq
            self.assertEqual(Z.battery_request(seq), expected)

    def test_request_and_crc_types_cannot_manufacture_bytes(self):
        for value in (None, True, -1, 256, 1.0, "1", [], b"1"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                Z.battery_request(value)
        for value in (64, "12", [True], [1.0], [-1], [256]):
            with self.subTest(value=value), self.assertRaises(ValueError):
                Z.crc16(value)

    def test_complete_direct_and_property_battery_charging_values(self):
        for cmd in (7, 0xFE):
            for level in (1, 27, 70, 100):
                for charging in (False, True):
                    for container in (bytes, bytearray, list, tuple):
                        data = container(frame(level, charging, cmd=cmd))
                        self.assertEqual(Z.battery_reply(data, 1), (level, charging, ""))

    def test_short_unknown_zero_and_out_of_range_values_never_default(self):
        for cmd in (7, 0xFE):
            for size in range(3):
                self.assertIsNone(Z.battery_reply(frame(cmd=cmd, value=bytes([70]) * size), 1))
            for value in (0, *range(101, 128)):
                for charging in (False, True):
                    self.assertIsNone(Z.battery_reply(frame(value, charging, cmd=cmd), 1))

    def test_ff_length_tail_opcode_property_and_sequence_are_mandatory(self):
        good = frame(cmd=0xFE)
        bad = [good[:-1], good + b"\x00", b"", bytes(64), frame(seq=0),
               frame(cmd=0xFC), frame(cmd=6)]
        for index, value in ((0, 0xFE), (2, 0), (2, good[2] - 1), (2, good[2] + 1),
                             (4, 8), (len(good) - 1, 0)):
            changed = bytearray(good)
            changed[index] = value
            bad.append(changed)
        for data in bad:
            self.assertIsNone(Z.battery_reply(data, 1), data)
        for seq in (None, True, 1.0, "1", -1, 256):
            self.assertIsNone(Z.battery_reply(good, seq))

    def test_report_data_types_id_and_exact_length_are_required(self):
        good = reply()
        bad = [good[1:], good + b"\x00", bytes([0xCD]) + good[1:], 64, "x" * 64,
               [True] + list(good[1:]), list(good[:5]) + [1.0] + list(good[6:]),
               list(good[:5]) + [-1] + list(good[6:])]
        for data in bad:
            self.assertIsNone(Z.input_payload(data))
        for container in (bytes, bytearray, list, tuple):
            self.assertEqual(Z.input_payload(container(good)), good[1:])

    def test_status_requires_crc_length_opcode_padding_and_online_first_byte(self):
        for prefixed in (False, True):
            self.assertIs(Z.connection_reply(connected(prefixed=prefixed)[1:]), True)
            for state in (0, 2):
                self.assertIs(Z.connection_reply(connected(state, prefixed=prefixed)[1:]), False)
        good = connected()
        for index, value in ((1, 0), (2, 0), (4, 0), (4, 58), (5, 0), (6, 0), (7, 7), (63, 1)):
            bad = bytearray(good)
            bad[index] = value
            self.assertIsNone(Z.connection_reply(bad[1:]), (index, value))
        bad = bytearray(connected(prefixed=True))
        bad[1] += 1
        self.assertIsNone(Z.connection_reply(bad[1:]))
        self.assertIsNone(Z.connection_reply(frame()))

    def test_source_crc_compatibility_length_is_not_a_guessed_checksum(self):
        # bP2's L+1 branch: same independently computed CRC over [02,01].
        for prefixed in (False, True):
            packet = bytearray(connected(prefixed=prefixed))
            packet[5 if prefixed else 4] = 1
            if prefixed:
                packet[1] = 8  # 7 + the declared length of 1
            self.assertIs(Z.connection_reply(packet[1:]), True)
            packet[6 if prefixed else 5] ^= 1
            self.assertIsNone(Z.connection_reply(packet[1:]))

    def test_issue_459_hardware_status_and_battery_frames(self):
        # Verbatim listen-only frames from #459 (Z HUB showed 50%, not charging).
        def real(text):
            data = bytes.fromhex(text)
            return data + bytes(64 - len(data))
        online = real("CE 09 AA CC 00 02 C0 A0 02 01")
        self.assertIs(Z.connection_reply(Z.input_payload(online)), True)
        # Other opcodes seen in the same capture never count as a state.
        for text in ("CE 09 AA CC 00 02 C1 30 03 01", "CE 0B AA CC 00 04 C1 36 04 00 00 09",
                     "CE 0E AA CC 00 07 14 1C 05 F5 94 70 95 95 20",
                     "CE 0C AA CC 00 05 41 32 06 88 36 05 10", "CE 09 AA CC 00 02 06 50 09 00",
                     "CE 0E AA CC 00 07 96 67 0A 03 01 FF FF FF FF",
                     "CE 09 AA CC 00 02 06 12 08 38"):
            self.assertIsNone(Z.connection_reply(Z.input_payload(real(text))), text)
        # The hardware prefix stays exact, and the CRC still has to match.
        for index, value in ((1, 0x08), (1, 0x0A), (6, 0xC1), (9, 0x00), (10, 0x01)):
            bad = bytearray(online)
            bad[index] = value
            self.assertIsNone(Z.connection_reply(bad[1:]), (index, value))
        ack = Z._Assembler().feed(Z.input_payload(real("CE EA 80 00 05 00 FF 09 01 FC AA")), 0.0)
        self.assertEqual(ack, bytes.fromhex("FF 09 01 FC AA"))
        self.assertIsNone(Z.battery_reply(ack, 9))
        level = Z._Assembler().feed(
            Z.input_payload(real("CE EA 80 00 08 00 FF 09 04 07 32 00 00 AA")), 0.0)
        self.assertEqual(Z.battery_reply(level, 9), (50, False, ""))
        self.assertIsNone(Z.battery_reply(level, 10))

    def test_user_raw_descriptor_proves_ce_cd_without_shared_parser_changes(self):
        parsed, error = H.report_descriptor_proof(DESCRIPTOR)
        self.assertIsNone(error)
        self.assertEqual(parsed, {(0xFF05, 1): {"input": {"206": 64}, "output": {"205": 64}, "feature": {}}})


class ZhuAudioProviderTests(unittest.TestCase):
    def test_exact_interface_two_reads_and_known_charging(self):
        for level in (1, 70, 100):
            for charging in (False, True):
                with fixture([connected(), reply(level, charging)]) as bus:
                    status, = P().poll()
                self.assertEqual((status.level, status.charging, status.charging_known), (level, charging, True))
                self.assertEqual((status.kind, status.source, status.verification_level), ("headset", "zhuaudio", "C"))
                self.assertTrue(status.online and status.connection_known)
                self.assertEqual(bus.writes, [(entry()["path"], STATUS_REQUEST), (entry()["path"], BATTERY_REQUEST)])
                self.assertEqual(bus.closed, bus.opened)
                self.assertTrue(all(n == 64 for _, n, _ in bus.reads))

    def test_both_ff02_companions_are_never_opened_or_used_as_fallback(self):
        ff02 = [entry(usage_page=0xFF02, usage=2, interface_number=3, path=b"ff02-no-id",
                      input_report_sizes={"0": 65}, output_report_sizes={"0": 65}),
                entry(usage_page=0xFF02, usage=2, path=b"ff02-c0",
                      input_report_sizes={"192": 64}, output_report_sizes={"192": 64})]
        for infos, count in ((ff02, 0), ([entry(), *ff02], 1),
                             ([entry(output_report_sizes=None), *ff02], 0)):
            with self.subTest(count=count), fixture([connected(), reply()], infos) as bus:
                self.assertEqual(len(P().poll()), count)
                self.assertEqual(bus.opened, [entry()["path"]] if count else [])
                self.assertEqual(len(bus.writes), count * 2)

    def test_wrong_identity_product_interface_usage_and_ble_have_zero_io(self):
        bad = [dict(vendor_id=0), dict(product_id=0x5054), dict(product_string="iKF ZG4"),
               dict(product_string="ZhuAudio ZG4 "), dict(product_string=""), dict(product_string=None),
               dict(interface_number=3), dict(interface_number=5), dict(interface_number=True),
               dict(interface_number="4"), dict(usage_page=0xFF02), dict(usage=2), dict(usage=True),
               dict(path=b"bthledevice#vid&00023654"), dict(physical_id="bthenum:private")]
        for changes in bad:
            with self.subTest(changes=changes), fixture([connected(), reply()], [entry(**changes)]) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual((bus.opened, bus.writes), ([], []))

    def test_parent_and_path_must_be_nonempty_proven_metadata(self):
        bad = [dict(physical_id=""), dict(physical_id=None), dict(physical_id=4),
               dict(physical_id="collection:private"), dict(path=b""), dict(path=""),
               dict(path=None), dict(path=64), dict(path=b"collection:private")]
        missing = entry()
        missing.pop("physical_id")
        for infos in ([missing], *([entry(**c)] for c in bad)):
            with self.subTest(infos=infos), fixture([connected(), reply()], infos) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual((bus.opened, bus.writes), ([], []))

    def test_duplicate_ff05_rejected_before_product_or_shape_filter(self):
        for changes in ({}, dict(product_string="wrong"), dict(interface_number=3),
                        dict(input_report_sizes=None), dict(output_report_proof="unknown")):
            infos = [entry(), entry(path=b"duplicate", **changes)]
            with self.subTest(changes=changes), fixture([connected(), reply()], infos) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual((bus.opened, bus.writes), ([], []))

    def test_direction_specific_single_id_byte_proof_not_maximum_alone(self):
        for direction, correct, swapped in (("input", "206", "205"), ("output", "205", "206")):
            cases = [{direction + "_report_length": n} for n in (None, 63, 65, True, 64.0, "64")]
            cases += [{direction + "_report_sizes": sizes} for sizes in (
                None, {}, {swapped: 64}, {correct: 63}, {correct: 64.0}, {int(correct): 64},
                {correct: 64, "192": 64}, {"0": 64})]
            cases += [{direction + "_report_proof": proof} for proof in (None, "unknown", "failed", "descriptor")]
            for changes in cases:
                with self.subTest(changes=changes), fixture([connected(), reply()], [entry(**changes)]) as bus:
                    self.assertEqual(P().poll(), [])
                    self.assertEqual((bus.opened, bus.writes), ([], []))

    def test_no_state_no_battery_request_and_disconnected_has_no_new_reading(self):
        for frames in ([], [reply()], [connected(0)], [connected(2)], [reply(cmd=0xFC)],
                       [connected(), connected(0), reply()]):
            with self.subTest(frames=frames), fixture(frames) as bus:
                self.assertEqual(P().poll(), [])
                self.assertEqual(bus.writes[0][1], STATUS_REQUEST)
                self.assertEqual(len(bus.writes), 2 if len(frames) == 3 else 1)
                self.assertEqual(bus.closed, bus.opened)

    def test_noise_bad_status_crc_old_sequence_ack_and_unrelated_opcode_then_valid(self):
        bad_crc = bytearray(connected())
        bad_crc[5] ^= 1
        frames = [report(b"noise"), bad_crc, reply(), connected(), report(b"noise"),
                  reply(seq=0), report(b"\xFF\x01\x01\xFC\xAA"), reply(cmd=6), reply(27, True, cmd=0xFE)]
        with fixture(frames) as bus:
            status, = P().poll()
        self.assertEqual((status.level, status.charging), (27, True))
        self.assertEqual(len(bus.writes), 2)  # No host ACK or probing.

    def test_ack_only_or_short_battery_or_request_echo_never_measure(self):
        for packet in (report(b"\xFF\x01\x01\xFC\xAA"), reply(value=b"\x46"),
                       reply(value=b"\x46\x00"), report(BATTERY_REQUEST[1:]), reply(0), reply(101)):
            with self.subTest(packet=packet), fixture([connected(), packet]):
                self.assertEqual(P().poll(), [])

    def test_ee_and_ea_complete_fragment_chains_are_supported(self):
        data = frame(70, True, cmd=0xFE, value=b"\xC6\x34\x12" + bytes(range(130)))
        for marker in (0xEE, 0xEA):
            with self.subTest(marker=marker), fixture([connected(), *fragments(data, marker)]) as bus:
                status, = P().poll()
                self.assertEqual((status.level, status.charging), (70, True))
                self.assertEqual(len(bus.writes), 2)

    def test_complete_fragmented_ack_and_old_sequence_do_not_block_current_reply(self):
        ack = b"\xFF\x01\x01\xFC\xAA"
        data = frame(value=b"\x46\x34\x12" + bytes(70))
        for marker in (0xEE, 0xEA):
            packets = [connected(), *fragments(ack, marker), *fragments(frame(seq=0), marker),
                       *fragments(data, marker)]
            with self.subTest(marker=marker), fixture(packets) as bus:
                self.assertEqual(P().poll()[0].level, 70)
                self.assertEqual(len(bus.writes), 2)

    def test_lost_reordered_duplicate_and_unfinished_fragments_reject(self):
        parts = fragments(frame(value=b"\x46\x34\x12" + bytes(130)))
        cases = [parts[:-1], parts[1:], [parts[0], parts[2]], [parts[1], parts[0], parts[2]],
                 [parts[0], parts[0], *parts[1:]], [parts[0], reply()]]
        for packets in cases:
            with self.subTest(packets=packets), fixture([connected(), *packets]):
                self.assertEqual(P().poll(), [])

    def test_fragment_total_reserved_padding_last_flag_and_mixed_marker_reject(self):
        base = fragments(frame(value=b"\x46\x34\x12" + bytes(130)))
        cases = []
        for packet, index, value in ((0, 3, 1), (0, 2, 0x80), (1, 4, 1),
                                     (1, 1, 0xEA), (2, 63, 1), (2, 2, 2)):
            packets = [bytearray(p) for p in base]
            packets[packet][index] = value
            cases.append(packets)
        for packets in cases:
            with self.subTest(packets=packets), fixture([connected(), *packets]):
                self.assertEqual(P().poll(), [])

    def test_fragment_total_length_is_bounded_and_cannot_restart_failed_chain(self):
        for total in (0, 4, 1025, 65535):
            payload = bytes([0xEE, 0x80, 0, total & 255, total >> 8]) + bytes(58)
            assembler = Z._Assembler()
            self.assertIsNone(assembler.feed(payload, 0))
            self.assertTrue(assembler.failed)
            self.assertIsNone(assembler.feed(fragments(frame())[0][1:], .1))
            self.assertLessEqual(len(assembler.data), 1024)
        assembler = Z._Assembler()
        for packet in fragments(bytes(1024)):
            assembler.feed(packet[1:], 0)
        self.assertEqual(len(assembler.data), 1024)

    def test_fragment_timeout_and_total_query_deadline_reject_late_results(self):
        parts = fragments(frame(value=b"\x46\x34\x12" + bytes(60)))
        assembler = Z._Assembler()
        self.assertIsNone(assembler.feed(parts[0][1:], 0))
        self.assertIsNone(assembler.feed(parts[1][1:], 2))
        self.assertTrue(assembler.failed)
        with fixture([connected(), reply()], read_ms=1000) as bus:
            self.assertEqual(P().poll(), [])  # Valid bytes arrive at the deadline.
            self.assertEqual(len(bus.reads), 2)
            self.assertLessEqual(bus.now, 2)

    def test_both_phases_share_one_read_count_limit(self):
        with fixture([report(b"noise")] * 30 + [connected(), reply(seq=0), reply()]) as bus:
            self.assertEqual(P().poll(), [])
            self.assertEqual(len(bus.reads), Z.MAX_READS)
            self.assertEqual(len(bus.writes), 2)
        with fixture([report(b"noise")] * 100) as bus:
            self.assertEqual(P().poll(), [])
            self.assertEqual(len(bus.reads), 32)
            self.assertEqual(len(bus.writes), 1)
        with fixture([report(b"noise")] * 31 + [connected()]) as bus:
            self.assertEqual(P().poll(), [])
            self.assertEqual((len(bus.reads), len(bus.writes)), (32, 1))

    def test_status_failures_allow_next_poll_without_consuming_a_sequence(self):
        cases = [("timeout", [], {}),
                 ("short write", [connected()], {"write_results": [63]}),
                 ("invalid write result", [connected()], {"write_results": [64.0]}),
                 ("write error", [], {"error_at": "write1"}),
                 ("read error", [], {"error_at": "read"}),
                 ("offline", [connected(0)], {}),
                 ("read limit", [report(b"noise")] * 31 + [connected()], {})]
        for name, packets, options in cases:
            with self.subTest(name=name):
                provider = P()
                with fixture(packets, **options) as first:
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual([p for _, p in first.writes], [STATUS_REQUEST])
                    self.assertEqual(first.closed, first.opened)
                # A separate normal oracle, never leftovers from the failure.
                with fixture([connected(), reply(27, seq=1)]) as second:
                    statuses = provider.poll()
                    self.assertEqual(len(statuses), 1)
                    self.assertEqual(statuses[0].level, 27)
                    self.assertEqual([p for _, p in second.writes], [STATUS_REQUEST, BATTERY_REQUEST])
                    self.assertEqual(second.closed, second.opened)

    def test_300_successes_wrap_255_zero_one_without_exhaustion(self):
        provider = P()
        sequences = []
        for count in range(1, 301):
            seq = count & 255
            with fixture([connected(), reply(27, seq=seq)]) as bus:
                statuses = provider.poll()
                self.assertEqual(len(statuses), 1, f"poll {count}")
                self.assertEqual(statuses[0].level, 27)
                self.assertEqual(len(bus.opened), 1)
                self.assertEqual(bus.closed, bus.opened)
                sequences.extend(p[7] for _, p in bus.writes if p[1] == 0xEE)
        self.assertEqual(sequences, [n & 255 for n in range(1, 301)])
        self.assertEqual(sequences[254:257], [255, 0, 1])

    def test_retired_sequence_late_battery_and_ack_cannot_complete_next_poll(self):
        for marker in (None, 0xEE, 0xEA):
            with self.subTest(marker=marker):
                provider = P()
                with fixture([connected()]) as first:
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual([p[7] for _, p in first.writes if p[1] == 0xEE], [1])
                ack = b"\xFF\x01\x01\xFC\xAA"
                stale = [frame(99, seq=1), ack]
                packets = [report(f) for f in stale] if marker is None else [
                    packet for f in stale for packet in fragments(f, marker)]
                with fixture([connected(), *packets, reply(27, seq=2)]) as second:
                    statuses = provider.poll()
                    self.assertEqual(len(statuses), 1)
                    self.assertEqual(statuses[0].level, 27)
                    self.assertEqual([p[7] for _, p in second.writes if p[1] == 0xEE], [2])
                    self.assertEqual(len(second.reads), len(packets) + 2)
                    self.assertEqual(second.closed, second.opened)

    def test_short_writes_end_query_without_immediate_retry_or_reopen(self):
        for results, count in (([63], 1), ([64, 63], 2), ([64.0], 1), ([64, 64.0], 2)):
            with self.subTest(results=results), fixture([connected(), reply()], write_results=results) as bus:
                provider = P()
                self.assertEqual(provider.poll(), [])
                self.assertEqual(len(bus.writes), count)
                self.assertEqual(len(bus.opened), 1)
                self.assertEqual(bus.closed, bus.opened)

    def test_io_and_close_exceptions_are_private_and_always_attempt_close(self):
        for error in ("open", "write1", "write2", "read", "read2", "close"):
            with self.subTest(error=error), fixture([connected(), reply()], error_at=error) as bus:
                provider = P()
                self.assertEqual(len(provider.poll()), 1 if error == "close" else 0)
                self.assertEqual(bus.closed, bus.opened)
                self.assertTrue(provider.diagnostics())
                self.assertTrue(all(len(d) <= 48 and "private" not in d for d in provider.diagnostics()))
            seq = 2 if error in ("write2", "read2", "close") else 1
            with self.subTest(recovery=error), fixture([connected(), reply(27, seq=seq)]) as bus:
                statuses = provider.poll()
                self.assertEqual(len(statuses), 1)
                self.assertEqual(statuses[0].level, 27)
                self.assertEqual([p[7] for _, p in bus.writes if p[1] == 0xEE], [seq])
                self.assertEqual(bus.closed, bus.opened)

    def test_incomplete_fe_attempts_retire_only_the_attempted_sequence(self):
        partial = fragments(frame(value=b"\x46\x34\x12" + bytes(70)))[:1]
        cases = [("short FE write", [connected()], {"write_results": [64, 63]}),
                 ("invalid FE write result", [connected()], {"write_results": [64, 64.0]}),
                 ("FE write error", [connected()], {"error_at": "write2"}),
                 ("FE read error", [connected()], {"error_at": "read2"}),
                 ("timeout and close error", [connected()], {"error_at": "close"}),
                 ("ACK only", [connected(), report(b"\xFF\x01\x01\xFC\xAA")], {}),
                 ("short value", [connected(), reply(value=b"\x46\x34")], {}),
                 ("zero value", [connected(), reply(0)], {}),
                 ("disconnect", [connected(), connected(0)], {}),
                 ("partial chain", [connected(), *partial], {}),
                 ("late value", [connected(), reply()], {"read_ms": 1000})]
        for name, packets, options in cases:
            with self.subTest(name=name):
                provider = P()
                with fixture(packets, **options) as first:
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual([p[7] for _, p in first.writes if p[1] == 0xEE], [1])
                    self.assertEqual(first.closed, first.opened)
                with fixture([connected(), reply(99, seq=1), reply(27, seq=2)]) as second:
                    statuses = provider.poll()
                    self.assertEqual(len(statuses), 1)
                    self.assertEqual(statuses[0].level, 27)
                    self.assertEqual([p[7] for _, p in second.writes if p[1] == 0xEE], [2])
                    self.assertEqual(second.closed, second.opened)

    def test_failed_or_incomplete_chain_cannot_restart_until_next_query(self):
        parts = fragments(frame(value=b"\x46\x34\x12" + bytes(130)))
        malformed = bytearray(frame())
        malformed[-1] = 0
        for prefix in ([parts[0]], [parts[1]], [parts[0], parts[2]],
                       fragments(malformed)):
            with self.subTest(prefix=prefix):
                provider = P()
                with fixture([connected(), *prefix, *fragments(frame()), reply()]) as first:
                    self.assertEqual(provider.poll(), [])
                    self.assertEqual(len(first.writes), 2)
                with fixture([connected(), reply(27, seq=2)]) as second:
                    statuses = provider.poll()
                    self.assertEqual(len(statuses), 1)
                    self.assertEqual(statuses[0].level, 27)
                    self.assertEqual(len(second.writes), 2)

    def test_sequence_is_preserved_and_old_success_is_not_current(self):
        provider = P()
        with fixture([connected(), reply(70)]) as bus:
            self.assertEqual(provider.poll()[0].level, 70)
            bus.frames += [connected(), reply(70, seq=1), reply(27, seq=2)]
            self.assertEqual(provider.poll()[0].level, 27)
            self.assertEqual([p[7] for _, p in bus.writes if p[1] == 0xEE], [1, 2])

    def test_late_retired_reply_alone_never_becomes_a_reading(self):
        provider = P()
        with fixture([connected()]) as bus:
            self.assertEqual(provider.poll(), [])
            bus.frames += [connected(), reply(seq=1)]
            self.assertEqual(provider.poll(), [])
            self.assertEqual((len(bus.opened), len(bus.writes)), (2, 4))
            self.assertEqual(provider.diagnostics(), ["ZG4 no valid reply within limits"])
            self.assertEqual([p[7] for _, p in bus.writes if p[1] == 0xEE], [1, 2])
            bus.frames += [connected(), reply(seq=2)]
            self.assertEqual(provider.poll(), [])
            self.assertEqual([p[7] for _, p in bus.writes if p[1] == 0xEE], [1, 2, 3])

    def test_local_poll_guard_prevents_concurrent_opens(self):
        provider = P()
        with fixture([connected(), reply()]) as bus:
            def nested():
                bus.on_read = None
                self.assertEqual(provider.poll(), [])
                self.assertEqual(len(bus.opened), 1)
            bus.on_read = nested
            self.assertEqual(len(provider.poll()), 1)
            self.assertEqual(len(bus.opened), 1)

    def test_independent_parents_keep_sequence_and_unresolved_state_separate(self):
        infos = [entry("one"), entry("two")]
        packets = {infos[0]["path"]: [connected()], infos[1]["path"]: [connected(), reply(72)]}
        with fixture(packets, infos) as bus:
            provider = P()
            first, = provider.poll()
            self.assertEqual((first.physical_id, first.level), ("two", 72))
            bus.frames[infos[0]["path"]] = [connected(), reply(seq=1)]
            bus.frames[infos[1]["path"]] = [connected(), reply(27, seq=1), reply(71, seq=2)]
            second, = provider.poll()
            self.assertEqual((second.physical_id, second.level), ("two", 71))
            self.assertEqual(bus.opened.count(infos[0]["path"]), 2)
            self.assertEqual(bus.opened.count(infos[1]["path"]), 2)
            for info in infos:
                self.assertEqual([p[7] for path, p in bus.writes
                                  if path == info["path"] and p[1] == 0xEE], [1, 2])
            bus.frames[infos[0]["path"]] = [connected(), reply(26, seq=3)]
            bus.frames[infos[1]["path"]] = [connected(), reply(70, seq=3)]
            self.assertEqual([(s.physical_id, s.level) for s in provider.poll()], [("one", 26), ("two", 70)])

    def test_only_256_unresolved_fe_sequences_exhaust_further_io(self):
        provider = P()
        with fixture() as bus:
            for count in range(1, 257):
                bus.frames += [connected()]
                self.assertEqual(provider.poll(), [])
                self.assertEqual(len(bus.opened), count)
            writes = [p[7] for _, p in bus.writes if p[1] == 0xEE]
            self.assertEqual(writes, list(range(1, 256)) + [0])
            bus.frames += [connected(), reply(seq=1)]
            bus.now += 100000  # Silence cannot retire/cancel or age out state.
            self.assertEqual(provider.poll(), [])
            self.assertEqual(provider.diagnostics(), ["ZG4 all 256 FE sequences unresolved"])
            self.assertEqual(len(bus.opened), 256)
            self.assertEqual((len(bus.writes), len(bus.reads)), (512, 512))
            self.assertEqual(bus.closed, bus.opened)

    def test_300_status_timeouts_leave_all_fe_sequences_available(self):
        provider = P()
        with fixture() as bus:
            for _ in range(300):
                self.assertEqual(provider.poll(), [])
            self.assertEqual(len(bus.opened), 300)
            self.assertEqual([p for _, p in bus.writes], [STATUS_REQUEST] * 300)
            bus.frames += [connected(), reply(27, seq=1)]
            self.assertEqual(provider.poll()[0].level, 27)
            self.assertEqual([p[7] for _, p in bus.writes if p[1] == 0xEE], [1])

    def test_retired_sequence_survives_absence_and_is_skipped_after_successful_wrap(self):
        provider = P()
        with fixture([connected()]):
            self.assertEqual(provider.poll(), [])  # FE seq 1 remains unresolved.
        with fixture(inventory=[]) as absent:
            self.assertEqual(provider.poll(), [])
            self.assertEqual(absent.opened, [])
        available = list(range(2, 256)) + [0]
        sequences = []
        for count in range(300):
            seq = available[count % len(available)]
            with fixture([connected(), reply(99, seq=1), reply(27, seq=seq)]) as bus:
                statuses = provider.poll()
                self.assertEqual(len(statuses), 1, f"poll {count + 1}")
                self.assertEqual(statuses[0].level, 27)
                sequences.extend(p[7] for _, p in bus.writes if p[1] == 0xEE)
        self.assertEqual(sequences, [available[n % len(available)] for n in range(300)])
        self.assertNotIn(1, sequences)
        self.assertEqual(sequences[253:256], [255, 0, 2])

    def test_enumeration_failure_is_fixed_and_has_zero_io(self):
        with fixture() as bus, patch.object(H.hidlist, "enumerate", side_effect=OSError("private")):
            provider = P()
            self.assertEqual(provider.poll(), [])
            self.assertEqual(provider.diagnostics(), ["ZG4 enumeration failed"])
            self.assertEqual(bus.opened, [])


if __name__ == "__main__":
    unittest.main()
