"""ATK N9 V2 receivers, battery-only Bolutek protocol (verification C).

Facts from ATK Hub 3.2.31; see upstream-protocols.md. Only the two diagnosed
receiver IDs and FF90:0001 are enabled. Report 55 must be proven per ID by
the runtime descriptor: output 64 bytes, input 22..64 bytes including ID.
The source requires at least 21 input payload bytes, not a fixed input size;
64 is our conservative receive ceiling. The actual reply must match its caps.

No initialization, register binding, feature, EQ, pairing or OTA commands.
Initial N9 Ultra 373B:1204 uses a different serial protocol and is not enabled.
"""
from battery_hid import BatteryHidProvider

VID = 0x373B
PIDS = {
    0x1262: "ATK N9 V2 Ultimate",
    0x12D6: "ATK N9 V2 ULTRA",
}


def make_request():
    # WebHID report 55, 63-byte payload: GetBattery 65, Headset target 01.
    return [0x55, 0x65, 0x01] + [0] * 61


def parse_reply(reply):
    if (not 22 <= len(reply) <= 64 or list(reply[:2]) != [0x55, 0x65]
            or not 0 <= reply[2] <= 100 or reply[3] not in (0x02, 0x03, 0x04)):
        return None
    # ATK's states differ from MCHOSE: 04 is full, 00 is not a known state.
    return reply[2], reply[3] == 0x03, ""


def no_reading_reply(reply):
    return (22 <= len(reply) <= 64 and reply[0] == 0x55
            and (reply[1] == 0x65 and reply[3] == 0x1A
                 or tuple(reply[1:3]) == (0x0A, 0x01)))


class AtkHeadsetProvider(BatteryHidProvider):
    name = "atk_headset"
    vid, pids = VID, PIDS
    collection = (0xFF90, 0x0001)
    input_id = output_id = 0x55
    input_bounds = (22, 64)
    output_bytes = 64
    kind = "headset"
    charging_known = True
    make_request = staticmethod(make_request)
    parse_reply = staticmethod(parse_reply)
    no_reading_reply = staticmethod(no_reading_reply)
