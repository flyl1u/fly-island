"""Grade-C ZG4 candidate: official Z HUB facts + #459's FF05 descriptor.

Only two read commands exist here. Vendor JS is an inert protocol reference,
never imported/executed. Matching sequences bound ordinary in-process replies;
they do not prove device sample age or freshness across worker reconstruction.
"""
from dataclasses import dataclass, field
import math
import threading
import time

from battery_hid import BatteryHidProvider

VID = 0x3654
PIDS = {0x5055: "ZhuAudio ZG4"}
QUERY_SECONDS = 2.0
MAX_READS = 32  # Both phases together, not per command.
MAX_FRAME = 1024

# All public reasons are fixed and fit the desktop's 48-character field.
DIAGNOSTICS = frozenset({
    "ZG4 collection missing or ambiguous", "ZG4 parent/path unproven",
    "ZG4 interface/product unverified", "ZG4 CE/CD byte reports unproven",
    "ZG4 all 256 FE sequences unresolved",
    "ZG4 query already pending", "ZG4 inventory invalid",
    "ZG4 write short/failed; no retry", "ZG4 no valid reply within limits",
    "ZG4 headset disconnected", "ZG4 input rejected",
    "ZG4 parent unresolved", "ZG4 enumeration failed", "ZG4 battery I/O failed",
    "HID handle close failed",
})
_BASE_DIAGNOSTICS = {
    "physical parent unresolved; uniqueness unknown: nothing sent": "ZG4 parent unresolved",
    "enumeration failed: nothing sent": "ZG4 enumeration failed",
    "battery I/O failed; connection unknown": "ZG4 battery I/O failed",
}


def _bytes(value):
    if (not isinstance(value, (bytes, bytearray, list, tuple))
            or any(type(n) is not int or not 0 <= n <= 255 for n in value)):
        return None
    return bytes(value)


def crc16(value):
    """cxF/bXq: initial zero, right-shift A001 (not CCITT-FALSE)."""
    data = _bytes(value)
    if data is None:
        raise ValueError("invalid CRC bytes")
    crc = 0
    for n in data:
        crc ^= n
        for _ in range(8):
            crc = (crc >> 1) ^ (0xA001 if crc & 1 else 0)
    return crc


def status_request():
    body = bytes((1, 2))  # len(cmd + payload), cmd; zero parameters.
    crc = crc16(body)
    return bytes((0xCD, 7, 0xAA, 0x5A, 0xCC, crc & 255, crc >> 8, 1, 2)) + bytes(55)


def battery_request(sequence):
    if type(sequence) is not int or not 0 <= sequence <= 255:
        raise ValueError("invalid sequence")
    return bytes((0xCD, 0xEE, 0x80, 0, 6, 0, 0xFF, sequence, 2, 0xFE, 7, 0xAA)) + bytes(52)


def input_payload(raw):
    data = _bytes(raw)
    return data[1:] if data is not None and len(data) == 64 and data[0] == 0xCE else None


def connection_reply(payload):
    """bP2/cvR + c04; None means no validated opcode-02 state.

    Source explicitly skips U at offset 2; it is opaque, not a sequence or
    success field. Only the CRC-covered opcode/payload establish the state.
    Support the source's two CRC lengths only when padding/optional length
    prefix agree exactly. No inferred checksum or header interpretation.
    #459's listen-only capture (Z HUB showing 50%) proves the hardware form:
    prefix = 7 + length while the CRC covers exactly the `length` opcode +
    payload bytes (`09 AA CC 00 02 C0 A0 02 01`). A prefix, when present,
    must therefore be 7 + length for either CRC length.
    """
    data = _bytes(payload)
    if data is None or len(data) != 63:
        return None
    prefix = None
    if data[:2] != b"\xAA\xCC":
        if data[1:3] != b"\xAA\xCC":
            return None
        prefix, data = data[0], data[1:]
    length = data[3]
    if not 1 <= length <= 57 or data[6] != 2:
        return None
    checksum = int.from_bytes(data[4:6], "little")
    candidates = []
    for end in (6 + length, 7 + length):
        if (8 <= end <= len(data) and (prefix is None or prefix == 7 + length)
                and not any(data[end:]) and crc16(data[6:end]) == checksum):
            candidates.append(data[7] == 1)
    return candidates[0] if len(candidates) == 1 else None


