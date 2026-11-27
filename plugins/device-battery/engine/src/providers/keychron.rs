//! Keychron receivers: a B3 06 feature request answered by input report B4.
use super::context::{sleep, Context};
use crate::hid::{DeviceInfo, HidResult};
use crate::status::Status;
use std::time::Duration;

pub(crate) const VENDORS: &[u16] = &[0x3434];

const MODELS: [(u16, &str); 2] = [(0xD028, "Keychron Ultra-Link 8K"), (0xD048, "Keychron M5")];
const VENDOR_INTERFACE: i32 = 4;
const REPORT_BYTES: usize = 64;
const ATTEMPTS: u8 = 3;

fn request() -> [u8; REPORT_BYTES] {
    let mut frame = [0; REPORT_BYTES];
    frame[..2].copy_from_slice(&[0xB3, 0x06]);
    frame
}

fn parse(reply: &[u8]) -> Option<u8> {
    let level = *reply.get(20)?;
    (reply[..2] == [0xB4, 0x06] && level <= 100).then_some(level)
}

fn query(context: &Context, info: &DeviceInfo) -> HidResult<Option<u8>> {
    let mut device = context.open(info)?;
    for attempt in 0..ATTEMPTS {
        if attempt > 0 {
            sleep(100);
        }
        if device.send_feature(&request()).is_err() {
            continue;
        }
        let reply = device.read(REPORT_BYTES, Duration::from_millis(500))?;
        if let Some(level) = parse(&reply) {
            return Ok(Some(level));
        }
    }
    Ok(None)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for (product_id, name) in MODELS {
        let mine: Vec<&DeviceInfo> = context
            .vendor(0x3434)
            .into_iter()
            .filter(|d| d.product_id == product_id)
            .collect();
        let Some(info) = mine
            .iter()
            .find(|d| d.interface_number == VENDOR_INTERFACE)
            .or(mine.first())
        else {
            continue;
        };
        if let Ok(Some(level)) = query(context, info) {
            result.push(Status::new(
                format!("keychron:{product_id:04x}"),
                name,
                Some(level),
                false,
                "",
            ));
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_level_sits_at_byte_twenty_of_report_b4() {
        let mut reply = [0u8; REPORT_BYTES];
        reply[..2].copy_from_slice(&[0xB4, 0x06]);
        reply[20] = 93;
        assert_eq!(parse(&reply), Some(93));
        assert_eq!(parse(&reply[..20]), None);
        reply[20] = 101;
        assert_eq!(parse(&reply), None);
        assert_eq!(parse(&request()), None);
    }
}
