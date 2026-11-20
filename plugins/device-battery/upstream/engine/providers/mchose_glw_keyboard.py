"""G87 V2 GLW read-only configuration path, C / unverified.

See research/batch2-protocols.md §1 and M1/M2. The official SDK has no identified
open-source licence; only protocol facts are independently implemented here.
In particular there is no setBase/automatic configuration repair branch.
"""
from mchose_keyboard_hid import KeyboardProvider

VID = 0x3837
PIDS = {0x3033: "MCHOSE G87 V2"}


def make_request(command, offset, length):
    # An explicit read-only allowlist, including the exact documented ranges.
    valid = ((command, offset, length) == (4, 0, 56)
             or command == 5 and any((offset, length) in ((64 * p, 56), (64 * p + 56, 8))
                                    for p in range(4)))
    if not valid:
        raise ValueError("undocumented GLW request forbidden")
    payload = [0x55, command, 0, 0, length, offset & 255, offset >> 8, 0] + [0] * 56
    payload[3] = sum(payload[4:]) & 255
    return payload


def parse_reply(payload, command, offset, length):
    if len(payload) < 64 or payload[0] != 0xAA or payload[1] != command:
        raise ValueError("rejected GLW marker/command or incomplete report")
    if payload[4] != length or payload[5:7] != [offset & 255, offset >> 8]:
        raise ValueError("rejected GLW declared length or offset echo")
    # Reply checksum and other header flags are unconfirmed; neither is guessed.
    return payload[8:8 + length]


def active_profile(data):
    if len(data) != 56 or data[0] not in range(4):
        raise ValueError("invalid GLW active profile; no automatic repair")
    slots = data[2:6]
    return slots[data[0]] if sorted(slots) == [0, 1, 2, 3] else data[0]


class MchoseGlwKeyboardProvider(KeyboardProvider):
    name = "mchose_glw_keyboard"
    pids = PIDS
    product = "MCHOSE G87 V2 2.4G"
    collection = (1, 0)
    input_id = None  # Learn the single actual input ID from the descriptor.
    output_id = 0
    min_input = min_output = output_bytes = 65

    def _read(self, dev, info, command, offset, length):
        return self._exchange(dev, info, make_request(command, offset, length),
                              lambda payload: parse_reply(payload, command, offset, length))

    def _query(self, dev, info):
        base = self._read(dev, info, 4, 0, 56)
        if base is None:
            return None
        try:
            profile = active_profile(base)
        except ValueError as error:
            self._diag.append(str(error))
            return None
        if sorted(base[2:6]) != [0, 1, 2, 3]:
            self._diag.append("GLW legacy direct profile index; format needs hardware validation")
        first = self._read(dev, info, 5, 64 * profile, 56)
        if first is None:
            return None
        tail = self._read(dev, info, 5, 64 * profile + 56, 8)
        if tail is None:
            return None
        config = first + tail
        level = config[32] & 0x7F
        if level > 100:
            self._diag.append("rejected GLW percentage outside 0..100")
            return None
        return level, bool(config[32] & 0x80)
