//! MCHOSE BY keyboards on a shared 2.4G receiver: identify the keyboard behind it
//! (read 05), then read its power (4A). An unidentified keyboard is only read on
//! the one receiver whose generic reply is known.
use super::battery_query::{Query, Reading, READ_TIMEOUT};
use super::by_frame::{battery_request, identity_request, payload};
use super::context::{only, proven_groups, read_until, Context};
use crate::hid::{DeviceInfo, HidDevice, HidResult, Sizes};
use crate::status::Status;
use std::time::Duration;

pub(crate) const VENDORS: &[u16] = &[0x3554, 0x41E4];

const GENERIC: (u16, u16) = (0x3554, 0xFA09);
const PRIMARY: (u16, u16) = (0xFF04, 0x0002);
const ALTERNATE: (u16, u16) = (0xFF02, 0x0002);
const RECEIVER_NAMES: [&str; 2] = ["2.4G Wireless Receiver", "MCHOSE 2.4G Wireless"];
/// M HUB's retry budget, per query.
const TIMEOUT: Duration = Duration::from_millis(2200);

const MODEL_CODES: [(u64, &str); 18] = [
    (0x0300_0000_021C, "G87"),
    (0x0300_0000_0077, "K99"),
    (0x0300_0000_01DF, "K99_V2"),
    (0x0300_0000_0132, "G98"),
    (0x0300_0000_00D6, "X75"),
    (0x0A00_0000_0003, "G98_Pro"),
    (0x0300_0000_01C6, "X75_V2"),
    (0x0300_0000_0115, "G75_Pro"),
    (0x0A00_0000_0018, "G98_V2"),
    (0x0A00_0000_002B, "UT98"),
    (0x0A00_0000_0001, "Z75"),
    (0x0A00_0000_0009, "Z75S"),
    (0x0300_0000_01C7, "KX75"),
    (0x0300_0000_0174, "GX87"),
    (0x0300_0000_01ED, "GX87_V2"),
    (0x0300_0000_0135, "K87"),
    (0x0300_0000_0335, "G75_V2"),
    (0x0A00_0000_0034, "G87_V2"),
];

const fn query(vendor_id: u16, models: &'static [(u16, &'static str)]) -> Query {
    Query {
        name: "mchose_by_keyboard",
        vendor_id,
        models,
        collection: PRIMARY,
        input_id: 0x13,
        input_bounds: (20, 20),
        output_id: 0x13,
        output_len: 20,
        kind: "keyboard",
        charging_known: true,
        unconfirmed: false,
        timeout: READ_TIMEOUT,
    }
}

const QUERIES: [Query; 2] = [
    query(0x3554, &[(0xFA09, "2.4G 无线键盘（3554:FA09）")]),
    query(
        0x41E4,
        &[(0x2001, "MCHOSE BY keyboard (model identification required)")],
    ),
];

