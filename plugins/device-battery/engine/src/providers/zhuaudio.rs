//! ZhuAudio ZG4: ask the receiver whether the headset is connected, then send one
//! battery request. The answer is an FF frame, whole or split into EE/EA parts.
use super::battery_query::{Query, Reading};
use super::context::{only, proven_groups, Context};
use crate::hid::proof::single_report;
use crate::hid::{DeviceInfo, HidDevice, HidResult};
use crate::status::Status;
use frames::{battery_reply, connection_reply, input_payload, is_frame, Assembler};
use std::time::{Duration, Instant};

mod frames;

pub(crate) const VENDORS: &[u16] = &[0x3654];

const NAME: &str = "ZhuAudio ZG4";
const REPORT_BYTES: usize = 64;
const BUDGET: Duration = Duration::from_secs(2);
/// For both phases together.
const MAX_READS: usize = 32;
/// Every read of the engine is a new process, so the first sequence is always free.
const SEQUENCE: u8 = 1;

const QUERY: Query = Query {
    name: "zhuaudio",
    vendor_id: 0x3654,
    models: &[(0x5055, NAME)],
    collection: (0xFF05, 1),
    input_id: 0xCE,
    input_bounds: (REPORT_BYTES, REPORT_BYTES),
    output_id: 0xCD,
    output_len: REPORT_BYTES,
    kind: "headset",
    charging_known: true,
    unconfirmed: false,
    timeout: BUDGET,
};

fn eligible(info: &DeviceInfo) -> bool {
    let identity = format!("{}{}", info.path, info.physical_id).to_lowercase();
    info.interface_number == 4
        && info.product == NAME
        && !info.path.is_empty()
        && !info.path.to_lowercase().starts_with("collection:")
        && !["bth", "bluetooth", "vid&"]
            .iter()
            .any(|token| identity.contains(token))
        && info.input_len == Some(REPORT_BYTES)
        && info.output_len == Some(REPORT_BYTES)
        && single_report(&info.input_sizes, 0xCE, REPORT_BYTES)
        && single_report(&info.output_sizes, 0xCD, REPORT_BYTES)
        && info.input_proven_by == Some("caps")
        && info.output_proven_by == Some("caps")
}

fn send(device: &mut dyn HidDevice, request: &[u8]) -> HidResult<bool> {
    Ok(device.write(request)? == request.len())
}

fn exchange(device: &mut dyn HidDevice) -> HidResult<Option<(u8, bool)>> {
    let deadline = Instant::now() + BUDGET;
    if !send(device, &frames::status_request())? {
        return Ok(None);
    }
    let mut online = false;
    let mut assembler = Assembler::default();
    for index in 0..MAX_READS {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        let report = device.read(REPORT_BYTES, remaining.max(Duration::from_millis(1)))?;
        if report.is_empty() || Instant::now() >= deadline {
            break;
        }
        let Some(payload) = input_payload(&report) else {
            continue;
        };
        let connected = connection_reply(payload);
        if connected == Some(false) {
            return Ok(None);
        }
        if !online {
            if connected == Some(true) {
                // Never send a request with no read budget left.
                if index + 1 == MAX_READS || !send(device, &frames::battery_request(SEQUENCE))? {
                    break;
                }
                online = true;
            }
            continue;
        }
        let frame = match payload[0] {
            0xEE | 0xEA => assembler.feed(payload),
            0xFF if !assembler.started() => frames::single_frame(payload),
            _ => None,
        };
        let Some(frame) = frame else {
            continue;
        };
        if let Some(reading) = battery_reply(&frame, SEQUENCE) {
            return Ok(Some(reading));
        }
        if is_frame(&frame) {
            assembler = Assembler::default();
        }
    }
    Ok(None)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for (physical, infos) in proven_groups(&context.vendor(QUERY.vendor_id)) {
        let candidate = only(&infos, |d| {
            d.is(0x3654, 0x5055) && d.is_collection(0xFF05, 1)
        });
        let Some(info) = candidate.filter(|d| !physical.is_empty() && eligible(d)) else {
            continue;
        };
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        if let Ok(Some((level, charging))) = exchange(device.as_mut()) {
            result.push(QUERY.status(physical, NAME, Reading::exact(level, charging)));
        }
    }
    result
}

#[cfg(test)]
mod tests;
