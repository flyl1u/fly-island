//! V3 8K receivers: one power query on report 4D. The collection must prove 64-byte
//! input and output reports before it is opened; no legacy frame is ever sent here.
use super::Reading;
use crate::hid::{proof, DeviceInfo, Sizes};
use crate::providers::context::{read_until, Context};
use std::time::Duration;

const VENDOR_ID: u16 = 0x3837;
/// 1018: A7 V3 Pro (V3 8K receiver). 1014: A7 V3 Ultra+ and relatives.
pub(super) const PRODUCT_IDS: [u16; 2] = [0x1018, 0x1014];
const ULTRA_NAME: &str = "MCHOSE A7 V3 Ultra+";
const USAGE: (u16, u16) = (0xFF01, 0x0001);
/// 1018 only.
const ALTERNATE_USAGE: (u16, u16) = (0xFF0B, 0x00C4);
const REPORT_ID: u8 = 0x4D;
/// Including the report ID.
const REPORT_LEN: usize = 64;
const CMD_POWER: u16 = 0x0900;
/// Deferred replies arrive after about a second.
const TIMEOUT: Duration = Duration::from_millis(1500);
const MAX_READS: usize = 32;
const EXCLUDING_ERRORS: [&str; 2] = [
    "collection maximum mismatch",
    "caps/descriptor disagreement",
];

pub(super) fn fallback_name(product_id: u16) -> &'static str {
    if product_id == 0x1014 {
        ULTRA_NAME
    } else {
        "MCHOSE V3 8K 接收器"
    }
}

/// The A7 V3 Ultra+ firmware declares a 127-byte input report that Windows exposes
/// as 64. The topology pass may then confirm report 4D/64 with Windows itself.
pub(crate) fn windows_report_candidate(info: &DeviceInfo) -> bool {
    let exact = Some(&REPORT_LEN);
    let Some([declared_input, declared_output, _]) = info.declared.as_ref() else {
        return false;
    };
    info.is(VENDOR_ID, 0x1018)
        && info.is_collection(USAGE.0, USAGE.1)
        && info.interface_number == 2
        && info.product.trim() == ULTRA_NAME
        && info.input_len == Some(REPORT_LEN)
        && info.output_len == Some(REPORT_LEN)
        && info.descriptor_error == Some("collection maximum mismatch")
        && info.input_sizes.is_none()
        && declared_input.get(&REPORT_ID) == Some(&(2 * REPORT_LEN - 1))
        && declared_output.get(&REPORT_ID) == exact
        && info
            .output_sizes
            .as_ref()
            .is_none_or(|sizes| sizes.get(&REPORT_ID) == exact)
}

struct Direction<'a> {
    index: usize,
    maximum: Option<usize>,
    sizes: &'a Option<Sizes>,
    proven_by: Option<&'static str>,
}

fn directions(info: &DeviceInfo) -> [Direction<'_>; 2] {
    [
        Direction {
            index: 0,
            maximum: info.input_len,
            sizes: &info.input_sizes,
            proven_by: info.input_proven_by,
        },
        Direction {
            index: 1,
            maximum: info.output_len,
            sizes: &info.output_sizes,
            proven_by: info.output_proven_by,
        },
    ]
}

fn declared_agrees(info: &DeviceInfo, direction: &Direction) -> bool {
    info.declared
        .as_ref()
        .is_none_or(|declared| Some(&declared[direction.index]) == direction.sizes.as_ref())
}

fn is_proven(info: &DeviceInfo) -> bool {
    directions(info)
        .iter()
        .all(|d| proof::report_proven(d.maximum, d.sizes, REPORT_ID, (REPORT_LEN, REPORT_LEN)))
}

/// The primary collection can be shown not to carry report 4D/64.
fn primary_excludes(info: &DeviceInfo) -> bool {
    if info
        .descriptor_error
        .is_some_and(|error| EXCLUDING_ERRORS.contains(&error))
    {
        return false;
    }
    let mut excluded = false;
    for direction in directions(info) {
        let Some(maximum) = direction.maximum.filter(|n| (2..=4096).contains(n)) else {
            return false;
        };
        if let Some(sizes) = direction.sizes {
            if !sizes.values().all(|n| (2..=maximum).contains(n))
                || sizes.values().max() != Some(&maximum)
                || !declared_agrees(info, &direction)
            {
                return false;
            }
            excluded |= sizes.get(&REPORT_ID) != Some(&REPORT_LEN);
        }
        excluded |= maximum < REPORT_LEN;
    }
    excluded
}

fn check(info: &DeviceInfo) -> Option<&DeviceInfo> {
    if info.path.is_empty() {
        return None;
    }
    let confirmed = info.v3_windows_report_confirmed && windows_report_candidate(info);
    (confirmed || is_proven(info)).then_some(info)
}

