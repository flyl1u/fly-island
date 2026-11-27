//! Logitech mice, keyboards and headsets over HID++ 2.0, with the HID++ 1.0 battery
//! registers for older devices. Works alongside G HUB; everything is read-only.
use super::context::Context;
use crate::hid::HidResult;
use crate::status::Status;

mod channel;
mod identity;
mod parsers;

use channel::{Channel, Reply, ERROR_OLD_PROTOCOL, PING_TIMEOUT};
use identity::{headset_name, identify, is_receiver, receivers, Receiver};
use parsers::{
    feature_reply, register_reply, Battery, BATTERY_FEATURES, REGISTER_CHARGE, REGISTER_STATUS,
    UNIFIED_BATTERY,
};

pub(crate) const VENDORS: &[u16] = &[0x046D];
const ROOT: u8 = 0;
const PING_FUNCTION: u8 = 1;
/// The slot of a cabled device or headset.
const DIRECT_SLOT: u8 = 0xFF;
const FALLBACK_NAME: &str = "Logitech device";

struct Slot<'a> {
    receiver: &'a Receiver<'a>,
    index: u8,
    /// Two receivers of one kind hand out the same unit IDs, so then the instance
    /// joins the key.
    multiple: bool,
}

impl Slot<'_> {
    fn key(&self, unit: &str) -> String {
        let prefix = if self.multiple {
            format!("{}:", self.receiver.instance)
        } else {
            String::new()
        };
        if unit.is_empty() {
            let product_id = self.receiver.product_id;
            format!("logitech:{prefix}{product_id:04x}:{}", self.index)
        } else {
            format!("logitech:{prefix}{unit}")
        }
    }
}

fn status(key: String, name: &str, battery: Battery, kind: &'static str) -> Status {
    let mut status = Status::new(key, name, Some(battery.level), battery.charging, kind);
    status.approximate = battery.approximate;
    status
}

/// A device without a feature table reports through registers; charge first.
fn register_battery(channel: &mut Channel, slot: &Slot, name: &str) -> HidResult<Option<Status>> {
    for register in [REGISTER_CHARGE, REGISTER_STATUS] {
        let Some(data) = channel.read_register(slot.index, register)? else {
            continue;
        };
        if let Some(battery) = register_reply(register, &data) {
            return Ok(Some(status(slot.key(""), name, battery, "")));
        }
    }
    Ok(None)
}

fn feature_battery(channel: &mut Channel, slot: &Slot) -> HidResult<Option<Battery>> {
    for feature in BATTERY_FEATURES {
        let index = channel.feature_index(slot.index, feature)?;
        if index == 0 {
            continue;
        }
        let function = u8::from(feature == UNIFIED_BATTERY);
        let reply = channel.call(slot.index, index, function, &[])?;
        if let Some(battery) = reply.and_then(|data| feature_reply(feature, &data)) {
            return Ok(Some(battery));
        }
    }
    Ok(None)
}

fn read_slot(channel: &mut Channel, slot: &Slot) -> HidResult<Option<Status>> {
    // A sleeping, switched-off or absent device ends here.
    match channel.request(slot.index, ROOT, PING_FUNCTION, &[], PING_TIMEOUT)? {
        Reply::Data(_) => {}
        Reply::Error(ERROR_OLD_PROTOCOL) => {
            return register_battery(channel, slot, FALLBACK_NAME);
        }
        _ => return Ok(None),
    }
    let identity = identify(channel, slot.index)?;
    let headset = headset_name(slot.receiver.product_id);
    let name = if !identity.name.is_empty() {
        identity.name.as_str()
    } else {
        headset.unwrap_or(FALLBACK_NAME)
    };
    let kind = if headset.is_some() {
        "headset"
    } else {
        identity.kind
    };
    if let Some(battery) = feature_battery(channel, slot)? {
        return Ok(Some(status(slot.key(&identity.unit), name, battery, kind)));
    }
    register_battery(channel, slot, name)
}

/// The same device on the cable and through the receiver: charging wins.
fn merge(found: &mut Vec<Status>, status: Status) {
    match found.iter_mut().find(|existing| existing.key == status.key) {
        Some(existing) if status.charging => *existing = status,
        Some(_) => {}
        None => found.push(status),
    }
}

fn read_receiver(
    context: &mut Context,
    receiver: &Receiver,
    multiple: bool,
    product: &str,
    found: &mut Vec<Status>,
) -> HidResult<()> {
    let Some(long) = receiver.long else {
        return Ok(());
    };
    let short = receiver.short.and_then(|info| context.open(info).ok());
    let mut channel = Channel::new(context.open(long)?, short);
    let slots: Vec<u8> = if is_receiver(receiver.product_id, product) {
        (1..=6).collect()
    } else {
        vec![DIRECT_SLOT]
    };
    for index in slots {
        let slot = Slot {
            receiver,
            index,
            multiple,
        };
        if let Some(status) = read_slot(&mut channel, &slot)? {
            merge(found, status);
        }
    }
    Ok(())
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let infos = context.vendor(VENDORS[0]);
    let receivers = receivers(&infos);
    let mut found = Vec::new();
    for receiver in &receivers {
        let multiple = receivers
            .iter()
            .filter(|other| other.product_id == receiver.product_id)
            .count()
            > 1;
        let product = infos
            .iter()
            .find(|d| d.product_id == receiver.product_id)
            .map_or("", |d| d.product.as_str());
        // An I/O error ends this receiver only; what was read before it stays.
        let _ = read_receiver(context, receiver, multiple, product, &mut found);
    }
    found
}

#[cfg(test)]
mod tests;
