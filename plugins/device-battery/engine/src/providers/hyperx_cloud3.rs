//! HyperX Cloud III / Cloud II Core Wireless: report 66, only on FF13:0001. Some
//! dongles reject output reports on Windows and take the same bytes as a feature
//! report.
use super::context::{sleep, Context};
use crate::hid::{DeviceInfo, HidDevice, HidResult};
use crate::status::Status;
use std::time::Duration;

pub(crate) const VENDORS: &[u16] = &[0x03F0];

const CLOUD_3: &str = "HyperX Cloud III Wireless";
const CLOUD_2_CORE: &str = "HyperX Cloud II Core Wireless";
/// (PID, canonical PID, name): alternate IDs share one card.
const MODELS: [(u16, u16, &str); 5] = [
    (0x05B7, 0x05B7, CLOUD_3),
    (0x0C9D, 0x05B7, CLOUD_3),
    (0x0FCC, 0x05B7, CLOUD_3),
    (0x0795, 0x0995, CLOUD_2_CORE),
    (0x0995, 0x0995, CLOUD_2_CORE),
];
const PACKET_BYTES: usize = 62;
/// (command, the other reply ID)
const BATTERY: (u8, u8) = (0x89, 0x0D);
const CHARGING: (u8, u8) = (0x8A, 0x0C);

fn request(command: u8) -> [u8; PACKET_BYTES] {
    let mut frame = [0; PACKET_BYTES];
    frame[..2].copy_from_slice(&[0x66, command]);
    frame
}

fn answers(reply: &[u8], (command, response): (u8, u8)) -> bool {
    reply.len() > 1 && reply[0] == 0x66 && (reply[1] == command || reply[1] == response)
}

fn parse_battery(reply: &[u8]) -> Option<u8> {
    if reply.len() <= 4 || !answers(reply, BATTERY) || reply[2..4] == [0, 0] {
        return None;
    }
    (reply[4] <= 100).then_some(reply[4])
}

fn parse_charging(reply: &[u8]) -> Option<bool> {
    if reply.len() <= 2 || !answers(reply, CHARGING) {
        return None;
    }
    match reply[2] {
        0 => Some(false),
        1 | 2 => Some(true),
        _ => None,
    }
}

/// Windows says "incorrect function" (error 1) for a collection that only takes
/// feature reports; the message text is localized, the code is not.
fn feature_only(message: &str) -> bool {
    let message = message.to_lowercase();
    [
        "incorrect function",
        "0x00000001",
        "0x80070001",
        "os error 1)",
    ]
    .iter()
    .any(|marker| message.contains(marker))
}

fn send(device: &mut dyn HidDevice, packet: &[u8]) -> bool {
    match device.write(packet) {
        Ok(_) => true,
        Err(error) if feature_only(&error.0) => device.send_feature(packet).is_ok(),
        Err(_) => false,
    }
}

fn query(context: &Context, info: &DeviceInfo, kind: (u8, u8)) -> HidResult<Option<Vec<u8>>> {
    let mut device = context.open(info)?;
    if !send(device.as_mut(), &request(kind.0)) {
        return Ok(None);
    }
    sleep(100);
    for _ in 0..6 {
        let reply = device.read(64, Duration::from_millis(200))?;
        if answers(&reply, kind) {
            return Ok(Some(reply));
        }
    }
    Ok(None)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut found: Vec<(u16, &str, u8, Option<bool>)> = Vec::new();
    for (product_id, canonical, name) in MODELS {
        let Some(info) = context
            .vendor(0x03F0)
            .into_iter()
            .find(|d| d.product_id == product_id && d.is_collection(0xFF13, 0x0001))
        else {
            continue;
        };
        let reply = |kind| query(context, info, kind).ok().flatten();
        let Some(level) = reply(BATTERY).and_then(|r| parse_battery(&r)) else {
            continue;
        };
        let charging = reply(CHARGING).and_then(|r| parse_charging(&r));
        match found.iter_mut().find(|(id, ..)| *id == canonical) {
            None => found.push((canonical, name, level, charging)),
            Some(previous) if charging == Some(true) && previous.3 != Some(true) => {
                *previous = (canonical, name, level, charging);
            }
            Some(_) => {}
        }
    }
    found
        .into_iter()
        .map(|(canonical, name, level, charging)| Status {
            charging_known: Some(charging.is_some()),
            source: "hyperx",
            ..Status::new(
                format!("hyperx:{canonical:04x}"),
                name,
                Some(level),
                charging.unwrap_or(false),
                "headset",
            )
        })
        .collect()
}

#[cfg(test)]
mod tests;
