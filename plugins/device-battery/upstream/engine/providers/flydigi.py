"""APEX5 GET_INFO only; batch3-protocols F1 (CC0), F2/F3 (MIT).

Independent implementation; no IMU, rumble, trigger or mode-setting commands.
Only the observed single-fragment, model-80 replies are parsed. Response
checksum is unconfirmed; output checksum rules are not applied to replies.
"""
from battery_hid import BatteryHidProvider

VID = 0x37D7
PIDS = {0x2501: "Flydigi APEX5"}


def make_request():
    return [0x03, 0x5A, 0xA5, 0x01, 0x02, 0x03] + [0] * 26


def parse_reply(reply):
    if (len(reply) != 32 or list(reply[:7]) != [4, 0x5A, 0xA5, 1, 1, 0, 0x80]
            or reply[7] not in (1, 2)):
        return None
    tier, charge = reply[12] & 0x0F, reply[12] >> 4
    if charge not in (0, 1):
        return None
    if charge == 1:
        # The vendor represents charging as a sentinel, never 6 * 20 percent.
        return None, True, ""
    if tier > 5:
        return None
    return tier * 20, False, f"about {tier * 20}% ({tier}/5)"


class FlydigiProvider(BatteryHidProvider):
    name = "flydigi"
    vid, pids = VID, PIDS
    collection = (0xFFA0, 1)
    input_id, output_id = 4, 3
    input_bounds = (32, 32)
    output_bytes = 32
    kind = "gamepad"
    charging_known = True
    make_request = staticmethod(make_request)
    parse_reply = staticmethod(parse_reply)
