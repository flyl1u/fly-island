//! The 20-byte BY read frame shared by two keyboard readers. M HUB does not verify
//! reply checksums; VGN receivers were verified to carry one.

pub(crate) fn identity_request() -> [u8; 20] {
    frame(0x05, 0x19)
}

pub(crate) fn battery_request() -> [u8; 20] {
    frame(0x4A, 0x5E)
}

fn frame(command: u8, checksum: u8) -> [u8; 20] {
    let mut frame = [0; 20];
    frame[..3].copy_from_slice(&[0x13, command, 0x01]);
    frame[19] = checksum;
    frame
}

/// The 14 data bytes of one complete reply to `command`; a query echo is refused.
pub(crate) fn payload(reply: &[u8], command: u8, check_checksum: bool) -> Option<&[u8]> {
    if reply.len() != 20
        || reply[..4] != [0x13, command, 1, 0]
        || reply == identity_request()
        || reply == battery_request()
    {
        return None;
    }
    let sum = reply[..19].iter().fold(0u8, |sum, &b| sum.wrapping_add(b));
    if check_checksum && reply[19] != sum {
        return None;
    }
    Some(&reply[5..19])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn echoes_and_bad_checksums_are_refused() {
        assert_eq!(payload(&battery_request(), 0x4A, false), None);
        let mut reply = [0u8; 20];
        reply[..6].copy_from_slice(&[0x13, 0x4A, 1, 0, 2, 99]);
        reply[19] = reply[..19].iter().fold(0u8, |s, &b| s.wrapping_add(b));
        assert_eq!(payload(&reply, 0x4A, true).map(|d| d[0]), Some(99));
        reply[19] ^= 1;
        assert_eq!(payload(&reply, 0x4A, true), None);
        assert_eq!(payload(&reply, 0x4A, false).map(|d| d[0]), Some(99));
        assert_eq!(payload(&reply, 0x05, false), None);
    }
}
