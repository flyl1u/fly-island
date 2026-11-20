"""MCHOSE wireless mice on the 2.4 GHz receiver (M7 Ultra 5253:1020 confirmed on hardware).

Protocol from MCHOSE's own driver, recovered and documented by @alexfrih in
github.com/alexfrih/mchose-linux (PROTOCOL.md, from the M HUB web bundle), which covers
the 0x5253 family: L7/L7 Pro/L7 Ultra, M7, A7, K7. What this mouse forced on top of that
document, all of it measured on the M7 Ultra with firmware 5.2.7.0:

  * the configuration collection is usage page 0xFF01. The sibling collection on the same
    interface (0xFF0B, usage 0x104) never answers anything, on any report id or length.
  * two report ids: 0x11 (20 bytes) and 0x12 (64 bytes), both *feature* reports. Reads are
    written as feature reports too; output reports are not used.
  * every payload byte is inverted (^ 0xFF), padding included, so a zero tail goes on the
    wire as FF FF FF.
  * a reply echoes cmd ^ 0xFF in byte 1 and inverts its payload from byte 2.
  * 0x06 returns: vid:u16, model:u16, firmware:u32, flags:u8, level:u8, charging:u8 and
    then a second level/charging pair with the same values. Charging is 1 while the mouse
    is on the cable, 0 otherwise. The flags byte reads as the radio link state (0x09 on
    the dongle, 0x00 while wired).
  * **it must be re-asked for every attempt.** One request followed by repeated reads only
    ever returns the request itself (raw, then decoded, alternating) - the reference
    driver's "retry the read" advice is what makes this work here, and about one exchange
    in two carries a real answer anyway.
  * **the receiver only answers while the mouse itself is awake.** Asleep, it still answers
    the frame, but with an all-zero payload: measured here as eight seconds of zeros
    followed by the real 100% the moment the mouse was moved. It is the mouse's idle timer
    that decides, so a silent mouse is a normal state - keep the last value on a greyed-out
    icon, exactly like a Razer mouse that has gone idle, rather than calling it a fault.
  * the receiver also pushes a device-info notice on input report 0x13 (01 01 00 <level>
    02 03 06 <..> "M7 Ultra"), which independently reported the same level.

Also measured on the cable: the mouse answers on its own wired PID (5253:0031 - the same
number it reports as the model id) with the same collection and the same command, while
the receiver goes quiet, so the charging source wins and the icon stays single.

The G7 is a different chip on a different vendor id (A8A5:2255, 'YJX-CHIP', while the
0x5253 receivers are RealTek) and speaks a different protocol, worked out by @kek353 from
their own monitor and the HID dump in issue #8: a 65-byte output report starting
``00 55 30 A5 0B 2E 01 01 01``, answered by an input report starting ``AA 30`` whose byte 8
is the level and byte 9 the charging flag. Its vendor collections are 0xFFA5:0x88,
0xFF05:0x88 and 0xFF01:0x10; only the last one is written to, as in @kek353's monitor.
**Confirmed on @kek353's own G7** (issue #8): the probe answers
``aa 30 a5 0b 0a 01 01 01 2e 00 00 00``, so byte 8 = 0x2E = 46% and byte 9 = 0 while the
mouse sits on its dongle, and that level is the one their tool shows. On its cable the same
read answers ``aa 30 a5 3c 0a 01 01 01 2e 01 00 00`` (byte 9 = 1 while charging) with the
PID unchanged, so a G7 keeps a single icon the way the M7 Ultra does.

The 0x3837 family is the same protocol on MCHOSE's newer vendor id: the reference driver
"treats both identically" and matches on the vendor id plus the vendor collection rather
than by model list, which is what this provider does as well. The diagnostics in issue #4
(a MCHOSE A7 V2 Ultra, 3837:100b, RealTek strings, collections 0xFF0B:0x104 and
0xFF01:0x01 on interface 2) have exactly that shape, and the reference documents the status
read on the *short* 0x11 report, so both report ids are tried before a poll gives up.
Exception: A7 V3's 3837:1018 and 3837:1014 receivers share the collection but use
output report 0x4D and a different command set (OpenMouse's V3 codec). Its separate
read-only path below prefers FF01:0001 with confirmed 64-byte Windows buffers
for input/output report 4D, including the Ultra+ descriptor recovery below.
Only 1018 may use a uniquely proven FF0B:00C4 on the same USB parent when FF01 is
absent or definitively excludes 4D/64. It never falls back to a legacy exchange.
See the V3 source/license notes in upstream-protocols.md.
3837:600A is the V9 Turbo+ headset (mchose_headset); 3837:6008 is its lighting
device. Both are excluded before any mouse I/O (用户实机抓包，#61).

The first-generation A5 Pro Max (0x2023 - the 1K receiver F013, the 4K receiver F015 and the
wired mouse F019; issue #149) speaks a third exchange, taken from the community web driver
z750sasr/mchose-a5-pro-max-web-driver (MIT, whose transport the independent Klegus/mchose-macos
table agrees with for the same ids): 64-byte *feature* reports on the vendor collection, usage
page 0xFFFF preferred, report id 0. The request carries route 2 (mouse) at byte 2, its own
length 2 at byte 3, page 0 at byte 4 and command 0x83 at byte 5; the reply is the report read
back, starting with the 0xA1 marker and echoing page and command at its bytes 4 and 5, with
charging in byte 6 (non-zero) and the level in byte 7 - clamped to 100, exactly as the
reference clamps it. The reference writes once, waits its 34 ms, then reads back up to eight
times with one re-send in the middle; silent means the mouse is asleep. **Confirmed on the
reporter's hardware** (@Pekish992, #149): his run showed 22 % and then 25 % while charging,
matching the MCHOSE software and its charging animation. His diagnostics pinned the receiver
(2023:f013, product string 'MCHOSE A5 2.4G', vendor collections ffa0:0001 and ffff:0001 on
interface 1, ffff:0000 on interface 2); the 4K receiver and the wired ids are still untried.

Not verified: the 0x3837 family (the device in issue #4 is not here), other models, and the
meaning of the second level/charging pair in the 0x5253 reply (it has matched the first pair
in every reading so far).
"""
from __future__ import annotations

