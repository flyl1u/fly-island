//! AM Infinity 8K mouse: the vendor app's status poll F7, answered in feature
//! report 05.
use super::context::{sleep, Context};
use crate::hid::{DeviceInfo, HidResult};
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x3151];

const NAME: &str = "AM Infinity 8K Mouse";
/// The vendor app sends 65 bytes; the hardware probe tries both.
const POLL_LENGTHS: [usize; 2] = [65, 67];

fn request(length: usize) -> Vec<u8> {
    let mut frame = vec![0; length];
    frame[1] = 0xF7;
    frame
}

/// Byte 3 after report ID 05 (byte 2 without it), behind zero padding. Zero means the
/// radio link is not up yet.
fn parse(frame: &[u8]) -> Option<u8> {
    if frame.len() < 4 {
        return None;
    }
    let at = if frame[0] == 0x05 { 3 } else { 2 };
    if frame[1..at].iter().any(|&b| b != 0) {
        return None;
    }
    (frame[at] != 0).then(|| frame[at].min(100))
}

fn query(context: &Context, info: &DeviceInfo) -> HidResult<Option<u8>> {
    let mut device = context.open(info)?;
    for length in POLL_LENGTHS {
        if device.send_feature(&request(length)).is_err() {
            continue;
        }
        sleep(30);
        if let Some(level) = device.get_feature(0x05, 65).ok().and_then(|r| parse(&r)) {
            return Ok(Some(level));
        }
    }
    Ok(None)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let Some(info) = context
        .vendor(0x3151)
        .into_iter()
        .find(|d| d.product_id == 0x5007 && d.is_collection(0xFFFF, 0x02))
    else {
        return Vec::new();
    };
    match query(context, info) {
        Ok(Some(level)) => vec![Status::new(
            "am_infinity",
            NAME,
            Some(level),
            false,
            "mouse",
        )],
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn junk_padding_and_a_zero_charge_are_refused() {
        assert_eq!(parse(&[5, 0, 0, 0x64]), Some(100));
        assert_eq!(parse(&[0, 0, 42, 0]), Some(42));
        assert_eq!(parse(&[5, 0, 0, 200]), Some(100));
        assert_eq!(parse(&[5, 0, 0, 0]), None);
        assert_eq!(parse(&[5, 1, 0, 50]), None);
        assert_eq!(parse(&[5, 0, 0]), None);
    }
}
