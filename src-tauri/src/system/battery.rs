use serde::Serialize;
use windows::Win32::System::Power::{SYSTEM_POWER_CAPABILITIES, SYSTEM_POWER_STATUS};

use crate::win32::battery;

const UNKNOWN: u8 = u8::MAX;
const CHARGING: u8 = 8;
const NO_BATTERY: u8 = 128;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BatterySnapshot {
    percent: Option<u8>,
    plugged_in: Option<bool>,
    charging: Option<bool>,
    seconds_remaining: Option<u32>,
    details: Option<BatteryDetails>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BatteryDetails {
    remaining_mwh: Option<i32>,
    full_mwh: Option<i32>,
    design_mwh: Option<i32>,
    rate_mw: Option<i32>,
}

fn normalize_status(
    status: SYSTEM_POWER_STATUS,
    capabilities: Option<&SYSTEM_POWER_CAPABILITIES>,
) -> Result<Option<BatterySnapshot>, String> {
    let flags = (status.BatteryFlag != UNKNOWN).then_some(status.BatteryFlag);
    if flags.is_some_and(|flags| flags & NO_BATTERY != 0)
        || capabilities.is_some_and(|cap| !cap.SystemBatteriesPresent || cap.BatteriesAreShortTerm)
    {
        return Ok(None);
    }
    let percent = (status.BatteryLifePercent <= 100).then_some(status.BatteryLifePercent);
    if flags.is_none() && percent.is_none() && capabilities.is_none() {
        return Err("Windows did not report whether a battery is present.".to_owned());
    }
    let plugged_in = match status.ACLineStatus {
        0 => Some(false),
        1 => Some(true),
        _ => None,
    };
    let charging = flags.map(|flags| flags & CHARGING != 0);
    let seconds_remaining = (plugged_in == Some(false)
        && charging != Some(true)
        && !matches!(status.BatteryLifeTime, 0 | u32::MAX))
    .then_some(status.BatteryLifeTime);

    Ok(Some(BatterySnapshot {
        percent,
        plugged_in,
        charging,
        seconds_remaining,
        details: None,
    }))
}

fn read_battery(include_details: bool) -> Result<Option<BatterySnapshot>, String> {
    let status = battery::system_status().map_err(|error| error.to_string())?;
    let capabilities = battery::power_capabilities();
    let mut snapshot = normalize_status(status, capabilities.as_ref())?;
    if let Some(snapshot) = snapshot.as_mut() {
        // The aggregate report can include a connected UPS alongside a laptop battery.
        if include_details && !capabilities.is_some_and(|cap| cap.UpsPresent) {
            snapshot.details = battery::aggregate_report()
                .ok()
                .map(|report| BatteryDetails {
                    remaining_mwh: report.remaining_mwh.filter(|value| *value >= 0),
                    full_mwh: report.full_mwh.filter(|value| *value > 0),
                    design_mwh: report.design_mwh.filter(|value| *value > 0),
                    rate_mw: report.rate_mw.filter(|value| *value != i32::MIN),
                });
        }
    }
    Ok(snapshot)
}

#[tauri::command]
pub(crate) async fn get_notebook_battery(
    include_details: bool,
) -> Result<Option<BatterySnapshot>, String> {
    tauri::async_runtime::spawn_blocking(move || read_battery(include_details))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_flags_do_not_imply_absence_or_charging() {
        let snapshot = normalize_status(
            SYSTEM_POWER_STATUS {
                BatteryFlag: UNKNOWN,
                BatteryLifePercent: 61,
                ACLineStatus: 1,
                ..Default::default()
            },
            None,
        )
        .unwrap()
        .unwrap();
        assert_eq!(snapshot.percent, Some(61));
        assert_eq!(snapshot.plugged_in, Some(true));
        assert_eq!(snapshot.charging, None);
    }

    #[test]
    fn confirmed_absence_and_short_term_batteries_are_hidden() {
        let absent = SYSTEM_POWER_STATUS {
            BatteryFlag: NO_BATTERY,
            ..Default::default()
        };
        let ups = SYSTEM_POWER_CAPABILITIES {
            SystemBatteriesPresent: true,
            BatteriesAreShortTerm: true,
            ..Default::default()
        };
        assert!(normalize_status(absent, None).unwrap().is_none());
        assert!(normalize_status(SYSTEM_POWER_STATUS::default(), Some(&ups))
            .unwrap()
            .is_none());
    }

    #[test]
    fn only_battery_power_has_an_eta() {
        let mut status = SYSTEM_POWER_STATUS {
            BatteryLifeTime: 3600,
            ..Default::default()
        };
        assert_eq!(
            normalize_status(status, None)
                .unwrap()
                .unwrap()
                .seconds_remaining,
            Some(3600)
        );
        status.ACLineStatus = 1;
        status.BatteryFlag = CHARGING;
        let snapshot = normalize_status(status, None).unwrap().unwrap();
        assert_eq!(snapshot.charging, Some(true));
        assert_eq!(snapshot.seconds_remaining, None);
        status.ACLineStatus = 0;
        status.BatteryFlag = 0;
        status.BatteryLifeTime = u32::MAX;
        assert_eq!(
            normalize_status(status, None)
                .unwrap()
                .unwrap()
                .seconds_remaining,
            None
        );
    }
}
