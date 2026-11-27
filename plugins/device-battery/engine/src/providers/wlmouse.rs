//! WLmouse: request 83 as a feature report, with the passive heartbeat as fallback.
//! Every WLmouse PID (receivers and the cable) feeds one card; the source reporting
//! external power wins.
use super::context::{sleep, Context};
use crate::hid::{DeviceInfo, HidDevice, HidResult};
use crate::status::Status;
use std::time::{Duration, Instant};

pub(crate) const VENDORS: &[u16] = &[0x36A7];

const KNOWN: [(u16, &str); 3] = [
    (0xA887, "WLmouse Beast X"),
    (0xA868, "WLmouse Beast X Mini Pro"),
    (0xA880, "WLmouse Beast X Max"),
];
const PASSIVE_WINDOW: Duration = Duration::from_secs(2);

/// The feature request, shared with LAMZU: report 0, then 00 02 02 00 83.
pub(crate) fn request() -> [u8; 65] {
    let mut frame = [0; 65];
    frame[..7].copy_from_slice(&[0x00, 0x00, 0x00, 0x02, 0x02, 0x00, 0x83]);
    frame
}

/// (percent, charging) following the `A1/A2 .. .. 02 00 83` marker.
pub(crate) fn parse_feature(reply: &[u8]) -> Option<(u8, bool)> {
    (5..reply.len().saturating_sub(2))
        .find(|&i| {
            reply[i] == 0x83
                && reply[i - 1] == 0
                && reply[i - 2] == 2
                && matches!(reply[i - 5], 0xA1 | 0xA2)
                && reply[i + 2] <= 100
        })
        .map(|i| (reply[i + 2], reply[i + 1] != 0))
}

fn parse_heartbeat(data: &[u8]) -> Option<(u8, bool)> {
    [0, 1].into_iter().find_map(|offset| {
        let frame = data.get(offset..offset + 4)?;
        (frame[..2] == [0x03, 0x00] && frame[2] <= 100).then(|| (frame[2], frame[3] != 0))
    })
}

fn read_feature(device: &mut dyn HidDevice) -> Option<(u8, bool)> {
    device.send_feature(&request()).ok()?;
    for _ in 0..15 {
        sleep(50);
        for length in [65, 64] {
            if let Some(reading) = device
                .get_feature(0, length)
                .ok()
                .and_then(|reply| parse_feature(&reply))
            {
                return Some(reading);
            }
        }
    }
    None
}

fn read_passive(device: &mut dyn HidDevice, window: Duration) -> HidResult<Option<(u8, bool)>> {
    let deadline = Instant::now() + window;
    while Instant::now() < deadline {
        let data = device.read(64, Duration::ZERO)?;
        if let Some(reading) = parse_heartbeat(&data) {
            return Ok(Some(reading));
        }
        sleep(20);
    }
    Ok(None)
}

fn read_group(context: &Context, collections: &[&DeviceInfo]) -> Option<(u8, bool)> {
    let mut vendor: Vec<_> = collections
        .iter()
        .filter(|d| d.usage_page == 0xFFFF)
        .collect();
    vendor.sort_by_key(|d| d.usage != 0);
    for info in vendor {
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        if let Some(reading) = read_feature(device.as_mut()) {
            return Some(reading);
        }
    }
    let listen: Vec<_> = collections
        .iter()
        .filter(|d| d.usage_page >= 0xFF00)
        .take(2)
        .collect();
    let window = PASSIVE_WINDOW / listen.len().max(1) as u32;
    listen.into_iter().find_map(|info| {
        let mut device = context.open(info).ok()?;
        read_passive(device.as_mut(), window).ok().flatten()
    })
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut groups: Vec<(u16, Vec<&DeviceInfo>)> = Vec::new();
    for info in context.vendor(0x36A7) {
        match groups.iter_mut().find(|(id, _)| *id == info.product_id) {
            Some((_, list)) => list.push(info),
            None => groups.push((info.product_id, vec![info])),
        }
    }
    let is_receiver = |(id, list): &(u16, Vec<&DeviceInfo>)| {
        list[0].product.to_uppercase().contains("RECEIVER")
            || KNOWN.iter().any(|(known, _)| known == id)
    };
    // The cable goes first; once it reports power the receivers are not asked.
    groups.sort_by_key(|group| is_receiver(group));

    let mut name: Option<String> = None;
    let mut readings: Vec<(u8, bool)> = Vec::new();
    for group in &groups {
        if readings.first().is_some_and(|r| r.1) && is_receiver(group) {
            continue;
        }
        let (product_id, list) = group;
        let product = list[0].product.trim();
        if let Some((_, known)) = KNOWN.iter().find(|(id, _)| id == product_id) {
            name = Some(known.to_string());
        } else if name.is_none() && !product.is_empty() {
            name = Some(if product.to_lowercase().contains("wl") {
                product.to_string()
            } else {
                format!("WLmouse {product}")
            });
        }
        readings.extend(read_group(context, list));
    }
    readings.sort_by_key(|reading| !reading.1);
    let Some(&(level, charging)) = readings.first() else {
        return Vec::new();
    };
    vec![Status::new(
        "wlmouse",
        name.unwrap_or_else(|| "WLmouse".into()),
        Some(level),
        charging,
        "",
    )]
}

#[cfg(test)]
mod tests;
