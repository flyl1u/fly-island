"""Pulsar, ATK, VXE, VGN and Hitscan mice over USB/HID, without vendor software.

MyFinder extension: unlisted ATK VID 373B devices may use protocol-family matching
(协议族匹配，未实测; level C). Only FF02:0002 with a known output length of exactly
17 bytes receives the existing power query. N9 headset IDs 1204/1262/12D6 are
excluded before collection/length probing. FF04/FF05 alone and unknown lengths
are not sufficient. Exact 373B:1216 uses the separate, descriptor-guarded
FF05 BITMOUSE reader below; it never enters the legacy FF02/DPI path.
DPI uses a separate exact allow-list below; the server keeps
native 373B:1278 excluded. Scyrox 3554:F517, VGN F2 Master+ 3554:FB56 and
VXE R1 SE 1K 3554:F58E also require FF02:0002 and exactly 17 output bytes;
they are pending hardware verification in this project. VGN F1 Moba F503
3554:F503 uses those same strict guards, based on Issue #592's user-supplied
95% reply; it remains C / pending maintainer hardware verification. VGN Dragonfly 4K
3554:F505 uses the same strict collection/length guards; the project maintainer
read 35%, not charging, 3766 mV on a VGN F1 Pro (VGN HUB: 36%) on 2026-11-05.
Charging transitions and sleep/wake remain untested. Other listed models retain
their original selection rules. See upstream-protocols.md for ID evidence.
Pulsar Link 8K 3710:5501 additionally requires descriptor-proven input/output
report 8, each exactly 17 bytes, on FF02:0002. Its web-driver parser requires
status zero and treats charging as exactly 1; only battery reads are enabled (C).

Protocol from andrewrabert/python-pulsar-mouse-tool, which also backs the
"HID: pulsar" driver in review for the Linux kernel and lists these ids:

  * 3554:f508  Pulsar X2 V2 Mini (1 kHz dongle)      3554:f507  the same mouse on the cable
  * 3554:f58f  ATK VXE R1 SE+ (wired)                373b:1085  ATK VXE R1 SE+ (2.4 GHz)
  * 3554:f58a  VXE R1 Pro Max (1 kHz dongle, #87)    3554:f58c  the same mouse on its cable
  * 3710:5406  Pulsar X2 CrazyLight Mini (2.4 GHz)   3710:3414  the same mouse on the cable
  * the Kysona M600 and the VXE Dragonfly R1 Pro use the same protocol (their ids are
    not in the tool, so they are not claimed here).

The cable id (3554:f58c) is claimed too, from the reporter's second report in #87: the
wired mouse lists the same eight collections as the receiver, and the panel below reads it
with the same command 0x04 frame. Both transports are confirmed on that reporter's
hardware - the receiver read the mouse's level, and on the cable the level agreed with
ATK's own panel (hub.atk.pro) and the charging flag followed the cable.

The ATK and Compx builds are also handled by the OpenMouse project's ATK/VXE panel
(@openmouse/protocol, drivers/atk): it lists 3554:f58a for the R1 Pro Max receiver
and 3554:f58c for the same mouse on its cable, and reads the battery with command
0x04, taking the level, the flag and the millivolts from the same three places this
file does. It also opens the collection with usage page 0xFF02 and usage 0x0002,
which is why that one is preferred below.

The same 17-byte framing is in G-Wolves' own web driver (mouse.xyz), which also handles
these Compx-based receivers: its get_Crc() is 0x55 minus the sum of the first fifteen
payload bytes, the result goes in byte 15, and the frame is sent with sendReport(8, ...) -
so the frame on the wire sums to 0x55, the rule this file uses. (Its battery read is for
the G-Wolves protocol; the level offsets here rest on the two sources above.)

The Hitscan Hyperlight speaks the same frame, on the same kind of vendor collection
(ff02:0002): sopparus/hitscan-battery mapped it from USBPcap captures of Hitscan Utility
1.0.2 in both cable (3770:0100) and receiver (3770:0200) mode and reads it with a plain
write()/read(), command 0x04, the level in byte 6, the flag in byte 7, checksum 0x55 minus
the sum. Its notes left byte 8 and byte 9 unresolved; across its captures those read
0x1129 (4393 mV) while charging and 0x1073 (4211 mV) on battery - the big-endian millivolt
field this file already reads. Its own warning also applies: the vendor application's
battery indicator is broken (it showed 100 % while the device answered 75), so the raw
byte is the truth, which is what this file reports.

A mouse that is idle stops answering - the receiver goes quiet a few seconds after the
last movement, and the wired collection does the same while the mouse sits on its
cable - so a silent poll is a normal state and not a device that went away. The last
reading is kept greyed out for as long as the mouse's receiver stays in the USB tree,
however long the mouse sleeps, and it refreshes at the first poll the mouse answers
again; only a receiver that leaves the tree drops the device, icon included. #87
first showed the icon vanishing around the mouse's cable, then that after the mouse's
own deep stop-mode (10-15 idle minutes) the reading took a long time to come back; a
later screen-off report showed that dropping the icon also cost it its tray position
(Windows puts a re-created icon at a new spot), so the greyed value no longer
expires on a timer.

Frames are 17 bytes, big-endian, report id 0x08:

    [0] 0x08      header, which is also the report id
    [1] command   0x04 = power details
    [2..15]        arguments, zero for a power query
    [16] checksum 0x55 - the sum of bytes 0..15, mod 256

A power reply carries the level in byte 6, the power flag in byte 7 (the mouse is on
its cable) and millivolts big-endian in bytes 8-9. The same endpoint also pushes
events (command 0x0a), so a reply is only accepted when the header and the checksum
both check out, the command is the one we asked for, and the level is 0..100.
"""
from __future__ import annotations

