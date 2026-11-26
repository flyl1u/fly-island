//! Pulsar and the CompX mice sharing its power query (ATK, VXE, VGN, Hitscan), plus
//! the separate ATK NANO receiver protocol.
use super::context::{sleep, Context};
use crate::hid::{DeviceInfo, HidDevice, HidResult, Sizes};
use crate::status::Status;
use std::time::Duration;

pub(crate) mod compx;
mod models;
mod nano;

use compx::{parse_link8k_power, parse_power, power_request, FRAME_BYTES};
use models::{ATK_HEADSETS, ATK_VENDOR, LINK8K, MODELS, STRICT_IDS};

pub(crate) const VENDORS: &[u16] = &[0x3554, 0x373B, 0x3770, 0x3710];

type Parse = fn(&[u8]) -> Option<(u8, bool)>;

fn is_control(info: &DeviceInfo) -> bool {
    info.is_collection(0xFF02, 0x0002)
}

/// FF02:0002 with a proven 17-byte output report.
fn strict<'a>(mine: &[&'a DeviceInfo]) -> Option<&'a DeviceInfo> {
    mine.iter()
        .copied()
        .find(|d| is_control(d) && d.output_len == Some(FRAME_BYTES))
}

fn pick_link8k<'a>(mine: &[&'a DeviceInfo]) -> Option<&'a DeviceInfo> {
    let mut control = mine.iter().copied().filter(|d| is_control(d));
    let info = control.next()?;
    let exact = Some(Sizes::from([(8, FRAME_BYTES)]));
    (control.next().is_none()
        && !info.path.is_empty()
        && info.input_len == Some(FRAME_BYTES)
        && info.output_len == Some(FRAME_BYTES)
        && info.input_sizes == exact
        && info.output_sizes == exact)
        .then_some(info)
}

/// The listed models keep the original tool's fallback: the vendor collection when
/// it can take the frame, else the first collection that can.
fn pick_listed<'a>(mine: &[&'a DeviceInfo]) -> Option<&'a DeviceInfo> {
    let control: Vec<_> = mine.iter().copied().filter(|d| is_control(d)).collect();
    control
        .iter()
        .chain(mine.iter())
        .copied()
        .find(|d| d.output_len.is_none_or(|length| length == FRAME_BYTES))
        .or_else(|| control.first().copied())
        .or_else(|| mine.first().copied())
}

fn first_product(chosen: &DeviceInfo, mine: &[&DeviceInfo]) -> Option<String> {
    std::iter::once(chosen)
        .chain(mine.iter().copied())
        .map(|d| d.product.trim())
        .find(|product| !product.is_empty())
        .map(str::to_string)
}

/// (the collection to ask, the card name)
fn select<'a>(
    vendor_id: u16,
    product_id: u16,
    mine: &[&'a DeviceInfo],
) -> Option<(&'a DeviceInfo, String)> {
    let listed = MODELS
        .iter()
        .find(|(vendor, product, _)| (*vendor, *product) == (vendor_id, product_id))
        .map(|(.., name)| *name);
    let identity = (vendor_id, product_id);
    if identity == LINK8K {
        return Some((pick_link8k(mine)?, listed?.to_string()));
    }
    if STRICT_IDS.contains(&identity) {
        let info = strict(mine)?;
        let name = first_product(info, mine).or_else(|| listed.map(str::to_string))?;
        return Some((info, name));
    }
    if let Some(name) = listed {
        return Some((pick_listed(mine)?, name.to_string()));
    }
    let info = strict(mine)?;
    let name = if info.product.is_empty() {
        "ATK Mouse"
    } else {
        &info.product
    };
    Some((info, name.to_string()))
}

fn query(device: &mut dyn HidDevice, parse: Parse) -> HidResult<Option<(u8, bool)>> {
    for _ in 0..4 {
        if device
            .read(FRAME_BYTES, Duration::from_millis(30))?
            .is_empty()
        {
            break;
        }
    }
    device.write(&power_request())?;
    for _ in 0..4 {
        let reply = device.read(FRAME_BYTES, Duration::from_millis(250))?;
        if reply.is_empty() {
            break;
        }
        if let Some(reading) = parse(&reply) {
            return Ok(Some(reading));
        }
        sleep(20);
    }
    Ok(None)
}

/// Listed PIDs in table order; every other ATK PID that is not a headset after them.
fn candidates(vendor_id: u16, infos: &[&DeviceInfo]) -> Vec<u16> {
    let listed: Vec<u16> = MODELS
        .iter()
        .filter(|(vendor, ..)| *vendor == vendor_id)
        .map(|(_, product, _)| *product)
        .collect();
    let mut result = listed.clone();
    if vendor_id == ATK_VENDOR {
        let mut others: Vec<u16> = infos
            .iter()
            .map(|d| d.product_id)
            .filter(|id| {
                !listed.contains(id) && !ATK_HEADSETS.contains(id) && *id != nano::PRODUCT_ID
            })
            .collect();
        others.sort_unstable();
        others.dedup();
        result.extend(others);
    }
    result
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for &vendor_id in VENDORS {
        let infos = context.vendor(vendor_id);
        // A NANO receiver never falls back to the CompX frame, proven or not.
        if vendor_id == ATK_VENDOR && infos.iter().any(|d| d.product_id == nano::PRODUCT_ID) {
            result.extend(nano::poll(context));
        }
        for product_id in candidates(vendor_id, &infos) {
            let mine: Vec<&DeviceInfo> = infos
                .iter()
                .copied()
                .filter(|d| d.product_id == product_id)
                .collect();
            let Some((info, name)) = select(vendor_id, product_id, &mine) else {
                continue;
            };
            let parse: Parse = if (vendor_id, product_id) == LINK8K {
                parse_link8k_power
            } else {
                parse_power
            };
            let reading = context
                .open(info)
                .and_then(|mut device| query(device.as_mut(), parse))
                .ok()
                .flatten();
            if let Some((level, charging)) = reading {
                result.push(Status::new(
                    format!("pulsar:{vendor_id:04x}{product_id:04x}"),
                    name,
                    Some(level),
                    charging,
                    "mouse",
                ));
            }
        }
    }
    result
}

#[cfg(test)]
mod tests;
