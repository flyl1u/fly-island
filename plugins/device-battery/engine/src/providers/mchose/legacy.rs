//! The older frames: the inverted feature status (5253 / 3837), the G7's 55-30
//! report pair and the A5 Pro Max feature query.
use super::Reading;
use crate::hid::HidDevice;
use crate::providers::context::sleep;
use std::time::Duration;

const MCHOSE_VIDS: [u16; 2] = [0x5253, 0x3837];
const CMD_STATUS: u8 = 0x06;
/// (report ID, payload bytes)
const CHANNELS: [(u8, usize); 2] = [(0x11, 20), (0x12, 64)];
const ATTEMPTS: usize = 4;
const ATTEMPT_GAP_MS: u64 = 120;

const G7_HEADER: [u8; 2] = [0xAA, 0x30];
const G7_READS: usize = 25;
const G7_READ_GAP_MS: u64 = 20;

const A5_CMD_BATTERY: u8 = 0x83;
const A5_READS: usize = 8;
const A5_RESEND_AT: usize = 3;
const A5_WRITE_PAUSE_MS: u64 = 34;
const A5_READ_GAP_MS: u64 = 30;

/// Every byte after the report ID travels inverted.
fn status_request(report: u8, length: usize) -> Vec<u8> {
    let mut frame = vec![0xFF; length + 1];
    frame[0] = report;
    frame[1] = !CMD_STATUS;
    frame
}

fn parse_status(reply: &[u8]) -> Option<Reading> {
    if reply.len() < 13 || !matches!(reply[0], 0x11 | 0x12) || reply[1] != !CMD_STATUS {
        return None;
    }
    let payload: Vec<u8> = reply[2..].iter().map(|byte| !byte).collect();
    let vendor = u16::from_le_bytes([payload[0], payload[1]]);
    (MCHOSE_VIDS.contains(&vendor) && payload[9] <= 100).then(|| Reading {
        level: payload[9],
        charging: payload[10] != 0,
        model: u16::from_le_bytes([payload[2], payload[3]]),
    })
}

/// The receiver answers "read error" until it has the value from the mouse.
pub(super) fn read_status(device: &mut dyn HidDevice) -> Option<Reading> {
    for (report, length) in CHANNELS {
        let request = status_request(report, length);
        for _ in 0..ATTEMPTS {
            if device.send_feature(&request).is_err() {
                break;
            }
            sleep(ATTEMPT_GAP_MS);
            let Ok(reply) = device.get_feature(report, length + 1) else {
                continue;
            };
            if let Some(reading) = parse_status(&reply) {
                return Some(reading);
            }
        }
    }
    None
}

fn g7_request() -> [u8; 65] {
    let mut frame = [0; 65];
    frame[..9].copy_from_slice(&[0x00, 0x55, 0x30, 0xA5, 0x0B, 0x2E, 0x01, 0x01, 0x01]);
    frame
}

fn parse_g7(reply: &[u8]) -> Option<Reading> {
    (reply.len() > 9 && reply[..2] == G7_HEADER && reply[8] <= 100).then(|| Reading {
        level: reply[8],
        charging: reply[9] != 0,
        model: 0,
    })
}

pub(super) fn read_g7(device: &mut dyn HidDevice) -> Option<Reading> {
    device.write(&g7_request()).ok()?;
    for _ in 0..G7_READS {
        sleep(G7_READ_GAP_MS);
        let Ok(reply) = device.read(64, Duration::ZERO) else {
            continue;
        };
        if let Some(reading) = parse_g7(&reply) {
            return Some(reading);
        }
    }
    None
}

/// Route 02 addresses the mouse behind the receiver.
fn a5_request() -> [u8; 65] {
    let mut frame = [0; 65];
    frame[..7].copy_from_slice(&[0x00, 0x00, 0x00, 0x02, 0x02, 0x00, A5_CMD_BATTERY]);
    frame
}

/// Windows may or may not keep the zero report ID before the A1 status byte.
fn parse_a5(reply: &[u8]) -> Option<Reading> {
    if reply.len() < 9 {
        return None;
    }
    let at = (0..2).find(|&at| reply[at] == 0xA1)?;
    // A level above 100 is not a percentage: unknown rather than clamped.
    (reply[at + 4] == 0 && reply[at + 5] == A5_CMD_BATTERY && reply[at + 7] <= 100).then(|| {
        Reading {
            level: reply[at + 7],
            charging: reply[at + 6] > 0,
            model: 0,
        }
    })
}

pub(super) fn read_a5(device: &mut dyn HidDevice) -> Option<Reading> {
    device.send_feature(&a5_request()).ok()?;
    sleep(A5_WRITE_PAUSE_MS);
    for attempt in 0..A5_READS {
        if attempt == A5_RESEND_AT {
            device.send_feature(&a5_request()).ok()?;
            sleep(A5_WRITE_PAUSE_MS);
        }
        let reading = device
            .get_feature(0x00, 65)
            .ok()
            .and_then(|reply| parse_a5(&reply));
        if reading.is_some() {
            return reading;
        }
        sleep(A5_READ_GAP_MS);
    }
    None
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;

    pub(in super::super) fn status_reply(level: u8, charge: u8, model: u16) -> Vec<u8> {
        let mut payload = [0u8; 19];
        payload[..2].copy_from_slice(&0x5253u16.to_le_bytes());
        payload[2..4].copy_from_slice(&model.to_le_bytes());
        payload[9] = level;
        payload[10] = charge;
        let mut reply = vec![0x11, !CMD_STATUS];
        reply.extend(payload.iter().map(|byte| !byte));
        reply
    }

    #[test]
    fn the_status_frame_is_inverted_both_ways() {
        assert_eq!(status_request(0x11, 20)[..3], [0x11, 0xF9, 0xFF]);
        assert_eq!(status_request(0x12, 64).len(), 65);
        assert_eq!(
            parse_status(&status_reply(55, 1, 0x31)),
            Some(Reading {
                level: 55,
                charging: true,
                model: 0x31
            })
        );
        assert_eq!(parse_status(&status_reply(101, 0, 1)), None);
    }

    #[test]
    fn g7_and_a5_replies_need_their_headers() {
        let mut g7 = [0u8; 16];
        g7[..2].copy_from_slice(&G7_HEADER);
        g7[8] = 90;
        assert_eq!(
            parse_g7(&g7).map(|r| (r.level, r.charging)),
            Some((90, false))
        );
        assert_eq!(parse_g7(&g7[..9]), None);
        let mut a5 = [0u8; 12];
        a5[1] = 0xA1;
        a5[6] = A5_CMD_BATTERY;
        a5[7] = 1;
        a5[8] = 42;
        assert_eq!(
            parse_a5(&a5).map(|r| (r.level, r.charging)),
            Some((42, true))
        );
        assert_eq!(parse_a5(&a5[1..]).map(|r| r.level), Some(42));
        a5[8] = 130;
        assert_eq!(parse_a5(&a5), None);
    }
}
