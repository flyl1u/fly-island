//! Lingbao M1 Pro: one Feature 0F read; the reply carries a fixed signature. A read
//! feature report may be cached by the receiver, so the connection stays unconfirmed.
use super::context::{only, proven_groups, Context};
use crate::hid::proof::single_report;
use crate::hid::DeviceInfo;
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x088D];

const REPORT_ID: u8 = 0x0F;
const REPORT_BYTES: usize = 33;

fn parse(reply: &[u8]) -> Option<u8> {
    let valid = reply.len() == REPORT_BYTES
        && reply[0] == REPORT_ID
        && reply[7..11] == [0x4D, 0x35, 0x33, 0x36]
        && reply[13..15] == [0x4C, 0x58]
        // Byte 19 set means charging: the level is a placeholder then.
        && reply[19] == 0
        && (1..=100).contains(&reply[18]);
    valid.then(|| reply[18])
}

fn eligible(info: &DeviceInfo) -> bool {
    info.interface_number == 1
        && info.product == "Wireless-Receiver"
        && !info.path.trim().is_empty()
        && info.feature_len == Some(REPORT_BYTES)
        && single_report(&info.feature_sizes, REPORT_ID, REPORT_BYTES)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mine: Vec<&DeviceInfo> = context
        .vendor(0x088D)
        .into_iter()
        .filter(|d| d.product_id == 0x052F)
        .collect();
    let mut result = Vec::new();
    for (physical, infos) in proven_groups(&mine) {
        let candidate = only(&infos, |d| d.is_collection(0xFF00, 1));
        let Some(info) = candidate.filter(|d| eligible(d)) else {
            continue;
        };
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        let Ok(reply) = device.get_feature(REPORT_ID, REPORT_BYTES) else {
            continue;
        };
        let Some(level) = parse(&reply) else {
            continue;
        };
        result.push(Status {
            physical_id: physical.to_string(),
            connection_known: Some(false),
            charging_known: Some(false),
            ..Status::new(
                format!("lingbao:{physical}"),
                "Lingbao M1 Pro",
                Some(level),
                false,
                "mouse",
            )
        });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(level: u8, charging: u8) -> Vec<u8> {
        let mut reply = vec![0u8; REPORT_BYTES];
        reply[0] = REPORT_ID;
        reply[7..11].copy_from_slice(b"M536");
        reply[13..15].copy_from_slice(b"LX");
        reply[18] = level;
        reply[19] = charging;
        reply
    }

    #[test]
    fn the_signature_and_a_discharging_state_are_required() {
        assert_eq!(parse(&reply(82, 0)), Some(82));
        assert_eq!(parse(&reply(82, 1)), None);
        assert_eq!(parse(&reply(0, 0)), None);
        assert_eq!(parse(&reply(101, 0)), None);
        let mut bad = reply(82, 0);
        bad[13] = 0;
        assert_eq!(parse(&bad), None);
        assert_eq!(parse(&reply(82, 0)[..32]), None);
    }
}