enum Model {
    Known(&'static str),
    Unknown,
}

/// `None`: not an identity reply.
fn parse_model(reply: &[u8]) -> Option<Model> {
    let data = payload(reply, 0x05, false)?;
    let code = data[..6]
        .iter()
        .fold(0u64, |code, &b| (code << 8) | u64::from(b));
    let known = MODEL_CODES.iter().find(|(known, _)| *known == code);
    Some(known.map_or(Model::Unknown, |(_, name)| Model::Known(name)))
}

/// (percent, charge flag) from the short push form or a 4A reply.
fn fields(reply: &[u8]) -> Option<(u8, u8)> {
    let data = if reply.len() == 20 && reply[..2] == [0x13, 0x0A] && reply[5] == 0x05 {
        &reply[6..8]
    } else {
        payload(reply, 0x4A, false)?
    };
    Some((data[0], data[1]))
}

fn parse_identified(reply: &[u8]) -> Option<Reading> {
    let (level, flags) = fields(reply)?;
    let (full, charge) = (flags & 15, flags >> 4);
    ((1..=100).contains(&level) && full <= 1 && charge <= 1)
        .then(|| Reading::exact(level, charge == 1 && level < 100))
}

fn parse_generic(reply: &[u8]) -> Option<Reading> {
    let level = payload(reply, 0x4A, false)?[0];
    (1..=100)
        .contains(&level)
        .then(|| Reading::exact(level, false))
}

fn exactly_by_report(maximum: Option<usize>, sizes: &Option<Sizes>) -> bool {
    maximum == Some(20)
        && sizes
            .as_ref()
            .is_some_and(|s| s.len() == 1 && s.get(&0x13) == Some(&20))
}

fn carries_by_reports(info: &DeviceInfo) -> bool {
    exactly_by_report(info.input_len, &info.input_sizes)
        && exactly_by_report(info.output_len, &info.output_sizes)
}

/// The shape of a 3554:FA09 receiver that only has a vendor feature report.
fn feature_only(info: &DeviceInfo) -> bool {
    let empty = |maximum: Option<usize>, sizes: &Option<Sizes>| {
        maximum == Some(0) && sizes.as_ref().is_some_and(Sizes::is_empty)
    };
    (info.vendor_id, info.product_id) == GENERIC
        && info.feature_len == Some(8)
        && info.feature_sizes == Some(Sizes::from([(6, 8)]))
        && empty(info.input_len, &info.input_sizes)
        && empty(info.output_len, &info.output_sizes)
}

fn pick<'a>(query: &Query, infos: &[&'a DeviceInfo]) -> Option<&'a DeviceInfo> {
    let listed = |d: &DeviceInfo| {
        d.vendor_id == query.vendor_id && query.models.iter().any(|(id, _)| *id == d.product_id)
    };
    let primary = only(infos, |d| {
        listed(d) && d.is_collection(PRIMARY.0, PRIMARY.1)
    })
    .filter(|d| !d.path.is_empty())?;
    let mut by = infos.iter().copied().filter(|d| {
        listed(d)
            && !d.path.is_empty()
            && (d.is_collection(PRIMARY.0, PRIMARY.1)
                || (d.is_collection(ALTERNATE.0, ALTERNATE.1) && !d.physical_id.is_empty()))
            && carries_by_reports(d)
    });
    let info = match (by.next(), by.next()) {
        (Some(_), Some(_)) => return None,
        (Some(info), None) => info,
        _ if feature_only(primary) => return None,
        _ => query.pick(infos)?.0,
    };
    let known_name = |d: &DeviceInfo| RECEIVER_NAMES.contains(&d.product.as_str());
    (known_name(info) && known_name(primary) && carries_by_reports(info)).then_some(info)
}

fn ask<T>(
    device: &mut dyn HidDevice,
    request: &[u8],
    accept: impl FnMut(&[u8]) -> Option<T>,
) -> HidResult<Option<T>> {
    if device.write(request)? != request.len() {
        return Ok(None);
    }
    read_until(device, 20, TIMEOUT, 32, accept)
}

/// The name and reading of the keyboard behind this receiver.
fn read(
    device: &mut dyn HidDevice,
    identity: (u16, u16),
    fallback: &str,
) -> HidResult<Option<(String, Reading, bool)>> {
    let Some(model) = ask(device, &identity_request(), parse_model)? else {
        return Ok(None);
    };
    let (name, known) = match model {
        Model::Known(key) => (format!("MCHOSE {}", key.replace('_', " ")), true),
        Model::Unknown if identity == GENERIC => (fallback.to_string(), false),
        Model::Unknown => return Ok(None),
    };
    let parse = if known {
        parse_identified
    } else {
        parse_generic
    };
    let reading = ask(device, &battery_request(), parse)?;
    Ok(reading.map(|reading| (name, reading, known)))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for query in &QUERIES {
        for (physical, infos) in proven_groups(&context.vendor(query.vendor_id)) {
            let Some(info) = pick(query, &infos) else {
                continue;
            };
            let Some((_, fallback)) = query.models.iter().find(|(id, _)| *id == info.product_id)
            else {
                continue;
            };
            let Ok(mut device) = context.open(info) else {
                continue;
            };
            let identity = (info.vendor_id, info.product_id);
            if let Ok(Some((name, reading, known))) = read(device.as_mut(), identity, fallback) {
                let mut status = query.status(physical, &name, reading);
                status.charging_known = Some(known);
                result.push(status);
            }
        }
    }
    result
}

#[cfg(test)]
mod tests;