import re
import time
from typing import Dict, List, Optional, Tuple

import hid

from battery_hid import report_proof_summary
from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

# 0x5253 is the family measured here and keeps the plain icon key; 0x3837 is the newer
# MCHOSE vendor id the reference driver treats identically (issue #4's A7 V2 Ultra).
MEASURED_VID = 0x5253
MCHOSE_VIDS = (MEASURED_VID, 0x3837)

# Exact C-grade candidate. Source: M HUB's 100C -> 11/06 chain and
# OpenMouse 30d6ad37 V2 codec/transport, not a 100C hardware capture.
A5V2_VID, A5V2_PID = 0x3837, 0x100C
A5V2_NAME = "MCHOSE A5 V2 Ultra"
A5V2_ATTEMPTS, A5V2_TIMEOUT, A5V2_GAP = 20, 2.0, 0.09

# Read-only V3 subset, adapted 2026-11-04 from OpenMouse mouse-protocol
# 30d6ad37d0ecc9fff53f86d5058d67a88e07150d, src/mchose/v3.ts and
# src/drivers/mchose/v3-hid.ts (AGPL-3.0; see upstream-protocols.md).
# The upstream hardware capture is an Ultra+ sibling, not this Pro: level C.
V3_VID, V3_PID = 0x3837, 0x1018
V3_PIDS = {
    0x1018: "MCHOSE A7 V3 Pro (V3 8K 接收器)",
    0x1014: "MCHOSE A7 V3 Ultra+",  # Fallback; #276 verified this model, not every 1014.
}
V3_USAGE = (0xFF01, 0x0001)
V3_ALTERNATE_USAGE = (0xFF0B, 0x00C4)  # 1018 only; actual #493 placement unknown.
V3_REPORT_ID, V3_REPORT_LEN = 0x4D, 64  # includes the report ID; body is 63 bytes
V3_CMD_POWER = 0x0900
V3_TIMEOUT_MS = 1500                  # upstream observed deferred replies at ~1 s
V3_MAX_READS = 32

# model ids seen in the 0x06 reply (the receiver's own PID does not identify the mouse:
# 0x1020 is used by the M7 Ultra and by the L7 Pro)
MODEL_NAMES = {
    0x0031: "MCHOSE M7 Ultra",
}

# The G7: another chip (0xA8A5, 'YJX-CHIP') and another protocol, from @kek353's monitor
# and the HID dump in issue #8 - see the module docstring. Unverified: no device here.
G7_VID = 0xA8A5
G7_PID = 0x2255
G7_REQUEST = bytes([0x00, 0x55, 0x30, 0xA5, 0x0B, 0x2E, 0x01, 0x01, 0x01]).ljust(65, b"\x00")
G7_HEADER = b"\xaa\x30"
G7_LEVEL_BYTE = 8
G7_CHARGE_BYTE = 9
G7_READS = 25                 # a non-blocking read loop, ~0.5 s at G7_READ_GAP
G7_READ_GAP = 0.02

# The first-generation A5 Pro Max: a third exchange on vendor id 0x2023 (see the module
# docstring). One icon for the mouse whether it sits on a dongle or on its cable.
A5_VID = 0x2023
A5_PIDS = {
    0xF013: "MCHOSE A5 Pro Max (1K receiver)",
    0xF015: "MCHOSE A5 Pro Max (4K receiver)",
    0xF019: "MCHOSE A5 Pro Max (wired)",
}
A5_USAGE_PAGE = 0xFFFF        # the page the reference prefers
A5_REPORT_ID = 0x00           # what both references report on Windows
A5_PAGE = 0x00
A5_CMD_BATTERY = 0x83
A5_ROUTE = 0x02               # 2 = mouse-level commands (1 = pairing, 0 = receiver-local)
A5_LEN = 2                    # the request's own length announcement
A5_READS = 8                  # the reference's bounded response loop
A5_RESEND_AT = 3              # it re-sends once per loop
A5_WRITE_PAUSE = 0.034        # ... and waits its own 34 ms after a write
A5_READ_GAP = 0.03

CONFIG_PAGE = 0xFF01          # the only collection that answers
SHORT_REPORT = 0x11
LONG_REPORT = 0x12
SHORT_LEN = 20                # payload bytes on 0x11, 64 on 0x12 (the frame adds the id)
LONG_LEN = 64
CMD_STATUS = 0x06
CMD_BOND = 0x03

# The status read is documented on the short report and was also captured there on the M7
# Ultra, so it is tried first (cheaper: 21 bytes on the wire instead of 65); the long
# report is the channel this provider polled on before, kept as the fallback.
CHANNELS = ((SHORT_REPORT, SHORT_LEN), (LONG_REPORT, LONG_LEN))

