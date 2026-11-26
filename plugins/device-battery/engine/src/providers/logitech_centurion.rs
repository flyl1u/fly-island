//! Logitech G PRO X 2 LIGHTSPEED (Centurion): discover the feature table behind the
//! receiver's bridge, then read battery feature 0104. Older firmware without it
//! takes one fixed legacy request.
use super::context::Context;
use crate::hid::{DeviceInfo, HidDevice, HidResult};
use crate::status::Status;
use std::time::{Duration, Instant};

pub(crate) const VENDORS: &[u16] = &[0x046D];

const NAME: &str = "Logitech G PRO X 2 LIGHTSPEED";
const PRODUCT_ID: u16 = 0x0AF7;
const REPORT_ID: u8 = 0x51;
const FRAME_BYTES: usize = 64;
const SOFTWARE_ID: u8 = 0x01;
const BRIDGE_SEND: u8 = 0x10;
const FEATURE_SET: [u8; 2] = [0x00, 0x01];
const FEATURE_BRIDGE: u16 = 0x0003;
const FEATURE_BATTERY: u16 = 0x0104;
const LEGACY_REQUEST: [u8; 10] = [0x51, 0x08, 0x00, 0x03, 0x1A, 0x00, 0x03, 0x00, 0x04, 0x0A];

fn frame(payload: &[u8]) -> [u8; FRAME_BYTES] {
    let mut frame = [0; FRAME_BYTES];
    frame[0] = REPORT_ID;
    let length = payload.len().min(FRAME_BYTES - 3);
    frame[1] = length as u8 + 1;
    frame[3..3 + length].copy_from_slice(&payload[..length]);
    frame
}

fn function_id(function: u8) -> u8 {
    (function & 0xF0) | SOFTWARE_ID
}

fn direct_frame(feature: u8, function: u8, params: &[u8]) -> [u8; FRAME_BYTES] {
    let mut payload = vec![feature, function_id(function)];
    payload.extend_from_slice(params);
    frame(&payload)
}

fn bridge_frame(bridge: u8, sub: u8, function: u8, params: &[u8]) -> [u8; FRAME_BYTES] {
    let mut message = vec![0x00, sub, function_id(function)];
    message.extend_from_slice(params);
    let [high, low] = (message.len() as u16).to_be_bytes();
    let mut payload = vec![bridge, BRIDGE_SEND | SOFTWARE_ID, high & 0x0F, low];
    payload.extend(message);
    frame(&payload)
}

fn payload_of(reply: &[u8]) -> Option<&[u8]> {
    if reply.len() < 4 || reply[0] != REPORT_ID {
        return None;
    }
    let length = usize::from(reply[1]);
    (length > 1 && length + 2 <= reply.len()).then(|| &reply[3..2 + length])
}

/// `Some(None)` when the other side refused; `None` for an unrelated frame.
fn direct_reply(reply: &[u8], feature: u8, function: u8) -> Option<Option<Vec<u8>>> {
    let payload = payload_of(reply).filter(|p| p.len() >= 2)?;
    let function = function_id(function);
    if payload.len() >= 3 && payload[..3] == [0xFF, feature, function] {
        return Some(None);
    }
    (payload[..2] == [feature, function]).then(|| Some(payload[2..].to_vec()))
}

fn bridge_reply(reply: &[u8], bridge: u8, sub: u8, function: u8) -> Option<Option<Vec<u8>>> {
    let p = payload_of(reply)?;
    // A message event (low nibble 0); nibble 1 is only the receiver's acknowledgement.
    if p.len() < 7 || p[0] != bridge || p[1] != BRIDGE_SEND || p[4] != 0 {
        return None;
    }
    if p[5..7] == [0xFF, sub] {
        return Some(None);
    }
    (p[5..7] == [sub, function_id(function)]).then(|| Some(p[7..].to_vec()))
}

/// The first frame within 1.5 s that `accept` recognises.
fn wait<T>(
    device: &mut dyn HidDevice,
    mut accept: impl FnMut(&[u8]) -> Option<Option<T>>,
) -> HidResult<Option<T>> {
    let deadline = Instant::now() + Duration::from_millis(1500);
    while Instant::now() < deadline {
        let reply = device.read(FRAME_BYTES, Duration::from_millis(100))?;
        if reply.is_empty() {
            continue;
        }
        if let Some(value) = accept(&reply) {
            return Ok(value);
        }
    }
    Ok(None)
}

