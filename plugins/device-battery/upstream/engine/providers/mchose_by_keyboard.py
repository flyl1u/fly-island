"""BY reads for shared 3554:FA09; model-gated BY for 41E4:2001.

Protocol facts independently implemented from M HUB / VGN HUB, not vendor code.
See upstream-protocols.md for framing, identification and untested limits.
Only generic receiver names take this wireless path; no substring brand guesses.
"""
import battery_hid as H
from by_keyboard import identity_request, make_request, payload as _payload

VID = 0x3554
# Exact pairs, never a cross product of vendor and product IDs.
PIDS = {
    (0x3554, 0xFA09): "2.4G 无线键盘（3554:FA09）",
    (0x41E4, 0x2001): "MCHOSE BY keyboard (model identification required)",
}
RECEIVER_NAMES = frozenset(("2.4G Wireless Receiver", "MCHOSE 2.4G Wireless"))

# Six-byte model identifiers from M HUB's keyboardPwds table, not credentials.
# The official generic-receiver path matches this entire table, not just the
# PID-dependent aliases used for already-named wired keyboards by getDevName.
MODEL_CODES = {
    "03000000021c": "G87", "030000000077": "K99",
    "0300000001df": "K99_V2", "030000000132": "G98",
    "0300000000d6": "X75", "0a0000000003": "G98_Pro",
    "0300000001c6": "X75_V2", "030000000115": "G75_Pro",
    "0a0000000018": "G98_V2", "0a000000002b": "UT98",
    "0a0000000001": "Z75", "0a0000000009": "Z75S",
    "0300000001c7": "KX75", "030000000174": "GX87",
    "0300000001ed": "GX87_V2", "030000000135": "K87",
    "030000000335": "G75_V2", "0a0000000034": "G87_V2",
}


def parse_model(reply):
    payload = _payload(reply, 0x05)
    return MODEL_CODES.get(bytes(payload[:6]).hex()) if payload is not None else None


def parse_reply(reply):
    # M HUB subscribes to 0A/type 05 independently of its 4A transaction.
    # The notification skips bytes 2..4; they are NOT sequence/length gates.
    # Its parser does not check a trailer. Require our proven 20-byte report.
    if (len(reply) == 20 and all(type(b) is int and 0 <= b <= 255 for b in reply)
            and reply[0] == 0x13 and reply[1] == 0x0A and reply[5] == 0x05):
        payload = reply[6:8]
    else:
        payload = _payload(reply, 0x4A)
    if payload is None:
        return None
    level, flags = payload[:2]
    full, charge = flags & 15, flags >> 4
    # The bundled little-endian bit parser places fullStatus in the LOW nibble.
    # M HUB treats chargeStatus == 1 as charging, only below 100 percent.
    # Other nibble values have no established meaning: reject, never coerce.
    if level > 100 or full not in (0, 1) or charge not in (0, 1):
        return None
    # A sleeping keyboard behind a live receiver may report zero; never show a
    # false 0 % from a single reply.
    if level == 0:
        return None
    return level, charge == 1 and level < 100, ""


def parse_generic_reply(reply):
    # VGN HUB reads the same 4A percentage without a model gate. Unknown FA09
    # firmware has no proven M HUB flag semantics; leave charging unknown.
    payload = _payload(reply, 0x4A)
    if payload is None or not 1 <= payload[0] <= 100:
        return None
    return payload[0], False, ""


