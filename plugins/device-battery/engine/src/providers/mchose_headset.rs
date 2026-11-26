//! MCHOSE V9 headsets: read 55 65. The V9 PRO receiver's firmware is read first
//! from Feature AA, because versions before 8 do not answer the battery protocol.
use super::context::{only, read_until, sleep, Context};
use crate::hid::{DeviceInfo, HidDevice, HidResult, Sizes};
use crate::status::Status;
use std::time::Duration;

pub(crate) const VENDORS: &[u16] = &[0x291D, 0x3837];

const PRO: (u16, u16) = (0x291D, 0x385D);
const MODELS: [((u16, u16), &str); 2] = [
    (PRO, "MCHOSE V9 PRO"),
    ((0x3837, 0x600A), "MCHOSE V9 Turbo+"),
];
const REPORT_BYTES: usize = 64;

#[derive(Debug, PartialEq)]
struct Reply {
    level: Option<u8>,
    charging: bool,
    online: bool,
}

fn request() -> [u8; REPORT_BYTES] {
    let mut frame = [0; REPORT_BYTES];
    frame[..3].copy_from_slice(&[0x55, 0x65, 0x01]);
    frame
}

fn firmware_request() -> [u8; REPORT_BYTES] {
    let mut frame = [0; REPORT_BYTES];
    frame[..3].copy_from_slice(&[0xAA, 0x01, 0x01]);
    frame
}

fn parse(reply: &[u8]) -> Option<Reply> {
    if reply.len() != REPORT_BYTES || reply[..2] != [0x55, 0x65] {
        return None;
    }
    let (level, charging, online) = match (reply[2], reply[3]) {
        (level, 0x02) if level <= 100 => (Some(level), false, true),
        // On external power: the receiver has no level to give.
        (_, 0x00 | 0x03) => (None, true, true),
        (_, 0x1A) => (None, false, false),
        _ => return None,
    };
    Some(Reply {
        level,
        charging,
        online,
    })
}

/// M HUB joins the four version bytes as decimal text, not as hex or BCD.
fn parse_firmware(reply: &[u8]) -> Option<u64> {
    if reply.len() != REPORT_BYTES || reply[..2] != [0xAA, 0x01] || reply == firmware_request() {
        return None;
    }
    let text: String = reply[2..6].iter().map(u8::to_string).collect();
    text.parse().ok()
}

fn read_firmware(device: &mut dyn HidDevice) -> HidResult<Option<u64>> {
    if device.send_feature(&firmware_request())? != REPORT_BYTES {
        return Ok(None);
    }
    sleep(300);
    Ok(parse_firmware(&device.get_feature(0xAA, REPORT_BYTES)?))
}

/// `None` when the receiver has no proven firmware collection or does not answer.
fn firmware(context: &Context, group: &[&DeviceInfo]) -> Option<u64> {
    let info = only(group, |d| {
        (d.vendor_id, d.product_id) == PRO && d.is_collection(0xFF22, 0x0001)
    })?;
    if info.path.is_empty()
        || info.feature_len != Some(REPORT_BYTES)
        || info.feature_sizes != Some(Sizes::from([(0xAA, REPORT_BYTES)]))
    {
        return None;
    }
    let mut device = context.open(info).ok()?;
    read_firmware(device.as_mut()).ok().flatten()
}

fn query(device: &mut dyn HidDevice) -> HidResult<Option<Reply>> {
    if device.write(&request())? != REPORT_BYTES {
        return Ok(None);
    }
    read_until(device, REPORT_BYTES, Duration::from_millis(1000), 32, parse)
}

fn model(info: &DeviceInfo) -> Option<&'static str> {
    MODELS
        .iter()
        .find(|(id, _)| info.is(id.0, id.1))
        .map(|(_, name)| *name)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut groups: Vec<(&str, Vec<&DeviceInfo>)> = Vec::new();
    for info in context.devices.iter().filter(|d| model(d).is_some()) {
        match groups.iter_mut().find(|(id, _)| *id == info.physical_id) {
            Some((_, list)) => list.push(info),
            None => groups.push((&info.physical_id, vec![info])),
        }
    }
    let mut result = Vec::new();
    for (physical, group) in groups {
        let battery = group.iter().copied().find(|d| {
            d.is_collection(0xFF90, 0x0001)
                && d.input_len == Some(REPORT_BYTES)
                && d.output_len == Some(REPORT_BYTES)
        });
        let Some((info, name)) = battery.and_then(|d| Some((d, model(d)?))) else {
            continue;
        };
        if (info.vendor_id, info.product_id) == PRO
            && firmware(context, &group).is_some_and(|version| version < 8)
        {
            continue;
        }
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        let Ok(Some(reply)) = query(device.as_mut()) else {
            continue;
        };
        result.push(Status {
            online: reply.online,
            connection_known: Some(true),
            charging_known: Some(reply.online),
            level_unavailable: reply.level.is_none(),
            physical_id: physical.to_string(),
            ..Status::new(
                format!("mchose_headset:{physical}"),
                name,
                reply.level,
                reply.charging,
                "headset",
            )
        });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(level: u8, state: u8) -> [u8; REPORT_BYTES] {
        let mut reply = request();
        reply[2] = level;
        reply[3] = state;
        reply
    }

    #[test]
    fn only_state_two_carries_a_level() {
        let live = parse(&reply(88, 2)).map(|r| (r.level, r.charging, r.online));
        assert_eq!(live, Some((Some(88), false, true)));
        let charging = parse(&reply(88, 3)).map(|r| (r.level, r.charging, r.online));
        assert_eq!(charging, Some((None, true, true)));
        let offline = parse(&reply(0, 0x1A)).map(|r| r.online);
        assert_eq!(offline, Some(false));
        assert_eq!(parse(&reply(101, 2)), None);
        assert_eq!(parse(&reply(50, 0x07)), None);
    }

    #[test]
    fn firmware_digits_are_joined_in_decimal() {
        let mut reply = [0u8; REPORT_BYTES];
        reply[..6].copy_from_slice(&[0xAA, 0x01, 0, 0, 1, 2]);
        assert_eq!(parse_firmware(&reply), Some(12));
        assert_eq!(parse_firmware(&firmware_request()), None);
    }
}