import ctypes
import hashlib
import json
import re
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import hid

from battery_hid import BatteryHidProvider
from . import hidlist
from .base import DeviceStatus, Provider, hexdump, log

CMD_POWER = 0x04
PAYLOAD_HEADER = 0x08
PAYLOAD_LEN = 17
CHECKSUM_BASE = 0x55

LEVEL_INDEX = 6
POWER_INDEX = 7
VOLTAGE_SLICE = (8, 10)

CONTROL_INTERFACE = 1           # the tool reads its 17-byte replies on interface 1
CONTROL_USAGE = (0xFF02, 0x0002)   # the collection the OpenMouse ATK/VXE panel opens
LINK8K_ID = (0x3710, 0x5501)
# Exact N9 identities use serial/Bolutek, never the broad ATK mouse fallback.
ATK_HEADSET_PIDS = {0x1204, 0x1262, 0x12D6}


class _HIDP_CAPS(ctypes.Structure):
    """The part of HIDP_CAPS this file needs (same shape as providers/gwolves.py)."""
    _fields_ = [("Usage", ctypes.c_ushort), ("UsagePage", ctypes.c_ushort),
                ("InputReportByteLength", ctypes.c_ushort),
                ("OutputReportByteLength", ctypes.c_ushort),
                ("FeatureReportByteLength", ctypes.c_ushort),
                ("Reserved", ctypes.c_ushort * 17),
                ("NumberLinkCollectionNodes", ctypes.c_ushort),
                ("NumberInputButtonCaps", ctypes.c_ushort),
                ("NumberInputValueCaps", ctypes.c_ushort),
                ("NumberInputDataIndices", ctypes.c_ushort),
                ("NumberOutputButtonCaps", ctypes.c_ushort),
                ("NumberOutputValueCaps", ctypes.c_ushort),
                ("NumberOutputDataIndices", ctypes.c_ushort),
                ("NumberFeatureButtonCaps", ctypes.c_ushort),
                ("NumberFeatureValueCaps", ctypes.c_ushort),
                ("NumberFeatureDataIndices", ctypes.c_ushort)]


def _query_output_length(path) -> Optional[int]:
    """OutputReportByteLength of one HID collection, or None when Windows does not
    say. The handle is opened with no access rights, so nothing is sent to the device."""
    if sys.platform != "win32":
        return None
    try:
        p = path.decode("utf-8", "ignore") if isinstance(path, (bytes, bytearray)) else str(path)
        k32, hidd = ctypes.windll.kernel32, ctypes.windll.hid
        k32.CreateFileW.restype = ctypes.c_void_p
        handle = k32.CreateFileW(p, 0, 3, None, 3, 0, None)   # no access, share r/w, open existing
        if handle in (None, ctypes.c_void_p(-1).value):
            return None
        try:
            pp = ctypes.c_void_p()
            if not hidd.HidD_GetPreparsedData(ctypes.c_void_p(handle), ctypes.byref(pp)):
                return None
            try:
                caps = _HIDP_CAPS()
                if hidd.HidP_GetCaps(pp, ctypes.byref(caps)) != 0x00110000:   # HIDP_STATUS_SUCCESS
                    return None
                return caps.OutputReportByteLength
            finally:
                hidd.HidD_FreePreparsedData(pp)
        finally:
            k32.CloseHandle(ctypes.c_void_p(handle))
    except Exception:            # a probe must never take the provider down
        return None


_CAPS: Dict[bytes, Optional[int]] = {}      # collection path -> output report length


def output_length(path) -> Optional[int]:
    """Cached _query_output_length. The paths change when a receiver is re-plugged,
    so the cache never outlives the collection it describes."""
    if path not in _CAPS:
        _CAPS[path] = _query_output_length(path)
    return _CAPS[path]


READ_ATTEMPTS = 4
READ_TIMEOUT_MS = 250
FLUSH_TIMEOUT_MS = 30

