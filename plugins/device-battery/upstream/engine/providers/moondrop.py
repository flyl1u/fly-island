"""GM01 Pro battery only; static MOONDROP Hub evidence, hardware unverified.

Only 35D8:0133 / FF02:0002 or 000C:0001 with descriptor-proven input/output
report 4B is eligible. #127 supplies user evidence for the latter collection;
maintainer hardware verification remains pending. Lengths include the report
ID and are never guessed. The Hub's
read-only reachability preflight is omitted: only 80 27 00 is sent, without
initialization, flash, EQ, control-panel or OTA commands. See upstream-protocols.
The Hub confirms inputreport ID 4B; it supplies no alternate ID, Feature read,
fixed usage or report length. Failed proof stays diagnostic-only; do not probe.
"""
import math
import time

from battery_hid import BatteryHidProvider, report_proof_summary

VID = 0x35D8
PIDS = {0x0133: "MOONDROP GM01 Pro"}
COLLECTION = (0xFF02, 0x0002)
COLLECTIONS = (COLLECTION, (0x000C, 0x0001))  # Prefer proven FF02, then proven 000C.
REPORT_ID = 0x4B
MAX_REPORT_BYTES = 4096
MAX_READS = 32


def make_request(length):
    """WebHID payload 80 27 00, zero-filled to the proven output capacity."""
    if type(length) is not int or not 4 <= length <= MAX_REPORT_BYTES:
        raise ValueError("unproven output length")
    return [REPORT_ID, 0x80, 0x27, 0x00] + [0] * (length - 4)


def parse_reply(reply):
    # Sc/Lt: three-byte OP/CMD/LEN header, then payload. zP reads payload
    # offsets 4 (validity) and 5 (percentage). hidapi prepends the report ID.
    # CMD/LEN correlation is a conservative local guard; Xj only matches ID.
    # No reply OP, checksum, charging flag or resolution is invented.
    if (not reply or not 10 <= len(reply) <= MAX_REPORT_BYTES
            or reply[0] != REPORT_ID or reply[2] != 0x27
            or not 6 <= reply[3] <= len(reply) - 4
            or reply[8] == 0 or not 0 <= reply[9] <= 100):
        return None
    return reply[9], False, ""


class MoondropProvider(BatteryHidProvider):
    name = "moondrop"
    vid, pids = VID, PIDS
    kind = "headset"
    charging_known = False
    verification_level = "C"

    def poll(self):
        result = super().poll()
        if not result and not self._diag:
            self._diag.append("no eligible GM01 Pro collection or HID backend; not opened; nothing sent")
        return result

    def _pick(self, infos):
        candidates = [info for info in infos
                      if (info.get("vendor_id"), info.get("product_id")) == (VID, 0x0133)
                      and (info.get("usage_page"), info.get("usage")) in COLLECTIONS]
        if not candidates:
            self._diag.append("missing eligible GM01 Pro collection; not opened; nothing sent")
            return None
        # Preserve the original fail-closed rule for duplicate raw FF02 paths,
        # even if one lacks proof or a valid consumer collection also exists.
        if sum((info.get("usage_page"), info.get("usage")) == COLLECTION
               for info in candidates) > 1:
            self._diag.append("missing or ambiguous FF02:0002 collection; not opened; nothing sent")
            return None
        failures = []
        for collection in COLLECTIONS:
            eligible = []
            for info in candidates:
                if (info.get("usage_page"), info.get("usage")) != collection:
                    continue
                reason = self._proof_failure(info)
                if reason:
                    failures.append(reason)
                else:
                    eligible.append(info)
            if len(eligible) > 1:
                self._diag.append(f"ambiguous {collection[0]:04X}:{collection[1]:04X} collection; "
                                  "not opened; nothing sent")
                return None
            if eligible:
                return eligible[0]
        # Failed siblings are not a 'nothing sent' diagnostic for a successful
        # selection. Retain their sanitized proof reasons only when none qualify.
        self._diag.extend(failures)
        return None

    def _proof_failure(self, info):
        if not info.get("path") or not info.get("physical_id"):
            return "collection path/physical parent unresolved; not opened; nothing sent"
        for direction, minimum in (("input", 10), ("output", 4)):
            maximum = info.get(direction + "_report_length")
            sizes = info.get(direction + "_report_sizes")
            # Require 4B to occupy the collection maximum as well: do not
            # guess how Windows pads a shorter report in a mixed collection.
            if (type(maximum) is not int or not minimum <= maximum <= MAX_REPORT_BYTES
                    or not isinstance(sizes, dict) or not sizes
                    or any(type(n) is not int or not 2 <= n <= maximum for n in sizes.values())
                    or sizes.get(str(REPORT_ID)) != maximum):
                return (direction + " report 4B length unproven"
                        + report_proof_summary(info, direction, include_declared=True)
                        + "; not opened; nothing sent")
        return None

    def _query(self, dev, info):
        request = make_request(info["output_report_length"])
        if dev.write(request) != len(request):
            self._diag.append("short/failed battery query write; no retry")
            return None
        length = info["input_report_length"]
        deadline = time.monotonic() + self.read_timeout_ms / 1000
        for _ in range(MAX_READS):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            reply = dev.read(length, max(1, math.ceil(remaining * 1000)))
            if not reply:
                break
            if len(reply) != length:
                continue
            parsed = parse_reply(reply)
            if parsed is not None:
                return parsed
            if (reply[0] == REPORT_ID and reply[2] == 0x27
                    and 6 <= reply[3] <= len(reply) - 4 and reply[8] == 0):
                break  # Hub returns zero here; retain unknown, not a false 0%.
        self._diag.append("no valid battery reply; no new reading; connection unknown")
        return None
