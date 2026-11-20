"""Dareu EM901 battery-only CompX variant: Feature 08 -> Input 09.

The official driver does not validate a reply checksum. Descriptor proof,
report ID, command, status and percentage guard replies here; see
upstream-protocols.md. No discovery handshake or settings commands are sent.
"""
import math
import time

from battery_hid import BatteryHidProvider, MAX_READS
from .pulsar import make_request

VID = 0x260D
PIDS = {0x1074: "Dareu EM901"}


def parse_reply(reply, report_length=17):
    if (not reply or len(reply) != report_length or len(reply) < 8
            or reply[0] != 0x09 or reply[1] != 0x04 or reply[2] != 0
            or not 0 <= reply[6] <= 100):
        return None
    return reply[6], reply[7] != 0, ""


class DareuProvider(BatteryHidProvider):
    name = "dareu"
    vid, pids = VID, PIDS
    collection = (0xFF02, 0x0002)
    kind = "mouse"
    charging_known = True

    def _pick(self, infos):
        candidates = [info for info in infos
                      if info.get("vendor_id") == VID and info.get("product_id") in PIDS
                      and (info.get("usage_page"), info.get("usage")) == self.collection]
        if len(candidates) != 1 or not candidates[0].get("path"):
            self._diag.append("missing or ambiguous eligible collection: nothing sent")
            return None
        info = candidates[0]
        for direction, report_id, bounds in (("feature", "8", (17, 17)),
                                             ("input", "9", (8, 4096))):
            maximum = info.get(direction + "_report_length")
            sizes = info.get(direction + "_report_sizes")
            if (type(maximum) is not int or not bounds[0] <= maximum <= bounds[1]
                    or not isinstance(sizes, dict) or not sizes
                    or any(type(n) is not int or not 2 <= n <= maximum for n in sizes.values())
                    or max(sizes.values()) != maximum
                    or not bounds[0] <= sizes.get(report_id, 0) <= bounds[1]):
                self._diag.append("feature/input IDs or lengths unproven: nothing sent")
                return None
        return info

    def _query(self, dev, info):
        # Reuse only the fixed CompX power frame/checksum, never its transport
        # or DPI/identity paths. A failed send is not retried.
        request = make_request()
        if dev.send_feature_report(request) != len(request):
            self._diag.append("short/failed battery feature request; no retry")
            return None
        deadline = time.monotonic() + self.read_timeout_ms / 1000
        for _ in range(MAX_READS):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            raw = dev.read(info["input_report_length"], max(1, math.ceil(remaining * 1000)))
            if not raw:
                break
            parsed = parse_reply(raw, info["input_report_sizes"]["9"])
            if parsed is not None:
                return parsed
        # Silence/sleep and invalid replies produce no new reading, not an error.
        self._diag.append("no battery reply; connection unknown")
        return None
