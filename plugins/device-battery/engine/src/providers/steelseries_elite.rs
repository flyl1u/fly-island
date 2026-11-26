//! SteelSeries Arctis Nova Elite: request 01 B0 on a vendor collection of interface
//! 3; the direct reply or the 07 B7 / 07 B5 frames may arrive on any collection.
use super::context::{sleep, Context};
use crate::hid::{DeviceInfo, HidDevice};
use crate::status::Status;
use std::time::{Duration, Instant};

pub(crate) const VENDORS: &[u16] = &[0x1038];

const NAME: &str = "Arctis Nova Elite";
const PRODUCT_ID: u16 = 0x2244;
const CHARGING: u8 = 0x02;
const POWER_OFFLINE: u8 = 0x01;
const POWER_CABLE: u8 = 0x02;

#[derive(Debug, Default, PartialEq)]
struct Heard {
    /// (percent, charging)
    battery: Option<(u8, bool)>,
    power: Option<u8>,
}

impl Heard {
    fn complete(&self) -> bool {
        self.power == Some(POWER_OFFLINE) || (self.battery.is_some() && self.power.is_some())
    }

    fn take(&mut self, report: &[u8]) {
        // The direct reply to the request carries both.
        if report.len() > 15 && report[..2] == [0x01, 0xB0] {
            if report[6] <= 100 {
                self.battery = Some((report[6], report[15] == CHARGING));
            }
            self.power = Some(report[14]);
        } else if report.len() >= 5 && report[0] == 0x07 {
            match report[1] {
                0xB7 if report[2] <= 100 => {
                    self.battery = Some((report[2], report[4] == CHARGING));
                }
                0xB5 => self.power = Some(report[4]),
                _ => {}
            }
        }
    }

    /// (percent, charging), unless the headset is off or sent no level.
    fn reading(&self) -> Option<(u8, bool)> {
        let (level, charging) = self.battery?;
        (self.power != Some(POWER_OFFLINE))
            .then_some((level, charging || self.power == Some(POWER_CABLE)))
    }
}

fn request() -> [u8; 64] {
    let mut frame = [0; 64];
    frame[..2].copy_from_slice(&[0x01, 0xB0]);
    frame
}

fn listen(handles: &mut [(u16, Box<dyn HidDevice>)]) -> Heard {
    let mut heard = Heard::default();
    let deadline = Instant::now() + Duration::from_secs(1);
    while Instant::now() < deadline && !heard.complete() {
        let mut received = false;
        for (_, device) in handles.iter_mut() {
            let Ok(report) = device.read(64, Duration::ZERO) else {
                continue;
            };
            received |= !report.is_empty();
            heard.take(&report);
            if heard.complete() {
                break;
            }
        }
        if !received {
            sleep(10);
        }
    }
    heard
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut mine: Vec<&DeviceInfo> = context
        .vendor(0x1038)
        .into_iter()
        .filter(|d| d.product_id == PRODUCT_ID && d.interface_number == 3)
        .collect();
    // FFC0 first, then other vendor pages, then the rest.
    mine.sort_by_key(|d| {
        let rank = match d.usage_page {
            0xFFC0 => 0,
            page if page >= 0xFF00 => 1,
            _ => 2,
        };
        (rank, d.usage_page)
    });
    let mut handles: Vec<(u16, Box<dyn HidDevice>)> = mine
        .iter()
        .filter_map(|info| Some((info.usage_page, context.open(info).ok()?)))
        .collect();
    if handles.is_empty() {
        return Vec::new();
    }
    // Only a vendor collection is written to.
    let _ = handles
        .iter_mut()
        .filter(|(page, _)| *page >= 0xFF00)
        .any(|(_, device)| device.write(&request()).is_ok());
    match listen(&mut handles).reading() {
        Some((level, charging)) => vec![Status {
            source: "steelseries",
            ..Status::new(
                format!("steelseries:{PRODUCT_ID:04x}"),
                NAME,
                Some(level),
                charging,
                "headset",
            )
        }],
        None => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_combine_and_an_offline_headset_has_no_reading() {
        let mut heard = Heard::default();
        heard.take(&[0x07, 0xB7, 70, 0, 0]);
        assert!(!heard.complete());
        heard.take(&[0x07, 0xB5, 0, 0, POWER_CABLE]);
        assert!(heard.complete());
        assert_eq!(heard.reading(), Some((70, true)));
        heard.take(&[0x07, 0xB5, 0, 0, POWER_OFFLINE]);
        assert_eq!(heard.reading(), None);
    }

    #[test]
    fn the_direct_reply_carries_both_and_refuses_bad_levels() {
        let mut reply = [0u8; 16];
        reply[..2].copy_from_slice(&[0x01, 0xB0]);
        reply[6] = 101;
        reply[14] = 8;
        let mut heard = Heard::default();
        heard.take(&reply);
        assert_eq!(heard.reading(), None);
        reply[6] = 64;
        reply[15] = CHARGING;
        heard.take(&reply);
        assert_eq!(heard.reading(), Some((64, true)));
    }
}
