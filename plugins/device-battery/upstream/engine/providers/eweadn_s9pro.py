"""372E:1026 battery only, from EWEADN Hub's Bytech getBasics path.

The runtime descriptor must uniquely locate Feature 03/64 bytes among the
FF00:0001 and FF06:0001 collections of one physical receiver. No probing,
initialization commands, online/UUID queries or configuration writes.
"""
import time

from battery_hid import BatteryHidProvider, report_proof_summary

VID = 0x372E
PIDS = {0x1026: "EWEADN S9 PRO 8K"}
COLLECTIONS = {(0xFF00, 0x0001), (0xFF06, 0x0001)}
REPORT_ID = 0x03
REPORT_BYTES = 64


def make_request():
    # 63-byte WebHID payload; checksum 20 excludes the report-ID slot.
    return [0x03, 0x20, 0x50, 0x00, 0x00, 0x4F, 0x81] + [0] * 57


def parse_reply(reply):
    if reply and len(reply) == 16:
        # #315: short replies despite a descriptor-proven Feature 03/64.
        if (reply[0] != REPORT_ID or reply[1] != 0x50 or reply[2] != 0
                or reply[5] != 1):
            return None
        level = reply[6] & 0x7F
        if not 1 <= level <= 100:
            return None
        return level, bool(reply[6] & 0x80), ""
    if (not reply or len(reply) != REPORT_BYTES or reply[0] != REPORT_ID
            or reply[2] != 0 or reply[4] != 0
            or not 7 <= reply[3] <= REPORT_BYTES - 6):
        return None
    # SDK response signature: ACK=0, encapsulation index=0. TYPE/OFFSET
    # and a reply checksum are not established constants; do not invent them.
    level = reply[6] & 0x7F
    if level > 100:
        return None
    return level, bool(reply[6] & 0x80), ""


class EweadnS9ProProvider(BatteryHidProvider):
    name = "eweadn_s9pro"
    vid, pids = VID, PIDS
    kind = "mouse"
    charging_known = True

    def poll(self):
        result = super().poll()
        if not result and not self._diag:
            self._diag.append("no eligible S9 PRO collection or HID backend; not opened; nothing sent")
        return result

    def _pick(self, infos):
        candidates = []
        for info in infos:
            if (info.get("vendor_id") != VID or info.get("product_id") not in PIDS
                    or (info.get("usage_page"), info.get("usage")) not in COLLECTIONS):
                continue
            maximum = info.get("feature_report_length")
            sizes = info.get("feature_report_sizes")
            if (type(maximum) is int and REPORT_BYTES <= maximum <= 4096
                    and isinstance(sizes, dict) and sizes
                    and all(type(n) is int and 2 <= n <= maximum for n in sizes.values())
                    and max(sizes.values()) == maximum
                    and sizes.get(str(REPORT_ID)) == REPORT_BYTES):
                candidates.append(info)
            else:
                self._diag.append(f"{info['usage_page']:04X}:0001 Feature 03 length unproven"
                                  + report_proof_summary(info, "feature") + "; not opened; nothing sent")
        if len(candidates) != 1:
            self._diag.append("missing or ambiguous proven Feature 03 collection; not opened; nothing sent")
            return None
        info = candidates[0]
        if not info.get("path") or not info.get("physical_id"):
            self._diag.append("collection path/physical parent unresolved; not opened; nothing sent")
            return None
        self._diag.append("selected unique Feature 03/64 collection"
                          + report_proof_summary(info, "feature"))
        return info

    def _query(self, dev, info):
        request = make_request()
        if dev.send_feature_report(request) != len(request):
            self._diag.append("short/failed battery read request; no retry")
            return None
        time.sleep(0.100)  # SDK receive delay, without its generic retry policy.
        reading = parse_reply(dev.get_feature_report(REPORT_ID, REPORT_BYTES))
        if reading is None:
            self._diag.append("no valid battery reply; no new reading; connection unknown")
        return reading