class MchoseByKeyboardProvider(H.BatteryHidProvider):
    name = "mchose_by_keyboard"
    vid = VID
    pids = {pid: name for (vid, pid), name in PIDS.items() if vid == VID}
    collection = (0xFF04, 0x0002)
    input_id = output_id = 0x13
    input_bounds = (20, 20)
    output_bytes = 20
    kind = "keyboard"
    charging_known = True
    read_timeout_ms = 2200  # M HUB's retryTime:2 response budget, per query.
    # Remember each receiver's identity until removal. Unknown FA09 models use
    # VGN HUB's direct 4A read with a neutral name; unknown 41E4:2001 models stay
    # blocked. Neither is re-identified. A silent receiver (keyboard asleep, or
    # firmware that ignores 0x05) is retried once on the next poll, then with exponential
    # back-off from 1 minute doubling to at most 30 minutes, so a sleeping MCHOSE
    # keyboard is still found later while other brands are probed rarely.
    IDENTIFY_BACKOFF_SECONDS = (60, 1800)

    def __init__(self):
        super().__init__()
        self._models = {}    # (physical, path) -> model key, or False when unrecognized
        self._attempts = {}  # (physical, path) -> (silent attempts, monotonic time of next allowed try)
        self._seen = set()
        self._key = None

    def poll(self):
        self._seen = set()
        result, diagnostics = [], []
        original = self.vid, self.pids
        try:
            # Reuse the same descriptor gate and state machine for each exact
            # vendor's PID table. Prune identity/back-off caches only after BOTH
            # inventories, so polling one vendor never forgets the other.
            for vid in sorted({vid for vid, _ in PIDS}):
                self.vid = vid
                self.pids = {pid: name for (vendor, pid), name in PIDS.items() if vendor == vid}
                result.extend(super().poll())
                diagnostics.extend(self._diag)
        finally:
            self.vid, self.pids = original
            self._diag = diagnostics
        for cache in (self._models, self._attempts):
            for key in [k for k in cache if k not in self._seen]:
                del cache[key]
        return result

    def _pick(self, infos):
        receiver = [info for info in infos
                      if info.get("vendor_id") == self.vid
                      and info.get("product_id") in self.pids]
        candidates = [info for info in receiver
                      if (info.get("usage_page"), info.get("usage")) == self.collection]
        # M HUB filters a WebHID device containing FF04, then sends report 13.
        # hidapi exposes individual collections: locate that report on FF04
        # or its FF02 sibling, keeping the physical/name/model gates intact.
        if len(candidates) != 1 or not candidates[0].get("path"):
            self._diag.append("missing or ambiguous eligible collection: nothing sent")
            return None
        info = candidates[0]
        by = [item for item in receiver
              if item.get("path")
              and (item.get("usage_page"), item.get("usage")) in (self.collection, (0xFF02, 2))
              and (item.get("usage_page") == self.collection[0] or item.get("physical_id"))
              and all(type(item.get(d + "_report_length")) is int
                      and item[d + "_report_length"] == 20
                      and item.get(d + "_report_sizes") == {"19": 20}
                      and type(item[d + "_report_sizes"]["19"]) is int
                      for d in ("input", "output"))]
        if len(by) > 1:
            self._diag.append("missing or ambiguous eligible collection: nothing sent")
            return None
        if by:
            info = by[0]
        # #99/#477/#485 disprove Feature06 byte3 as battery. Reject even a
        # fully proven feature-only collection before opening it. Independently
        # proven BY reports above remain eligible; BY failure never downgrades.
        elif (info.get("path")
                and (info["vendor_id"], info["product_id"]) == (0x3554, 0xFA09)
                and type(info.get("feature_report_length")) is int
                and info.get("feature_report_length") == 8
                and info.get("feature_report_sizes") == {"6": 8}
                and type(info["feature_report_sizes"]["6"]) is int
                and all(type(info.get(d + "_report_length")) is int
                        and info[d + "_report_length"] == 0
                        and info.get(d + "_report_sizes") == {}
                        for d in ("input", "output"))):
            self._diag.append("Feature06 battery path disabled: field does not track battery; nothing sent")
            return None
        else:
            info = super()._pick(infos)
        if info is None:
            return None
        self._key = (info.get("physical_id", ""), info.get("path"))
        self._seen.add(self._key)
        if (info.get("product_string") not in RECEIVER_NAMES
                or candidates[0].get("product_string") not in RECEIVER_NAMES):
            self._diag.append("unrecognized wireless receiver name: nothing sent")
            return None
        if any(info.get(direction + "_report_sizes") != {"19": 20}
               for direction in ("input", "output")):
            self._diag.append("single byte-array report not proven: nothing sent")
            return None
        return info

    def device_name(self, info):
        if self._model is False:
            return PIDS[(info["vendor_id"], info["product_id"])]
        return "MCHOSE " + self._model.replace("_", " ")

    def _exchange(self, dev, request, parse):
        if dev.write(request) != len(request):
            self._diag.append("short/failed read query write; no retry")
            return None
        deadline = H.time.monotonic() + self.read_timeout_ms / 1000
        for _ in range(H.MAX_READS):
            remaining = deadline - H.time.monotonic()
            if remaining <= 0:
                break
            raw = dev.read(20, max(1, H.math.ceil(remaining * 1000)))
            if not raw:
                break
            parsed = parse(raw)
            if parsed is not None:
                return parsed
            # A complete unknown identity ends identification, even if a
            # previously queued recognized identity follows it. The query state
            # machine decides whether this exact receiver allows a generic read.
            if request == identity_request() and _payload(raw, 0x05) is not None:
                self._diag.append("model not in M HUB table")
                self._unknown = True
                return None
        self._diag.append("no valid reply; no new reading; connection unknown")
        return None

    def _query(self, dev, info):
        key = self._key
        model = self._models.get(key)
        if model is None:
            silent, next_try = self._attempts.get(key, (0, 0.0))
            now = H.time.monotonic()
            if now < next_try:
                self._diag.append("identification backing off: nothing sent")
                return None
            self._unknown = False
            model = self._exchange(dev, identity_request(), parse_model)
            if model is None:
                if self._unknown:
                    model = False
                else:
                    first, ceiling = self.IDENTIFY_BACKOFF_SECONDS
                    delay = 0 if silent == 0 else min(ceiling, first * 2 ** (silent - 1))
                    self._attempts[key] = (silent + 1, now + delay)
                    return None
            self._models[key] = model
            self._attempts.pop(key, None)
        if model is False and (info["vendor_id"], info["product_id"]) != (0x3554, 0xFA09):
            self._diag.append("unrecognized model remembered: nothing sent until re-plug")
            return None
        self._model = model
        self.charging_known = model is not False
        # Accept subscribed 0A notifications in this bounded post-4A window;
        # never use them as identity or open an unsolicited background reader.
        return self._exchange(dev, make_request(), parse_reply if self.charging_known else parse_generic_reply)
