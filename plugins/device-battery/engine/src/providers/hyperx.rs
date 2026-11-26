//! HyperX Cloud II Wireless (HeadsetControl's protocol): level and charging are two
//! separate 06 FF BB requests on the FF90:0303 collection.
use super::context::{sleep, Context};
use crate::hid::{DeviceInfo, HidResult};
use crate::status::Status;
use std::time::Duration;

pub(crate) const VENDORS: &[u16] = &[0x03F0];

const MODELS: [(u16, &str); 2] = [
    (0x0696, "HyperX Cloud II Wireless"),
    (0x018B, "HyperX Cloud II Wireless"),
];
const REPLY_LEN: usize = 20;
const LEVEL: u8 = 0x02;
const CHARGING: u8 = 0x03;

fn request(command: u8) -> [u8; 52] {
    let mut frame = [0; 52];
    frame[..4].copy_from_slice(&[0x06, 0xFF, 0xBB, command]);
    frame
}

fn answers(reply: &[u8], command: u8) -> bool {
    reply.len() >= 4 && reply[..4] == [0x06, 0xFF, 0xBB, command]
}

fn parse_level(reply: &[u8]) -> Option<u8> {
    let level = *reply.get(7)?;
    (answers(reply, LEVEL) && level <= 100).then_some(level)
}

fn parse_charging(reply: &[u8]) -> Option<bool> {
    let value = *reply.get(4)?;
    answers(reply, CHARGING).then_some(value == 1)
}

fn query(context: &Context, info: &DeviceInfo, command: u8) -> HidResult<Vec<u8>> {
    let mut device = context.open(info)?;
    // A failed write still leaves a pending reply worth reading, as upstream does.
    let _ = device.write(&request(command));
    sleep(100);
    device.read(REPLY_LEN, Duration::from_millis(1000))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for (product_id, name) in MODELS {
        // Without the battery collection nothing is written.
        let Some(info) = context
            .vendor(0x03F0)
            .into_iter()
            .find(|d| d.product_id == product_id && d.is_collection(0xFF90, 0x0303))
        else {
            continue;
        };
        let Some(level) = query(context, info, LEVEL)
            .ok()
            .and_then(|reply| parse_level(&reply))
        else {
            continue;
        };
        let charging = query(context, info, CHARGING)
            .ok()
            .and_then(|reply| parse_charging(&reply));
        result.push(Status {
            charging_known: Some(charging.is_some()),
            source: "hyperx",
            ..Status::new(
                format!("hyperx:{product_id:04x}"),
                name,
                Some(level),
                charging.unwrap_or(false),
                "headset",
            )
        });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::fake::FakeBus;

    #[test]
    fn replies_must_echo_their_command() {
        let level = [0x06, 0xFF, 0xBB, 2, 0, 0, 0, 87];
        assert_eq!(parse_level(&level), Some(87));
        assert_eq!(parse_charging(&level), None);
        assert_eq!(parse_charging(&[0x06, 0xFF, 0xBB, 3, 1]), Some(true));
        assert_eq!(parse_level(&level[..7]), None);
        assert_eq!(parse_level(&[0x06, 0xFF, 0xBB, 2, 0, 0, 0, 101]), None);
    }

    #[test]
    fn a_missing_charging_answer_stays_unknown() {
        let info = DeviceInfo {
            path: "h".into(),
            vendor_id: 0x03F0,
            product_id: 0x018B,
            usage_page: 0xFF90,
            usage: 0x0303,
            ..Default::default()
        };
        let bus = FakeBus::default();
        bus.script("h", |s| {
            s.on_write
                .insert(1, vec![vec![0x06, 0xFF, 0xBB, 2, 0, 0, 0, 55]]);
        });
        let statuses = poll(&mut Context::new(&[info], &bus));
        assert_eq!(statuses[0].level, Some(55));
        assert_eq!(statuses[0].charging_known, Some(false));
    }
}
