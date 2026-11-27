//! The 90-byte feature report Synapse and OpenRazer use (report ID 0):
//! status, transaction ID, .., data size [5], class [6], command [7],
//! arguments [8..], XOR of bytes 2..87 at [88].
use crate::hid::HidDevice;
use crate::providers::context::sleep;
use std::time::{Duration, Instant};

const REPORT_BYTES: usize = 90;
const POWER_CLASS: u8 = 0x07;
pub(super) const BATTERY_LEVEL: u8 = 0x80;
pub(super) const CHARGING: u8 = 0x84;

pub(super) const STATUS_BUSY: u8 = 0x01;
pub(super) const STATUS_OK: u8 = 0x02;
/// The receiver is there; the device does not respond (off or asleep).
pub(super) const STATUS_TIMEOUT: u8 = 0x04;

const REPLY_BUDGET: Duration = Duration::from_secs(1);
const FIRST_WAIT_MS: u64 = 60;
const RETRY_WAIT_MS: u64 = 80;
/// How often one request is sent while only other applications' packets come back.
const SENDS: usize = 3;
const FOREIGN_PER_SEND: usize = 4;

/// Why one command brought no value; the codes appear in reader health.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum Fault {
    SendFailed,
    GetFailed,
    ShortReply,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum Answer {
    Value(u8),
    /// A final status other than success.
    Status(u8),
    /// Every success packet belonged to another command: RGB software talking to
    /// the same collection overwrites the reply buffer.
    Foreign,
}

fn request(transaction_id: u8, command: u8) -> [u8; REPORT_BYTES + 1] {
    let mut report = [0u8; REPORT_BYTES];
    report[1] = transaction_id;
    report[5] = 0x02;
    report[6] = POWER_CLASS;
    report[7] = command;
    report[88] = report[2..88].iter().fold(0, |crc, &byte| crc ^ byte);
    // The leading zero is the report ID.
    let mut frame = [0u8; REPORT_BYTES + 1];
    frame[1..].copy_from_slice(&report);
    frame
}

/// Windows keeps the report ID in front of the 90 bytes.
fn body(reply: &[u8]) -> Option<&[u8]> {
    if reply.len() > REPORT_BYTES {
        reply.get(1..=REPORT_BYTES)
    } else {
        (reply.len() == REPORT_BYTES).then_some(reply)
    }
}

pub(super) fn query(
    device: &mut dyn HidDevice,
    transaction_id: u8,
    command: u8,
) -> Result<Answer, Fault> {
    let request = request(transaction_id, command);
    device
        .send_feature(&request)
        .map_err(|_| Fault::SendFailed)?;
    let (mut sends, mut foreign) = (1, 0);
    let deadline = Instant::now() + REPLY_BUDGET;
    sleep(FIRST_WAIT_MS);
    loop {
        let reply = device
            .get_feature(0x00, REPORT_BYTES + 1)
            .map_err(|_| Fault::GetFailed)?;
        let data = body(&reply).ok_or(Fault::ShortReply)?;
        let status = data[0];
        let ours = data[6] == POWER_CLASS && data[7] == command;
        // A success status alone cannot tell somebody else's packet from ours.
        let is_foreign = status == STATUS_OK && !ours;
        if Instant::now() < deadline && (status == STATUS_BUSY || is_foreign) {
            if is_foreign {
                foreign += 1;
                // The other request may have replaced ours before it was read.
                if foreign % FOREIGN_PER_SEND == 0 && sends < SENDS {
                    device
                        .send_feature(&request)
                        .map_err(|_| Fault::SendFailed)?;
                    sends += 1;
                }
            }
            sleep(RETRY_WAIT_MS);
            continue;
        }
        return Ok(if is_foreign {
            Answer::Foreign
        } else if status == STATUS_OK {
            Answer::Value(data[9])
        } else {
            Answer::Status(status)
        });
    }
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;
    use crate::hid::fake::FakeBus;
    use crate::hid::HidBus;

    pub(in super::super) fn reply(status: u8, command: u8, value: u8) -> Vec<u8> {
        let mut reply = vec![0u8; REPORT_BYTES + 1];
        reply[1] = status;
        reply[7] = POWER_CLASS;
        reply[8] = command;
        reply[10] = value;
        reply
    }

    #[test]
    fn the_request_carries_its_checksum_behind_a_zero_report_id() {
        let frame = request(0x1F, BATTERY_LEVEL);
        assert_eq!(frame.len(), 91);
        assert_eq!(frame[..3], [0, 0, 0x1F]);
        assert_eq!(frame[6..9], [0x02, 0x07, 0x80]);
        assert_eq!(frame[89], 0x02 ^ 0x07 ^ 0x80);
    }

    #[test]
    fn other_commands_are_read_past() {
        let bus = FakeBus::default();
        bus.script("d", |s| {
            let mut lighting = reply(STATUS_OK, 0x03, 9);
            lighting[7] = 0x0F;
            s.features
                .extend([lighting, reply(STATUS_OK, BATTERY_LEVEL, 128)]);
        });
        let mut device = bus.open("d").unwrap();
        assert_eq!(
            query(device.as_mut(), 0x1F, BATTERY_LEVEL),
            Ok(Answer::Value(128))
        );
        assert_eq!(
            query(device.as_mut(), 0x1F, CHARGING),
            Err(Fault::GetFailed)
        );
    }
}
