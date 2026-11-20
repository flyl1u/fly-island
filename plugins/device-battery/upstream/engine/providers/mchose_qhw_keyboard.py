"""G98 V3 QHW battery query, C / unverified; research/batch2-protocols.md §3.

Independent implementation of protocol facts from official M HUB/CZ SDK
(M1/M2, no open-source licence found). No vendor implementation copied.
"""
from mchose_keyboard_hid import KeyboardProvider

VID = 0x3837
PIDS = {0x1015: "MCHOSE G98 V3"}


def make_request(sequence):
    if type(sequence) is not int or not 0 <= sequence <= 255:
        raise ValueError("invalid sequence")
    return [1, 3, 0, 4, 9, 0, sequence, 0x0E ^ sequence]


def parse_reply(payload, sequence):
    if len(payload) < 10 or payload[:7] != [1, 3, 2, 4, 9, 0, sequence]:
        raise ValueError("rejected QHW length/version/flags/command/bizCode/sequence")
    charge, level = payload[7:9]
    if charge not in (0, 1, 2) or not 0 <= level <= 100:
        raise ValueError("rejected QHW charging state or percentage")
    # The response checkCode algorithm has not been established. Do not invent
    # an XOR validator. State 2 means full, not actively charging.
    return level, charge == 1


class MchoseQhwKeyboardProvider(KeyboardProvider):
    name = "mchose_qhw_keyboard"
    pids = PIDS
    product = "MCHOSE G98 V3 2.4G"
    collection = (0xFF80, 1)
    input_id = output_id = 0x4D
    min_input, min_output = 11, 9
    output_bytes = None

    def _query(self, dev, info):
        sequence = self.sequence
        self.sequence = (sequence + 1) & 255
        return self._exchange(dev, info, make_request(sequence),
                              lambda payload: parse_reply(payload, sequence))
