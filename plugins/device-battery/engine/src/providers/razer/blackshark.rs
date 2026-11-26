//! The "PA" protocol of the BlackShark V2 Pro (2023): 64-byte frames on report 02,
//! each exchange framed by a remote-on and remote-off command.
use crate::hid::{DeviceInfo, HidDevice};
use crate::providers::context::{sleep, Context};
use std::time::{Duration, Instant};

pub(super) const PRODUCT_IDS: [u16; 2] = [0x0555, 0x0556];

const REPORT_ID: u8 = 0x02;
const REPORT_BYTES: usize = 64;
const TYPE_REMOTE: u8 = 0x02;
const TYPE_QUERY: u8 = 0x03;
const COMMAND_REMOTE: u8 = 0xE1;
const COMMAND_BATTERY: u8 = 0x21;
const COMMAND_CHARGING: u8 = 0x2A;
const REPLY_COMMAND_OFFSET: usize = 12;
const ATTEMPTS: usize = 3;
const WAKE_ATTEMPTS: usize = 4;
const REPLY_TIMEOUT: Duration = Duration::from_millis(150);
const REMOTE_PAUSE_MS: u64 = 35;

#[derive(Debug, PartialEq)]
pub(super) enum Outcome {
    Reading {
        level: u8,
        charging: Option<bool>,
    },
    /// The collection took a command and the headset did not answer: the right
    /// collection, with the headset switched off.
    Offline,
    /// No command was accepted: asleep, off, or the wrong collection.
    NoWake,
    OpenFailed,
}

pub(super) fn is_candidate(info: &DeviceInfo) -> bool {
    matches!(info.usage_page, 0xFF00 | 0xFF14)
}

fn frame(length: u8, kind: u8, type_byte: u8, command: u8) -> [u8; REPORT_BYTES] {
    let mut frame = [0; REPORT_BYTES];
    frame[..3].copy_from_slice(&[REPORT_ID, 0x80, length]);
    frame[5..8].copy_from_slice(&[b'P', b'A', kind]);
    frame[9] = type_byte;
    frame[10] = command;
    frame
}

fn query_frame(command: u8) -> [u8; REPORT_BYTES] {
    frame(0x08, 0x08, TYPE_QUERY, command)
}

fn remote_frame(on: bool) -> [u8; REPORT_BYTES] {
    let mut remote = frame(0x07, 0x0E, TYPE_REMOTE, COMMAND_REMOTE);
    remote[11] = u8::from(on);
    remote
}

/// The first payload byte of an acknowledgement for `command`, with or without
/// the report ID in front.
fn parse(reply: &[u8], command: u8) -> Option<u8> {
    [REPLY_COMMAND_OFFSET, REPLY_COMMAND_OFFSET - 1]
        .into_iter()
        .find(|&at| {
            reply.len() > at + 3
                && (at != REPLY_COMMAND_OFFSET || reply[0] == REPORT_ID)
                && reply[at] == command
                && reply[at + 1] == 0x01
        })
        .map(|at| reply[at + 3])
}

fn remote(device: &mut dyn HidDevice, on: bool) {
    // A failed remote frame shows up as a missing reply.
    let _ = device.write(&remote_frame(on));
    sleep(REMOTE_PAUSE_MS);
}

fn attempt_query(device: &mut dyn HidDevice, command: u8) -> Option<u8> {
    for _ in 0..ATTEMPTS {
        remote(device, true);
        device.write(&query_frame(command)).ok()?;
        let deadline = Instant::now() + REPLY_TIMEOUT;
        while Instant::now() < deadline {
            let reply = device.read(REPORT_BYTES, Duration::from_millis(50));
            if let Some(value) = reply.ok().and_then(|data| parse(&data, command)) {
                return Some(value);
            }
        }
    }
    None
}

fn query(device: &mut dyn HidDevice, command: u8) -> Option<u8> {
    for _ in 0..32 {
        match device.read(REPORT_BYTES, Duration::from_millis(5)) {
            Ok(stale) if !stale.is_empty() => {}
            _ => break,
        }
    }
    // A sacrificial frame wakes the link.
    remote(device, true);
    let result = attempt_query(device, command);
    remote(device, false);
    result
}

/// The receiver may be in USB selective suspend: a few attempts wake it.
fn wake(device: &mut dyn HidDevice) -> bool {
    (0..WAKE_ATTEMPTS as u64).any(|attempt| {
        let woke = device.write(&remote_frame(true)).is_ok();
        if !woke {
            sleep(150 * (attempt + 1));
        }
        woke
    })
}

pub(super) fn read_battery(context: &mut Context, info: &DeviceInfo) -> Outcome {
    let Ok(mut device) = context.open(info) else {
        return Outcome::OpenFailed;
    };
    if !wake(device.as_mut()) {
        // A stuck handle: reopen the receiver once.
        drop(device);
        sleep(300);
        let Ok(reopened) = context.open(info) else {
            return Outcome::NoWake;
        };
        device = reopened;
        if !wake(device.as_mut()) {
            return Outcome::NoWake;
        }
    }
    sleep(REMOTE_PAUSE_MS);
    match query(device.as_mut(), COMMAND_BATTERY) {
        // A level above 100 is not a percentage: treated as no reading.
        Some(level) if level <= 100 => Outcome::Reading {
            level,
            charging: query(device.as_mut(), COMMAND_CHARGING).map(|value| value != 0),
        },
        _ => Outcome::Offline,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_match_the_documented_bytes() {
        let query = query_frame(COMMAND_BATTERY);
        assert_eq!(query[..11], [2, 0x80, 8, 0, 0, 0x50, 0x41, 8, 0, 3, 0x21]);
        let remote = remote_frame(true);
        assert_eq!(
            remote[..12],
            [2, 0x80, 7, 0, 0, 0x50, 0x41, 0x0E, 0, 2, 0xE1, 1]
        );
    }

    #[test]
    fn acknowledgements_with_and_without_the_report_id() {
        let mut reply = [0u8; 64];
        reply[0] = REPORT_ID;
        reply[12..16].copy_from_slice(&[0x21, 1, 1, 77]);
        assert_eq!(parse(&reply, 0x21), Some(77));
        assert_eq!(parse(&reply[1..], 0x21), Some(77));
        assert_eq!(parse(&reply, 0x2A), None);
        reply[13] = 0;
        assert_eq!(parse(&reply, 0x21), None);
    }
}
