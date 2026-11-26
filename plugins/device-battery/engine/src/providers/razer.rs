//! Razer mice, keyboards and headsets: the generic 90-byte feature report, and the
//! two BlackShark protocols.
use super::context::Context;
use crate::hid::DeviceInfo;
use crate::status::Status;
use std::collections::BTreeSet;

mod blackshark;
mod blackshark2020;
mod models;
mod protocol;

use models::{KEYBOARD_INTERFACE, KNOWN};
use protocol::{Answer, Fault, STATUS_BUSY, STATUS_TIMEOUT};

pub(crate) const VENDORS: &[u16] = &[0x1532];
const TRANSACTION_IDS: [u8; 5] = [0x1F, 0x3F, 0xFF, 0x9F, 0x08];
/// The Barracuda Pro's receiver speaks its own protocol (the barracuda reader).
const BARRACUDA_PRO: u16 = 0x053A;
/// Unlisted devices are asked only when their name suggests a battery: some wired
/// ones answer the command with a meaningless value.
const WIRELESS_WORDS: [&str; 8] = [
    "hyperspeed",
    "wireless",
    "receiver",
    "dongle",
    "dock",
    "blackshark",
    "barracuda",
    "nari",
];

/// Why a collection or transaction ID gave no reading. A reply outranks failures
/// opening unrelated collections; the highest one is reported.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum Failure {
    NoReply,
    NoUsableInterface,
    OpenFailed,
    SendFailed,
    GetFailed,
    ShortReply,
    ReplyStatus(u8),
    BusyTimeout,
    DeviceTimeout,
    ForeignReply,
}

impl Failure {
    fn code(self) -> String {
        let name = match self {
            Failure::NoReply => "no_reply",
            Failure::NoUsableInterface => "no_usable_interface",
            Failure::OpenFailed => "open_failed",
            Failure::SendFailed => "send_failed",
            Failure::GetFailed => "get_failed",
            Failure::ShortReply => "short_reply",
            Failure::ReplyStatus(status) => return format!("razer_reply_status_{status:02x}"),
            Failure::BusyTimeout => "busy_timeout",
            Failure::DeviceTimeout => "device_timeout_04",
            Failure::ForeignReply => "foreign_reply",
        };
        format!("razer_{name}")
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Reading {
    level: Option<u8>,
    /// `None`: not known.
    charging: Option<bool>,
}

/// What asking one device ended with.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Outcome {
    Reading(Reading),
    /// The receiver is there and the device does not respond.
    Asleep,
    /// Another application kept overwriting the reply.
    Foreign,
}

fn known(product_id: u16) -> Option<(&'static str, u8)> {
    KNOWN
        .iter()
        .find(|(id, ..)| *id == product_id)
        .map(|(_, name, transaction_id)| (*name, *transaction_id))
}

fn keyboard_interface(product_id: u16) -> Option<i32> {
    KEYBOARD_INTERFACE
        .iter()
        .find(|(id, _)| *id == product_id)
        .map(|(_, interface)| *interface)
}

fn maybe_wireless(product_id: u16, name: &str) -> bool {
    let lower = name.to_lowercase();
    known(product_id).is_some()
        || blackshark::PRODUCT_IDS.contains(&product_id)
        || WIRELESS_WORDS.iter().any(|word| lower.contains(word))
}

/// One collection with one transaction ID. `Ok(None)`: a final status that says
/// nothing about this collection, so the next ID is worth trying. `Err`: the
/// collection cannot take the exchange.
fn read_collection(
    context: &mut Context,
    info: &DeviceInfo,
    transaction_id: u8,
    failures: &mut BTreeSet<Failure>,
) -> Result<Option<Outcome>, ()> {
    let Ok(mut device) = context.open(info) else {
        failures.insert(Failure::OpenFailed);
        return Err(());
    };
    let mut ask = |command| protocol::query(device.as_mut(), transaction_id, command);
    let raw = match ask(protocol::BATTERY_LEVEL) {
        Ok(Answer::Value(raw)) => raw,
        Ok(Answer::Foreign) => {
            failures.insert(Failure::ForeignReply);
            return Ok(Some(Outcome::Foreign));
        }
        Ok(Answer::Status(status)) => {
            failures.insert(match status {
                STATUS_BUSY => Failure::BusyTimeout,
                STATUS_TIMEOUT => Failure::DeviceTimeout,
                other => Failure::ReplyStatus(other),
            });
            return Ok((status == STATUS_TIMEOUT).then_some(Outcome::Asleep));
        }
        Err(fault) => {
            failures.insert(match fault {
                Fault::SendFailed => Failure::SendFailed,
                Fault::GetFailed => Failure::GetFailed,
                Fault::ShortReply => Failure::ShortReply,
            });
            return Err(());
        }
    };
    let level = (f64::from(raw) * 100.0 / 255.0).round_ties_even() as u8;
    let charging = match ask(protocol::CHARGING) {
        Ok(Answer::Value(value)) => Some(value != 0),
        _ => None,
    };
    Ok(Some(Outcome::Reading(Reading {
        level: Some(level),
        charging,
    })))
}

/// The keyboard's own interface, then vendor and main collections; collections
/// Windows re-parented (no interface number) go last.
fn ranked<'a>(product_id: u16, infos: &[&'a DeviceInfo]) -> Vec<&'a DeviceInfo> {
    let wanted = keyboard_interface(product_id);
    let mut ranked = infos.to_vec();
    ranked.sort_by_key(|d| {
        let interface = if d.interface_number < 0 {
            99
        } else {
            d.interface_number
        };
        (
            Some(interface) != wanted,
            !matches!(d.usage_page, 0x0001 | 0xFF00),
            interface,
        )
    });
    ranked
}

