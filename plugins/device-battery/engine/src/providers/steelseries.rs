//! SteelSeries wireless headsets and mice, directly over HID without SteelSeries GG.
use super::context::Context;
use crate::hid::{DeviceInfo, HidDevice};
use crate::status::Status;
use std::time::{Duration, Instant};

mod classic;
mod models;
mod parsers;

use models::{HeadsetModel, MouseModel, HEADSETS, MICE};
use parsers::Reading;

pub(crate) const VENDORS: &[u16] = &[0x1038];
const INTERFACE: i32 = 3;
/// The configuration collection, whatever interface it is on.
const COLLECTION: (u16, u16) = (0xFFC0, 0x0001);
const TIMEOUT: Duration = Duration::from_secs(1);
const READ_SLICE: Duration = Duration::from_millis(100);
const WRITE_ATTEMPTS: usize = 3;
const READ_ATTEMPTS: usize = 6;

/// Picked by usage page, not interface number: the Rival 650 uses interface 0.
fn pick<'a>(infos: &[&'a DeviceInfo]) -> Option<&'a DeviceInfo> {
    let matching = || {
        infos
            .iter()
            .copied()
            .filter(|d| d.is_collection(COLLECTION.0, COLLECTION.1))
    };
    matching()
        .find(|d| d.interface_number == INTERFACE)
        .or_else(|| matching().next())
}

/// The first report `accept` takes within one second. Write or read errors end it.
fn ask(
    device: &mut dyn HidDevice,
    request: &[u8],
    accept: impl Fn(&[u8]) -> bool,
) -> Option<Vec<u8>> {
    device.write(request).ok()?;
    let deadline = Instant::now() + TIMEOUT;
    while Instant::now() < deadline {
        let reply = device.read(64, READ_SLICE).ok()?;
        if !reply.is_empty() && accept(&reply) {
            return Some(reply);
        }
    }
    None
}

fn read_headset(device: &mut dyn HidDevice, model: &HeadsetModel) -> Reading {
    let reply = ask(device, &[0x00, 0xB0], |r| r[0] == 0xB0)?;
    (model.parse)(&reply)
}

/// Up to three rounds. A report with the family's echo, or one the parser accepts,
/// is the answer; anything else on the collection ends the round.
fn read_mouse(device: &mut dyn HidDevice, model: &MouseModel) -> Reading {
    let mut request = [0u8; 64];
    request[..model.request.len()].copy_from_slice(model.request);
    for _ in 0..WRITE_ATTEMPTS {
        if device.write(&request).is_err() {
            continue;
        }
        for _ in 0..READ_ATTEMPTS {
            let reply = device.read(64, READ_SLICE).ok()?;
            if reply.is_empty() {
                continue;
            }
            let echoed = reply[0] == model.echo
                || (reply.len() > 1 && reply[0] == 0x00 && reply[1] == model.echo);
            if echoed {
                return (model.parse)(&reply);
            }
            if let Some(reading) = (model.parse)(&reply) {
                return Some(reading);
            }
            break;
        }
    }
    None
}

fn status(product_id: u16, name: &str, reading: (u8, bool), kind: &'static str) -> Status {
    Status::new(
        format!("steelseries:{product_id:04x}"),
        name,
        Some(reading.0),
        reading.1,
        kind,
    )
}

fn poll_current(context: &mut Context, infos: &[&DeviceInfo]) -> Vec<Status> {
    let mut product_ids: Vec<u16> = infos.iter().map(|d| d.product_id).collect();
    product_ids.sort_unstable();
    product_ids.dedup();
    let mut result = Vec::new();
    for product_id in product_ids {
        let mouse = MICE.iter().find(|m| m.product_id == product_id);
        let headset = HEADSETS.iter().find(|m| m.product_id == product_id);
        if mouse.is_none() && headset.is_none() {
            continue;
        }
        let mine: Vec<&DeviceInfo> = infos
            .iter()
            .copied()
            .filter(|d| d.product_id == product_id)
            .collect();
        let Some(mut device) = pick(&mine).and_then(|info| context.open(info).ok()) else {
            continue;
        };
        if let Some(model) = mouse {
            if let Some(reading) = read_mouse(device.as_mut(), model) {
                result.push(status(product_id, model.name, reading, "mouse"));
            }
        } else if let Some(model) = headset {
            if let Some(reading) = read_headset(device.as_mut(), model) {
                result.push(status(product_id, model.name, reading, "headset"));
            }
        }
    }
    result
}

fn poll_classic(context: &mut Context, infos: &[&DeviceInfo]) -> Vec<Status> {
    let mut result = Vec::new();
    for model in classic::MODELS {
        let candidates = infos.iter().copied().filter(|d| {
            d.product_id == model.product_id
                && model.interfaces.contains(&d.interface_number)
                && match model.usage_page {
                    Some(page) => d.usage_page == page,
                    None => d.usage_page >= 0xFF00,
                }
        });
        for info in candidates {
            let Ok(mut device) = context.open(info) else {
                continue;
            };
            let mut answered = false;
            let reading = (model.exchange)(&mut |request, accept| {
                let reply = ask(device.as_mut(), request, accept);
                answered |= reply.is_some();
                reply
            });
            // Once a collection has answered, the others are not asked.
            if answered {
                if let Some(reading) = reading {
                    let mut found = status(model.product_id, model.name, reading, "headset");
                    found.approximate = model.coarse;
                    result.push(found);
                }
                break;
            }
        }
    }
    result
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let infos = context.vendor(VENDORS[0]);
    let mut result = poll_current(context, &infos);
    result.extend(poll_classic(context, &infos));
    result
}

#[cfg(test)]
mod tests;
