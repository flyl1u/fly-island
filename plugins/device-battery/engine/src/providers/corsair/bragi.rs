//! Corsair Bragi dongles: get-property 0F (battery) and 10 (charge state). The
//! answer does not name its property, so the level is asked twice and the answers
//! must not disagree.
use crate::hid::{DeviceInfo, HidDevice, HidResult};
use crate::providers::context::Context;
use crate::status::Status;
use std::time::{Duration, Instant};

const FRAME_BYTES: usize = 64;
const DONGLE: u8 = 0x08;
const CHILD: u8 = 0x09;
const ANSWER_ROUTE: u8 = 0x01;
const GET: u8 = 0x02;
const BATTERY: u8 = 0x0F;
const CHARGE: u8 = 0x10;
const HEARTBEAT: u8 = 0x12;
const FIRMWARE: u8 = 0x13;
/// The first answer was measured about 4.7 s after the write.
const WINDOW: Duration = Duration::from_secs(6);
const CONFIRM_WINDOW: Duration = Duration::from_secs(3);
/// Per dongle, across its collections.
const BUDGET: Duration = Duration::from_millis(6500);

const MODELS: [(u16, &str, &str); 6] = [
    (0x1B7F, "Corsair Dark Core RGB Pro SE", "corsair:1b7f"),
    (
        0x0A40,
        "Corsair Virtuoso RGB Wireless SE",
        "corsair:virtuoso-se",
    ),
    (
        0x0A3E,
        "Corsair Virtuoso RGB Wireless SE",
        "corsair:virtuoso-se",
    ),
    (
        0x0A3D,
        "Corsair Virtuoso RGB Wireless SE",
        "corsair:virtuoso-se",
    ),
    (
        0x0A64,
        "Corsair Virtuoso RGB Wireless XT",
        "corsair:virtuoso-xt",
    ),
    (
        0x0A62,
        "Corsair Virtuoso RGB Wireless XT",
        "corsair:virtuoso-xt",
    ),
];

/// Virtuoso receivers refuse every report-ID-prefixed form; their frame begins
/// with an extra 02 and goes out bare.
fn takes_bare(product_id: u16) -> bool {
    product_id != 0x1B7F
}

/// Only the SE receiver was measured with a session before the question.
fn needs_session(product_id: u16) -> bool {
    product_id == 0x0A40
}

/// Routes in the order to try them; wired IDs ask themselves first.
fn routes(product_id: u16) -> &'static [u8] {
    match product_id {
        0x0A3D | 0x0A62 => &[DONGLE, CHILD],
        0x0A3E | 0x0A64 => &[CHILD, DONGLE],
        _ => &[CHILD],
    }
}

fn forms(product_id: u16, route: u8, property: u8) -> Vec<Vec<u8>> {
    if takes_bare(product_id) {
        let mut frame = vec![0x02, route, GET, property];
        frame.resize(FRAME_BYTES, 0);
        return vec![frame];
    }
    let mut framed = vec![0, route, GET, property];
    framed.resize(FRAME_BYTES + 1, 0);
    let bare = framed[1..].to_vec();
    vec![framed, bare]
}

/// The 16-bit value of a get-property answer: `01 02 00 v v` (Dark Core) or
/// `01 01 02 00 v v` (Virtuoso). Every field must match: other frames share the
/// channel.
fn raw_value(reply: &[u8]) -> Option<u16> {
    // hidapi may hand the report ID back.
    let data = if reply.len() > FRAME_BYTES {
        &reply[1..]
    } else {
        reply
    };
    if data.len() < 5 || data[0] != ANSWER_ROUTE {
        return None;
    }
    if data[1..3] == [GET, 0] {
        return Some(u16::from_le_bytes([data[3], data[4]]));
    }
    (data.len() >= 6 && data[1..4] == [ANSWER_ROUTE, GET, 0])
        .then(|| u16::from_le_bytes([data[4], data[5]]))
}

fn parse_level(reply: &[u8]) -> Option<u8> {
    let value = raw_value(reply)?;
    (1..=1000).contains(&value).then_some((value / 10) as u8)
}

/// 1 is charging, 2 is on battery.
fn parse_charge(reply: &[u8]) -> Option<bool> {
    match raw_value(reply)? {
        1 => Some(true),
        2 => Some(false),
        _ => None,
    }
}

struct Session {
    device: Box<dyn HidDevice>,
    product_id: u16,
    deadline: Instant,
}

impl Session {
    fn send(&mut self, route: u8, property: u8) -> bool {
        forms(self.product_id, route, property)
            .iter()
            .any(|frame| self.device.write(frame).is_ok_and(|sent| sent > 0))
    }

    /// The first matching value within `window` and the overall budget.
    fn listen<T>(
        &mut self,
        window: Duration,
        parse: impl Fn(&[u8]) -> Option<T>,
    ) -> HidResult<Option<T>> {
        let deadline = self.deadline.min(Instant::now() + window);
        for _ in 0..96 {
            if Instant::now() >= deadline {
                break;
            }
            let reply = self
                .device
                .read(FRAME_BYTES + 1, Duration::from_millis(500))?;
            if let Some(value) = parse(&reply) {
                return Ok(Some(value));
            }
        }
        Ok(None)
    }

