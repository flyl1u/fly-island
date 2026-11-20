"""Dragonfly 3 SE receiver only; independent VGN HUB protocol facts.

Only the battery query is sent, without online/configuration probes. Report
sizes must be proven by the descriptor. See engine/upstream-protocols.md.
"""
from battery_hid import BatteryHidProvider

VID = 0x391D
PIDS = {0x1A01: "VGN Dragonfly3 SE"}


def make_request():
    # hidapi needs the ID-0 slot; WebHID sends the following 64-byte payload.
    return [0, 0x55, 0x30] + [0] * 62


def parse_reply(reply):
    # Unnumbered input has no ID slot. HUB only correlates the command byte;
    # it supplies no response header/checksum or charging-state validation.
    if (len(reply) != 64 or reply[1] != 0x30 or reply[9] == 1
            or not 0 <= reply[8] <= 100 or list(reply) == make_request()[1:]):
        return None
    return reply[8], False, ""


class VgnDragonfly3Provider(BatteryHidProvider):
    name = "vgn_dragonfly3"
    vid, pids = VID, PIDS
    collection = (0xFF01, 0x0010)
    input_id = output_id = 0
    input_bounds = (65, 65)
    output_bytes = 65
    kind = "mouse"
    make_request = staticmethod(make_request)
    parse_reply = staticmethod(parse_reply)