/// The alternate collection needs a stricter proof and one consistent USB parent.
fn check_alternate<'a>(info: &'a DeviceInfo, all: &[&DeviceInfo]) -> Option<&'a DeviceInfo> {
    let parent = &info.physical_id;
    let sound = proof::is_usb_parent(parent, VENDOR_ID, 0x1018)
        && all.iter().all(|d| &d.physical_id == parent)
        && proof::is_usb_hid_path(&info.path, VENDOR_ID, 0x1018)
        && info.descriptor_error.is_none()
        && is_proven(info)
        && directions(info).iter().all(|d| {
            matches!(d.proven_by, Some("caps" | "descriptor")) && declared_agrees(info, d)
        });
    sound.then_some(info)
}

fn matching<'a>(infos: &[&'a DeviceInfo], usage: (u16, u16)) -> Vec<&'a DeviceInfo> {
    infos
        .iter()
        .copied()
        .filter(|d| d.is_collection(usage.0, usage.1))
        .collect()
}

pub(super) fn pick<'a>(infos: &[&'a DeviceInfo]) -> Option<&'a DeviceInfo> {
    let primaries = matching(infos, USAGE);
    let exact_1018 = !infos.is_empty() && infos.iter().all(|d| d.is(VENDOR_ID, 0x1018));
    if primaries.len() > 1 || (primaries.is_empty() && !exact_1018) {
        return None;
    }
    if let Some(primary) = primaries.first().copied() {
        if primary.path.is_empty()
            || is_proven(primary)
            || !exact_1018
            || !primary_excludes(primary)
        {
            return check(primary);
        }
    }
    match matching(infos, ALTERNATE_USAGE)[..] {
        [alternate] => check_alternate(alternate, infos),
        _ => None,
    }
}

fn request() -> [u8; REPORT_LEN] {
    let mut frame = [0; REPORT_LEN];
    frame[..9].copy_from_slice(&[REPORT_ID, 1, 1, 0, 0, 9, 0, 0, 8]);
    frame
}

/// (percent, charging)
fn parse(reply: &[u8]) -> Option<(u8, bool)> {
    if reply.len() != REPORT_LEN
        || reply[..2] != [REPORT_ID, 1]
        || reply[2] > 1
        || u16::from_le_bytes([reply[4], reply[5]]) != CMD_POWER
    {
        return None;
    }
    let size = usize::from(reply[3]);
    let end = 8 + size;
    let checked = reply[2] == 1;
    if size < 14 || end + usize::from(checked) > reply.len() {
        return None;
    }
    if checked && reply[2..end].iter().fold(0, |sum, &byte| sum ^ byte) != reply[end] {
        return None;
    }
    let data = &reply[8..end];
    (u16::from_le_bytes([data[0], data[1]]) == VENDOR_ID && data[10] != 0 && data[12] <= 100)
        .then(|| (data[12], data[11] != 0))
}

pub(super) fn read(context: &mut Context, info: &DeviceInfo) -> Option<Reading> {
    let mut device = context.open(info).ok()?;
    if device.write(&request()).ok()? != REPORT_LEN {
        return None;
    }
    let (level, charging) = read_until(device.as_mut(), REPORT_LEN, TIMEOUT, MAX_READS, parse)
        .ok()
        .flatten()?;
    Some(Reading {
        level,
        charging,
        model: 0,
    })
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;

    pub(in super::super) fn reply(level: u8, checksum: bool) -> Vec<u8> {
        let mut reply = vec![0u8; REPORT_LEN];
        reply[..8].copy_from_slice(&[REPORT_ID, 1, u8::from(checksum), 14, 0, 9, 0, 0]);
        reply[8..10].copy_from_slice(&VENDOR_ID.to_le_bytes());
        reply[18..21].copy_from_slice(&[1, 0, level]);
        if checksum {
            reply[22] = reply[2..22].iter().fold(0, |sum, &byte| sum ^ byte);
        }
        reply
    }

    #[test]
    fn replies_are_checked_for_identity_length_and_checksum() {
        assert_eq!(parse(&reply(64, false)), Some((64, false)));
        assert_eq!(parse(&reply(64, true)), Some((64, false)));
        let mut bad = reply(64, true);
        bad[22] ^= 1;
        assert_eq!(parse(&bad), None);
        assert_eq!(parse(&reply(101, false)), None);
        assert_eq!(parse(&reply(64, false)[..63]), None);
    }

    #[test]
    fn the_windows_candidate_needs_the_exact_declaration() {
        let mut info = DeviceInfo {
            vendor_id: VENDOR_ID,
            product_id: 0x1018,
            usage_page: USAGE.0,
            usage: USAGE.1,
            interface_number: 2,
            product: ULTRA_NAME.into(),
            input_len: Some(64),
            output_len: Some(64),
            descriptor_error: Some("collection maximum mismatch"),
            declared: Some([
                Sizes::from([(REPORT_ID, 127)]),
                Sizes::from([(REPORT_ID, 64)]),
                Sizes::new(),
            ]),
            ..Default::default()
        };
        assert!(windows_report_candidate(&info));
        info.interface_number = 1;
        assert!(!windows_report_candidate(&info));
    }
}