/// The generic report over the collections, preferred transaction ID first.
fn poll_generic(
    context: &mut Context,
    product_id: u16,
    infos: &[&DeviceInfo],
    failures: &mut BTreeSet<Failure>,
) -> Option<Outcome> {
    let preferred = known(product_id).map(|(_, transaction_id)| transaction_id);
    let transaction_ids: Vec<u8> = preferred
        .into_iter()
        .chain(
            TRANSACTION_IDS
                .into_iter()
                .filter(|id| Some(*id) != preferred),
        )
        .collect();
    let mut asleep = None;
    if infos.is_empty() {
        failures.insert(Failure::NoUsableInterface);
    }
    for info in ranked(product_id, infos) {
        for &transaction_id in &transaction_ids {
            match read_collection(context, info, transaction_id, failures) {
                Err(()) => break,
                Ok(None) => {}
                Ok(Some(Outcome::Asleep)) => {
                    asleep = Some(Outcome::Asleep);
                    break;
                }
                Ok(Some(outcome)) => return Some(outcome),
            }
        }
    }
    asleep
}

fn poll_pa(context: &mut Context, infos: &[&DeviceInfo]) -> Option<Outcome> {
    let mut candidates: Vec<&DeviceInfo> = infos
        .iter()
        .copied()
        .filter(|d| blackshark::is_candidate(d))
        .collect();
    if candidates.is_empty() {
        candidates = infos.to_vec();
    }
    let mut asleep = None;
    for info in candidates {
        match blackshark::read_battery(context, info) {
            blackshark::Outcome::Reading { level, charging } => {
                return Some(Outcome::Reading(Reading {
                    level: Some(level),
                    charging,
                }));
            }
            // This collection speaks the protocol; the headset is off.
            blackshark::Outcome::Offline => return Some(Outcome::Asleep),
            blackshark::Outcome::NoWake => asleep = Some(Outcome::Asleep),
            blackshark::Outcome::OpenFailed => {}
        }
    }
    asleep
}

/// Only FF00:0001 takes the 2020 report; there is no fallback.
fn poll_2020(context: &mut Context, infos: &[&DeviceInfo]) -> Option<Outcome> {
    let mut asleep = None;
    for info in infos
        .iter()
        .copied()
        .filter(|d| blackshark2020::is_candidate(d))
    {
        match blackshark2020::read_battery(context, info) {
            blackshark2020::Outcome::Reading { level, charging } => {
                return Some(Outcome::Reading(Reading { level, charging }));
            }
            blackshark2020::Outcome::Offline => asleep = Some(Outcome::Asleep),
            blackshark2020::Outcome::Failed => {}
        }
    }
    asleep
}

