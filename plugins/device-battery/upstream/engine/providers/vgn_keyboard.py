"""VGN 320F:5088 keyboard receiver, from VGN HUB and a maintainer capture.

Independent read-only battery query; no G3M checksum, settings or fallback.
Rainy75 shares this USB identity but is unverified; the product string cannot
distinguish it. Only descriptor-backed reports with the battery signature count.
Evidence and limits: engine/upstream-protocols.md.
"""
from battery_hid import BatteryHidProvider

VID = 0x320F
PIDS = {0x5088: "VGN 2.4G 键盘"}


def make_request():
    return [0x04, 0x00, 0x00, 0x1A, 0x06] + [0] * 59


def parse_reply(reply):
    if (len(reply) != 64 or reply[0] != 0x04 or reply[3] != 0x1A
            or reply[4] != 0x06 or not 0 <= reply[8] <= 100
            or list(reply) == make_request()):
        return None
    return reply[8], False, ""


class VgnKeyboardProvider(BatteryHidProvider):
    name = "vgn_keyboard"
    vid, pids = VID, PIDS
    collection = (0xFF1C, 0x0092)
    input_id = output_id = 0x04
    input_bounds = (64, 64)
    output_bytes = 64
    kind = "keyboard"
    verification_level = "A"  # One maintainer reading; not all shared-ID devices.
    # The dongle answers about 1.03 s after the query (VGN HUB capture and maintainer
    # test), past the shared 1 s budget; asleep or awake, the reply is that slow.
    read_timeout_ms = 2500
    make_request = staticmethod(make_request)
    parse_reply = staticmethod(parse_reply)

    def device_name(self, info):
        return info.get("product_string") or super().device_name(info)

    def no_reading_reply(self, reply):
        return len(reply) == 64 and reply[0] == 0x04 and reply[3] == 0xFF
