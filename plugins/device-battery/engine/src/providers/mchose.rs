//! MCHOSE mice. Each identity has exactly one protocol: A5 V2 Ultra and the V3
//! receivers never fall back to the older ones, and the G7 and A5 Pro Max frames are
//! only sent to their listed IDs.
use super::context::Context;
use crate::hid::DeviceInfo;
use crate::status::Status;

mod a5v2;
mod legacy;
pub(crate) mod v3;

const MEASURED_VID: u16 = 0x5253;
const MCHOSE_VID: u16 = 0x3837;
const G7: (u16, u16) = (0xA8A5, 0x2255);
const A5_VID: u16 = 0x2023;
/// A5 Pro Max: 1K receiver, 4K receiver, wired.
const A5_PIDS: [u16; 3] = [0xF013, 0xF015, 0xF019];
const CONFIG_PAGE: u16 = 0xFF01;
const A5_USAGE_PAGE: u16 = 0xFFFF;
const M7_ULTRA_MODEL: u16 = 0x0031;

pub(crate) const VENDORS: &[u16] = &[MEASURED_VID, MCHOSE_VID, G7.0, A5_VID];

#[derive(Clone, Copy, Debug, PartialEq)]
struct Reading {
    level: u8,
    charging: bool,
    /// The model the legacy status reply names; 0 when the protocol has none.
    model: u16,
}

/// One status per key: a charging reading wins over a battery one.
struct Found {
    key: String,
    product: String,
    reading: Reading,
}

fn is_v3(vendor_id: u16, product_id: u16) -> bool {
    vendor_id == MCHOSE_VID && v3::PRODUCT_IDS.contains(&product_id)
}

fn device_key(vendor_id: u16, product_id: u16) -> String {
    if (vendor_id, product_id) == a5v2::IDENTITY || is_v3(vendor_id, product_id) {
        format!("mchose:{vendor_id:04x}:{product_id:04x}")
    } else if vendor_id == MEASURED_VID {
        "mchose".to_string()
    } else {
        format!("mchose:{vendor_id:04x}")
    }
}

type Group<'a> = ((u16, u16), Vec<&'a DeviceInfo>);

/// Collections grouped by identity; anything on an A5 V2 Ultra path joins that group
/// whatever its attributes claim.
fn identity_groups<'a>(context: &Context<'a>) -> Vec<Group<'a>> {
    let mut groups: Vec<Group<'a>> = Vec::new();
    for &vendor_id in VENDORS {
        for info in context.vendor(vendor_id) {
            let identity = if a5v2::is_path(&info.path) {
                a5v2::IDENTITY
            } else {
                (info.vendor_id, info.product_id)
            };
            match groups.iter_mut().find(|(key, _)| *key == identity) {
                Some((_, list)) => list.push(info),
                None => groups.push((identity, vec![info])),
            }
        }
    }
    groups
}

/// The collections one of the older protocols may try, in order.
fn legacy_collections<'a>(vendor_id: u16, infos: &[&'a DeviceInfo]) -> Vec<&'a DeviceInfo> {
    let mut result: Vec<&DeviceInfo> = infos
        .iter()
        .copied()
        .filter(|d| match vendor_id {
            id if id == G7.0 => d.usage_page == CONFIG_PAGE,
            A5_VID => d.usage_page == A5_USAGE_PAGE,
            _ => d.usage_page >= 0xFF00,
        })
        .collect();
    result.sort_by_key(|d| (d.usage_page != CONFIG_PAGE, d.usage != 1));
    result
}

fn first_product(infos: &[&DeviceInfo]) -> String {
    infos
        .iter()
        .map(|d| d.product.trim())
        .find(|product| !product.is_empty())
        .unwrap_or_default()
        .to_string()
}

fn display_name(found: &Found) -> String {
    if found.reading.model == M7_ULTRA_MODEL {
        "MCHOSE M7 Ultra".to_string()
    } else if !found.product.is_empty() {
        found.product.clone()
    } else if found.reading.model != 0 {
        format!("MCHOSE mouse (0x{:04x})", found.reading.model)
    } else {
        "MCHOSE mouse".to_string()
    }
}

fn record(found: &mut Vec<Found>, key: String, product: String, reading: Reading) {
    match found.iter_mut().find(|entry| entry.key == key) {
        Some(entry) => {
            entry.product = product;
            if reading.charging && !entry.reading.charging {
                entry.reading = reading;
            }
        }
        None => found.push(Found {
            key,
            product,
            reading,
        }),
    }
}

fn read_group(context: &mut Context, group: &Group) -> Option<(String, Reading)> {
    let ((vendor_id, product_id), infos) = group;
    let (vendor_id, product_id) = (*vendor_id, *product_id);
    if (vendor_id, product_id) == a5v2::IDENTITY {
        let reading = a5v2::read(context, a5v2::pick(infos)?)?;
        return Some((a5v2::NAME.to_string(), reading));
    }
    // 600A/6008 are the V9 headset (mchose_headset) and its lighting device;
    // 1015/3033 are keyboards with their own readers.
    if vendor_id == MCHOSE_VID && [0x600A, 0x6008, 0x1015, 0x3033].contains(&product_id) {
        return None;
    }
    if is_v3(vendor_id, product_id) {
        let product = first_product(infos);
        let name = if !product.is_empty() {
            product
        } else {
            v3::fallback_name(product_id).to_string()
        };
        let reading = v3::read(context, v3::pick(infos)?)?;
        return Some((name, reading));
    }
    if (vendor_id == G7.0 && product_id != G7.1)
        || (vendor_id == A5_VID && !A5_PIDS.contains(&product_id))
    {
        return None;
    }
    let product = infos
        .first()
        .map(|d| d.product.trim().to_string())
        .unwrap_or_default();
    let reading = legacy_collections(vendor_id, infos)
        .into_iter()
        .find_map(|info| {
            let mut device = context.open(info).ok()?;
            match vendor_id {
                id if id == G7.0 => legacy::read_g7(device.as_mut()),
                A5_VID => legacy::read_a5(device.as_mut()),
                _ => legacy::read_status(device.as_mut()),
            }
        })?;
    Some((product, reading))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut found = Vec::new();
    for group in identity_groups(context) {
        let key = device_key(group.0 .0, group.0 .1);
        // Receivers sharing a key: once one answered, a charging cable cannot be
        // told apart any better by asking the next one more than once.
        if let Some((product, reading)) = read_group(context, &group) {
            record(&mut found, key, product, reading);
        }
    }
    found
        .into_iter()
        .map(|entry| {
            let name = display_name(&entry);
            Status::new(
                entry.key,
                name,
                Some(entry.reading.level),
                entry.reading.charging,
                "mouse",
            )
        })
        .collect()
}

#[cfg(test)]
mod tests;