# vendor id -> product ids
PIDS: Dict[int, Dict[int, str]] = {
    0x3554: {
        0xF508: "Pulsar X2 V2 Mini (wireless)",
        0xF507: "Pulsar X2 V2 Mini (wired)",
        0xF58F: "ATK VXE R1 SE+ (wired)",
        0xF58A: "VXE R1 Pro Max (2.4 GHz)",
        0xF58C: "VXE R1 Pro Max (wired)",
        0xF517: "Scyrox 8K 接收器",  # 待实机验证; OpenMouse Scyrox report-8 family
        0xFB56: "VGN Dragonfly F2 Master+",  # 待实机验证; batch3 V2/V3
        0xF58E: "VXE R1 SE 1K 接收器",  # 待实机验证; OpenMouse ATK CompX PID
        0xF505: "VGN Dragonfly 4K Receiver",  # maintainer's VGN F1 Pro, 2026-11-05
        0xF503: "VGN F1 Moba F503",  # #592 user capture; C / 待实机验证
    },
    0x373B: {
        0x1085: "ATK VXE R1 SE+ (2.4 GHz)",
    },
    0x3770: {
        0x0200: "Hitscan Hyperlight (2.4 GHz)",
        0x0100: "Hitscan Hyperlight (wired)",
    },
    0x3710: {
        0x5406: "Pulsar X2 CrazyLight Mini (2.4 GHz)",
        0x3414: "Pulsar X2 CrazyLight Mini (wired)",
        0x5501: "Pulsar Link 8K Dongle",  # #134 + Pulsar web snapshot; 待实机验证
    },
}

# Separate from PIDS: that table's listed mice use the legacy CompX protocol.
NANO_PIDS = {0x373B: {0x1216: "ATK / VXE NANO receiver"}}


# Public projection of existing private-reader results, never free-form logs.
_NANO_READER_REASONS = {
    "NANO requires one proven input report: nothing sent": "NANO input report unproven",
    "NANO input report ID invalid: nothing sent": "NANO input report ID invalid",
    "missing or ambiguous eligible collection: nothing sent": "NANO collection missing or ambiguous",
    "report IDs/lengths unknown or incompatible: nothing sent": "NANO report IDs/lengths unproven",
    "physical parent unresolved; uniqueness unknown: nothing sent": "NANO physical parent unproven",
    "enumeration failed: nothing sent": "NANO enumeration failed",
    "short/failed battery query write; no retry": "NANO query write short/failed",
    "rejected input report length": "NANO input report length rejected",
    "rejected battery reply": "NANO battery reply rejected",
    "no valid reply within deadline/read limit; connection unknown": "NANO no valid battery reply",
    "battery I/O failed; connection unknown": "NANO battery I/O failed",
    "HID handle close failed": "NANO handle close failed",
}


def _nano_reader_reason(line):
    if not isinstance(line, str):
        return None
    # Only report-proof messages have a known suffix; discard it entirely.
    proof = "report IDs/lengths unknown or incompatible: nothing sent"
    if line.startswith(proof + ";"):
        return _NANO_READER_REASONS[proof]
    return _NANO_READER_REASONS.get(line)


def make_nano_request():
    # Output report 08 + 63-byte BITMOUSE payload; receiver target 01.
    # Checksum 7D = sum(72 02 00 01 07 01 + padding) modulo 256.
    return [0x08, 0x7D, 0x72, 0x02, 0x00, 0x01, 0x07, 0x01] + [0] * 56


def parse_nano_reply(reply, report_id):
    # WebHID delivers payload only; numbered hidapi input retains its ID.
    if report_id:
        if not reply or reply[0] != report_id:
            return None
        reply = reply[1:]
    # Same BITMOUSE readVersions path proves status 0 and declared data length.
    # The vendor does not check a response checksum or fixed first byte.
    if (not 7 <= len(reply) <= 63 or reply[1] != 0 or reply[4] != 0x07
            or not 1 <= reply[5] <= len(reply) - 6 or not 0 <= reply[6] <= 100):
        return None
    return reply[6], False, ""


class AtkNanoProvider(BatteryHidProvider):
    """Private BITMOUSE path owned by PulsarProvider; no CompX fallbacks.

    The upstream listener ignores input reportId. Require a sole proven input
    byte-array report instead of assuming that its ID equals output report 08.
    Each pick/query runs synchronously; input_id belongs to that selected path.
    """
    name = "pulsar"
    vid = 0x373B
    pids = NANO_PIDS[vid]
    collection = (0xFF05, 0x0001)
    output_id = 0x08
    output_bytes = 64
    input_bounds = (8, 64)  # 7 payload bytes minimum; local conservative ceiling.
    kind = "mouse"
    charging_known = False
    make_request = staticmethod(make_nano_request)

    def _pick(self, infos):
        candidates = [d for d in infos if d.get("vendor_id") == self.vid
                      and d.get("product_id") in self.pids
                      and (d.get("usage_page"), d.get("usage")) == self.collection]
        sizes = candidates[0].get("input_report_sizes") if len(candidates) == 1 else None
        if not isinstance(sizes, dict) or len(sizes) != 1:
            self._diag.append("NANO requires one proven input report: nothing sent")
            return None
        key = next(iter(sizes))
        if (not isinstance(key, str) or not re.fullmatch(r"0|[1-9][0-9]{0,2}", key)
                or int(key) > 255):
            self._diag.append("NANO input report ID invalid: nothing sent")
            return None
        self.input_id = int(key)
        return super()._pick(infos)

    def parse_reply(self, reply):
        return parse_nano_reply(reply, self.input_id)