def _ff_frame(frame):
    data = _bytes(frame)
    if (data is None or not 5 <= len(data) <= MAX_FRAME or data[0] != 0xFF or data[2] < 1
            or len(data) != data[2] + 4 or data[-1] != 0xAA):
        return None
    return data


def battery_reply(frame, sequence):
    """A complete FF frame only; no default 0 and no ACK-as-measurement."""
    data = _ff_frame(frame)
    if data is None or type(sequence) is not int or not 0 <= sequence <= 255 or data[1] != sequence:
        return None
    value = data[4:-1]
    if data[3] == 0xFE:
        if not value or value[0] != 7:
            return None
        value = value[1:]
    elif data[3] != 7:
        return None
    if len(value) < 3 or not 1 <= value[0] & 0x7F <= 100:
        return None
    return value[0] & 0x7F, bool(value[0] & 0x80), ""


class _Assembler:
    """One exact EE/EA chain; failures cannot restart it within a query."""
    def __init__(self):
        self.data = bytearray()
        self.total = 0
        self.next_part = 0
        self.started_at = None
        self.marker = None
        self.failed = False

    def feed(self, payload, now):
        data = _bytes(payload)
        if (self.failed or data is None or len(data) != 63
                or data[0] not in (0xEE, 0xEA)):
            return None
        part, last = data[1] & 127, bool(data[1] & 128)
        total = int.from_bytes(data[3:5], "little")
        if self.started_at is None:
            self.total, self.marker, self.started_at = total, data[0], now
            valid = part == 0 and 5 <= total <= MAX_FRAME
        else:
            valid = total == 0 and data[0] == self.marker and now - self.started_at < QUERY_SECONDS
        remaining = self.total - len(self.data)
        count = min(58, remaining)
        if (not valid or data[2] != 0 or part != self.next_part or remaining <= 0
                or last != (remaining <= 58) or any(data[5 + count:])):
            self.failed = True
            return None
        self.data.extend(data[5:5 + count])
        self.next_part += 1
        return bytes(self.data) if last else None


@dataclass
class _Transaction:
    next_sequence: int = 1
    pending: bool = False
    # Reserve before attempting FE I/O. Only a complete valid battery reply in
    # that query releases it; every other outcome retires it for this instance.
    unresolved: set = field(default_factory=set)

    def reserve(self):
        for _ in range(256):
            sequence = self.next_sequence
            self.next_sequence = (sequence + 1) & 255
            if sequence not in self.unresolved:
                self.unresolved.add(sequence)
                return sequence
        return None


