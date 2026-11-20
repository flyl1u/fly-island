"""G3M PRO only; batch3-protocols G1-G3, MIT protocol references.

Independent battery-only implementation. No configuration session/commit,
online probe or Rainy75 fallback. Response checksum and charging are unknown.
Pinned sources and licences: engine/upstream-protocols.md.
"""
from battery_hid import BatteryHidProvider

VID = 0x320F
PIDS = {0x706E: "HECATE G3M PRO"}


def make_request():
    return [0x04, 0x20, 0x00, 0x1A, 0x06] + [0] * 59


def parse_reply(reply):
    if (len(reply) != 64 or reply[0] != 0x04 or reply[3] != 0x1A
            or reply[7] in (0xFE, 0xFF) or not 0 <= reply[8] <= 100
            or list(reply) == make_request()):
        return None
    return reply[8], False, ""


class G3mProvider(BatteryHidProvider):
    name = "g3m"
    vid, pids = VID, PIDS
    collection = (0xFF1C, 0x0092)
    input_id = output_id = 0x04
    input_bounds = (64, 64)
    output_bytes = 64
    kind = "mouse"
    make_request = staticmethod(make_request)
    parse_reply = staticmethod(parse_reply)