# Exact IDs with strict descriptor guards, including the maintainer-tested F505.
# Unlike legacy entries, never fall back to a sibling or unknown-length path.
STRICT_COMPX_IDS = frozenset({(0x3554, 0xF517), (0x3554, 0xFB56), (0x3554, 0xF58E),
                             (0x3554, 0xF505), (0x3554, 0xF503)})

# Exact USB + live CID/MID gates, never the broad battery protocol-family gate.
# OpenMouse 30d6ad37d0ecc9fff53f86d5058d67a88e07150d; see upstream-protocols.md.
# (CID/MID, codec, stage base, row length, maximum stages)
DPI_MODELS = {
    (0x373B, 0x12A7): ((1, 62), "paw3955", 0x1B00, 6, 6),
    (0x3554, 0xF58C): ((2, 27), "step50", 0x000C, 4, 8),
    (0x3554, 0xF58F): ((2, 32), "paw3395se", 0x000C, 4, 8),
}
DPI_CACHE_SECONDS = 10 * 60
_SE_INVALID = frozenset((7, 13, 20, 26, 33, 40, 46, 53, 60, 66, 73, 80, 86, 93,
                       100, 106, 113, 120, 126, 133, 140, 146, 153, 160, 166,
                       173, 180, 186, 193, 200, 206, 213, 220, 226, 233))
_SE_CODES = tuple(code for code in range(1, 236) if code not in _SE_INVALID)


def _dpi_frame(command, address=0, length=0, data=()):
    if len(data) > 10:
        raise ValueError("dpi_payload_too_long")
    frame = [0x08, command, 0, address >> 8, address & 0xFF, length, *data]
    frame += [0] * (16 - len(frame))
    return frame + [checksum(frame)]


def _dpi_exchange(dev, command, address=0, length=2):
    # Flush stale replies/events, send this read once, then bound the receive loop.
    for _ in range(4):
        if not dev.read(PAYLOAD_LEN, FLUSH_TIMEOUT_MS):
            break
    frame = _dpi_frame(command, address, length if command == 0x08 else 0)
    if dev.write(frame) != PAYLOAD_LEN:
        raise ValueError("dpi_read_failed")
    deadline = time.monotonic() + .5
    for _ in range(16):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        reply = list(dev.read(PAYLOAD_LEN, max(1, int(remaining * 1000))))
        commands = (0x07, 0x08) if command == 0x08 else (command,)
        if (len(reply) == PAYLOAD_LEN and reply[0] == 0x08 and reply[1] in commands
                and reply[2] == 0 and reply[16] == checksum(reply[:16])
                and reply[3:5] == [address >> 8, address & 0xFF]
                and length <= reply[5] <= 10):
            return reply[6:6 + length]
        if not reply:
            break
    raise ValueError("dpi_invalid_reply")


def _dpi_system(data, maximum):
    if (len(data) != 6 or any((data[i] + data[i + 1]) % 256 != 0x55 for i in (0, 2, 4))
            or not 1 <= data[2] <= maximum or not 0 <= data[4] < data[2]):
        raise ValueError("dpi_invalid_system")
    return data[2], data[4]


def _dpi_stage(data, codec):
    length = 6 if codec == "paw3955" else 4
    if len(data) != length or sum(data) % 256 != 0x55:
        raise ValueError("dpi_invalid_stage")
    if codec == "paw3955":
        axes = [(data[0] + (data[1] << 8) + 1) * (2 if data[4] & 1 else 1),
                (data[2] + (data[3] << 8) + 1) * (2 if data[4] & 0x10 else 1)]
        maximum = 40000
    else:
        axes = []
        for byte, nibble in ((data[0], data[2] & 15), (data[1], data[2] >> 4)):
            if codec == "paw3395se":
                if nibble & ~2 or byte not in _SE_CODES:
                    raise ValueError("dpi_invalid_stage")
                value = (_SE_CODES.index(byte) + 1) * 50
                if nibble & 2:
                    if value <= 5000:
                        raise ValueError("dpi_invalid_stage")
                    value *= 2
            else:
                value = (byte + (((nibble >> 2) & 3) << 8) + 1) * 50
                if nibble & 1:
                    value *= 2
            axes.append(value)
        maximum = 18000 if codec == "paw3395se" else 30000
    if any(not 50 <= value <= maximum for value in axes):
        raise ValueError("dpi_invalid_stage")
    return axes


def _dpi_eligible(info):
    return ((info.get("vendor_id"), info.get("product_id")) in DPI_MODELS
            and info.get("modelSource", info.get("model_source")) != "pack"
            and (info.get("usage_page"), info.get("usage")) == CONTROL_USAGE
            and isinstance(info.get("physical_id"), str) and bool(info["physical_id"])
            and not re.search(r"\b(?:nearlink|nk)\b", info.get("product_string") or "", re.I)
            and (info["vendor_id"] != 0x3554 or not re.search(
                r"receiver|dongle", info.get("product_string") or "", re.I)))


