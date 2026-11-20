"""AE1C battery via two read-only legacy feature requests; no settings writes.

OpenMouse's pinned readLegacySettings path is documented in upstream-protocols.
Report-6 battery commands belong to the new protocol and are never used here.
"""
import time

from battery_hid import BatteryHidProvider

VID = 0x1915
PIDS = {0xAE1C: "Ninjutso Sora V2"}


def profile_request():
    return [5, 0x0D, 0, 0, 1, 0, 0, 0x16] + [0] * 24


def settings_request(profile):
    if type(profile) is not int or not 1 <= profile <= 255:
        raise ValueError("invalid legacy profile")
    return [4, 0x26, 0, 0, 1, 0, profile] + [0] * 697


def parse_profile(reply):
    if len(reply) != 32 or reply[0] != 5 or not 1 <= reply[9] <= 255:
        return None
    return reply[9]


def parse_reply(reply):
    if (len(reply) != 704 or reply[0] != 4 or not 0 <= reply[16] <= 100
            or reply[17] not in (0, 1)):
        return None
    # Match the upstream algorithm exactly: offset 701 is excluded, no modulo.
    if sum(reply[:701]) != reply[702] | (reply[703] << 8):
        return None
    return reply[16], reply[17] == 1, ""


class NinjutsoLegacyProvider(BatteryHidProvider):
    name = "ninjutso_legacy"
    vid, pids = VID, PIDS
    collection = (0xFFA0, 0x0001)
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
        # Upstream chooses a different (74-byte) format for the named 8K model.
        # Require the diagnosed noncompact name and both exact descriptor sizes.
        sizes = info.get("feature_report_sizes")
        if (info.get("product_string") != "Ninjutso Sora V2"
                or type(info.get("feature_report_length")) is not int
                or info["feature_report_length"] != 704
                or not isinstance(sizes, dict) or not sizes
                or any(type(n) is not int or not 2 <= n <= 704 for n in sizes.values())
                or sizes.get("4") != 704 or sizes.get("5") != 32):
            self._diag.append("legacy variant/report IDs/lengths unknown or incompatible: nothing sent")
            return None
        return info

    def _query(self, dev, info):
        profile = None
        for attempt in range(2):
            request = profile_request()
            if dev.send_feature_report(request) != len(request):
                self._diag.append("short/failed profile read request; no retry")
                return None
            time.sleep(0.015)
            reply = dev.get_feature_report(5, 32)
            profile = parse_profile(reply)
            if profile is not None:
                break
            # Only a well-sized, ID-5 zero-profile response gets the upstream
            # single retry. Silence/malformed responses never cause more I/O.
            if len(reply) != 32 or reply[0] != 5 or reply[9] != 0 or attempt == 1:
                self._diag.append("no valid legacy profile; connection unknown")
                return None
        request = settings_request(profile)
        if dev.send_feature_report(request) != len(request):
            self._diag.append("short/failed settings read request; no retry")
            return None
        time.sleep(0.090)
        reading = parse_reply(dev.get_feature_report(4, 704))
        if reading is None:
            self._diag.append("no valid legacy battery reply; connection unknown")
        return reading
