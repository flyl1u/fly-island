//! Display-only rules over the finished cards: hiding duplicates of one device, and
//! naming the present devices no reader produced a card for.
use super::card::Card;
use super::clock::public_id;
use super::redact;
use crate::hid::topology::is_native;
use crate::hid::DeviceInfo;
use serde_json::{json, Value};
use std::cmp::Reverse;
use std::collections::BTreeSet;

const MAX_LISTED: usize = 16;
const MAX_UNADAPTED_NAME_CHARS: usize = 48;
const MAX_COLLECTIONS: usize = 8;
/// Families whose identical-looking cards are always distinct.
const NEVER_MERGED: [&str; 4] = ["cherry", "lingbao", "zhuaudio", "asus_omni"];
const RECEIVER_WORDS: [&str; 5] = ["dongle", "receiver", "接收器", "wireless mouse", "2.4g"];
/// Exact virtual devices and lighting controllers seen in feedback.
const NOISE_IDS: [(u16, u16); 6] = [
    (0xFFAA, 0xAAFF),
    (0xDEED, 0xFEED),
    (0xBACD, 0x001F),
    (0x048D, 0xC100),
    (0x0B05, 0x19AF),
    (0x0CF2, 0x7750),
];

/// XInput has no Bluetooth identity: for each Bluetooth Xbox pad with a percentage,
/// the lowest approximate wireless slot is taken to be the same pad and hidden.
pub(crate) fn hide_bluetooth_xinput(cards: &mut Vec<Card>) {
    let mut count = cards
        .iter()
        .filter(|c| {
            c.family == "bluetooth"
                && c.kind == "gamepad"
                && c.online
                && c.percent.is_some()
                && c.name.to_lowercase().contains("xbox")
        })
        .count();
    for slot in 0..4 {
        if count == 0 {
            break;
        }
        let id = public_id(&format!("xinput:{slot}"));
        let position = cards
            .iter()
            .position(|c| c.id == id && c.family == "xinput" && c.online && c.approximate);
        if let Some(position) = position {
            cards.remove(position);
            count -= 1;
        }
    }
}

/// An old connection of a device now seen elsewhere: a receiver and a cable.
fn same_device(a: &Card, b: &Card) -> bool {
    if NEVER_MERGED.contains(&a.family) || a.family != b.family || a.kind != b.kind {
        return false;
    }
    if a.physical.is_empty() || b.physical.is_empty() || a.physical == b.physical {
        return false;
    }
    let (Some(first), Some(second)) = (a.percent, b.percent) else {
        return false;
    };
    if first.abs_diff(second) > 5 || (a.current && b.current) {
        return false;
    }
    let names = [a.name.to_lowercase(), b.name.to_lowercase()];
    names[0] == names[1]
        || names
            .iter()
            .any(|name| RECEIVER_WORDS.iter().any(|word| name.contains(word)))
}

/// Keeps the best card of each group whose members are all the same device; returns
/// the names of the hidden ones.
pub(crate) fn hide_old_connections(cards: &mut Vec<Card>) -> Vec<Value> {
    let mut order: Vec<usize> = (0..cards.len()).collect();
    order.sort_by_key(|&at| {
        let card = &cards[at];
        let confirmed = Reverse(card.confirmed_at.clone().unwrap_or_default());
        (!card.current, confirmed, card.id.clone())
    });
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut hidden = BTreeSet::new();
    for at in order {
        let group = groups.iter_mut().find(|members| {
            members
                .iter()
                .all(|&member| same_device(&cards[at], &cards[member]))
        });
        match group {
            Some(members) => {
                members.push(at);
                hidden.insert(at);
            }
            None => groups.push(vec![at]),
        }
    }
    let names = hidden
        .iter()
        .take(MAX_LISTED)
        .map(|&at| json!({"name": cards[at].name, "kind": cards[at].kind}))
        .collect();
    let mut index = 0;
    cards.retain(|_| {
        index += 1;
        !hidden.contains(&(index - 1))
    });
    names
}

fn is_noise(info: &DeviceInfo) -> bool {
    let named = ["virtual", "argb", "aura"]
        .iter()
        .any(|word| redact::mentions_word(&info.product, word));
    let words: Vec<String> = info
        .product
        .split_whitespace()
        .map(str::to_lowercase)
        .collect();
    let led_controller = words.windows(2).any(|pair| {
        redact::mentions_word(&pair[0], "led")
            && pair[0].ends_with("led")
            && redact::mentions_word(&pair[1], "controller")
            && pair[1].starts_with("controller")
    });
    NOISE_IDS.contains(&(info.vendor_id, info.product_id)) || named || led_controller
}

/// A product string with every private part removed, then bounded.
fn safe_product(info: &DeviceInfo, private: &[&str]) -> String {
    let name = redact::secrets(&info.product, private.iter().copied());
    let printable: String = redact::identifiers(&name)
        .chars()
        .filter(|c| !c.is_control())
        .map(|c| if c == '"' { '\'' } else { c })
        .collect();
    printable
        .trim()
        .chars()
        .take(MAX_UNADAPTED_NAME_CHARS)
        .collect()
}

/// (vendor ID, product ID, product, collections)
type Unadapted = (u16, u16, String, Vec<(u16, u16)>);

fn describe(physical: &str, infos: &[&DeviceInfo]) -> Option<Unadapted> {
    // Lighting functions must not hide another peripheral of the same group.
    let infos: Vec<&DeviceInfo> = infos.iter().copied().filter(|d| !is_noise(d)).collect();
    let peripheral = infos
        .iter()
        .any(|d| d.usage_page >= 0xFF00 || (d.usage_page, d.usage) == (1, 2));
    if !peripheral {
        return None;
    }
    let mut private = vec![physical];
    for info in &infos {
        private.extend([&info.serial, &info.path, &info.physical_id].map(String::as_str));
    }
    let product = infos
        .iter()
        .map(|info| safe_product(info, &private))
        .filter(|name| !name.is_empty())
        .min()
        .unwrap_or_default();
    let (vendor_id, product_id) = infos.iter().map(|d| (d.vendor_id, d.product_id)).min()?;
    let mut collections: Vec<(u16, u16)> = infos.iter().map(|d| (d.usage_page, d.usage)).collect();
    collections.sort_unstable();
    collections.truncate(MAX_COLLECTIONS);
    Some((vendor_id, product_id, product, collections))
}

/// Model metadata of the present physical devices without a card, from the
/// inventory already discovered. Nothing is probed.
pub(crate) fn unadapted(groups: &[(String, Vec<DeviceInfo>)], cards: &[Card]) -> Vec<Value> {
    let mut found: Vec<Unadapted> = groups
        .iter()
        .filter(|(physical, infos)| {
            !cards.iter().any(|card| &card.physical == physical)
                && !infos.iter().any(|d| is_native(d.vendor_id, d.product_id))
        })
        .filter_map(|(physical, infos)| describe(physical, &infos.iter().collect::<Vec<_>>()))
        .collect();
    found.sort();
    found
        .into_iter()
        .take(MAX_LISTED)
        .map(|(vendor_id, product_id, product, collections)| {
            let collections: Vec<Value> = collections
                .into_iter()
                .map(|(page, usage)| json!({"usagePage": page, "usage": usage}))
                .collect();
            json!({"vendorId": vendor_id, "productId": product_id,
                   "product": product, "collections": collections})
        })
        .collect()
}

#[cfg(test)]
mod tests;
