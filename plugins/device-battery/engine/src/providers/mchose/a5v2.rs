//! A5 V2 Ultra: feature report 11 on its one proven FF01:0001 collection. Two equal
//! replies in a row are required, and a failure never falls back to older frames.
use super::Reading;
use crate::hid::{proof, DeviceInfo};
use crate::providers::context::{sleep, Context};
use std::time::{Duration, Instant};

pub(super) const IDENTITY: (u16, u16) = (0x3837, 0x100C);
pub(super) const NAME: &str = "MCHOSE A5 V2 Ultra";
const ATTEMPTS: usize = 20;
const TIMEOUT: Duration = Duration::from_secs(2);
const GAP_MS: u64 = 90;

pub(super) fn is_path(path: &str) -> bool {
    proof::is_usb_hid_path(path, IDENTITY.0, IDENTITY.1)
}

/// The proof attached by the topology pass must describe exactly these collections.
pub(super) fn pick<'a>(infos: &[&'a DeviceInfo]) -> Option<&'a DeviceInfo> {
    let first = infos.first()?;
    let attestation = first.a5v2_topology.as_ref()?;
    let parent = &first.physical_id;
    let mut paths: Vec<String> = infos.iter().map(|d| d.path.to_lowercase()).collect();
    paths.sort();
    let unique = paths.windows(2).all(|pair| pair[0] != pair[1]);
    let consistent = unique
        && proof::is_usb_parent(parent, IDENTITY.0, IDENTITY.1)
        && attestation.paths == paths
        && &attestation.parent == parent
        && infos.iter().all(|d| {
            is_path(&d.path)
                && d.is(IDENTITY.0, IDENTITY.1)
                && d.product.trim() == NAME
                && &d.physical_id == parent
                && d.a5v2_topology.as_ref() == Some(attestation)
                && d.a5v2_complete
                && d.usage_page > 0
                && d.usage > 0
        });
    if !consistent {
        return None;
    }
    let mut collections = infos.iter().filter(|d| d.is_collection(0xFF01, 0x0001));
    let info = *collections.next()?;
    if collections.next().is_some() || attestation.collection != info.path.to_lowercase() {
        return None;
    }
    feature_length(info).map(|_| info)
}

fn feature_length(info: &DeviceInfo) -> Option<usize> {
    let maximum = info.feature_len.filter(|n| matches!(n, 21 | 65))?;
    let sizes = info.feature_sizes.as_ref()?;
    (sizes.values().all(|n| (2..=maximum).contains(n))
        && sizes.get(&0x11) == Some(&maximum)
        && info.feature_proven_by == Some("caps"))
    .then_some(maximum)
}

fn request(length: usize) -> Vec<u8> {
    let mut frame = vec![0u8; length];
    frame[..21].fill(0xFF);
    frame[..2].copy_from_slice(&[0x11, 0xF9]);
    frame
}

/// The eleven inverted payload bytes of an exact-length reply.
fn parse(reply: &[u8], length: usize) -> Option<[u8; 11]> {
    if reply.len() != length || reply.len() < 13 || reply[..2] != [0x11, 0xF9] {
        return None;
    }
    let mut payload = [0u8; 11];
    for (target, byte) in payload.iter_mut().zip(&reply[2..13]) {
        *target = !byte;
    }
    (payload.iter().any(|&b| b != 0)
        && u16::from_le_bytes([payload[0], payload[1]]) == IDENTITY.0
        && u16::from_le_bytes([payload[2], payload[3]]) != 0
        && payload[9] <= 100)
        .then_some(payload)
}

pub(super) fn read(context: &mut Context, info: &DeviceInfo) -> Option<Reading> {
    let length = feature_length(info)?;
    let request = request(length);
    let deadline = Instant::now() + TIMEOUT;
    let mut device = context.open(info).ok()?;
    let mut previous = None;
    for _ in 0..ATTEMPTS {
        if Instant::now() >= deadline {
            break;
        }
        if device.send_feature(&request).ok()? != length {
            return None;
        }
        if deadline.saturating_duration_since(Instant::now()) < Duration::from_millis(GAP_MS) {
            break;
        }
        sleep(GAP_MS);
        if Instant::now() >= deadline {
            break;
        }
        let Ok(reply) = device.get_feature(0x11, length) else {
            previous = None;
            continue;
        };
        if Instant::now() >= deadline {
            break;
        }
        let payload = parse(&reply, length);
        if let Some(stable) = payload.filter(|_| payload == previous) {
            return Some(Reading {
                level: stable[9],
                charging: stable[10] != 0,
                model: 0,
            });
        }
        previous = payload;
    }
    None
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;

    pub(in super::super) fn reply(length: usize, level: u8, charging: u8) -> Vec<u8> {
        let payload = [0x37, 0x38, 0x0C, 0x10, 0, 0, 0, 0, 0, level, charging];
        let mut reply = vec![0u8; length];
        reply[..2].copy_from_slice(&[0x11, 0xF9]);
        for (target, byte) in reply[2..].iter_mut().zip(payload) {
            *target = !byte;
        }
        reply
    }

    #[test]
    fn the_request_and_reply_are_exact() {
        assert_eq!(request(21)[..3], [0x11, 0xF9, 0xFF]);
        assert_eq!(request(65).iter().filter(|&&b| b == 0).count(), 44);
        assert_eq!(parse(&reply(21, 80, 1), 21).map(|p| p[9]), Some(80));
        assert_eq!(parse(&reply(21, 101, 0), 21), None);
        assert_eq!(parse(&reply(21, 80, 0), 65), None);
    }
}
