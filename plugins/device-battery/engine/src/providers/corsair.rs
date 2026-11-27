//! Corsair wireless headsets (HeadsetControl's protocol) here; the Bragi
//! get-property dongles are in `bragi`.
use super::context::Context;
use crate::hid::{DeviceInfo, HidDevice, HidResult};
use crate::status::Status;
use std::time::Duration;

mod bragi;

pub(crate) const VENDORS: &[u16] = &[0x1B1C];

const MODELS: [(u16, &str); 3] = [
    (0x2A08, "Corsair Void v2 Wireless"),
    (0x2A02, "Corsair Virtuoso Max Wireless"),
    (0x0A97, "Corsair HS80 Max Wireless"),
];
const CONTROL_INTERFACE: i32 = 4;
const RECEIVER: u8 = 0x08;
const HEADSET: u8 = 0x09;
/// (sub-command, command)
const FIRMWARE: (u8, u8) = (0x02, 0x13);
const HEARTBEAT: (u8, u8) = (0x02, 0x12);
const BATTERY: (u8, u8) = (0x02, 0x0F);

fn request(endpoint: u8, (sub, command): (u8, u8)) -> [u8; 65] {
    let mut frame = [0; 65];
    frame[1..5].copy_from_slice(&[0x02, endpoint, sub, command]);
    frame
}

/// The level word is in tenths of a percent; zero is not a reading.
fn parse(reply: &[u8]) -> Option<u8> {
    let value = u16::from_le_bytes([*reply.get(4)?, *reply.get(5)?]);
    (1..=1000).contains(&value).then_some((value / 10) as u8)
}

/// Drops replies that are still queued, so the next read answers our request.
fn drain(device: &mut dyn HidDevice) -> HidResult<()> {
    for _ in 0..4 {
        if device.read(64, Duration::from_millis(30))?.is_empty() {
            break;
        }
    }
    Ok(())
}

fn query(device: &mut dyn HidDevice) -> HidResult<Option<u8>> {
    let timeout = Duration::from_millis(500);
    device.write(&request(RECEIVER, FIRMWARE))?;
    device.write(&request(RECEIVER, HEARTBEAT))?;
    drain(device)?;
    device.write(&request(HEADSET, HEARTBEAT))?;
    // No heartbeat answer: the headset is off or asleep.
    if device.read(64, timeout)?.is_empty() {
        return Ok(None);
    }
    drain(device)?;
    for _ in 0..3 {
        device.write(&request(HEADSET, BATTERY))?;
        if let Some(level) = parse(&device.read(64, timeout)?) {
            return Ok(Some(level));
        }
    }
    Ok(None)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for (product_id, name) in MODELS {
        let mine: Vec<&DeviceInfo> = context
            .vendor(0x1B1C)
            .into_iter()
            .filter(|d| d.product_id == product_id)
            .collect();
        let Some(info) = mine
            .iter()
            .find(|d| d.interface_number == CONTROL_INTERFACE)
            .or(mine.first())
        else {
            continue;
        };
        let level = context
            .open(info)
            .and_then(|mut device| query(device.as_mut()))
            .ok()
            .flatten();
        if let Some(level) = level {
            result.push(Status::new(
                format!("corsair:{product_id:04x}"),
                name,
                Some(level),
                false,
                "headset",
            ));
        }
    }
    result.extend(bragi::poll(context));
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_level_is_a_word_in_tenths() {
        assert_eq!(parse(&[0, 0, 0, 0, 0xFD, 0x02]), Some(76));
        assert_eq!(parse(&[0, 0, 0, 0, 0, 0]), None);
        assert_eq!(parse(&[0, 0, 0, 0, 0xE9, 0x03]), None);
        assert_eq!(parse(&[0, 0, 0, 0, 1]), None);
        assert_eq!(request(HEADSET, BATTERY)[..5], [0, 2, 9, 2, 0x0F]);
    }
}