# Re-ask rather than re-read (see the module docstring): the real answer normally arrives
# on the second exchange. An awake mouse answers within a couple of exchanges; a sleeping
# one answers nothing at all, so a long budget would only slow the poll down.
ATTEMPTS = 4
ATTEMPT_GAP = 0.12

# how long a silent mouse keeps its (greyed-out) icon before it is hidden, s
ASLEEP_KEEP = 300


def _invert(data: bytes) -> bytes:
    return bytes(b ^ 0xFF for b in data)


def make_request(cmd: int, report: int = LONG_REPORT, length: int = 64) -> bytes:
    """A request frame: report id, then cmd and a zero tail, all payload bytes inverted."""
    body = bytes([cmd]).ljust(length, b"\x00")[:length]
    return bytes([report]) + _invert(body)


def parse_status(resp) -> Optional[Tuple[int, int, int, int]]:
    """(level, charging, model, flags) from a status reply, or None if it is not one.

    The same buffer answers with all zeros, or with the request echoed back, between real
    answers, so a reply counts only when it echoes cmd ^ 0xFF *and* its payload carries a
    MCHOSE vid *and* the level is in range.
    """
    if not resp or len(resp) < 13:
        return None
    r = list(resp)
    if r[0] not in (SHORT_REPORT, LONG_REPORT) or r[1] != (CMD_STATUS ^ 0xFF):
        return None
    pay = _invert(bytes(r[2:]))
    if len(pay) < 11:
        return None
    vid = int.from_bytes(pay[0:2], "little")
    if vid not in MCHOSE_VIDS:
        return None
    model = int.from_bytes(pay[2:4], "little")
    flags, level, charge = pay[8], pay[9], pay[10]
    if level > 100:
        return None
    return level, charge, model, flags


def parse_g7(resp) -> Optional[Tuple[int, bool]]:
    """(level, charging) from a G7 reply, or None if it is not one.

    Layout from @kek353's monitor and the HID dump in issue #8: the frame starts AA 30,
    the level is byte 8 and the charging flag byte 9. Confirmed on @kek353's G7, on the
    dongle and on its cable: `aa 30 a5 0b 0a 01 01 01 2e 00 00 00` (46%, not charging) and
    `aa 30 a5 3c 0a 01 01 01 2e 01 00 00` (46%, charging). Only the two-byte AA 30 header is
    relied on - byte 3 differs between those two (0x0b against 0x3c) - and the same PID
    (A8A5:2255) on the same 0xFF01 collection answers either way, which is what keeps one
    icon for a G7 on its dongle and on its cable. An out-of-range level is refused rather
    than reported as a made-up number.
    """
    if not resp or len(resp) <= G7_CHARGE_BYTE:
        return None
    r = bytes(resp)
    if not r.startswith(G7_HEADER):
        return None
    level = r[G7_LEVEL_BYTE]
    if level > 100:
        return None
    return level, bool(r[G7_CHARGE_BYTE])


def make_a5_request() -> List[int]:
    """The reference's frame: its report id 0, then route 2 / length 2 / page 0 / 0x83.

    hidapi wants the report id as the first byte, so the reference's own payload - route
    at its byte 2, length at 3, page at 4, command at 5 - sits one byte in.
    """
    frame = [0x00, 0x00, 0x00, A5_ROUTE, A5_LEN, A5_PAGE, A5_CMD_BATTERY]
    return frame + [0x00] * 58


def parse_a5(resp) -> Optional[Tuple[int, bool]]:
    """(level, charging) from the A5's reply, or None.

    The reply starts with the 0xA1 marker (hidapi may keep the report id in front of it)
    and echoes page and command; charging is byte 6, the level byte 7, clamped to 100 the
    way the reference clamps it.
    """
    if not resp or len(resp) < 9:
        return None
    r = bytes(resp)
    at = 0 if r[0] == 0xA1 else (1 if r[1] == 0xA1 else None)
    if at is None or len(r) < at + 8:
        return None
    if r[at + 4] != A5_PAGE or r[at + 5] != A5_CMD_BATTERY:
        return None
    return min(100, r[at + 7]), r[at + 6] > 0


def device_key(vid: int, pid: int) -> str:
    """One icon per device: the dongle and the cable of the same mouse share a key.

    Only the family measured here (0x5253) keeps the plain "mchose" key it has always
    used, so an existing icon does not move. Anything else gets a key of its own - the
    G7's 0xA8A5, and the newer 0x3837 receivers (the A7 V2 Ultra in issue #4) - which is
    what keeps two MCHOSE devices on one machine off a single shared icon.
    """
    if (vid, pid) == (A5V2_VID, A5V2_PID) or vid == V3_VID and pid in V3_PIDS:
        return f"mchose:{vid:04x}:{pid:04x}"
    return "mchose" if vid == MEASURED_VID else f"mchose:{vid:04x}"


def make_v3_request() -> bytes:
    """Only readDeviceInfo: version/flags/length/cmd LE/biz/sequence/XOR."""
    return bytes([V3_REPORT_ID, 1, 1, 0, 0, 9, 0, 0, 8]).ljust(V3_REPORT_LEN, b"\x00")