def _dpi_token(target):
    identity = dict(target)
    path = identity.get("path")
    if isinstance(path, bytes):
        identity["path"] = path.hex()
    return hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _dpi_view(target, active, error=None):
    axes = target["stages"]
    stages = [pair[0] for pair in axes]
    # The generic value-based UI cannot distinguish duplicate X values or XY pairs.
    writable = not error and len(set(stages)) == len(stages) and all(x == y for x, y in axes)
    return {"supported": True, "canSet": writable, "current": stages[active],
            "stages": stages, "stageSource": "onboard",
            "checkedAtUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "targetToken": _dpi_token(target) if writable else None,
            "error": error or (None if writable else "dpi_ambiguous_stages")}


def _dpi_state(dev, info):
    identity, codec, base, length, maximum = DPI_MODELS[(info["vendor_id"], info["product_id"])]
    if tuple(_dpi_exchange(dev, 0x10)) != identity:
        raise ValueError("dpi_identity_unconfirmed")
    system = _dpi_exchange(dev, 0x08, 0, 6)
    count, active = _dpi_system(system, maximum)
    axes = [_dpi_stage(_dpi_exchange(dev, 0x08, base + index * length, length), codec)
            for index in range(count)]
    if _dpi_exchange(dev, 0x08, 0, 6) != system:
        raise ValueError("dpi_current_changed")
    target = {key: info.get(key) for key in ("vendor_id", "product_id", "physical_id", "path", "serial_number")}
    target.update(provider="pulsar", identity=list(identity), stages=axes)
    return _dpi_view(target, active), target, system


def _dpi_cache_key(info):
    return tuple(info.get(key) for key in
                 ("vendor_id", "product_id", "physical_id", "path", "serial_number"))


def _capture_dpi(info, cache=None):
    if not _dpi_eligible(info) or output_length(info["path"]) != PAYLOAD_LEN:
        return None, None
    key = _dpi_cache_key(info)
    dev = None
    try:
        dev = hid.device()
        dev.open_path(info["path"])
        cached = cache.get(key) if cache is not None else None
        if cached is not None and time.monotonic() - cached[2] < DPI_CACHE_SECONDS:
            target, previous_system, _ = cached
            try:
                system = _dpi_exchange(dev, 0x08, 0, 6)
                _, active = _dpi_system(system, DPI_MODELS[(info["vendor_id"], info["product_id"])][4])
                if system == previous_system:
                    view = _dpi_view(target, active)
                    return view, target if view["canSet"] else None
            except Exception:
                pass  # A failed cache probe still requires the complete live read.
        view, target, system = _dpi_state(dev, info)
        if cache is not None:
            cache[key] = (target, system, time.monotonic())
        return view, target if view["canSet"] else None
    except Exception:
        # A failed DPI read cannot invalidate the independent battery reply.
        if cache is not None:
            cache.pop(key, None)
        return None, None
    finally:
        if dev is not None:
            try:
                dev.close()
            except Exception:
                pass


def set_device_dpi(inventory, target, value, expected_dpi, target_token):
    """Switch one existing stage with one two-byte write at 0x0004; never retry."""
    view, dev, attempted = None, None, False

    def result(error=None, success=False, unknown=False):
        answer = dict(view) if view else None
        if answer and error:
            answer.update(canSet=False, targetToken=None, error=error)
        if answer and unknown:
            answer.update(current=None, checkedAtUtc=None)
        return {"dpi": answer, "success": success, "outcomeUnknown": unknown, "error": error,
                "confirmedDpi": answer["current"] if answer and not unknown else None}

    try:
        if (not isinstance(target, dict) or target.get("provider") != "pulsar"
                or not isinstance(inventory, (list, tuple))):
            return result("dpi_invalid_target")
        if not isinstance(target_token, str) or _dpi_token(target) != target_token:
            return result("dpi_stale_target")
        if type(value) is not int or type(expected_dpi) is not int:
            return result("dpi_invalid_value")
        offered = [pair[0] for pair in target["stages"]]
        if value not in offered or expected_dpi not in offered:
            return result("dpi_unsupported_value")
        matches = [info for info in inventory if isinstance(info, dict) and _dpi_eligible(info)
                   and all(info.get(key) == target.get(key) for key in
                           ("vendor_id", "product_id", "physical_id", "path", "serial_number"))]
        if len(matches) != 1 or output_length(matches[0]["path"]) != PAYLOAD_LEN:
            return result("dpi_target_changed")
        info = matches[0]
        dev = hid.device()
        dev.open_path(info["path"])
        view, fresh, system = _dpi_state(dev, info)
        if not view["canSet"] or view["targetToken"] != target_token:
            return result("dpi_target_changed")
        if view["current"] != expected_dpi:
            return result("dpi_current_changed")
        index = offered.index(value)
        if value == expected_dpi:
            return result(success=True)
        # Recheck identity and the complete system immediately before mutation.
        if (_dpi_exchange(dev, 0x10) != fresh["identity"]
                or _dpi_exchange(dev, 0x08, 0, 6) != system):
            return result("dpi_current_changed")
        frame = _dpi_frame(0x07, 4, 2, [index, (0x55 - index) & 0xFF])
        attempted = True  # Even a driver error/short write may have reached hardware.
        if dev.write(frame) != PAYLOAD_LEN:
            return result("dpi_readback_unconfirmed", unknown=True)
        time.sleep(.01)  # OpenMouse WRITE_SETTLE_MS, not a resend.
        confirmed = _dpi_exchange(dev, 0x08, 0, 6)
        spec = DPI_MODELS[(info["vendor_id"], info["product_id"])]
        _count, active = _dpi_system(confirmed, spec[4])
        if confirmed[:4] != system[:4] or active != index:
            return result("dpi_readback_mismatch", unknown=True)
        if (_dpi_stage(_dpi_exchange(dev, 0x08, spec[2] + index * spec[3], spec[3]), spec[1])
                != fresh["stages"][index] or _dpi_exchange(dev, 0x10) != fresh["identity"]):
            return result("dpi_readback_mismatch", unknown=True)
        view = _dpi_view(fresh, active)
        return result(success=True)
    except Exception:
        return result("dpi_readback_unconfirmed" if attempted else "dpi_read_failed", unknown=attempted)
    finally:
        if dev is not None:
            try:
                dev.close()
            except Exception:
                pass