fn direct(
    device: &mut dyn HidDevice,
    feature: u8,
    function: u8,
    params: &[u8],
) -> HidResult<Option<Vec<u8>>> {
    device.write(&direct_frame(feature, function, params))?;
    wait(device, |reply| direct_reply(reply, feature, function))
}

fn bridged(
    device: &mut dyn HidDevice,
    bridge: u8,
    sub: u8,
    function: u8,
    params: &[u8],
) -> HidResult<Option<Vec<u8>>> {
    device.write(&bridge_frame(bridge, sub, function, params))?;
    wait(device, |reply| bridge_reply(reply, bridge, sub, function))
}

fn feature_at(entry: &[u8]) -> Option<u16> {
    (entry.len() >= 3).then(|| u16::from_be_bytes([entry[1], entry[2]]))
}

/// The first byte of a reply.
fn first(reply: Option<Vec<u8>>) -> Option<u8> {
    reply.and_then(|r| r.first().copied())
}

/// (bridge index, index of the headset's battery feature if it has one)
fn discover(device: &mut dyn HidDevice) -> HidResult<Option<(u8, Option<u8>)>> {
    let Some(set) = first(direct(device, 0, 0x00, &FEATURE_SET)?).filter(|&i| i != 0) else {
        return Ok(None);
    };
    let Some(count) = first(direct(device, set, 0x00, &[])?) else {
        return Ok(None);
    };
    let mut bridge = None;
    for index in 0..count {
        let Some(entry) = direct(device, set, 0x10, &[index])? else {
            return Ok(None);
        };
        if feature_at(&entry) == Some(FEATURE_BRIDGE) {
            bridge = Some(index);
            break;
        }
    }
    let Some(bridge) = bridge else {
        return Ok(None);
    };
    let reply = bridged(device, bridge, 0, 0x00, &FEATURE_SET)?;
    let Some(set) = first(reply).filter(|&i| i != 0) else {
        return Ok(None);
    };
    let Some(count) = first(bridged(device, bridge, set, 0x00, &[])?) else {
        return Ok(None);
    };
    let mut battery = None;
    for index in 0..count {
        let Some(entry) = bridged(device, bridge, set, 0x10, &[index])? else {
            return Ok(None);
        };
        if feature_at(&entry) == Some(FEATURE_BATTERY) {
            battery = Some(index);
        }
    }
    Ok(Some((bridge, battery)))
}

fn parse_battery(data: &[u8]) -> Option<(u8, bool)> {
    let level = *data.first().filter(|&&level| level <= 100)?;
    let charging = data.get(2).is_some_and(|state| (1..=3).contains(state));
    Some((level, charging))
}

fn parse_legacy(reply: &[u8]) -> Option<(u8, bool)> {
    (reply.len() >= 13 && reply[..2] == [REPORT_ID, 0x0B] && reply[8] == 0x04 && reply[10] <= 100)
        .then(|| (reply[10], reply[12] == 0x02))
}

fn legacy(device: &mut dyn HidDevice) -> HidResult<Option<(u8, bool)>> {
    let mut request = [0; FRAME_BYTES];
    request[..LEGACY_REQUEST.len()].copy_from_slice(&LEGACY_REQUEST);
    device.write(&request)?;
    let mut seen = 0;
    wait(device, |reply| {
        if reply.first() != Some(&REPORT_ID) {
            return None;
        }
        seen += 1;
        // A power report: the headset is off.
        if reply.len() >= 7 && reply[1] == 0x05 && reply[6] == 0 {
            return Some(None);
        }
        match parse_legacy(reply) {
            Some(reading) => Some(Some(reading)),
            None => (seen >= 4).then_some(None),
        }
    })
}

fn read(context: &Context, info: &DeviceInfo) -> HidResult<Option<(u8, bool)>> {
    let mut device = context.open(info)?;
    match discover(device.as_mut())? {
        None => Ok(None),
        Some((_, None)) => legacy(device.as_mut()),
        Some((bridge, Some(index))) => {
            let data = bridged(device.as_mut(), bridge, index, 0x00, &[])?;
            Ok(data.and_then(|data| parse_battery(&data)))
        }
    }
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for info in context.vendor(0x046D) {
        if info.product_id != PRODUCT_ID || !info.is_collection(0xFFA0, 0x0001) {
            continue;
        }
        if let Ok(Some((level, charging))) = read(context, info) {
            result.push(Status {
                source: "logitech",
                ..Status::new(
                    format!("logitech-centurion:{PRODUCT_ID:04x}"),
                    NAME,
                    Some(level),
                    charging,
                    "headset",
                )
            });
        }
    }
    result
}

#[cfg(test)]
mod tests;
