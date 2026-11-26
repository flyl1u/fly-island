//! ASTRO A50 Gen 5 base station (HeadsetControl's protocol): command 06 returns the
//! level and the dock state.
use super::context::Context;
use crate::hid::{DeviceInfo, HidResult};
use crate::status::Status;
use std::time::Duration;

pub(crate) const VENDORS: &[u16] = &[0x046D];

const NAME: &str = "Astro A50 Gen 5";
const PRODUCT_ID: u16 = 0x0B1C;
const FRAME_BYTES: usize = 64;
const COMMAND: u8 = 0x06;

fn request() -> [u8; FRAME_BYTES] {
    let mut frame = [0; FRAME_BYTES];
    // Report 02, marker 0C, length 3, command, and an echo token.
    frame[..6].copy_from_slice(&[0x02, 0x0C, 0x03, 0x00, COMMAND, 0x0C]);
    frame
}

/// (percent, docked) from a battery reply.
fn parse(reply: &[u8]) -> Option<(u8, bool)> {
    let level = *reply.get(6)?;
    if reply[..2] != [0x02, 0x0C] || reply[4] != COMMAND || level > 100 {
        return None;
    }
    Some((level, reply.get(8).is_some_and(|&dock| dock != 0)))
}

fn query(context: &Context, info: &DeviceInfo) -> HidResult<Option<(u8, bool)>> {
    let mut device = context.open(info)?;
    device.write(&request())?;
    // Other frames can arrive first.
    for _ in 0..8 {
        let reply = device.read(FRAME_BYTES, Duration::from_millis(300))?;
        if reply.len() > 4 && reply[4] == COMMAND {
            return Ok(parse(&reply));
        }
    }
    Ok(None)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mine: Vec<&DeviceInfo> = context
        .vendor(0x046D)
        .into_iter()
        .filter(|d| d.product_id == PRODUCT_ID)
        .collect();
    let Some(info) = mine
        .iter()
        .find(|d| d.is_collection(0xFF32, 0x0074))
        .or(mine.first())
    else {
        return Vec::new();
    };
    match query(context, info) {
        Ok(Some((level, docked))) => vec![Status::new(
            format!("astro:{PRODUCT_ID:04x}"),
            NAME,
            Some(level),
            docked,
            "headset",
        )],
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::fake::FakeBus;

    #[test]
    fn unrelated_frames_are_skipped() {
        let info = DeviceInfo {
            path: "a".into(),
            vendor_id: 0x046D,
            product_id: PRODUCT_ID,
            ..Default::default()
        };
        let bus = FakeBus::default();
        bus.script("a", |s| {
            s.reads.push_back(vec![2, 0x0C, 5, 0, 0x99, 0, 1, 0, 0]);
            s.reads.push_back(vec![2, 0x0C, 6, 0, 6, 0x0C, 64, 0, 1]);
        });
        let statuses = poll(&mut Context::new(&[info], &bus));
        assert_eq!((statuses[0].level, statuses[0].charging), (Some(64), true));
        assert_eq!(parse(&[2, 0x0C, 6, 0, 6, 0x0C, 101]), None);
    }
}
