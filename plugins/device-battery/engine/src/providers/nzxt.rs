//! NZXT Lift Elite: the dongle's telemetry read (4E 02 81 00 B0). Receiver and cable
//! feed one card.
use super::context::{sleep, Context};
use crate::hid::{DeviceInfo, HidResult};
use crate::status::Status;
use std::time::Duration;

pub(crate) const VENDORS: &[u16] = &[0x1E71];

const NAME: &str = "NZXT Lift Elite";
/// Receiver, then cable.
const PRODUCTS: [u16; 2] = [0x2101, 0x2129];

fn request() -> [u8; 64] {
    let mut frame = [0; 64];
    frame[..5].copy_from_slice(&[0x4E, 0x02, 0x81, 0x00, 0xB0]);
    frame
}

/// (percent, on the charging cable)
fn parse(reply: &[u8]) -> Option<(u8, bool)> {
    if reply.len() < 27 || reply[..3] != [0x4E, 0x02, 0x97] {
        return None;
    }
    let level = u8::try_from(u16::from_le_bytes([reply[17], reply[18]])).ok()?;
    (level <= 100).then_some((level, reply[22] & 1 != 0))
}

fn read(context: &Context, info: &DeviceInfo) -> HidResult<Option<(u8, bool)>> {
    let mut device = context.open(info)?;
    // Clear a stale reply from an earlier poll.
    for _ in 0..3 {
        if device.read(64, Duration::from_millis(1))?.is_empty() {
            break;
        }
    }
    device.write(&request())?;
    for _ in 0..10 {
        let reply = device.read(64, Duration::from_millis(150))?;
        // Empty reads and acknowledgements are not the telemetry.
        if reply.is_empty() || reply.starts_with(&[0x4E, 0xE5]) {
            continue;
        }
        if let Some(reading) = parse(&reply) {
            return Ok(Some(reading));
        }
        sleep(20);
    }
    Ok(None)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut answered = Vec::new();
    for product_id in PRODUCTS {
        let mut candidates: Vec<&DeviceInfo> = Vec::new();
        for info in context.vendor(0x1E71) {
            if info.product_id == product_id
                && info.is_collection(0xFFCA, 0x0001)
                && !candidates.iter().any(|c| c.path == info.path)
            {
                candidates.push(info);
            }
        }
        let reading = candidates
            .into_iter()
            .take(2)
            .find_map(|info| read(context, info).ok().flatten());
        answered.extend(reading);
    }
    let charging = answered.iter().find(|reading| reading.1);
    let Some(&(level, charging)) = charging.or(answered.first()) else {
        return Vec::new();
    };
    vec![Status::new(
        "nzxt:2101",
        NAME,
        Some(level),
        charging,
        "mouse",
    )]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_level_is_a_little_endian_word() {
        let mut reply = [0u8; 64];
        reply[..3].copy_from_slice(&[0x4E, 0x02, 0x97]);
        reply[17] = 84;
        reply[22] = 1;
        assert_eq!(parse(&reply), Some((84, true)));
        reply[18] = 1;
        assert_eq!(parse(&reply), None);
        assert_eq!(parse(&reply[..26]), None);
        assert_eq!(parse(&request()), None);
    }
}
