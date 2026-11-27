//! Audeze Maxwell headsets, through the 2.4 GHz dongle or the USB-C cable.
//!
//! A request is output report 06; the answer is input report 07, a rolling buffer of
//! recent replies, so the newest frame with the `d6 0c 00 00 <percent>` marker
//! counts. The protocol has no charging flag: a Maxwell always charges on USB-C, so
//! the cable endpoint answering means "on power".
use super::context::{sleep, Context};
use crate::hid::{DeviceInfo, HidDevice};
use crate::status::Status;

mod packets;

use packets::{packet, BATTERY_QUERY, FULL_SEQUENCE, MESSAGE_BYTES};

const VENDOR_ID: u16 = 0x3329;
pub(crate) const VENDORS: &[u16] = &[VENDOR_ID];

/// Only these are written to. The unmeasured ones share the protocol.
const KNOWN: [u16; 6] = [0x4B19, 0x4B18, 0x4B1A, 0x4B1E, 0x4B29, 0x4B28];
const CABLES: [u16; 2] = [0x4B1A, 0x4B1E];
const NAME: &str = "Audeze Maxwell";
/// With no headset linked the dongle names itself so; its buffer still holds the
/// last level, which cannot be told from a live one.
const NO_HEADSET_PRODUCT: &str = "audeze maxwell dongle";

const REPORT_ID_IN: u8 = 0x07;
const PACKET_DELAY_MS: u64 = 60;
const EXTRA_READS: usize = 2;
const MARKER: [u8; 4] = [0xD6, 0x0C, 0x00, 0x00];

fn find_level(frame: &[u8]) -> Option<u8> {
    // A marker followed by an impossible value is a leftover; keep searching.
    frame
        .windows(MARKER.len() + 1)
        .find(|window| window[..4] == MARKER && window[4] <= 100)
        .map(|window| window[4])
}

fn newest_level(frames: &[Vec<u8>]) -> Option<u8> {
    frames.iter().rev().find_map(|frame| find_level(frame))
}

fn read_frame(device: &mut dyn HidDevice) -> Option<Vec<u8>> {
    device
        .get_input(REPORT_ID_IN, MESSAGE_BYTES)
        .ok()
        .filter(|frame| !frame.is_empty())
}

/// The collected frames, and whether the collection answers at all.
fn sequence(device: &mut dyn HidDevice, requests: &[&[u8]]) -> (Vec<Vec<u8>>, bool) {
    let mut frames = Vec::new();
    let mut unanswered = 0;
    for request in requests {
        if device.write(&packet(request)).is_err() {
            break;
        }
        sleep(PACKET_DELAY_MS);
        match read_frame(device) {
            Some(frame) => frames.push(frame),
            None if frames.is_empty() => {
                unanswered += 1;
                if unanswered >= 3 {
                    return (frames, false);
                }
            }
            None => {}
        }
    }
    for _ in 0..EXTRA_READS {
        sleep(PACKET_DELAY_MS);
        frames.extend(read_frame(device));
    }
    (frames, true)
}

/// The battery query alone first; the full sequence when its answer has no marker.
fn read_battery(device: &mut dyn HidDevice) -> Option<u8> {
    let (frames, answered) = sequence(device, &[BATTERY_QUERY]);
    if let Some(level) = newest_level(&frames) {
        return Some(level);
    }
    if !answered {
        return None;
    }
    newest_level(&sequence(device, &FULL_SEQUENCE).0)
}

/// FF13:0001, else the FF13 page, else any vendor page. Standard collections are
/// never written to.
fn candidates<'a>(infos: &[&'a DeviceInfo]) -> Vec<&'a DeviceInfo> {
    let tiers: [fn(&DeviceInfo) -> bool; 3] = [
        |d| d.is_collection(0xFF13, 0x0001),
        |d| d.usage_page == 0xFF13,
        |d| d.usage_page >= 0xFF00,
    ];
    tiers
        .iter()
        .map(|tier| {
            infos
                .iter()
                .copied()
                .filter(|d| tier(d))
                .collect::<Vec<_>>()
        })
        .find(|found| !found.is_empty())
        .unwrap_or_default()
}

fn status(serial: &str, level: Option<u8>, charging: bool) -> Status {
    Status::new(format!("audeze:{serial}"), NAME, level, charging, "headset")
}

/// (product ID, serial number) is one endpoint; cables are read first.
type Endpoint<'a> = ((u16, &'a str), Vec<&'a DeviceInfo>);

