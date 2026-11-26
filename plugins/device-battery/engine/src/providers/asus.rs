//! ASUS ROG / TUF wireless mice (G-Helper's battery command 12 07).
use super::context::Context;
use crate::hid::{DeviceInfo, HidDevice, HidResult};
use crate::status::Status;
use std::time::Duration;

pub(crate) const VENDORS: &[u16] = &[0x0B05];

const PACKET_BYTES: usize = 65;

/// Scale of the battery byte.
#[derive(Clone, Copy, PartialEq)]
enum Scale {
    Percent,
    /// 0..=4 in steps of 25 %.
    Steps,
}
use Scale::{Percent, Steps};

const MODELS: [(&[u16], &str, Scale); 16] = [
    (&[0x1A72, 0x1A70], "ROG Gladius III Aimpoint", Percent),
    (&[0x1B0C, 0x1B0A], "ROG Gladius III Eva 2", Percent),
    (&[0x197F, 0x197D], "ROG Gladius III Wireless", Percent),
    (&[0x1A1A, 0x1A18], "ROG Chakram X", Percent),
    (&[0x1A94, 0x1A92], "ROG Harpe Ace Aim Lab Edition", Percent),
    (&[0x1A68, 0x1A66], "ROG Keris Wireless Aimpoint", Percent),
    (&[0x1979, 0x1977], "ROG Spatha X", Percent),
    (&[0x19F4], "TUF Gaming M4 Wireless", Percent),
    (&[0x1A8D], "TX Gaming Mouse", Percent),
    (&[0x1AF5, 0x1AF3], "TX Gaming Mouse Mini", Percent),
    (&[0x1C57, 0x1C56], "TUF Gaming Mini Miku Edition", Percent),
    (&[0x18E5, 0x18E3], "ROG Chakram", Steps),
    (&[0x1960, 0x195E], "ROG Keris Wireless", Steps),
    (&[0x1A59, 0x1A57], "ROG Keris EVA Edition", Steps),
    (&[0x1908, 0x1906], "ROG Pugio II", Steps),
    (&[0x1949, 0x1947], "ROG Strix Impact II Wireless", Steps),
];

fn model(product_id: u16) -> Option<(&'static str, Scale)> {
    MODELS
        .iter()
        .find(|(ids, ..)| ids.contains(&product_id))
        .map(|&(_, name, scale)| (name, scale))
}

fn request() -> [u8; PACKET_BYTES] {
    let mut frame = [0; PACKET_BYTES];
    frame[..3].copy_from_slice(&[0x00, 0x12, 0x07]);
    frame
}

/// Where `pair` starts: 0 (hidapi left report ID 0 out) or 1.
fn offset(reply: &[u8], pair: [u8; 2]) -> Option<usize> {
    if reply.starts_with(&pair) {
        Some(0)
    } else if reply.first() == Some(&0) && reply[1..].starts_with(&pair) {
        Some(1)
    } else {
        None
    }
}

fn parse(reply: &[u8], scale: Scale) -> Option<(u8, bool)> {
    let start = offset(reply, [0x12, 0x07])?;
    let charging = *reply.get(start + 9)? != 0;
    let raw = reply[start + 4];
    // Zero while not charging is standby, not empty.
    if raw == 0 && !charging {
        return None;
    }
    let level = match scale {
        Percent if raw <= 100 => raw,
        Steps if raw <= 4 => raw * 25,
        _ => return None,
    };
    Some((level, charging))
}

fn exchange(device: &mut dyn HidDevice, scale: Scale) -> HidResult<Option<(u8, bool)>> {
    for _ in 0..16 {
        if device.read(PACKET_BYTES, Duration::ZERO)?.is_empty() {
            break;
        }
    }
    for _ in 0..3 {
        device.write(&request())?;
        for _ in 0..8 {
            let reply = device.read(PACKET_BYTES, Duration::from_millis(300))?;
            if reply.is_empty() {
                break; // Timed out: send the request again.
            }
            if offset(&reply, [0xFF, 0xAA]).is_some() || reply.iter().all(|&b| b == 0) {
                return Ok(None);
            }
            // Button and profile events are skipped.
            if offset(&reply, [0x12, 0x07]).is_some() {
                return Ok(parse(&reply, scale));
            }
        }
    }
    Ok(None)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut found: Vec<(&str, Scale, u8, bool)> = Vec::new();
    let vendor: Vec<&DeviceInfo> = context.vendor(0x0B05);
    for info in vendor {
        let Some((name, scale)) = model(info.product_id) else {
            continue;
        };
        // Only the vendor collection of interface 0.
        if info.interface_number != 0 || info.usage_page < 0xFF00 {
            continue;
        }
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        let Ok(Some((level, charging))) = exchange(device.as_mut(), scale) else {
            continue;
        };
        match found.iter_mut().find(|entry| entry.0 == name) {
            None => found.push((name, scale, level, charging)),
            Some(entry) if charging && !entry.3 => *entry = (name, scale, level, charging),
            Some(_) => {}
        }
    }
    found
        .into_iter()
        .map(|(name, scale, level, charging)| Status {
            approximate: scale == Steps,
            ..Status::new(
                format!("asus:{}", name.to_lowercase().replace(' ', "-")),
                name,
                Some(level),
                charging,
                "mouse",
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(prefix: usize, raw: u8, charging: u8) -> Vec<u8> {
        let mut reply = vec![0u8; PACKET_BYTES - 1 + prefix];
        reply[prefix..prefix + 2].copy_from_slice(&[0x12, 0x07]);
        reply[prefix + 4] = raw;
        reply[prefix + 9] = charging;
        reply
    }

    #[test]
    fn both_report_id_forms_and_both_scales_parse() {
        assert_eq!(parse(&reply(0, 90, 0), Percent), Some((90, false)));
        assert_eq!(parse(&reply(1, 90, 1), Percent), Some((90, true)));
        assert_eq!(parse(&reply(0, 3, 0), Steps), Some((75, false)));
        assert_eq!(parse(&reply(0, 5, 0), Steps), None);
        assert_eq!(parse(&reply(0, 101, 0), Percent), None);
        assert_eq!(parse(&reply(0, 0, 0), Percent), None);
        assert_eq!(parse(&reply(0, 0, 1), Percent), Some((0, true)));
        assert_eq!(
            model(0x1947).map(|m| m.0),
            Some("ROG Strix Impact II Wireless")
        );
    }
}
