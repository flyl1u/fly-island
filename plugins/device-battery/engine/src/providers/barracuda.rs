//! Razer Barracuda Pro 2.4 GHz receiver: its own "PA" frames on report 01. A
//! silent headset gives a card without a level.
use super::context::{sleep, Context};
use crate::hid::{HidDevice, HidResult};
use crate::status::Status;
use std::time::Duration;

pub(crate) const VENDORS: &[u16] = &[0x1532];

const NAME: &str = "Razer Barracuda Pro (2.4 GHz)";
const PRODUCT_ID: u16 = 0x053A;
const REPORT_BYTES: usize = 64;
const BATTERY: u8 = 0x21;
const CHARGING: u8 = 0x2A;

fn query_frame(command: u8) -> [u8; REPORT_BYTES] {
    let mut frame = [0; REPORT_BYTES];
    frame[..9].copy_from_slice(&[0x01, 0x80, 8, 0x50, 0x41, 0x08, 0x08, 0x03, command]);
    frame
}

fn remote_frame(on: bool) -> [u8; REPORT_BYTES] {
    let mut frame = [0; REPORT_BYTES];
    let head = [
        0x01,
        0x80,
        0x07,
        0x50,
        0x41,
        0x0E,
        0x08,
        0x02,
        0xE1,
        u8::from(on),
    ];
    frame[..10].copy_from_slice(&head);
    frame
}

/// The payload of an acknowledgement or notification for `command`, with or
/// without hidapi's report ID in front.
fn parse(reply: &[u8], command: u8) -> Option<&[u8]> {
    [13usize, 12].into_iter().find_map(|at| {
        if at == 12 && reply.first() == Some(&0x01) {
            return None;
        }
        if reply.len() <= at + 3 || reply[at] != command || !matches!(reply[at + 1], 1 | 2) {
            return None;
        }
        let length = usize::from(reply[at + 2]);
        (1..=32)
            .contains(&length)
            .then(|| &reply[at + 3..reply.len().min(at + 3 + length)])
    })
}

fn drain(device: &mut dyn HidDevice) {
    for _ in 0..8 {
        match device.read(REPORT_BYTES, Duration::from_millis(20)) {
            Ok(report) if !report.is_empty() => {}
            _ => return,
        }
    }
}

fn remote(device: &mut dyn HidDevice, on: bool) -> bool {
    drain(device);
    device.write(&remote_frame(on)).is_ok()
}

/// The first payload byte of the answer.
fn query(device: &mut dyn HidDevice, command: u8) -> HidResult<Option<u8>> {
    for _ in 0..4 {
        drain(device);
        if device.write(&query_frame(command)).is_err() {
            return Ok(None);
        }
        for _ in 0..6 {
            let reply = device.read(REPORT_BYTES, Duration::from_millis(150))?;
            if let Some(payload) = parse(&reply, command) {
                return Ok(payload.first().copied());
            }
        }
    }
    Ok(None)
}

/// (percent, charging); `None` when the headset does not answer.
fn read(device: &mut dyn HidDevice) -> HidResult<Option<(u8, bool)>> {
    let woke = (0..3u64).any(|attempt| {
        let accepted = remote(device, true);
        if !accepted {
            sleep(150 * (attempt + 1));
        }
        accepted
    });
    if !woke {
        return Ok(None);
    }
    sleep(50);
    let Some(level) = query(device, BATTERY)? else {
        remote(device, false);
        return Ok(None);
    };
    let charging = query(device, CHARGING)?;
    remote(device, false);
    Ok((level <= 100).then_some((level, charging.is_some_and(|value| value != 0))))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    // Chosen by usage page, never by interface.
    let Some(info) = context
        .vendor(0x1532)
        .into_iter()
        .find(|d| d.product_id == PRODUCT_ID && d.usage_page == 0xFF00)
    else {
        return Vec::new();
    };
    let reading = context
        .open(info)
        .and_then(|mut device| read(device.as_mut()))
        .ok()
        .flatten();
    let status = Status::new(
        format!("barracuda:{PRODUCT_ID:04x}"),
        NAME,
        reading.map(|r| r.0),
        reading.is_some_and(|r| r.1),
        "headset",
    );
    vec![Status {
        online: reading.is_some(),
        ..status
    }]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(command: u8, value: u8) -> [u8; REPORT_BYTES] {
        let mut reply = [0; REPORT_BYTES];
        reply[0] = 0x01;
        reply[3..5].copy_from_slice(&[0x50, 0x49]);
        reply[13..17].copy_from_slice(&[command, 0x01, 1, value]);
        reply
    }

    #[test]
    fn acknowledgements_must_name_the_command() {
        assert_eq!(parse(&reply(BATTERY, 81), BATTERY), Some(&[81u8][..]));
        assert_eq!(parse(&reply(BATTERY, 81), CHARGING), None);
        assert_eq!(parse(&reply(BATTERY, 81)[1..], BATTERY), Some(&[81u8][..]));
        assert_eq!(parse(&query_frame(BATTERY), BATTERY), None);
        assert_eq!(remote_frame(true)[8..10], [0xE1, 1]);
    }
}