class ZhuAudioProvider(BatteryHidProvider):
    name = "zhuaudio"
    vid, pids = VID, PIDS
    collection = (0xFF05, 1)
    input_id, output_id = 0xCE, 0xCD
    input_bounds, output_bytes = (64, 64), 64
    kind = "headset"
    charging_known = True

    def __init__(self):
        super().__init__()
        self._transactions = {}
        self._poll_lock = threading.Lock()

    def poll(self):
        # Reuse base physical grouping, DeviceStatus construction and finally
        # close. The local guard also prevents reentrant opens in direct use.
        if not self._poll_lock.acquire(blocking=False):
            self._diag.append("ZG4 query already pending")
            return []
        try:
            return super().poll()
        except (TypeError, AttributeError):
            # Invalid parent metadata cannot reach _pick in the shared grouper.
            self._diag.append("ZG4 inventory invalid")
            return []
        finally:
            self._poll_lock.release()

    def _pick(self, infos):
        # Count exact identity/FF05 BEFORE product, interface or report gates.
        candidates = [i for i in infos if (i.get("vendor_id"), i.get("product_id"),
                      i.get("usage_page"), i.get("usage")) == (VID, 0x5055, *self.collection)]
        if len(candidates) != 1:
            self._diag.append("ZG4 collection missing or ambiguous")
            return None
        info = candidates[0]
        parent, path = info.get("physical_id"), info.get("path")
        if (not isinstance(parent, str) or not parent or parent.startswith("collection:")
                or not isinstance(path, (bytes, str)) or not path
                or path.lower().startswith(b"collection:" if isinstance(path, bytes) else "collection:")):
            self._diag.append("ZG4 parent/path unproven")
            return None
        # Reject Bluetooth transports even if a synthetic inventory claims USB
        # IDs. Normal Windows topology already excludes these from USB parents.
        text = path.decode("utf-8", "replace") if isinstance(path, bytes) else path
        if (any(type(info.get(key)) is not int for key in ("vendor_id", "product_id", "usage_page", "usage"))
                or type(info.get("interface_number")) is not int or info["interface_number"] != 4
                or info.get("product_string") != "ZhuAudio ZG4"
                or any(token in (text + parent).lower() for token in ("bth", "bluetooth", "vid&"))):
            self._diag.append("ZG4 interface/product unverified")
            return None
        for direction, report_id in (("input", "206"), ("output", "205")):
            sizes = info.get(direction + "_report_sizes")
            if (type(info.get(direction + "_report_length")) is not int
                    or info[direction + "_report_length"] != 64
                    or not isinstance(sizes, dict) or sizes != {report_id: 64}
                    or type(sizes.get(report_id)) is not int
                    or info.get(direction + "_report_proof") != "caps"):
                self._diag.append("ZG4 CE/CD byte reports unproven")
                return None
        transaction = self._transactions.get(parent)
        if transaction is not None:
            if transaction.pending:
                self._diag.append("ZG4 query already pending")
                return None
            if len(transaction.unresolved) == 256:
                self._diag.append("ZG4 all 256 FE sequences unresolved")
                return None
        return info

    def _query(self, dev, info):
        transaction = self._transactions.setdefault(info["physical_id"], _Transaction())
        if transaction.pending:
            self._diag.append("ZG4 query already pending")
            return None
        if len(transaction.unresolved) == 256:
            self._diag.append("ZG4 all 256 FE sequences unresolved")
            return None
        transaction.pending = True
        try:
            deadline = time.monotonic() + QUERY_SECONDS
            request = status_request()
            written = dev.write(request)
            if type(written) is not int or written != len(request):
                self._diag.append("ZG4 write short/failed; no retry")
                return None
            online, assembler = False, _Assembler()
            for read_index in range(MAX_READS):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                raw = dev.read(64, max(1, math.ceil(remaining * 1000)))
                now = time.monotonic()
                if now >= deadline or not raw:
                    break
                payload = input_payload(raw)
                if payload is None:
                    self._diag.append("ZG4 input rejected")
                    continue
                connected = connection_reply(payload)
                if connected is False:
                    # State 02 has no FF sequence. After FE, disconnect cannot
                    # cancel that sequence; its reservation stays unresolved.
                    self._diag.append("ZG4 headset disconnected")
                    return None
                if not online:
                    if connected is True:
                        if read_index + 1 == MAX_READS:
                            break  # Do not send a request with no read budget left.
                        sequence = transaction.reserve()
                        if sequence is None:
                            self._diag.append("ZG4 all 256 FE sequences unresolved")
                            return None
                        request = battery_request(sequence)
                        written = dev.write(request)
                        if type(written) is not int or written != len(request):
                            self._diag.append("ZG4 write short/failed; no retry")
                            return None
                        online = True
                    continue
                frame = None
                if payload[0] in (0xEE, 0xEA):
                    frame = assembler.feed(payload, now)
                elif payload[0] == 0xFF and assembler.started_at is None:
                    end = payload[2] + 4
                    if 5 <= end <= len(payload) and not any(payload[end:]):
                        frame = payload[:end]
                reading = battery_reply(frame, sequence)
                if reading is not None:
                    transaction.unresolved.remove(sequence)
                    return reading
                if _ff_frame(frame) is not None:
                    # A complete ACK/old-seq/other-opcode chain is a frame boundary,
                    # not a battery reading. An incomplete/broken chain never resets.
                    assembler = _Assembler()
            self._diag.append("ZG4 no valid reply within limits")
            return None
        finally:
            # Release only this call. Silence/close/reopen never cancels an FE
            # reservation; later calls must skip all unresolved sequences.
            transaction.pending = False

    def diagnostics(self):
        return [safe for reason in self._diag
                if (safe := _BASE_DIAGNOSTICS.get(reason, reason)) in DIAGNOSTICS]