fn is_headset(product_id: u16, name: &str) -> bool {
    blackshark::PRODUCT_IDS.contains(&product_id) || name.to_lowercase().contains("blackshark")
}

fn ask_device(
    context: &mut Context,
    product_id: u16,
    name: &str,
    infos: &[&DeviceInfo],
    failures: &mut BTreeSet<Failure>,
) -> Option<Outcome> {
    if product_id == blackshark2020::PRODUCT_ID {
        return poll_2020(context, infos);
    }
    if blackshark::PRODUCT_IDS.contains(&product_id) {
        return poll_pa(context, infos)
            .or_else(|| poll_generic(context, product_id, infos, failures));
    }
    let outcome = poll_generic(context, product_id, infos, failures);
    if !is_headset(product_id, name) || matches!(outcome, Some(Outcome::Reading(_))) {
        return outcome;
    }
    match poll_pa(context, infos) {
        Some(pa) if outcome.is_none() || matches!(pa, Outcome::Reading(_)) => Some(pa),
        _ => outcome,
    }
}

/// (product ID, serial number)
type Group<'a> = ((u16, &'a str), Vec<&'a DeviceInfo>);

/// Synapse's virtual child collections report no serial number; they belong to the
/// one named device of the same product ID.
fn groups<'a>(infos: &[&'a DeviceInfo]) -> Vec<Group<'a>> {
    let mut groups: Vec<Group> = Vec::new();
    for &info in infos {
        let key = (info.product_id, info.serial.as_str());
        match groups.iter_mut().find(|(existing, _)| *existing == key) {
            Some((_, list)) => list.push(info),
            None => groups.push((key, vec![info])),
        }
    }
    let mut position = 0;
    while position < groups.len() {
        let (product_id, serial) = groups[position].0;
        let named: Vec<usize> = (0..groups.len())
            .filter(|&at| groups[at].0 .0 == product_id && !groups[at].0 .1.is_empty())
            .collect();
        match named[..] {
            [owner] if serial.is_empty() => {
                let (_, children) = groups.remove(position);
                let owner = owner - usize::from(owner > position);
                groups[owner].1.extend(children);
            }
            _ => position += 1,
        }
    }
    groups
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let infos = context.vendor(VENDORS[0]);
    let mut result = Vec::new();
    let mut reported = BTreeSet::new();
    for ((product_id, serial), members) in groups(&infos) {
        let name = match known(product_id) {
            Some((name, _)) => name.to_string(),
            None => match members.first().map_or("", |d| d.product.trim()) {
                "" => format!("Razer {product_id:04x}"),
                product => product.to_string(),
            },
        };
        if product_id == blackshark2020::CABLE_PRODUCT_ID
            || product_id == BARRACUDA_PRO
            || !maybe_wireless(product_id, &name)
        {
            continue;
        }
        let mut failures = BTreeSet::new();
        let outcome = ask_device(context, product_id, &name, &members, &mut failures);
        let Some(Outcome::Reading(reading)) = outcome else {
            if failures.is_empty() {
                failures.insert(Failure::NoReply);
            }
            reported.extend(failures);
            continue;
        };
        let kind = if keyboard_interface(product_id).is_some() {
            "keyboard"
        } else {
            ""
        };
        let mut status = Status::new(
            format!("razer:{product_id:04x}:{serial}"),
            name,
            reading.level,
            reading.charging == Some(true),
            kind,
        );
        if reading.charging.is_none() {
            status.charging_known = Some(false);
        }
        status.approximate = product_id == blackshark2020::PRODUCT_ID
            && (reading.level.is_none() || reading.charging.is_none());
        result.push(status);
    }
    if let Some(failure) = reported.last() {
        context.failure = Some(failure.code());
    }
    result
}

#[cfg(test)]
mod tests;