def checksum(payload: List[int]) -> int:
    return (CHECKSUM_BASE - sum(payload)) % 256


def make_request() -> List[int]:
    frame = [PAYLOAD_HEADER, CMD_POWER] + [0x00] * (PAYLOAD_LEN - 3)
    frame.append(checksum(frame))
    return frame


def parse_power(r) -> Optional[Tuple[int, bool]]:
    """(percent, power flag) from a power reply, or None when this is not one."""
    if not r or len(r) < PAYLOAD_LEN:
        return None
    frame = list(r[:PAYLOAD_LEN])
    if frame[0] != PAYLOAD_HEADER or frame[1] != CMD_POWER:
        return None
    if frame[PAYLOAD_LEN - 1] != checksum(frame[:PAYLOAD_LEN - 1]):
        return None
    level = frame[LEVEL_INDEX]
    if not 0 <= level <= 100:
        return None
    return level, frame[POWER_INDEX] != 0


def parse_link8k_power(r) -> Optional[Tuple[int, bool]]:
    """5501 web-driver fields; retain checksum/range guards, never smooth level."""
    if not r or len(r) != PAYLOAD_LEN or r[2] != 0:
        return None
    parsed = parse_power(r)
    return (parsed[0], r[POWER_INDEX] == 1) if parsed is not None else None


def voltage_mv(r) -> Optional[int]:
    if not r or len(r) < VOLTAGE_SLICE[1]:
        return None
    return int.from_bytes(bytes(r[VOLTAGE_SLICE[0]:VOLTAGE_SLICE[1]]), "big")