def v3_ultra_windows_report_candidate(info):
    """Match the Ultra+ layout whose reconstructed descriptor repeats Input 4D."""
    if ((info.get("vendor_id"), info.get("product_id")) != (V3_VID, V3_PID)
            or (info.get("usage_page"), info.get("usage")) != V3_USAGE
            or info.get("interface_number") != 2
            or (info.get("product_string") or "").strip() != V3_PIDS[0x1014]
            or (info.get("input_report_length"), info.get("output_report_length"))
            != (V3_REPORT_LEN, V3_REPORT_LEN)
            or info.get("report_descriptor_error") != "collection maximum mismatch"):
        return False
    # Windows hidapi reconstructs two 63-byte Input items for the same 4D
    # array. Their sum is 127 bytes with the report ID, while HidP reports 64.
    report_id = str(V3_REPORT_ID)
    declared = info.get("declared_report_sizes")
    if not isinstance(declared, dict):
        return False
    input_declaration = declared.get("input")
    output_declaration = declared.get("output")
    output_sizes = info.get("output_report_sizes")
    return (info.get("input_report_sizes") is None
            and isinstance(input_declaration, dict)
            and input_declaration.get(report_id) == 2 * V3_REPORT_LEN - 1
            and isinstance(output_declaration, dict)
            and output_declaration.get(report_id) == V3_REPORT_LEN
            and (output_sizes is None or isinstance(output_sizes, dict)
                 and output_sizes.get(report_id) == V3_REPORT_LEN))


def parse_v3(resp) -> Optional[Tuple[int, bool]]:
    """Validate a full hidapi input frame, then return current power only.

    Flags 1 carries XOR over frame[2:8+length]; flags 0 is checksum-free in
    the upstream codec. Unknown flags are refused here. The payload's PID is
    not a reliable model ID and is deliberately not used to name the mouse.
    Link-down, busy, refusal and malformed replies cannot refresh a reading.
    """
    if not resp or len(resp) != V3_REPORT_LEN:
        return None
    r = bytes(resp)
    if r[:2] != bytes([V3_REPORT_ID, 1]) or r[2] not in (0, 1):
        return None
    if int.from_bytes(r[4:6], "little") != V3_CMD_POWER:
        return None
    size = r[3]
    end = 8 + size
    if size < 14 or end + (r[2] == 1) > len(r):
        return None
    if r[2] == 1:
        checksum = 0
        for value in r[2:end]:
            checksum ^= value
        if r[end] != checksum:
            return None
    data = r[8:end]
    if int.from_bytes(data[:2], "little") != V3_VID or data[10] == 0 or data[12] > 100:
        return None
    return data[12], bool(data[11])


def _a5v2_path(path):
    if isinstance(path, bytes):
        try:
            path = path.decode("ascii")
        except UnicodeDecodeError:
            return None
    if (not isinstance(path, str)
            or re.fullmatch(r"\\\\\?\\hid#vid_3837&pid_100c(?:&[a-z0-9_]+)*#[^\\\s]+", path, re.I) is None):
        return None
    return path.lower()


def make_a5v2_request(length):
    """20 inverted logical body bytes, then untouched zero padding, plus ID."""
    if type(length) is not int or length not in (21, 65):
        raise ValueError("A5V2 length unproven")
    return b"\x11\xf9" + b"\xff" * 19 + b"\x00" * (length - 21)


def parse_a5v2(resp, length):
    """Only the 11 meaningful bytes, retaining firmware/flags for stability.

    The PID is the mouse's own, not necessarily the receiver's. flags=09 is
    valid in the upstream A7 41% fixture despite its decoded connected bit.
    Charge nonzero -> bool is upstream design, unverified on the target.
    """
    if not isinstance(resp, (bytes, bytearray, list, tuple)) or len(resp) != length:
        return None
    try:
        raw = bytes(resp)
    except (TypeError, ValueError):
        return None
    if raw[:2] != b"\x11\xf9":
        return None
    payload = _invert(raw[2:13])
    if (len(payload) != 11 or not any(payload)
            or int.from_bytes(payload[:2], "little") != A5V2_VID
            or int.from_bytes(payload[2:4], "little") == 0 or payload[9] > 100):
        return None
    return payload


