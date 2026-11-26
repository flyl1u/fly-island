//! Reply layouts of the Arctis dongles and the Rival 3 / Aerox 3 mouse families.
//! Model list and headset layouts as documented by Sapd/HeadsetControl; mouse
//! layouts from steel-mouse, rivalcfg and alloyctl. `None` means no live reading.

/// (percent, charging)
pub(super) type Reading = Option<(u8, bool)>;
pub(super) type Parse = fn(&[u8]) -> Reading;

fn percent(raw: u8) -> Option<u8> {
    (raw <= 100).then_some(raw)
}

/// 0..=4 steps.
fn quarters(raw: u8) -> Option<u8> {
    (raw <= 4).then(|| raw * 25)
}

/// `b0 <link> <battery> <status>`. The battery byte keeps its old value while the
/// headset is off, so the link byte must say "connected" (03).
fn nova7_fields(reply: &[u8]) -> Option<(u8, bool)> {
    (reply.len() >= 4 && reply[0] == 0xB0 && reply[1] == 0x03 && reply[3] != 0x00)
        .then(|| (reply[2], matches!(reply[3], 0x01 | 0x02)))
}

pub(super) fn nova7(reply: &[u8]) -> Reading {
    let (raw, charging) = nova7_fields(reply)?;
    Some((percent(raw)?, charging))
}

/// The original firmware reports 0..=4.
pub(super) fn nova7_discrete(reply: &[u8]) -> Reading {
    let (raw, charging) = nova7_fields(reply)?;
    Some((quarters(raw)?, charging))
}

/// `b0 <status> <?> <battery> <charging>`; status 02 is off.
pub(super) fn nova5(reply: &[u8]) -> Reading {
    if reply.len() < 5 || reply[0] != 0xB0 || reply[1] == 0x02 {
        return None;
    }
    Some((percent(reply[3])?, reply[4] == 0x01))
}

/// `b0 <status> <battery 0..4> <charging>`; status 01 is off.
pub(super) fn arctis7_plus(reply: &[u8]) -> Reading {
    if reply.len() < 4 || reply[0] != 0xB0 || reply[1] == 0x01 {
        return None;
    }
    Some((quarters(reply[2])?, reply[3] == 0x01))
}

/// The lower level of the buds out of the case (status 03); a cased bud reports 0 %.
pub(super) fn gamebuds(reply: &[u8]) -> Reading {
    if reply.len() < 7 || reply[0] != 0xB0 {
        return None;
    }
    let lowest = (0..2)
        .filter(|i| reply[3 + i] == 0x03)
        .map(|i| reply[5 + i])
        .min()?;
    Some((percent(lowest)?, false))
}

/// A leading zero report ID byte may or may not be present.
fn skip_report_id(reply: &[u8]) -> &[u8] {
    match reply {
        [0x00, rest @ ..] if !rest.is_empty() => rest,
        _ => reply,
    }
}

/// `aa <level> <?> <charging>` (steel-mouse) or `<level> <?> <charging 0|1>`
/// (rivalcfg). Neither shape is confirmed on this project's hardware.
pub(super) fn rival3(reply: &[u8]) -> Reading {
    let body = skip_report_id(reply);
    if body.len() >= 4 && body[0] == 0xAA {
        return Some((percent(body[1])?, body[3] != 0));
    }
    match body {
        [level, _, charging @ (0 | 1), ..] => Some((percent(*level)?, *charging == 1)),
        _ => None,
    }
}

/// `d2 <level>`: bit 7 is charging, the rest a 1..=21 step or a direct percentage
/// above 21. Zero means off or asleep, not empty.
pub(super) fn aerox3(reply: &[u8]) -> Reading {
    let [0xD2, byte, ..] = skip_report_id(reply) else {
        return None;
    };
    let value = byte & 0x7F;
    let level = match value {
        0 => return None,
        1..=21 => (value - 1) * 5,
        _ => percent(value)?,
    };
    Some((level, byte & 0x80 != 0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nova7_trusts_the_battery_only_while_linked() {
        assert_eq!(nova7(&[0xB0, 0x03, 99, 0x03]), Some((99, false)));
        assert_eq!(nova7(&[0xB0, 0x02, 99, 0x03]), None);
        assert_eq!(nova7(&[0xB0, 0x03, 99, 0x00]), None);
        assert_eq!(nova7(&[0x01, 0x00, 0x63, 0x02]), None);
        assert_eq!(nova7_discrete(&[0xB0, 0x03, 3, 0x01]), Some((75, true)));
        assert_eq!(nova7_discrete(&[0xB0, 0x03, 50, 0x01]), None);
    }

    #[test]
    fn other_headset_layouts() {
        assert_eq!(nova5(&[0xB0, 0x00, 0, 80, 1]), Some((80, true)));
        assert_eq!(nova5(&[0xB0, 0x02, 0, 80, 1]), None);
        assert_eq!(arctis7_plus(&[0xB0, 0x00, 4, 0]), Some((100, false)));
        assert_eq!(arctis7_plus(&[0xB0, 0x01, 4, 0]), None);
        assert_eq!(gamebuds(&[0xB0, 0, 0, 3, 1, 70, 0]), Some((70, false)));
        assert_eq!(gamebuds(&[0xB0, 0, 0, 3, 3, 70, 64]), Some((64, false)));
        assert_eq!(gamebuds(&[0xB0, 0, 0, 1, 1, 70, 64]), None);
    }

    #[test]
    fn mouse_layouts() {
        assert_eq!(rival3(&[0xAA, 85, 0, 1]), Some((85, true)));
        assert_eq!(rival3(&[0x00, 85, 0, 0]), Some((85, false)));
        assert_eq!(rival3(&[85, 0, 7]), None);
        assert_eq!(rival3(&[0xAA, 120, 0, 1]), None);
        assert_eq!(aerox3(&[0xD2, 0x95]), Some((100, true)));
        assert_eq!(aerox3(&[0x00, 0xD2, 1]), Some((0, false)));
        assert_eq!(aerox3(&[0xD2, 60]), Some((60, false)));
        assert_eq!(aerox3(&[0xD2, 0x80]), None);
        assert_eq!(aerox3(&[0x40, 1]), None);
    }
}
