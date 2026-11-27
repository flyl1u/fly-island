//! G-Wolves: models with their own receiver use the old (8F) or new (83) read by
//! PID; the shared receiver and the older cable PIDs feed one card. Only a
//! collection with a 65-byte feature report is asked.
use super::context::{sleep, Context};
use super::wlmouse::{parse_feature, request as new_request};
use crate::hid::{DeviceInfo, HidResult};
use crate::status::Status;

mod models;

use models::{model, Exchange, Model, SHARED_CABLES, SHARED_RECEIVER};

pub(crate) const VENDORS: &[u16] = &[0x33E4];

/// Report ID plus the 64 bytes the web driver sends.
const FEATURE_BYTES: usize = 65;

fn old_request(cable: bool) -> [u8; FEATURE_BYTES] {
    let mut frame = [0; FEATURE_BYTES];
    frame[1..5].copy_from_slice(&[0x00, 0x02, 0x8F, u8::from(!cable)]);
    frame
}

/// The web driver accepts the reply with or without a leading report ID byte.
fn parse_old(reply: &[u8]) -> Option<(u8, bool)> {
    [1, 0].into_iter().find_map(|offset| {
        let frame = reply.get(offset..offset + 6)?;
        (frame[..3] == [0xA1, 0x02, 0x8F] && frame[5] <= 100).then(|| (frame[5], frame[4] != 0))
    })
}

fn read(
    context: &Context,
    info: &DeviceInfo,
    model: Option<&Model>,
) -> HidResult<Option<(u8, bool)>> {
    let old = model.filter(|m| m.exchange == Exchange::Old);
    let request = old.map_or_else(new_request, |m| old_request(m.cable));
    let parse = if old.is_some() {
        parse_old
    } else {
        parse_feature
    };
    let mut device = context.open(info)?;
    device.send_feature(&request)?;
    for _ in 0..15 {
        sleep(50);
        if let Some(reading) = device
            .get_feature(0, FEATURE_BYTES)
            .ok()
            .and_then(|r| parse(&r))
        {
            return Ok(Some(reading));
        }
    }
    Ok(None)
}

fn read_product(
    context: &Context,
    collections: &[&DeviceInfo],
    model: Option<&Model>,
) -> Option<(u8, bool)> {
    let info = collections
        .iter()
        .find(|d| d.feature_len == Some(FEATURE_BYTES))?;
    read(context, info, model).ok().flatten()
}

fn by_product<'a>(infos: &[&'a DeviceInfo]) -> Vec<(u16, Vec<&'a DeviceInfo>)> {
    let mut groups: Vec<(u16, Vec<&DeviceInfo>)> = Vec::new();
    for info in infos {
        match groups.iter_mut().find(|(id, _)| *id == info.product_id) {
            Some((_, list)) => list.push(info),
            None => groups.push((info.product_id, vec![info])),
        }
    }
    groups
}

fn card(key: String, name: &str, (level, charging): (u8, bool)) -> Status {
    Status::new(key, name, Some(level), charging, "mouse")
}

/// One card per model with its own receiver; the cable is asked first.
fn poll_models(context: &Context, groups: &[(u16, Vec<&DeviceInfo>)]) -> Vec<Status> {
    let mut known: Vec<(&Model, &[&DeviceInfo])> = groups
        .iter()
        .filter_map(|(id, list)| Some((model(*id)?, list.as_slice())))
        .collect();
    known.sort_by_key(|(m, _)| (m.family, !m.cable));
    let mut result: Vec<Status> = Vec::new();
    let mut answered = Vec::new();
    for (m, list) in known {
        if answered.contains(&m.family) {
            continue;
        }
        if let Some(reading) = read_product(context, list, Some(m)) {
            answered.push(m.family);
            result.push(card(format!("gwolves:{:04x}", m.family), m.name, reading));
        }
    }
    result
}

/// The shared receiver does not say which mouse is behind it: only a cable does.
fn poll_shared(context: &Context, groups: &[(u16, Vec<&DeviceInfo>)]) -> Option<Status> {
    let cable_name = |id: u16| {
        SHARED_CABLES
            .iter()
            .find(|(known, _)| *known == id)
            .map(|(_, name)| *name)
    };
    let mut shared: Vec<_> = groups
        .iter()
        .filter(|(id, _)| *id == SHARED_RECEIVER || cable_name(*id).is_some())
        .collect();
    shared.sort_by_key(|(id, _)| *id == SHARED_RECEIVER);
    let mut name = "G-Wolves mouse";
    let mut first = None;
    for (product_id, list) in shared {
        name = cable_name(*product_id).unwrap_or(name);
        if let Some(reading) = read_product(context, list, None) {
            first = first.or(Some(reading));
            if reading.1 {
                break; // On the cable: the receiver has nothing to add.
            }
        }
    }
    first.map(|reading| card("gwolves".into(), name, reading))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let groups = by_product(&context.vendor(0x33E4));
    let mut result = poll_models(context, &groups);
    result.extend(poll_shared(context, &groups));
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::fake::FakeBus;

    fn info(path: &str, product_id: u16) -> DeviceInfo {
        DeviceInfo {
            path: path.into(),
            vendor_id: 0x33E4,
            product_id,
            feature_len: Some(FEATURE_BYTES),
            ..Default::default()
        }
    }

    #[test]
    fn old_replies_work_with_or_without_the_report_id() {
        assert_eq!(parse_old(&[0, 0xA1, 2, 0x8F, 0, 1, 88]), Some((88, true)));
        assert_eq!(parse_old(&[0xA1, 2, 0x8F, 0, 0, 88]), Some((88, false)));
        assert_eq!(parse_old(&[0xA1, 2, 0x8F, 0, 0, 101]), None);
        assert_eq!(parse_old(&old_request(true)), None);
        assert_eq!(old_request(false)[..5], [0, 0, 2, 0x8F, 1]);
    }

    #[test]
    fn a_silent_cable_falls_back_to_the_receiver_of_the_same_model() {
        let bus = FakeBus::default();
        bus.script("cable", |_| {});
        bus.script("radio", |s| {
            s.features.push_back(vec![0, 0xA1, 2, 0x8F, 0, 0, 45]);
        });
        let infos = [info("radio", 0x3917), info("cable", 0x3908)];
        let statuses = poll(&mut Context::new(&infos, &bus));
        assert_eq!(statuses.len(), 1);
        assert_eq!(statuses[0].key, "gwolves:3917");
        assert_eq!(statuses[0].level, Some(45));
        let sent = bus.inspect("radio", |s| s.sent_features.clone());
        assert_eq!(sent, vec![old_request(false).to_vec()]);
    }
}