class MchoseProvider(Provider):
    name = "mchose"

    def __init__(self):
        self._diag: List[str] = []
        self._v3_diag: List[str] = []
        self._a5v2_diag: List[str] = []
        self._last: Dict[str, Tuple[int, bool, float]] = {}
        self._names: Dict[str, str] = {}
        self._models: Dict[str, int] = {}

    def _read_collection(self, path: bytes) -> Optional[Tuple[int, int, int, int]]:
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"    open: {e}")
            return None
        try:
            for report, length in CHANNELS:
                # re-ask before every read (see the module docstring): one request
                # followed by repeated reads only ever returns the request itself.
                req = make_request(CMD_STATUS, report=report, length=length)
                for attempt in range(ATTEMPTS):
                    try:
                        dev.send_feature_report(req)
                    except (OSError, ValueError) as e:
                        self._diag.append(f"    send on report {report:#04x}: {e}")
                        break
                    time.sleep(ATTEMPT_GAP)
                    try:
                        resp = dev.get_feature_report(report, length + 1)
                    except (OSError, ValueError):
                        continue                  # the receiver answers with "read error"
                    got = parse_status(resp)      # until it has the value from the mouse
                    if got:
                        self._diag.append(f"    answered on report {report:#04x}, attempt "
                                          f"{attempt + 1}: {hexdump(resp, 16)}")
                        return got
                self._diag.append(f"    no fresh reply to 0x06 on report {report:#04x}")
            return None
        finally:
            try:
                dev.close()
            except Exception:
                pass

    def _read_g7(self, path: bytes) -> Optional[Tuple[int, bool]]:
        """The G7's own protocol: one output report, then wait for an AA 30 input report.

        @kek353's monitor writes the request once and reads until the answer turns up
        (non-blocking, in a loop), so that is what this does - with a bounded budget and
        a sleep between reads instead of a spin. Unverified against the hardware.
        """
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"    open: {e}")
            return None
        try:
            try:
                dev.set_nonblocking(True)
            except Exception:                       # pragma: no cover
                pass
            try:
                dev.write(G7_REQUEST)
            except (OSError, ValueError) as e:
                self._diag.append(f"    write: {e}")
                return None
            for _ in range(G7_READS):
                time.sleep(G7_READ_GAP)
                try:
                    resp = dev.read(64)
                except (OSError, ValueError):
                    continue
                got = parse_g7(resp)
                if got:
                    self._diag.append(f"    AA 30 answer: {hexdump(resp, 12)}")
                    return got
            self._diag.append("    no AA 30 answer")
            return None
        finally:
            try:
                dev.close()
            except Exception:
                pass

    def _read_a5(self, path: bytes) -> Optional[Tuple[int, bool]]:
        """The A5 Pro Max's feature-report exchange, run as the reference runs it: write
        once, wait, then read back up to eight times with one re-send in the middle. The
        mouse only answers while awake, so a silent run reads as no level.
        """
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._diag.append(f"    open: {e}")
            return None
        try:
            try:
                dev.send_feature_report(make_a5_request())
            except (OSError, ValueError) as e:
                self._diag.append(f"    send: {e}")
                return None
            time.sleep(A5_WRITE_PAUSE)
            for attempt in range(A5_READS):
                if attempt == A5_RESEND_AT:
                    try:
                        dev.send_feature_report(make_a5_request())
                    except (OSError, ValueError) as e:
                        self._diag.append(f"    send: {e}")
                        return None
                    time.sleep(A5_WRITE_PAUSE)
                try:
                    resp = dev.get_feature_report(A5_REPORT_ID, 65)
                except (OSError, ValueError):
                    resp = None
                got = parse_a5(resp) if resp else None
                if got:
                    self._diag.append(f"    answer (attempt {attempt + 1}): "
                                      f"{hexdump(resp, 12)}")
                    return got
                time.sleep(A5_READ_GAP)
            self._diag.append("    no A1 answer (mouse asleep?)")
            return None
        finally:
            try:
                dev.close()
            except Exception:
                pass

    def _note_v3(self, message):
        # Public reader health gets only these protocol-owned messages, never
        # the legacy logs' paths, product strings, payloads or exception text.
        self._v3_diag.append(message)
        self._diag.append(message)

    def reader_diagnostics(self):
        return list(self._v3_diag) + list(self._a5v2_diag)

    def _note_a5v2(self, code):
        # Protocol-owned fixed codes only; no paths, names, frames or errors.
        message = "A5V2 " + code
        self._a5v2_diag.append(message)
        self._diag.append(message)

    def _pick_a5v2(self, ifaces):
        if not ifaces:
            self._note_a5v2("topology_unproven")
            return None
        proof = ifaces[0].get("a5v2_topology")
        parent = ifaces[0].get("physical_id")
        paths = [_a5v2_path(d.get("path")) for d in ifaces]
        if (not isinstance(proof, dict) or not isinstance(parent, str)
                or re.fullmatch(r"pnp:usb\\vid_3837&pid_100c(?:&rev_[0-9a-f]{4})?\\[^\\\s]+", parent, re.I) is None
                or any(p is None for p in paths) or len(paths) != len(set(paths))
                or proof.get("paths") != sorted(paths) or proof.get("parent") != parent
                or any(type(d.get("vendor_id")) is not int or type(d.get("product_id")) is not int
                       or (d["vendor_id"], d["product_id"]) != (A5V2_VID, A5V2_PID)
                       or not isinstance(d.get("product_string"), str)
                       or d["product_string"].strip() != A5V2_NAME
                       or d.get("physical_id") != parent or d.get("a5v2_topology") != proof
                       or d.get("a5v2_descriptor_complete") is not True
                       or any(type(d.get(f)) is not int or d[f] <= 0 for f in ("usage_page", "usage"))
                       for d in ifaces)):
            self._note_a5v2("topology_unproven")
            return None
        cols = [d for d in ifaces if (d["usage_page"], d["usage"]) == (0xFF01, 1)]
        if len(cols) != 1 or proof.get("collection") != _a5v2_path(cols[0]["path"]):
            self._note_a5v2("collection_ambiguous")
            return None
        info = cols[0]
        maximum, sizes = info.get("feature_report_length"), info.get("feature_report_sizes")
        if (type(maximum) is not int or maximum not in (21, 65)
                or not isinstance(sizes, dict) or not sizes
                or any(not isinstance(k, str) or not k.isascii() or not k.isdecimal()
                       or len(k) > 3 or str(int(k)) != k or not 0 <= int(k) <= 255
                       or type(n) is not int or not 2 <= n <= maximum for k, n in sizes.items())
                or sizes.get("17") != maximum or max(sizes.values()) != maximum
                or info.get("feature_report_proof") != "caps"):
            self._note_a5v2("feature_unproven")
            return None
        return info

    def _read_a5v2(self, info):
        # A soft deadline cannot cancel a blocking native call. The existing
        # isolated worker's 7 s budget remains the hard containment boundary.
        deadline = time.monotonic() + A5V2_TIMEOUT
        previous, dev = None, None
        length = info["feature_report_length"]
        request = make_a5v2_request(length)
        try:
            dev = hid.device()
            dev.open_path(info["path"])
            for _ in range(A5V2_ATTEMPTS):
                if time.monotonic() >= deadline:
                    break
                written = dev.send_feature_report(request)
                if type(written) is not int or written != length:
                    self._note_a5v2("set_failed")
                    return None
                # Do not shorten the sourced 90 ms wait to fit another GET.
                if deadline - time.monotonic() < A5V2_GAP:
                    break
                time.sleep(A5V2_GAP)
                if time.monotonic() >= deadline:
                    break
                try:
                    response = dev.get_feature_report(0x11, length)
                except Exception:
                    previous = None
                    continue
                if time.monotonic() >= deadline:
                    break
                payload = parse_a5v2(response, length)
                if payload is None:
                    previous = None
                    continue
                if payload == previous:
                    self._note_a5v2("stable_reply_C_pending_hardware")
                    return payload[9], bool(payload[10])
                previous = payload
            self._note_a5v2("no_stable_reply")
        except Exception:
            self._note_a5v2("io_failed")
        finally:
            if dev is not None:
                try:
                    dev.close()
                except Exception:
                    pass
        return None

    @staticmethod
    def _v3_report_proven(info, direction, *, alternate=False):
        maximum = info.get(direction + "_report_length")
        sizes = info.get(direction + "_report_sizes")
        if (type(maximum) is not int or maximum != V3_REPORT_LEN
                or not isinstance(sizes, dict) or not sizes
                or any(type(n) is not int or not 2 <= n <= maximum for n in sizes.values())
                or sizes.get(str(V3_REPORT_ID)) != V3_REPORT_LEN):
            return False
        if alternate:
            declared = info.get("declared_report_sizes")
            return (all(isinstance(key, str) and key.isascii() and key.isdecimal()
                        and len(key) <= 3 and str(int(key)) == key and 0 <= int(key) <= 255
                        for key in sizes)
                    and info.get(direction + "_report_proof") in ("caps", "descriptor")
                    and not info.get("report_descriptor_error")
                    and (declared is None or isinstance(declared, dict)
                         and declared.get(direction) == sizes))
        return True

    @staticmethod
    def _v3_primary_excludes_4d(info):
        # Maxima below 64 exclude the transport even when byte-array discovery
        # failed. Otherwise only a complete, consistent per-ID map can exclude
        # it. Missing maps at max 64, partial maps and contradictions are unknown.
        if info.get("report_descriptor_error") in (
                "collection maximum mismatch", "caps/descriptor disagreement"):
            return False
        excluded = False
        for direction in ("input", "output"):
            maximum = info.get(direction + "_report_length")
            sizes = info.get(direction + "_report_sizes")
            if type(maximum) is not int or not 2 <= maximum <= 4096:
                return False
            if sizes is not None:
                if (not isinstance(sizes, dict) or not sizes
                        or any(not isinstance(key, str) or not key.isascii() or not key.isdecimal()
                               or len(key) > 3 or str(int(key)) != key or not 0 <= int(key) <= 255
                               or type(n) is not int or not 2 <= n <= maximum
                               for key, n in sizes.items())
                        or max(sizes.values()) != maximum):
                    return False
                declared = info.get("declared_report_sizes")
                if declared is not None and (not isinstance(declared, dict)
                                             or declared.get(direction) != sizes):
                    return False
                excluded |= sizes.get(str(V3_REPORT_ID)) != V3_REPORT_LEN
            excluded |= maximum < V3_REPORT_LEN
        return excluded

    def _check_v3(self, info, *, alternate=False):
        collection = "; collection=" + ("FF0B:00C4" if alternate else "FF01:0001")
        if not info.get("path"):
            self._note_v3("V3 collection path unresolved" + collection + "; not opened; nothing sent")
            return None
        if (not alternate and info.get("v3_windows_report_confirmed") is True
                and v3_ultra_windows_report_candidate(info)):
            self._note_v3("V3 Windows input/output report 4D/64 confirmed" + collection)
            return info
        for direction in ("input", "output"):
            if not self._v3_report_proven(info, direction, alternate=alternate):
                self._note_v3("V3 " + direction + " report 4D/64 length unproven"
                              + collection
                              + report_proof_summary(
                                  info, direction,
                                  include_declared=isinstance(info.get("declared_report_sizes"), dict))
                              + "; not opened; nothing sent")
                return None
        for direction in ("input", "output"):
            self._note_v3("V3 " + direction + " report 4D/64 proven"
                          + collection
                          + report_proof_summary(info, direction))
        return info

    def _pick_v3(self, ifaces):
        cols = [d for d in ifaces if (d.get("usage_page"), d.get("usage")) == V3_USAGE]
        exact_1018 = bool(ifaces) and all(
            type(d.get("vendor_id")) is int and type(d.get("product_id")) is int
            and (d["vendor_id"], d["product_id"]) == (V3_VID, V3_PID) for d in ifaces)
        if len(cols) > 1 or not cols and not exact_1018:
            self._note_v3("V3 missing or ambiguous FF01:0001 collection; not opened; nothing sent")
            return None
        primary = cols[0] if cols else None
        if primary is not None:
            if (not primary.get("path")
                    or all(self._v3_report_proven(primary, d) for d in ("input", "output"))
                    or not exact_1018 or not self._v3_primary_excludes_4d(primary)):
                return self._check_v3(primary)

        # WebHID selects the device by its collection list, then sends by report
        # ID. Windows needs a single, independently proven collection binding.
        alternates = [d for d in ifaces
                      if (d.get("usage_page"), d.get("usage")) == V3_ALTERNATE_USAGE]
        if len(alternates) != 1:
            self._note_v3("V3 FF0B:00C4 missing or ambiguous; not opened; nothing sent")
            if primary is not None:
                self._check_v3(primary)
            else:
                self._note_v3("V3 missing or ambiguous FF01:0001 collection; not opened; nothing sent")
            return None
        info = alternates[0]
        parent = info.get("physical_id")
        path = info.get("path")
        if isinstance(path, bytes):
            try:
                path = path.decode("ascii")
            except UnicodeDecodeError:
                path = None
        if (not isinstance(parent, str)
                or re.fullmatch(r"pnp:usb\\vid_3837&pid_1018(?:&rev_[0-9a-f]{4})?\\[^\\\s]+",
                                parent, re.I) is None
                or any(d.get("physical_id") != parent for d in ifaces)
                or not isinstance(path, str)
                or re.fullmatch(r"\\\\\?\\hid#vid_3837&pid_1018(?:&[a-z0-9_]+)*#[^\\\s]+",
                                path, re.I) is None
                or any(type(info.get(field)) is not int for field in ("usage_page", "usage"))):
            self._note_v3("V3 FF0B:00C4 USB parent/path unproven or inconsistent; not opened; nothing sent")
            if primary is None:
                self._note_v3("V3 missing or ambiguous FF01:0001 collection; not opened; nothing sent")
            else:
                self._check_v3(primary)
            return None
        self._note_v3("V3 FF01:0001 " + ("excludes 4D/64" if primary is not None else "absent")
                      + "; considering FF0B:00C4")
        return self._check_v3(info, alternate=True)

    def _read_v3(self, path: bytes) -> Optional[Tuple[int, bool]]:
        """One power query per poll; ignore unrelated input within a bounded wait."""
        dev = hid.device()
        try:
            dev.open_path(path)
            if dev.write(make_v3_request()) != V3_REPORT_LEN:
                self._note_v3("V3 power query write failed or short; no retry")
                return None
            deadline = time.monotonic() + V3_TIMEOUT_MS / 1000
            for _ in range(V3_MAX_READS):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                resp = dev.read(V3_REPORT_LEN, max(1, int(remaining * 1000)))
                if not resp:
                    break
                got = parse_v3(resp)
                if got is not None:
                    self._note_v3("V3 valid power reply")
                    return got
            self._note_v3("no valid V3 power reply; no legacy fallback")
        except (OSError, ValueError):
            self._note_v3("V3 power I/O failed; no legacy fallback")
        finally:
            try:
                dev.close()
            except Exception:
                pass
        return None

    def poll(self) -> List[DeviceStatus]:
        """One icon per device, whether it is on the dongle, on the cable or on radio."""
        self._diag = []
        self._v3_diag = []
        self._a5v2_diag = []
        # Candidate failures/absence never publish an old candidate value.
        # Other MCHOSE models retain their original sleep/cache policy.
        self._last.pop(device_key(A5V2_VID, A5V2_PID), None)
        infos: List[dict] = []
        for vid in MCHOSE_VIDS + (G7_VID, A5_VID):
            try:
                infos += hidlist.enumerate(vid)
            except Exception as e:  # pragma: no cover
                log.warning("hid.enumerate(mchose): %s", e)
        if not infos:
            return []

        # group the collections of one receiver (or one mouse) together, per vendor id:
        # a G7 and an M7 Ultra on one machine are two devices and get two icons
        groups: Dict[Tuple[int, int], List[dict]] = {}
        for d in infos:
            identity = (d["vendor_id"], d["product_id"])
            # A path advertising 100C with inconsistent attrs is quarantined
            # here too; it must not accidentally reach another legacy group.
            if _a5v2_path(d.get("path")) is not None:
                identity = (A5V2_VID, A5V2_PID)
            groups.setdefault(identity, []).append(d)

        found: Dict[str, List[Tuple[int, bool, int, int]]] = {}   # key -> readings
        for (vid, pid), ifaces in groups.items():
            if (vid, pid) == (A5V2_VID, A5V2_PID):
                key = device_key(A5V2_VID, A5V2_PID)
                self._names[key] = A5V2_NAME
                info = self._pick_a5v2(ifaces)
                got = self._read_a5v2(info) if info is not None else None
                if got is not None:
                    found.setdefault(key, []).append((got[0], got[1], A5V2_PID, 0))
                continue  # Exclusive, including failure: no legacy/CFU/12.
            if vid == 0x3837 and pid in (0x600A, 0x6008):
                reason = ("V9 Turbo+ headset reserved for mchose_headset" if pid == 0x600A
                          else "V9 Turbo lighting device; no battery reader")
                self._diag.append(f"[MCHOSE] {vid:04x}:{pid:04x} {reason}; no mouse commands sent")
                continue
            if vid == 0x3837 and pid in (0x1015, 0x3033):
                # Keyboard/shared keyboard PIDs never receive mouse probes,
                # including when the strict keyboard reader rejects their caps.
                self._diag.append("[MCHOSE] keyboard identity reserved; no mouse commands sent")
                continue
            key = device_key(vid, pid)
            if vid == V3_VID and pid in V3_PIDS:
                self._note_v3(f"[MCHOSE] 3837:{pid:04x} V3 power reader (C / 待实机验证)")
                self._names[key] = next(((d.get("product_string") or "").strip()
                                         for d in ifaces if (d.get("product_string") or "").strip()),
                                       V3_PIDS[pid] if pid == 0x1014 else "MCHOSE V3 8K 接收器")
                info = self._pick_v3(ifaces)
                if info is None:
                    self._last.pop(key, None)
                    continue
                got_v3 = self._read_v3(info["path"])
                if got_v3 is not None:
                    found.setdefault(key, []).append((got_v3[0], got_v3[1], pid, 0))
                continue  # V3 never scans siblings or calls any legacy protocol.
            product = (ifaces[0].get("product_string") or "").strip()
            if product:
                self._names[key] = product
            if vid == G7_VID and pid != G7_PID:
                # 0xA8A5 is a chip maker's vendor id ("YJX-CHIP"), not a model, so other
                # devices can sit behind it. The G7 request was captured from the G7 only,
                # and nothing is written to a device that is not it - not even the
                # collection scan, because that is what produced the capture's traffic.
                self._diag.append(f"[MCHOSE] vid={vid:04x} pid={pid:04x} product='{product}': "
                                  f"not the G7 ({G7_PID:04x}), leaving it alone")
                continue
            if vid == A5_VID and pid not in A5_PIDS:
                # only the three A5 Pro Max identities are claimed; another 0x2023 model
                # does not get this request written to it
                self._diag.append(f"[MCHOSE] vid={vid:04x} pid={pid:04x} product='{product}': "
                                  f"not an A5 Pro Max identity, leaving it alone")
                continue
            cols = [d for d in ifaces if (d.get("usage_page") or 0) >= 0xFF00]
            if vid == G7_VID:
                # the G7 answers on 0xFF01 only; the other vendor collections are left
                # alone (nothing off the documented path is written to)
                cols = [d for d in cols if (d.get("usage_page") or 0) == CONFIG_PAGE]
            elif vid == A5_VID:
                # The A5 reference opens its 0xFFFF page only; 0xFFA0 next to it is
                # never where the answer comes from, so it is not written to at all
                # (the G7's rule; review by @ahmedkhursheed23).
                cols = [d for d in cols if (d.get("usage_page") or 0) == A5_USAGE_PAGE]
            else:
                # the configuration collection first; 0xFF0B is dead on the M7 Ultra
                cols.sort(key=lambda d: (d.get("usage_page") != CONFIG_PAGE, d.get("usage") != 1))
            if not cols:
                self._diag.append(f"[MCHOSE] vid={vid:04x} pid={pid:04x} product='{product}': "
                                  "no vendor collection")
                continue
            for d in cols:
                self._diag.append(f"[MCHOSE] vid={vid:04x} pid={pid:04x} product='{product}' "
                                  f"iface={d.get('interface_number')} "
                                  f"usage={(d.get('usage_page') or 0):04x}:"
                                  f"{(d.get('usage') or 0):04x}")
                if vid == G7_VID:
                    got_g7 = self._read_g7(d["path"])
                    if got_g7:
                        found.setdefault(key, []).append((got_g7[0], got_g7[1], pid, 0))
                elif vid == A5_VID:
                    got_a5 = self._read_a5(d["path"])
                    if got_a5:
                        found.setdefault(key, []).append((got_a5[0], got_a5[1], pid, 0))
                else:
                    got = self._read_collection(d["path"])
                    if got:
                        self._models[key] = got[2]
                        found.setdefault(key, []).append((got[0], bool(got[1]), pid, got[2]))
                if found.get(key):
                    break

        out: List[DeviceStatus] = []
        for key, readings in found.items():
            # a wired mouse may be silent on the radio: prefer whichever source reports
            # charging, and one icon either way
            readings.sort(key=lambda r: (not r[1],))
            level, charge, pid, model = readings[0]
            if key != device_key(A5V2_VID, A5V2_PID):
                self._diag.append(f"  -> {key} pid={pid:04x}"
                                  + (f" model=0x{model:04x}" if model else "")
                                  + f": {level}%{' (charging)' if charge else ''}")
            self._last[key] = (level, charge, time.time())
            out.append(DeviceStatus(key, self._display_name(key), level, charge, True,
                                    "mchose", kind="mouse"))

        # silent: a receiver cannot tell a switched-off mouse from one that went to sleep
        # a few seconds ago, so keep the last value greyed out for a while
        now = time.time()
        for key, last in self._last.items():
            if key in found or now - last[2] >= ASLEEP_KEEP:
                continue
            out.append(DeviceStatus(key, self._display_name(key), last[0], last[1],
                                    False, "mchose", kind="mouse"))
        return out

    def _display_name(self, key: str) -> str:
        """A measured model id first, then the device's own product string.

        The id in the reply names the model on the family measured here (0x0031 is the M7
        Ultra, the same number it uses as its wired PID), but it is a per-model number
        that is not listed per device anywhere, so a model this table does not know is
        named from the receiver's product string: for the A7 V2 Ultra in issue #4 that
        reads "MCHOSE A7 V2 Ultra", the name on the box.
        """
        model = self._models.get(key)
        if model and model in MODEL_NAMES:
            return MODEL_NAMES[model]
        name = (self._names.get(key) or "").strip()
        if name:
            return name
        if model:
            return f"MCHOSE mouse (0x{model:04x})"
        return "MCHOSE mouse"

    def diagnostics(self) -> List[str]:
        return list(self._diag)
