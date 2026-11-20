"""Shared 20-byte BY read framing; brand-specific acceptance stays in providers.

Protocol facts from M HUB / VGN HUB, independently implemented. M HUB does
not verify reply checksums; VGN 258A:024F replies were checked in issue #190.
"""


def identity_request():
    return [0x13, 0x05, 0x01] + [0] * 16 + [0x19]


def make_request():
    return [0x13, 0x4A, 0x01] + [0] * 16 + [0x5E]


def payload(reply, command, *, check_checksum=False):
    """Accept one complete numbered packet; never accept a read-query echo."""
    if (len(reply) != 20 or any(type(b) is not int or not 0 <= b <= 255 for b in reply)
            or list(reply[:4]) != [0x13, command, 1, 0]
            or list(reply) in (identity_request(), make_request())):
        return None
    if check_checksum and reply[-1] != sum(reply[:-1]) & 255:
        return None
    # Offset 4 is packet metadata, not an established payload-length gate.
    return reply[5:19]
