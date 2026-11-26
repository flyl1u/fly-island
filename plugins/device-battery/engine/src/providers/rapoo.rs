//! Rapoo receivers: passive only. Input report 07 carries the charge state in byte 7
//! and the percent in byte 8. Nothing is ever sent.
use super::context::{only, proven_groups, Context};
use crate::hid::{DeviceInfo, HidDevice, HidResult};
use crate::status::Status;
use std::time::{Duration, Instant};

mod models;

pub(crate) use models::is_known_receiver;

pub(crate) const VENDORS: &[u16] = &[0x24AE];

const INPUT_ID: u8 = 0x07;
const WINDOW: Duration = Duration::from_millis(1500);

#[derive(Debug, PartialEq)]
struct Report {
    level: u8,
    charging: bool,
    /// Only states 1..=3 say anything about charging.
    charging_known: bool,
}

fn parse(report: &[u8]) -> Option<Report> {
    if report.len() < 9 || report[0] != INPUT_ID || report[8] > 100 {
        return None;
    }
    let state = report[7];
    Some(Report {
        level: report[8],
        charging: matches!(state, 2 | 3),
        charging_known: (1..=3).contains(&state),
    })
}

/// (maximum input length, length of report 07)
fn lengths(info: &DeviceInfo) -> Option<(usize, usize)> {
    let maximum = info.input_len.filter(|m| (9..=4096).contains(m))?;
    let sizes = info.input_sizes.as_ref()?;
    let battery = *sizes.get(&INPUT_ID)?;
    (sizes.values().all(|&n| (2..=maximum).contains(&n))
        && sizes.values().max() == Some(&maximum)
        && (9..=maximum).contains(&battery))
    .then_some((maximum, battery))
}

fn listen(
    device: &mut dyn HidDevice,
    (maximum, battery): (usize, usize),
) -> HidResult<Option<Report>> {
    let deadline = Instant::now() + WINDOW;
    for _ in 0..32 {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        let report = device.read(maximum, remaining)?;
        if report.is_empty() {
            break;
        }
        if report.len() == battery {
            if let Some(parsed) = parse(&report) {
                return Ok(Some(parsed));
            }
        }
    }
    Ok(None)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let known: Vec<&DeviceInfo> = context
        .vendor(0x24AE)
        .into_iter()
        .filter(|d| models::name(d.product_id).is_some())
        .collect();
    let mut result = Vec::new();
    for (physical, infos) in proven_groups(&known) {
        let candidate = only(&infos, |d| d.is_collection(0xFF00, 0x0002));
        let Some(info) = candidate.filter(|d| !d.path.is_empty()) else {
            continue;
        };
        let (Some(lengths), Some(name)) = (lengths(info), models::name(info.product_id)) else {
            continue;
        };
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        let Ok(Some(report)) = listen(device.as_mut(), lengths) else {
            continue;
        };
        result.push(Status {
            physical_id: physical.to_string(),
            connection_known: Some(true),
            charging_known: Some(report.charging_known),
            ..Status::new(
                format!("rapoo:{physical}"),
                name,
                Some(report.level),
                report.charging,
                "mouse",
            )
        });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::fake::FakeBus;
    use crate::hid::Sizes;

    fn report(state: u8, level: u8) -> Vec<u8> {
        vec![INPUT_ID, 0, 0, 0, 0, 0, 0, state, level]
    }

    #[test]
    fn unknown_states_keep_the_level_without_a_charge_claim() {
        assert_eq!(
            parse(&report(2, 40)).map(|r| (r.charging, r.charging_known)),
            Some((true, true))
        );
        assert_eq!(
            parse(&report(0, 40)).map(|r| (r.charging, r.charging_known)),
            Some((false, false))
        );
        assert_eq!(parse(&report(1, 101)), None);
        assert_eq!(parse(&report(1, 40)[..8]), None);
    }

    #[test]
    fn listening_never_writes() {
        let info = DeviceInfo {
            path: "r".into(),
            vendor_id: 0x24AE,
            product_id: 0x1412,
            usage_page: 0xFF00,
            usage: 2,
            physical_id: "pnp:r".into(),
            input_len: Some(9),
            input_sizes: Some(Sizes::from([(INPUT_ID, 9)])),
            ..Default::default()
        };
        let bus = FakeBus::default();
        bus.script("r", |s| s.reads.push_back(report(1, 63)));
        let statuses = poll(&mut Context::new(&[info], &bus));
        assert_eq!(statuses[0].name, "Rapoo VT3");
        assert_eq!(statuses[0].level, Some(63));
        assert!(bus.written_paths().is_empty());
    }
}
