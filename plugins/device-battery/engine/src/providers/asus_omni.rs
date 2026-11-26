//! ROG OMNI receiver: one 03 12 07 query, only on interface 2 / FF01:0001 / col03.
use super::battery_query::Reading;
use super::context::{proven_groups, read_until, Context};
use crate::hid::{DeviceInfo, HidDevice, HidResult, Sizes};
use crate::status::Status;
use std::time::Duration;

pub(crate) const VENDORS: &[u16] = &[0x0B05];

const NAME: &str = "ROG OMNI 接收器（鼠标）";
const PRODUCT_ID: u16 = 0x1ACE;
const REPORT_ID: u8 = 0x03;
const REPORT_BYTES: usize = 64;

fn request() -> [u8; REPORT_BYTES] {
    let mut frame = [0; REPORT_BYTES];
    frame[..3].copy_from_slice(&[REPORT_ID, 0x12, 0x07]);
    frame
}

/// `Some(None)` ends the wait without a reading; `None` keeps reading.
fn judge(reply: &[u8]) -> Option<Option<Reading>> {
    if reply.len() != REPORT_BYTES {
        return None;
    }
    if reply.iter().all(|&b| b == 0) {
        return Some(None);
    }
    if reply[0] != REPORT_ID {
        return None;
    }
    if reply[1..3] == [0xFF, 0xAA] || reply[1..4] == [0, 0, 0] {
        return Some(None);
    }
    if reply[..3] != [REPORT_ID, 0x12, 0x07] {
        return None;
    }
    let level = reply[5];
    Some(
        (1..=100)
            .contains(&level)
            .then(|| Reading::exact(level, reply[10] > 0)),
    )
}

fn is_col03(path: &str) -> bool {
    let mut parts = path.split('#').skip(1);
    let (Some(hardware), Some(_)) = (parts.next(), parts.next()) else {
        return false;
    };
    let hardware = hardware.to_ascii_lowercase();
    hardware.match_indices("&mi_02&col03").any(|(at, found)| {
        let rest = &hardware[at + found.len()..];
        rest.is_empty() || rest.starts_with('&')
    })
}

fn proven(maximum: Option<usize>, sizes: &Option<Sizes>, proof: Option<&str>) -> bool {
    let (Some(maximum), Some(sizes)) = (maximum, sizes.as_ref()) else {
        return false;
    };
    (REPORT_BYTES..=4096).contains(&maximum)
        && matches!(proof, Some("caps" | "descriptor"))
        && sizes.values().all(|&n| (2..=maximum).contains(&n))
        && sizes.values().max() == Some(&maximum)
        && sizes.get(&REPORT_ID) == Some(&REPORT_BYTES)
}

fn pick<'a>(infos: &[&'a DeviceInfo]) -> Option<&'a DeviceInfo> {
    let mut candidates = infos
        .iter()
        .copied()
        .filter(|d| d.interface_number == 2 && d.is_collection(0xFF01, 1) && is_col03(&d.path));
    let info = candidates.next()?;
    (candidates.next().is_none()
        && proven(info.input_len, &info.input_sizes, info.input_proven_by)
        && proven(info.output_len, &info.output_sizes, info.output_proven_by))
    .then_some(info)
}

fn exchange(device: &mut dyn HidDevice) -> HidResult<Option<Reading>> {
    if device.write(&request())? != REPORT_BYTES {
        return Ok(None);
    }
    let reply = read_until(device, REPORT_BYTES, Duration::from_millis(1200), 4, judge)?;
    Ok(reply.flatten())
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mine: Vec<&DeviceInfo> = context
        .vendor(0x0B05)
        .into_iter()
        .filter(|d| d.product_id == PRODUCT_ID)
        .collect();
    let mut result = Vec::new();
    for (physical, infos) in proven_groups(&mine) {
        let Some(info) = pick(&infos).filter(|_| !physical.trim().is_empty()) else {
            continue;
        };
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        if let Ok(Some(reading)) = exchange(device.as_mut()) {
            result.push(Status {
                physical_id: physical.to_string(),
                connection_known: Some(true),
                charging_known: Some(true),
                ..Status::new(
                    format!("asus_omni:{physical}"),
                    NAME,
                    reading.level,
                    reading.charging,
                    "mouse",
                )
            });
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(level: u8, charge: u8) -> [u8; 64] {
        let mut reply = request();
        reply[5] = level;
        reply[10] = charge;
        reply
    }

    #[test]
    fn echo_errors_and_empty_frames_end_the_wait() {
        assert_eq!(judge(&reply(67, 1)), Some(Some(Reading::exact(67, true))));
        assert_eq!(judge(&reply(0, 0)), Some(None));
        assert_eq!(judge(&reply(101, 0)), Some(None));
        assert_eq!(judge(&[0; 64]), Some(None));
        let mut error = reply(50, 0);
        error[1..3].copy_from_slice(&[0xFF, 0xAA]);
        assert_eq!(judge(&error), Some(None));
        let mut other = reply(50, 0);
        other[2] = 0x08;
        assert_eq!(judge(&other), None);
        assert_eq!(judge(&reply(50, 0)[..63]), None);
    }

    #[test]
    fn only_the_third_collection_of_interface_two_matches() {
        assert!(is_col03(r"\\?\hid#vid_0b05&pid_1ace&mi_02&col03#7&1#{g}"));
        assert!(!is_col03(r"\\?\hid#vid_0b05&pid_1ace&mi_02&col030#7&1#{g}"));
        assert!(!is_col03(r"\\?\hid#vid_0b05&pid_1ace&mi_02&col03"));
    }
}
