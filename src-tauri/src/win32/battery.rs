//! Read-only Windows system and battery-controller telemetry.

use windows::{
    core::Result,
    Devices::Power::Battery,
    Win32::System::Power::{
        GetPwrCapabilities, GetSystemPowerStatus, SYSTEM_POWER_CAPABILITIES, SYSTEM_POWER_STATUS,
    },
};

use super::com::WinRtApartment;

pub(crate) fn system_status() -> Result<SYSTEM_POWER_STATUS> {
    let mut status = SYSTEM_POWER_STATUS::default();
    // SAFETY: the initialized output structure is writable for the call.
    unsafe { GetSystemPowerStatus(&mut status) }?;
    Ok(status)
}

pub(crate) fn power_capabilities() -> Option<SYSTEM_POWER_CAPABILITIES> {
    let mut capabilities = SYSTEM_POWER_CAPABILITIES::default();
    // SAFETY: the initialized output structure is writable for the call.
    unsafe { GetPwrCapabilities(&mut capabilities) }.then_some(capabilities)
}

pub(crate) struct BatteryReport {
    pub remaining_mwh: Option<i32>,
    pub full_mwh: Option<i32>,
    pub design_mwh: Option<i32>,
    pub rate_mw: Option<i32>,
}

pub(crate) fn aggregate_report() -> Result<BatteryReport> {
    let _apartment = WinRtApartment::multithreaded()?;
    let report = Battery::AggregateBattery()?.GetReport()?;
    Ok(BatteryReport {
        remaining_mwh: report
            .RemainingCapacityInMilliwattHours()
            .and_then(|v| v.Value())
            .ok(),
        full_mwh: report
            .FullChargeCapacityInMilliwattHours()
            .and_then(|v| v.Value())
            .ok(),
        design_mwh: report
            .DesignCapacityInMilliwattHours()
            .and_then(|v| v.Value())
            .ok(),
        rate_mw: report.ChargeRateInMilliwatts().and_then(|v| v.Value()).ok(),
    })
}