fn endpoints<'a>(context: &Context<'a>) -> Vec<Endpoint<'a>> {
    let mut groups: Vec<Endpoint> = Vec::new();
    for info in context.vendor(VENDOR_ID) {
        if !KNOWN.contains(&info.product_id) {
            continue;
        }
        let key = (info.product_id, info.serial.as_str());
        match groups.iter_mut().find(|(existing, _)| *existing == key) {
            Some((_, list)) => list.push(info),
            None => groups.push((key, vec![info])),
        }
    }
    groups.sort_by_key(|((product, serial), _)| (!CABLES.contains(product), *product, *serial));
    groups
}

/// One card per headset: the first endpoint that answers.
pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for ((product_id, serial), infos) in endpoints(context) {
        let cable = CABLES.contains(&product_id);
        let candidates = candidates(&infos);
        if candidates.is_empty() {
            result.push(status(serial, None, false));
            continue;
        }
        let unlinked = !cable
            && infos
                .iter()
                .any(|d| d.product.trim().eq_ignore_ascii_case(NO_HEADSET_PRODUCT));
        if unlinked {
            continue;
        }
        let level = candidates.iter().find_map(|info| {
            let mut device = context.open(info).ok()?;
            read_battery(device.as_mut())
        });
        let Some(level) = level else {
            continue;
        };
        // Just after power-on the headset reports 0 before it has measured, and one
        // reading cannot tell that apart from a flat battery: 0 stays unknown.
        result.push(status(
            serial,
            (level > 0).then_some(level),
            cable && level > 0,
        ));
        break;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::fake::FakeBus;

    fn info(path: &str, product_id: u16, usage_page: u16, product: &str) -> DeviceInfo {
        DeviceInfo {
            path: path.into(),
            vendor_id: VENDOR_ID,
            product_id,
            usage_page,
            usage: 1,
            serial: "0000".into(),
            product: product.into(),
            ..Default::default()
        }
    }

    fn frame(level: u8) -> Vec<u8> {
        let mut frame = vec![0x07, 0, 0x80, 1, 2];
        frame.extend(MARKER);
        frame.push(level);
        frame.resize(MESSAGE_BYTES, 0);
        frame
    }

    #[test]
    fn the_newest_frame_with_a_plausible_marker_counts() {
        assert_eq!(newest_level(&[frame(86), frame(85)]), Some(85));
        assert_eq!(newest_level(&[frame(86), frame(200), vec![7]]), Some(86));
        assert_eq!(find_level(&MARKER), None);
        assert!(FULL_SEQUENCE.contains(&BATTERY_QUERY));
        assert_eq!(packet(BATTERY_QUERY).len(), 62);
    }

    #[test]
    fn the_cable_wins_and_means_charging() {
        let bus = FakeBus::default();
        bus.script("cable", |s| s.inputs.push_back(frame(64)));
        bus.script("dongle", |s| s.inputs.push_back(frame(60)));
        let infos = [
            info("dongle", 0x4B19, 0xFF13, "Audeze Maxwell HID"),
            info("cable", 0x4B1A, 0xFF13, "Audeze Maxwell Headset"),
        ];
        let statuses = poll(&mut Context::new(&infos, &bus));
        assert_eq!(statuses.len(), 1);
        assert_eq!((statuses[0].level, statuses[0].charging), (Some(64), true));
        assert_eq!(bus.written_paths(), vec!["cable".to_string()]);
    }

    #[test]
    fn nothing_is_sent_to_an_unlinked_dongle_or_an_unknown_id() {
        let bus = FakeBus::default();
        bus.script("dongle", |_| {});
        let infos = [
            info("dongle", 0x4B19, 0xFF13, "Audeze Maxwell Dongle"),
            info("unknown", 0x1111, 0xFF13, "Audeze"),
        ];
        assert!(poll(&mut Context::new(&infos, &bus)).is_empty());
        assert!(bus.written_paths().is_empty());
    }

    #[test]
    fn zero_and_a_missing_vendor_collection_are_unknown() {
        let bus = FakeBus::default();
        bus.script("zero", |s| s.inputs.push_back(frame(0)));
        let infos = [info("zero", 0x4B19, 0xFF13, "Audeze Maxwell HID")];
        assert_eq!(poll(&mut Context::new(&infos, &bus))[0].level, None);
        let consumer = [info("consumer", 0x4B19, 0x000C, "Audeze Maxwell HID")];
        let statuses = poll(&mut Context::new(&consumer, &bus));
        assert_eq!(statuses[0].level, None);
        assert!(!bus.written_paths().contains(&"consumer".to_string()));
    }
}
