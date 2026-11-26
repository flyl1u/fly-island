//! JBL Quantum 910: passive only. The headset pushes report 08 on its own. Upstream
//! kept a listener thread between polls; every read here is one process, so listen
//! for a bounded window instead.
use super::context::Context;
use crate::hid::{DeviceInfo, HidResult};
use crate::status::Status;
use std::time::{Duration, Instant};

pub(crate) const VENDORS: &[u16] = &[0x0ECB];

const NAME: &str = "JBL Quantum 910 Wireless";
const PRODUCT_ID: u16 = 0x2088;
/// Within the reader's time budget.
const WINDOW: Duration = Duration::from_secs(5);

#[derive(Debug, PartialEq)]
enum Report {
    Level(u8),
    /// The headset's power switch. Not a level.
    Power(bool),
}

fn parse(report: &[u8]) -> Option<Report> {
    match *report {
        [0x08, level, ..] if level <= 100 => Some(Report::Level(level)),
        [0x09, on, ..] => Some(Report::Power(on != 0)),
        _ => None,
    }
}

fn listen(context: &Context, info: &DeviceInfo, window: Duration) -> HidResult<Option<u8>> {
    let mut device = context.open(info)?;
    let deadline = Instant::now() + window;
    while Instant::now() < deadline {
        let report = device.read(64, Duration::from_millis(250))?;
        match parse(&report) {
            Some(Report::Level(level)) => return Ok(Some(level)),
            Some(Report::Power(false)) => break,
            _ => {}
        }
    }
    Ok(None)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mine: Vec<&DeviceInfo> = context
        .vendor(0x0ECB)
        .into_iter()
        .filter(|d| d.product_id == PRODUCT_ID)
        .collect();
    let Some(info) = mine
        .iter()
        .find(|d| d.is_collection(0xFF13, 0x0001))
        .or(mine.first())
    else {
        return Vec::new();
    };
    match listen(context, info, WINDOW) {
        Ok(Some(level)) => vec![Status::new(
            format!("jbl:{PRODUCT_ID:04x}"),
            NAME,
            Some(level),
            false,
            "headset",
        )],
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::fake::FakeBus;

    #[test]
    fn only_report_eight_is_a_level() {
        assert_eq!(parse(&[0x08, 55]), Some(Report::Level(55)));
        assert_eq!(parse(&[0x08, 101]), None);
        assert_eq!(parse(&[0x09, 0]), Some(Report::Power(false)));
        assert_eq!(parse(&[0x2F, 1]), None);
        assert_eq!(parse(&[0x08]), None);
    }

    #[test]
    fn nothing_is_ever_sent() {
        let info = DeviceInfo {
            path: "j".into(),
            vendor_id: 0x0ECB,
            product_id: PRODUCT_ID,
            ..Default::default()
        };
        let bus = FakeBus::default();
        bus.script("j", |s| {
            s.reads.push_back(vec![0x2F, 1]);
            s.reads.push_back(vec![0x08, 72]);
        });
        assert_eq!(poll(&mut Context::new(&[info], &bus))[0].level, Some(72));
        assert!(bus.written_paths().is_empty());
    }
}