class PulsarProvider(Provider):
    name = "pulsar"

    def __init__(self, device_pack=None):
        self._diag: List[str] = []
        self._reader_diag: List[str] = []
        self.configure_pack(device_pack)
        # key -> (name, level, charging, when it was last read)
        self._last: Dict[str, Tuple[str, int, bool, float]] = {}
        # Exact device -> (full target including identity/stages, system, monotonic time).
        self._dpi_cache: Dict[tuple, Tuple[dict, List[int], float]] = {}

    def configure_pack(self, device_pack):
        self._device_pack = device_pack

    def _note_reader(self, message: str) -> None:
        # Only fixed battery-result text belongs here. Legacy logs contain
        # product strings, paths, frames and exceptions and stay private.
        if message not in self._reader_diag and len(self._reader_diag) < 16:
            self._reader_diag.append(message)

    def set_device_dpi(self, inventory, target, value, expected_dpi, target_token):
        response = set_device_dpi(inventory, target, value, expected_dpi, target_token)
        if response["success"] or response["outcomeUnknown"]:
            self._dpi_cache.pop(_dpi_cache_key(target), None)
        return response

    def _pick_link8k(self, infos: List[dict]) -> Optional[dict]:
        """#134's control collection plus per-report proof from topology/battery_hid."""
        candidates = [d for d in infos
                      if (d.get("vendor_id"), d.get("product_id")) == LINK8K_ID
                      and (d.get("usage_page"), d.get("usage")) == CONTROL_USAGE]
        if len(candidates) == 1 and candidates[0].get("path"):
            info = candidates[0]
            if all(type(info.get(direction + "_report_length")) is int
                   and info[direction + "_report_length"] == PAYLOAD_LEN
                   and info.get(direction + "_report_sizes") == {"8": PAYLOAD_LEN}
                   for direction in ("input", "output")):
                return info
        self._diag.append("  Link 8K: missing/ambiguous FF02:0002 or unproven report-8 lengths; nothing sent")
        if len(candidates) != 1:
            self._note_reader("FF02:0002 missing or ambiguous; nothing sent")
        elif not candidates[0].get("path"):
            self._note_reader("collection path unresolved; nothing sent")
        else:
            self._note_reader("report-8 input/output lengths unproven; nothing sent")
        return None

    def _pick(self, infos: List[dict]) -> Optional[dict]:
        """The collection to open.

        The ATK/VXE panel of the OpenMouse project opens the collection with usage
        page 0xFF02 and usage 0x0002 and sends its report-0x08 frames there, so that
        one is tried first - the R1 Pro Max dongle has it next to four other
        interface-1 collections, and the first of those is not the one it answers on.
        Without it, the first interface-1 collection is used, which is where the
        reference tool reads its replies.

        A collection whose output report cannot carry the 17-byte frame is skipped
        even when it has the right usage: Windows refuses that write and no reply
        comes, which is indistinguishable from a device that is off. The length is
        only known when Windows says so, and an unknown length never disqualifies a
        collection. The probe is the same read-only HidP_GetCaps query that
        providers/gwolves.py uses for its feature length, cached per collection path.
        (Spotted by ahmedkhursheed23 in #87, from mouse.xyz's writeFile().)
        """
        control = [d for d in infos
                   if (d.get("usage_page"), d.get("usage")) == CONTROL_USAGE]
        for d in control + infos:
            if output_length(d["path"]) in (None, PAYLOAD_LEN):
                if not control:
                    self._note_reader("legacy FF02:0002 missing; fallback selected")
                    self._diag.append("  no control collection; using "
                                      f"iface={d.get('interface_number')} "
                                      f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x} "
                                      f"(output={output_length(d['path'])})")
                return d
            self._note_reader("legacy output length incompatible")
            self._diag.append(f"  {d.get('usage_page', 0):04x}:{d.get('usage', 0):04x} "
                              f"output={output_length(d['path'])} cannot take a "
                              f"{PAYLOAD_LEN}-byte frame; skipped")
        if control:
            return control[0]
        self._note_reader("legacy FF02:0002 missing; fallback selected")
        self._diag.append(f"  no interface {CONTROL_INTERFACE} collection; "
                          f"falling back to the first of {len(infos)}")
        return infos[0] if infos else None

    def _query(self, path: bytes, parse_reply=parse_power) -> Optional[List[int]]:
        dev = hid.device()
        try:
            dev.open_path(path)
        except (OSError, IOError) as e:
            self._note_reader("battery open failed")
            self._diag.append(f"  open: {e}")
            return None
        try:
            operation = "read"
            self._drain(dev)
            operation = "write"
            dev.write(make_request())
            operation = "read"
            for attempt in range(READ_ATTEMPTS):
                r = dev.read(PAYLOAD_LEN, READ_TIMEOUT_MS)
                if not r:
                    break
                self._diag.append(f"  reply {attempt + 1}: {hexdump(r)}")
                if parse_reply(r) is not None:
                    return list(r)
                time.sleep(0.02)
            self._note_reader("no valid battery reply; connection unknown")
            self._diag.append("  no power reply (events and short frames are ignored)")
            return None
        except (OSError, IOError, ValueError) as e:
            self._note_reader("battery write failed" if operation == "write" else "battery read failed")
            self._diag.append(f"  query error: {e}")
            return None
        finally:
            try:
                dev.close()
            except Exception:
                pass

    def _drain(self, dev) -> None:
        for _ in range(4):
            if not dev.read(PAYLOAD_LEN, FLUSH_TIMEOUT_MS):
                return

    def poll(self) -> List[DeviceStatus]:
        self._diag = []
        self._reader_diag = []
        out = []
        now = time.time()
        found: set = set()      # answered this poll
        present: set = set()    # enumerated this poll, answering or not
        for vid, pids in PIDS.items():
            try:
                infos = hidlist.enumerate(vid)
            except Exception as e:  # pragma: no cover
                log.warning("hid.enumerate(%04x): %s", vid, e)
                continue
            if vid == 0x373B and any(d.get("product_id") == 0x1216 for d in infos):
                nano = AtkNanoProvider()
                out.extend(nano.poll())
                nano_diag = nano.diagnostics()
                self._diag.extend(nano_diag)
                for line in nano_diag:
                    reason = _nano_reader_reason(line)
                    if reason is not None:
                        self._note_reader(reason)
            candidates = list(pids)
            if vid == 0x373B:
                candidates += sorted({d["product_id"] for d in infos if d["product_id"] not in pids})
            for pid in candidates:
                if vid == 0x373B and pid == 0x1216:
                    continue  # Never fall back to CompX, even if NANO proof fails.
                if vid == 0x373B and pid in ATK_HEADSET_PIDS:
                    self._diag.append(f"  ATK {vid:04x}:{pid:04x} headset reserved: nothing sent")
                    continue
                mine = [d for d in infos if d["product_id"] == pid]
                if not mine:
                    continue
                reader_diag_start = len(self._reader_diag)
                key = f"pulsar:{vid:04x}{pid:04x}"
                link8k = (vid, pid) == LINK8K_ID
                parse_reply = parse_link8k_power if link8k else parse_power
                if link8k:
                    d = self._pick_link8k(mine)
                    if d is not None:
                        present.add(key)
                    name = pids[pid]
                    self._diag.append("  Pulsar Link 8K 3710:5501: 待实机验证; "
                                      "requires FF02:0002 / input/output report 8 = 17 bytes")
                elif (vid, pid) in STRICT_COMPX_IDS:
                    # Feedback #19/#47/#55 omits report sizes; F505's maintainer
                    # capture confirms the same strict collection and length.
                    # F503's user capture in #592 matches that guarded exchange.
                    # Require descriptor evidence before sending the one known protocol;
                    # unknown length and sibling collections are never fallbacks.
                    d = next((d for d in mine if (d.get("usage_page"), d.get("usage")) == CONTROL_USAGE
                              and output_length(d["path"]) == PAYLOAD_LEN), None)
                    if d is not None:
                        present.add(key)
                    name = next((str(info.get("product_string") or "").strip()
                                 for info in ([d] if d is not None else []) + mine
                                 if str(info.get("product_string") or "").strip()), pids[pid])
                    evidence = ("本项目维护者实机确认（单次读数；充电/休眠未测）"
                                if (vid, pid) == (0x3554, 0xF505) else "待实机验证")
                    self._diag.append(f"  {pids[pid]} {vid:04x}:{pid:04x}: {evidence}; "
                                      "requires FF02:0002 / output=17")
                elif pid in pids:
                    present.add(key)
                    d = self._pick(mine)
                    name = pids[pid]
                else:
                    d = next((d for d in mine if (d.get("usage_page"), d.get("usage")) == CONTROL_USAGE
                              and output_length(d["path"]) == PAYLOAD_LEN), None)
                    if d is not None:
                        present.add(key)
                    name = (d.get("product_string") or "ATK Mouse") if d is not None else "ATK Mouse"
                if d is None:
                    if not link8k:
                        # Selection already checked every eligible length. Do
                        # not repeat output_length or probe sibling collections.
                        has_control = any((info.get("usage_page"), info.get("usage")) == CONTROL_USAGE
                                          for info in mine)
                        self._note_reader("output=17 unproven; nothing sent" if has_control
                                          else "FF02:0002 missing; nothing sent")
                    continue
                out_length = d["output_report_length"] if link8k else output_length(d["path"])
                self._diag.append(f"[Pulsar] pid={vid:04x}:{pid:04x} '{name}' "
                                  f"iface={d.get('interface_number')} "
                                  f"{d.get('usage_page', 0):04x}:{d.get('usage', 0):04x}"
                                  f" output={out_length}")
                reply = self._query(d["path"], parse_reply)
                parsed = parse_reply(reply)
                if parsed is None:
                    if not reply:
                        self._diag.append("    no reply (asleep, or the mouse is idle)")
                    continue
                # A usable reply supersedes this candidate's selection warnings,
                # including skipped legacy collections. Other results survive.
                del self._reader_diag[reader_diag_start:]
                self._note_reader("valid battery reply")
                level, on_cable = parsed
                mv = voltage_mv(reply)
                if mv:
                    self._diag.append(f"  {mv} mV")
                self._last[key] = (name, level, on_cable, now)
                found.add(key)
                pack = self._device_pack
                pack_model = bool(pack and pack.loaded and any(
                    entry.provider == self.name and entry.match.matches(d) for entry in pack.entries))
                dpi, target = (None, None) if pack_model or link8k else _capture_dpi(d, self._dpi_cache)
                out.append(DeviceStatus(key, name, level, on_cable, True, "pulsar",
                                        kind="mouse", dpi=dpi, dpi_target=target,
                                        model_source="pack" if pack_model else "builtin"))
        # A mouse that stopped answering is not necessarily a mouse that went away
        # (idle it stops answering - see the docstring), so its last reading stays
        # greyed out for as long as its receiver is still in the USB tree, however
        # long it sleeps. Only a receiver pulled out drops the device: Windows
        # re-creates a removed icon at a new tray position, which is what the
        # 2026-10-03 screen-off report was about.
        for key in list(self._last):
            name, level, charging, seen = self._last[key]
            if key in found:
                continue
            if key in present:
                self._diag.append(f"[Pulsar] {name} did not answer; keeping {level}%"
                                  f"{' (charging)' if charging else ''} greyed "
                                  f"(its receiver is still plugged in)")
                out.append(DeviceStatus(key, name, level, charging, False, "pulsar",
                                        kind="mouse", wake_on_input=True))
            else:
                del self._last[key]
        return out

    def diagnostics(self) -> List[str]:
        return list(self._diag)

    def reader_diagnostics(self) -> List[str]:
        return list(self._reader_diag)