    /// Firmware query, receiver heartbeat, headset heartbeat.
    fn open_session(&mut self) -> HidResult<()> {
        for (property, route) in [(FIRMWARE, DONGLE), (HEARTBEAT, DONGLE), (HEARTBEAT, CHILD)] {
            if Instant::now() >= self.deadline || !self.send(route, property) {
                break;
            }
            self.listen(Duration::from_millis(800), |_| None::<()>)?;
        }
        Ok(())
    }

    /// (percent, charging when the receiver reports it)
    fn query(&mut self) -> HidResult<Option<(u8, Option<bool>)>> {
        for _ in 0..4 {
            if self.device.read(64, Duration::from_millis(30))?.is_empty() {
                break;
            }
        }
        if needs_session(self.product_id) {
            self.open_session()?;
        }
        let mut answer = None;
        for &route in routes(self.product_id) {
            if !self.send(route, BATTERY) {
                return Ok(None);
            }
            if let Some(level) = self.listen(WINDOW, parse_level)? {
                answer = Some((route, level));
                break;
            }
        }
        let Some((route, level)) = answer else {
            return Ok(None);
        };
        if !self.send(route, BATTERY) {
            return Ok(None);
        }
        let confirmed = self.listen(CONFIRM_WINDOW, parse_level)?;
        if confirmed.is_some_and(|second| second != level) {
            return Ok(None);
        }
        let charging = if takes_bare(self.product_id)
            && Instant::now() < self.deadline
            && self.send(route, CHARGE)
        {
            self.listen(CONFIRM_WINDOW, parse_charge)?
        } else {
            None
        };
        Ok(Some((level, charging)))
    }
}

/// The two vendor collections, the one that answers (usage 1) first; every
/// collection when there is no vendor page.
fn candidates<'a>(mine: &[&'a DeviceInfo]) -> Vec<&'a DeviceInfo> {
    let mut vendor: Vec<_> = mine
        .iter()
        .copied()
        .filter(|d| d.usage_page == 0xFF42)
        .collect();
    if vendor.is_empty() {
        vendor = mine.to_vec();
    }
    vendor.sort_by_key(|d| {
        let interface = if d.interface_number == 0 {
            99
        } else {
            d.interface_number
        };
        (d.usage != 0x0001, interface)
    });
    vendor
}

pub(super) fn poll(context: &mut Context) -> Vec<Status> {
    let mut found: Vec<(&str, &str, &str, u8, Option<bool>)> = Vec::new();
    for (product_id, name, key) in MODELS {
        let mine: Vec<&DeviceInfo> = context
            .vendor(0x1B1C)
            .into_iter()
            .filter(|d| d.product_id == product_id)
            .collect();
        let deadline = Instant::now() + BUDGET;
        for info in candidates(&mine) {
            if Instant::now() >= deadline {
                break;
            }
            let Ok(device) = context.open(info) else {
                continue;
            };
            let mut session = Session {
                device,
                product_id,
                deadline,
            };
            let Ok(Some((level, charging))) = session.query() else {
                continue;
            };
            let kind = if product_id == 0x1B7F {
                "mouse"
            } else {
                "headset"
            };
            let entry = (key, name, kind, level, charging);
            match found.iter_mut().find(|kept| kept.0 == key) {
                None => found.push(entry),
                Some(kept) if charging == Some(true) && kept.4 != Some(true) => *kept = entry,
                Some(_) => {}
            }
            break;
        }
    }
    found
        .into_iter()
        .map(|(key, name, kind, level, charging)| Status {
            charging_known: Some(charging.is_some()),
            ..Status::new(key, name, Some(level), charging.unwrap_or(false), kind)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_answer_shapes_are_recognised() {
        assert_eq!(parse_level(&[1, 2, 0, 0xFD, 0x02]), Some(76));
        assert_eq!(parse_level(&[1, 1, 2, 0, 0xFD, 0x02]), Some(76));
        assert_eq!(parse_level(&[1, 2, 0, 0, 0]), None);
        assert_eq!(parse_level(&[1, 2, 5, 0xFD, 0x02]), None);
        assert_eq!(parse_level(&[0, 1, 2, 0, 0xFD, 0x02]), None);
        assert_eq!(parse_charge(&[1, 2, 0, 2, 0]), Some(false));
        assert_eq!(parse_charge(&[1, 2, 0, 3, 0]), None);
    }

    #[test]
    fn framing_differs_per_receiver() {
        let dark_core = forms(0x1B7F, CHILD, BATTERY);
        assert_eq!(dark_core.len(), 2);
        assert_eq!(dark_core[0][..4], [0, 9, 2, 0x0F]);
        assert_eq!(dark_core[1][..3], [9, 2, 0x0F]);
        let virtuoso = forms(0x0A40, CHILD, BATTERY);
        assert_eq!(virtuoso.len(), 1);
        assert_eq!(virtuoso[0].len(), 64);
        assert_eq!(virtuoso[0][..4], [2, 9, 2, 0x0F]);
    }
}
