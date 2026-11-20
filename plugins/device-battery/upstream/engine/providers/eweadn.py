"""S9 receiver only; batch3-protocols E1/E2 (HaloBattery PR #352, MIT).

Independent, narrowed implementation: exact collection and M156 response.
33 is the upstream read capacity, NOT a known input descriptor length.
Require actual unnumbered byte-array caps at runtime (15..33 input bytes).
Charging/checksum need hardware evidence; no passive D1 or wired fallback.
"""
from battery_hid import BatteryHidProvider

VID = 0x089D
PIDS = {0x062F: "EWEADN S9"}


def make_request():
    # 0 is hidapi's report-ID slot; checksum sum(q[5:32]) is zero.
    return [0x00, 0x30] + [0] * 31


def parse_reply(reply):
    if (not 15 <= len(reply) <= 33 or list(reply[:2]) != [0x30, 0]
            or reply[3] < 11 or reply[3] > len(reply) - 4
            or list(reply[4:8]) != list(b"M156") or not 0 <= reply[13] <= 100
            or reply[14] != 1):
        return None
    return reply[13], False, ""


class EweadnProvider(BatteryHidProvider):
    name = "eweadn"
    vid, pids = VID, PIDS
    collection = (0xFF01, 0x0010)
    input_id = output_id = 0
    # Windows includes the ID slot, hidapi strips it from input only.
    input_bounds = (16, 34)
    output_bytes = 33
    kind = "mouse"
    make_request = staticmethod(make_request)
    parse_reply = staticmethod(parse_reply)
