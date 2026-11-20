"""Exact CHERRY MX 2.0S WL Pro USB/2.4G battery query.

Protocol facts: zcmk123/cherry-battery-state at
af82d4d98cbad872a586302ba44e6a6b75ba65f4 and contributor issue #482.
Independent battery-only implementation; contributor comparisons are grade C,
pending maintainer hardware validation. No settings or Bluetooth commands.
"""
from battery_hid import BatteryHidProvider

VID = 0x046A
PIDS = {0x01E0: "CHERRY MX 2.0S WL Pro", 0x01DE: "CHERRY MX 2.0S WL Pro"}
PRODUCTS = {0x01E0: "MX 2.0S Pro Dongle", 0x01DE: "MX 2.0S WL Pro"}


def make_request():
    return [4, 0x20, 0, 0x1A, 6] + [0] * 59


def parse_reply(reply):
    # Do not coerce integers, strings, floats or bools into synthetic bytes.
    if (not isinstance(reply, (bytes, bytearray, list, tuple)) or len(reply) != 64
            or any(type(n) is not int or not 0 <= n <= 255 for n in reply)
            or list(reply[:5]) != [4, 0x20, 0, 0x1A, 6]
            or reply[7] != 0 or not 1 <= reply[8] <= 100
            or reply[9] not in (0, 1)):
        return None
    return reply[8], reply[9] == 1, ""


class CherryProvider(BatteryHidProvider):
    name = "cherry"
    vid, pids = VID, PIDS
    collection = (0xFF1C, 0x0092)
    input_id = output_id = 4
    input_bounds = (64, 64)
    output_bytes = 64
    kind = "keyboard"
    charging_known = True
    make_request = staticmethod(make_request)
    parse_reply = staticmethod(parse_reply)

    def _pick(self, infos):
        # Count the whole parent's eligible collections before product/MI gates:
        # a second collection must never be discarded to make a write eligible.
        info = super()._pick(infos)
        if info is None:
            return None
        physical = info.get("physical_id")
        if not isinstance(physical, str) or not physical or physical.startswith("collection:"):
            self._diag.append("physical parent unresolved; uniqueness unknown: nothing sent")
        elif not isinstance(info["path"], (bytes, str)):
            self._diag.append("missing or ambiguous eligible collection: nothing sent")
        elif (type(info.get("interface_number")) is not int or info["interface_number"] != 1
              or info.get("product_string") != PRODUCTS[info["product_id"]]):
            self._diag.append("unverified CHERRY interface/product: nothing sent")
        elif (info["input_report_sizes"] != {"4": 64}
              or info["output_report_sizes"] != {"4": 64}):
            self._diag.append("single report 04/64 not proven: nothing sent")
        else:
            return info
        return None
