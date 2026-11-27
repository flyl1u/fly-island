//! Shared 1D57 2.4G receivers: passive only, three routes (web frames, the legacy
//! IN10 firmware and one unnumbered SC650 frame). Nothing is ever sent, and no
//! charging state is derived.
use super::context::{only, proven_groups, Context};
use crate::hid::{DeviceInfo, HidDevice, HidResult, Sizes};
use crate::status::Status;
use std::time::{Duration, Instant};

pub(crate) const VENDORS: &[u16] = &[0x1D57];

const INPUT_ID: u8 = 0x03;
const WINDOW: Duration = Duration::from_millis(1500);
const MODELS_FA60: [u8; 7] = [0x07, 0x76, 0x77, 0x78, 0x79, 0x8E, 0xE8];
const MODELS_FA65: [u8; 6] = [0x71, 0x76, 0x77, 0x78, 0x79, 0x90];

#[derive(Clone, Copy, Debug, PartialEq)]
enum Route {
    Web(u16),
    Legacy,
    Unnumbered,
}

fn name(product_id: u16) -> &'static str {
    if product_id == 0xFA60 {
        "2.4G 无线鼠标（1D57:FA60）"
    } else {
        "2.4G 无线鼠标（1D57:FA65）"
    }
}

fn percent(value: u8) -> Option<u8> {
    (1..=100).contains(&value).then_some(value)
}

/// `report` includes the report ID. Byte 3 means different things on shared
/// receivers, so it is never turned into a level or a charging state.
fn parse(report: &[u8], route: Route) -> Option<u8> {
    if report.len() < 5 || report[0] != INPUT_ID {
        return None;
    }
    let (model, event, state) = (report[1], report[2], report[3]);
    let sc650 = model == 0x8E && (event, state) == (0x40, 0x01);
    let accepted = match route {
        Route::Web(product_id) => {
            let models: &[u8] = if product_id == 0xFA60 {
                &MODELS_FA60
            } else {
                &MODELS_FA65
            };
            models.contains(&model) && matches!(event, 0x40 | 0x41) && (model != 0x8E || sc650)
        }
        // States 2 and 3 drive synthetic "full / charging" pictures in the driver.
        Route::Legacy => model == 0x93 && event == 0x40 && !matches!(state, 2 | 3),
        Route::Unnumbered => report.len() == 5 && sc650,
    };
    accepted.then(|| percent(report[4])).flatten()
}

fn legacy_release(info: &DeviceInfo) -> bool {
    info.release_number & 0xFF == 0x16
}

/// The web collection of each receiver.
fn collection(product_id: u16) -> Option<(u16, u16)> {
    match product_id {
        0xFA60 => Some((0x000A, 0x0000)),
        0xFA65 => Some((0xFF00, 0x0001)),
        _ => None,
    }
}

/// (the collection to listen on, route)
fn select<'a>(infos: &[&'a DeviceInfo]) -> Option<(&'a DeviceInfo, Route)> {
    let fa65 = |page: u16, usage: u16| {
        move |d: &DeviceInfo| d.is(0x1D57, 0xFA65) && d.is_collection(page, usage)
    };
    let is_companion = fa65(0xFF00, 1);
    let is_state = fa65(0x000A, 0);
    if infos
        .iter()
        .any(|d| (is_companion(d) || is_state(d)) && legacy_release(d))
    {
        let companion = only(infos, is_companion)?;
        let state = only(infos, is_state)?;
        let paired = legacy_release(companion)
            && legacy_release(state)
            && !companion.path.is_empty()
            && !state.path.is_empty()
            && companion.path != state.path;
        return paired.then_some((state, Route::Legacy));
    }
    let info = only(infos, |d| {
        collection(d.product_id).is_some_and(|(page, usage)| d.is_collection(page, usage))
    })
    .filter(|d| !d.path.is_empty())?;
    Some((info, Route::Web(info.product_id)))
}

/// (maximum input length, expected report length, route), when the lengths are proven.
fn lengths(info: &DeviceInfo, route: Route) -> Option<(usize, usize, Route)> {
    let (maximum, sizes) = (info.input_len?, info.input_sizes.as_ref()?);
    if route == Route::Web(0xFA60) && info.is_collection(0x000A, 0) && sizes.contains_key(&0) {
        let exact = maximum == 5
            && *sizes == Sizes::from([(0, 5)])
            && info.input_proven_by == Some("descriptor");
        return exact.then_some((5, 5, Route::Unnumbered));
    }
    let battery = *sizes.get(&INPUT_ID)?;
    ((5..=4096).contains(&maximum)
        && sizes.values().all(|&n| (2..=maximum).contains(&n))
        && sizes.values().max() == Some(&maximum)
        && (5..=maximum).contains(&battery))
    .then_some((maximum, battery, route))
}

/// Waits for a first value, then drains what is already queued and keeps the newest.
fn listen(
    device: &mut dyn HidDevice,
    (maximum, expected, route): (usize, usize, Route),
) -> HidResult<Option<u8>> {
    let deadline = Instant::now() + WINDOW;
    let mut newest = None;
    for index in 0..256 {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() || (newest.is_none() && index >= 32) {
            break;
        }
        let wait = if newest.is_none() {
            remaining
        } else {
            Duration::from_millis(1)
        };
        let report = device.read(maximum, wait)?;
        if report.is_empty() {
            break;
        }
        if report.len() == expected {
            newest = parse(&report, route).or(newest);
        }
    }
    Ok(newest)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let known: Vec<&DeviceInfo> = context
        .vendor(0x1D57)
        .into_iter()
        .filter(|d| collection(d.product_id).is_some())
        .collect();
    let mut result = Vec::new();
    for (physical, infos) in proven_groups(&known) {
        let Some((info, route)) = select(&infos) else {
            continue;
        };
        let Some(lengths) = lengths(info, route) else {
            continue;
        };
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        let Ok(Some(level)) = listen(device.as_mut(), lengths) else {
            continue;
        };
        result.push(Status {
            physical_id: physical.to_string(),
            connection_known: Some(true),
            charging_known: Some(false),
            ..Status::new(
                format!("fa6x_passive:{physical}"),
                name(info.product_id),
                Some(level),
                false,
                "mouse",
            )
        });
    }
    result
}

#[cfg(test)]
mod tests;
