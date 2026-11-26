//! The 17-byte CompX frame: report 08, command 04, checksum 55 minus the sum.

pub(crate) const FRAME_BYTES: usize = 17;

pub(crate) fn checksum(payload: &[u8]) -> u8 {
    payload
        .iter()
        .fold(0x55u8, |sum, &byte| sum.wrapping_sub(byte))
}

pub(crate) fn power_request() -> [u8; FRAME_BYTES] {
    let mut frame = [0; FRAME_BYTES];
    frame[..2].copy_from_slice(&[0x08, 0x04]);
    frame[FRAME_BYTES - 1] = checksum(&frame[..FRAME_BYTES - 1]);
    frame
}

/// (percent, on external power)
pub(crate) fn parse_power(reply: &[u8]) -> Option<(u8, bool)> {
    let frame = reply.get(..FRAME_BYTES)?;
    (frame[..2] == [0x08, 0x04]
        && frame[FRAME_BYTES - 1] == checksum(&frame[..FRAME_BYTES - 1])
        && frame[6] <= 100)
        .then(|| (frame[6], frame[7] != 0))
}

/// The Link 8K dongle: an exact frame with a zero status byte; only 1 is charging.
pub(crate) fn parse_link8k_power(reply: &[u8]) -> Option<(u8, bool)> {
    if reply.len() != FRAME_BYTES || reply[2] != 0 {
        return None;
    }
    parse_power(reply).map(|(level, _)| (level, reply[7] == 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(level: u8, power: u8) -> [u8; FRAME_BYTES] {
        let mut reply = power_request();
        reply[6] = level;
        reply[7] = power;
        reply[16] = checksum(&reply[..16]);
        reply
    }

    #[test]
    fn the_request_matches_the_documented_frame() {
        assert_eq!(power_request()[..2], [8, 4]);
        assert_eq!(power_request()[16], 0x49);
    }

    #[test]
    fn checksum_and_range_are_required() {
        assert_eq!(parse_power(&reply(72, 1)), Some((72, true)));
        assert_eq!(parse_power(&reply(101, 0)), None);
        let mut bad = reply(72, 0);
        bad[16] ^= 1;
        assert_eq!(parse_power(&bad), None);
        assert_eq!(parse_link8k_power(&reply(72, 2)), Some((72, false)));
        let mut failed = reply(72, 1);
        failed[2] = 1;
        failed[16] = checksum(&failed[..16]);
        assert_eq!(parse_link8k_power(&failed), None);
    }
}
