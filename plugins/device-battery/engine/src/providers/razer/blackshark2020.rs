//! BlackShark V2 Pro (2020), receiver 0528: one 64-byte feature exchange on report
//! FF. The generic and PA reads are never sent to it.
use crate::hid::DeviceInfo;
use crate::providers::context::{sleep, Context};
use std::time::{Duration, Instant};

pub(super) const PRODUCT_ID: u16 = 0x0528;
/// The charging cable; the battery is read from the receiver.
pub(super) const CABLE_PRODUCT_ID: u16 = 0x052E;

const REPORT_ID: u8 = 0xFF;
const REPORT_BYTES: usize = 64;
const REQUEST_HEAD: [u8; 9] = [0xFF, 0x0A, 0x00, 0xFD, 0x04, 0x12, 0xF1, 0x02, 0x05];
const REPLY_PREFIX: [u8; 9] = [0xFF, 0x0F, 0x05, 0xFE, 0x12, 0x04, 0x1F, 0x08, 0x05];
const NO_REPLY_PREFIX: [u8; 9] = [0xFF, 0x01, 0x00, 0xFE, 0x12, 0x04, 0x1F, 0x08, 0x05];
const REPLY_BUDGET: Duration = Duration::from_millis(500);
/// Synapse waits about 100 ms between SET_REPORT and GET_REPORT.
const REPLY_GAP_MS: u64 = 100;

#[derive(Debug, PartialEq)]
pub(super) enum Outcome {
    /// A fresh reply. The level is hidden while charging, because the device's
    /// value jumps then; an unknown power state leaves charging unknown.
    Reading {
        level: Option<u8>,
        charging: Option<bool>,
    },
    Offline,
    Failed,
}

pub(super) fn is_candidate(info: &DeviceInfo) -> bool {
    info.is_collection(0xFF00, 0x0001)
}

fn parse(reply: &[u8]) -> Option<Outcome> {
    if reply.len() != REPORT_BYTES || !reply.starts_with(&REPLY_PREFIX) {
        return None;
    }
    if reply[12..14] == [0, 0] {
        return Some(Outcome::Offline);
    }
    // Only observed states say anything about charging.
    let charging = match reply[11] {
        0x09 => Some(true),
        0x01 | 0x02 | 0x03 | 0x06 => Some(false),
        _ => None,
    };
    let level = Some(reply[14]).filter(|&level| level <= 100 && charging != Some(true));
    Some(Outcome::Reading { level, charging })
}

pub(super) fn read_battery(context: &mut Context, info: &DeviceInfo) -> Outcome {
    let Ok(mut device) = context.open(info) else {
        return Outcome::Failed;
    };
    let mut request = [0u8; REPORT_BYTES];
    request[..REQUEST_HEAD.len()].copy_from_slice(&REQUEST_HEAD);
    if device.send_feature(&request) != Ok(REPORT_BYTES) {
        return Outcome::Failed;
    }
    let deadline = Instant::now() + REPLY_BUDGET;
    loop {
        sleep(REPLY_GAP_MS);
        let Ok(reply) = device.get_feature(REPORT_ID, REPORT_BYTES) else {
            return Outcome::Failed;
        };
        if let Some(outcome) = parse(&reply) {
            return outcome;
        }
        if Instant::now() >= deadline {
            return if reply.len() == REPORT_BYTES && reply.starts_with(&NO_REPLY_PREFIX) {
                Outcome::Offline
            } else {
                Outcome::Failed
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(state: u8, millivolts: u16, level: u8) -> [u8; REPORT_BYTES] {
        let mut reply = [0; REPORT_BYTES];
        reply[..9].copy_from_slice(&REPLY_PREFIX);
        reply[11] = state;
        reply[12..14].copy_from_slice(&millivolts.to_be_bytes());
        reply[14] = level;
        reply
    }

    fn reading(level: Option<u8>, charging: Option<bool>) -> Option<Outcome> {
        Some(Outcome::Reading { level, charging })
    }

    #[test]
    fn power_states_decide_what_is_shown() {
        assert_eq!(parse(&reply(1, 3900, 80)), reading(Some(80), Some(false)));
        assert_eq!(parse(&reply(9, 3900, 80)), reading(None, Some(true)));
        assert_eq!(parse(&reply(6, 4100, 100)), reading(Some(100), Some(false)));
        assert_eq!(parse(&reply(7, 3900, 40)), reading(Some(40), None));
        assert_eq!(parse(&reply(1, 3900, 200)), reading(None, Some(false)));
        assert_eq!(parse(&reply(1, 0, 80)), Some(Outcome::Offline));
        assert_eq!(parse(&reply(1, 3900, 80)[..63]), None);
        assert_eq!(parse(&[0xFF; REPORT_BYTES]), None);
    }
}
