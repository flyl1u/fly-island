//! HyperX Cloud Alpha 2 base station: request 50 02, reply 51 02. The collection is
//! chosen by usage, never by interface number.
use super::context::Context;
use crate::hid::{DeviceInfo, HidResult};
use crate::status::Status;
use std::time::{Duration, Instant};

pub(crate) const VENDORS: &[u16] = &[0x03F0];

const NAME: &str = "HyperX Cloud Alpha 2";
/// The controller half; the chat half 0ABE carries no battery.
const PRODUCT_ID: u16 = 0x08BE;
const REPORT_BYTES: usize = 64;

fn request() -> [u8; REPORT_BYTES] {
    let mut frame = [0; REPORT_BYTES];
    frame[..2].copy_from_slice(&[0x50, 0x02]);
    frame
}

fn parse(reply: &[u8]) -> Option<(u8, bool)> {
    let flags = *reply.get(6)?;
    (reply[..2] == [0x51, 0x02] && reply[2] <= 100).then_some((reply[2], flags & 0x80 != 0))
}

fn query(context: &Context, info: &DeviceInfo) -> HidResult<Option<(u8, bool)>> {
    let mut device = context.open(info)?;
    // Drop frames that were queued before the request.
    for _ in 0..64 {
        if device
            .read(REPORT_BYTES, Duration::from_millis(5))?
            .is_empty()
        {
            break;
        }
    }
    device.write(&request())?;
    let deadline = Instant::now() + Duration::from_millis(1500);
    while Instant::now() < deadline {
        let reply = device.read(REPORT_BYTES, Duration::from_millis(150))?;
        if let Some(reading) = parse(&reply) {
            return Ok(Some(reading));
        }
    }
    Ok(None)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let Some(info) = context
        .vendor(0x03F0)
        .into_iter()
        .find(|d| d.product_id == PRODUCT_ID && d.is_collection(0xFF13, 0xFF00))
    else {
        return Vec::new();
    };
    match query(context, info) {
        Ok(Some((level, charging))) => vec![Status::new(
            format!("hyperx:{PRODUCT_ID:04x}"),
            NAME,
            Some(level),
            charging,
            "headset",
        )],
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bit_seven_of_byte_six_is_charging() {
        let mut reply = [0u8; REPORT_BYTES];
        reply[..7].copy_from_slice(&[0x51, 0x02, 77, 0, 0, 0, 0x80]);
        assert_eq!(parse(&reply), Some((77, true)));
        assert_eq!(parse(&reply[..6]), None);
        reply[2] = 101;
        assert_eq!(parse(&reply), None);
        assert_eq!(parse(&request()), None);
    }
}
