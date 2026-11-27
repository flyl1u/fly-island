//! HyperX Cloud III S: the request goes to whichever collection accepts it, and the
//! answer (report 0C) or a notification (0D) may arrive on any of them.
use super::context::{sleep, Context};
use crate::hid::{DeviceInfo, HidDevice};
use crate::status::Status;
use std::time::{Duration, Instant};

pub(crate) const VENDORS: &[u16] = &[0x03F0];

const NAME: &str = "HyperX Cloud III S Wireless";
const PRODUCTS: [u16; 2] = [0x02CC, 0x06BE];
const PACKET_BYTES: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq)]
enum Value {
    Battery(u8),
    Charging(u8),
}

fn request(command: u8) -> [u8; PACKET_BYTES] {
    let mut frame = [0; PACKET_BYTES];
    frame[..6].copy_from_slice(&[0x0C, 0x02, 0x03, 0x01, 0x00, command]);
    frame
}

fn battery_request() -> [u8; PACKET_BYTES] {
    request(0x06)
}

fn charging_request() -> [u8; PACKET_BYTES] {
    request(0x48)
}

fn parse(reply: &[u8]) -> Option<Value> {
    if reply.len() < 7 {
        return None;
    }
    // 0xFF is "no value" and fails the percent check.
    let battery = |value: u8| (value <= 100).then_some(Value::Battery(value));
    match (reply[0], reply[5], reply[4]) {
        (0x0C, 0x06, _) => battery(reply[6]),
        (0x0C, 0x48, _) => Some(Value::Charging(reply[6])),
        (0x0D, value, 1) => battery(value),
        (0x0D, value, 10) => Some(Value::Charging(value)),
        _ => None,
    }
}

/// 1 and 2 (charging, full) mean the cable; anything else but 0 claims nothing.
fn charging_flag(state: u8) -> Option<bool> {
    match state {
        0 => Some(false),
        1 | 2 => Some(true),
        _ => None,
    }
}

fn ask<T>(
    handles: &mut [Box<dyn HidDevice>],
    request: &[u8],
    want: impl Fn(Value) -> Option<T>,
) -> Option<T> {
    if !handles.iter_mut().any(|d| d.write(request).is_ok()) {
        return None;
    }
    let deadline = Instant::now() + Duration::from_secs(1);
    while Instant::now() < deadline {
        let mut received = false;
        for device in handles.iter_mut() {
            let Ok(report) = device.read(PACKET_BYTES, Duration::ZERO) else {
                continue;
            };
            received |= !report.is_empty();
            if let Some(value) = parse(&report).and_then(&want) {
                return Some(value);
            }
        }
        if !received {
            sleep(10);
        }
    }
    None
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for product_id in PRODUCTS {
        let mut mine: Vec<&DeviceInfo> = context
            .vendor(0x03F0)
            .into_iter()
            .filter(|d| d.product_id == product_id)
            .collect();
        // Vendor collections first.
        mine.sort_by_key(|d| (d.usage_page < 0xFF00, d.usage_page));
        let mut handles: Vec<_> = mine
            .iter()
            .filter_map(|info| context.open(info).ok())
            .collect();
        let level = ask(&mut handles, &battery_request(), |value| match value {
            Value::Battery(level) => Some(level),
            Value::Charging(_) => None,
        });
        // Headset off, or no collection answered: no card.
        let Some(level) = level else {
            continue;
        };
        let charging = ask(&mut handles, &charging_request(), |value| match value {
            Value::Charging(state) => Some(state),
            Value::Battery(_) => None,
        })
        .and_then(charging_flag);
        result.push(Status {
            charging_known: Some(charging.is_some()),
            source: "hyperx",
            ..Status::new(
                format!("hyperx:{product_id:04x}"),
                NAME,
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

    #[test]
    fn replies_and_notifications_carry_the_same_values() {
        let reply = [0x0C, 2, 3, 1, 0, 0x06, 61];
        assert_eq!(parse(&reply), Some(Value::Battery(61)));
        assert_eq!(parse(&[0x0C, 2, 3, 1, 0, 0x06, 0xFF]), None);
        assert_eq!(parse(&[0x0D, 0, 0, 0, 1, 40, 0]), Some(Value::Battery(40)));
        assert_eq!(parse(&[0x0D, 0, 0, 0, 10, 2, 0]), Some(Value::Charging(2)));
        assert_eq!(parse(&reply[..6]), None);
        assert_eq!(charging_flag(2), Some(true));
        assert_eq!(charging_flag(0xFF), None);
    }
}
