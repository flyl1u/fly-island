//! Which collections belong to one receiver, and what the device in a slot is.
use super::channel::Channel;
use crate::hid::{DeviceInfo, HidResult};

const DEVICE_NAME: u16 = 0x0005;
const DEVICE_INFO: u16 = 0x0003;
/// More than any reported name.
const MAX_NAME_BYTES: usize = 96;

/// Receiver product IDs from Solaar: Bolt, Unifying, Nano and Lightspeed. A
/// product string containing "receiver" counts too.
const RECEIVERS: [u16; 23] = [
    0xC548, 0xC52B, 0xC532, 0xC52F, 0xC518, 0xC51A, 0xC51B, 0xC521, 0xC525, 0xC526, 0xC52E, 0xC531,
    0xC534, 0xC535, 0xC537, 0xC539, 0xC53A, 0xC53D, 0xC53F, 0xC541, 0xC545, 0xC547, 0xC54D,
];

/// Headsets with HID++ battery (feature 1F20), from HeadsetControl's list, with the
/// name used when the headset reports none.
const HEADSETS: [(u16, &str); 14] = [
    (0x0A66, "Logitech G533"),
    (0x0AC4, "Logitech G535"),
    (0x0A5C, "Logitech G633"),
    (0x0A89, "Logitech G635"),
    (0x0A5B, "Logitech G933"),
    (0x0A87, "Logitech G935"),
    (0x0AB5, "Logitech G733"),
    (0x0AFE, "Logitech G733"),
    (0x0B1F, "Logitech G733"),
    (0x0AA7, "Logitech G PRO"),
    (0x0AAA, "Logitech G PRO X"),
    (0x0ABA, "Logitech G PRO X"),
    (0x0AFB, "Logitech G PRO X 2"),
    (0x0AFC, "Logitech G PRO X 2"),
];
const G535: u16 = 0x0AC4;

pub(super) fn is_receiver(product_id: u16, product: &str) -> bool {
    RECEIVERS.contains(&product_id) || product.to_lowercase().contains("receiver")
}

pub(super) fn headset_name(product_id: u16) -> Option<&'static str> {
    HEADSETS
        .iter()
        .find(|(id, _)| *id == product_id)
        .map(|(_, name)| *name)
}

/// The device instance from the HID path without its collection number, so the two
/// HID++ collections of one receiver stay together and two receivers sharing a
/// product ID stay apart.
fn instance(path: &str) -> String {
    let segment = path.split('#').nth(2).unwrap_or_default().to_lowercase();
    match segment.rsplit_once('&') {
        Some((interface, _)) => interface.to_string(),
        None => segment,
    }
}

pub(super) struct Receiver<'a> {
    pub product_id: u16,
    pub instance: String,
    pub short: Option<&'a DeviceInfo>,
    pub long: Option<&'a DeviceInfo>,
    headset: Option<&'a DeviceInfo>,
}

/// ff00:0001 and ff00:0002; a listed headset may only have its own long collection
/// (ff43:0202, or the consumer collection on the G535). Others get no request there.
pub(super) fn receivers<'a>(infos: &[&'a DeviceInfo]) -> Vec<Receiver<'a>> {
    let mut found: Vec<Receiver> = Vec::new();
    for &info in infos {
        let headset_collection = if info.product_id == G535 {
            (0x000C, 0x0001)
        } else {
            (0xFF43, 0x0202)
        };
        let hidpp = info.usage_page == 0xFF00 && matches!(info.usage, 1 | 2);
        let headset = !hidpp
            && headset_name(info.product_id).is_some()
            && info.is_collection(headset_collection.0, headset_collection.1);
        if !hidpp && !headset {
            continue;
        }
        let instance = instance(&info.path);
        let position = found
            .iter()
            .position(|r| r.product_id == info.product_id && r.instance == instance)
            .unwrap_or_else(|| {
                found.push(Receiver {
                    product_id: info.product_id,
                    instance,
                    short: None,
                    long: None,
                    headset: None,
                });
                found.len() - 1
            });
        let receiver = &mut found[position];
        match (headset, info.usage) {
            (true, _) => receiver.headset = Some(info),
            (false, 1) => receiver.short = Some(info),
            (false, _) => receiver.long = Some(info),
        }
    }
    for receiver in &mut found {
        receiver.long = receiver.long.or(receiver.headset);
    }
    found
}

#[derive(Default)]
pub(super) struct Identity {
    pub name: String,
    /// mouse / keyboard, or empty.
    pub kind: &'static str,
    /// The stable unit ID, upper-case hex.
    pub unit: String,
}

/// Parts that cannot be read stay empty.
pub(super) fn identify(channel: &mut Channel, slot: u8) -> HidResult<Identity> {
    let mut identity = Identity::default();
    let index = channel.feature_index(slot, DEVICE_NAME)?;
    if index != 0 {
        let length = channel
            .call(slot, index, 0, &[])?
            .map_or(0, |data| usize::from(data[0]))
            .min(MAX_NAME_BYTES);
        let mut raw = Vec::new();
        while raw.len() < length {
            let Some(data) = channel.call(slot, index, 1, &[raw.len() as u8])? else {
                break;
            };
            raw.extend_from_slice(&data[..16]);
        }
        raw.truncate(length);
        identity.name = String::from_utf8_lossy(&raw)
            .trim_matches(|c: char| c.is_whitespace() || c == '\0')
            .to_string();
        identity.kind = match channel.call(slot, index, 2, &[])?.map(|data| data[0]) {
            Some(0 | 2) => "keyboard",
            Some(3..=5) => "mouse",
            _ => "",
        };
    }
    let index = channel.feature_index(slot, DEVICE_INFO)?;
    if index != 0 {
        if let Some(data) = channel.call(slot, index, 0, &[])? {
            if data[1..5].iter().any(|&byte| byte != 0) {
                identity.unit = data[1..5]
                    .iter()
                    .map(|byte| format!("{byte:02X}"))
                    .collect();
            }
        }
    }
    Ok(identity)
}
