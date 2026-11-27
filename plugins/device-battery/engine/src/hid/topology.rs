//! The present HID topology from metadata only: nothing is read from or written to a
//! device, and natively handled receivers are excluded before any handle is opened.
//! Only the exact identities listed here get report-size proofs; every other
//! collection stays unproven.
use super::{descriptor, proof, DeviceInfo, HidBus};
use crate::hid::caps::{byte_report_sizes, report_ids, Caps, FEATURE, INPUT, OUTPUT};
use crate::win32::hid_meta::{Attributes, MetaDevice};
use crate::win32::paths;
use std::collections::BTreeMap;

/// Read by the bridge itself, so the engine never opens them.
pub(crate) const NATIVE: [(u16, u16); 2] = [(0x373B, 0x1278), (0x03F0, 0x098D)];
const MAX_PATHS: usize = 512;

/// Proof that every present MCHOSE A5 V2 Ultra collection was inspected.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct A5v2Proof {
    pub paths: Vec<String>,
    pub parent: String,
    pub collection: String,
}

pub(crate) fn is_native(vendor_id: u16, product_id: u16) -> bool {
    NATIVE.contains(&(vendor_id, product_id))
}

pub(crate) fn discover(present: &[String], bus: &dyn HidBus) -> Vec<DeviceInfo> {
    let mut selected: Vec<&String> = present.iter().collect();
    selected.sort();
    selected.dedup();
    let mut inventory = Vec::new();
    for path in selected.into_iter().take(MAX_PATHS) {
        if proof::path_ids(path).is_some_and(|(v, p)| is_native(v, p)) {
            continue;
        }
        let Some(mut device) = MetaDevice::open(path) else {
            continue;
        };
        let Some(attributes) = device.attributes() else {
            continue;
        };
        if is_native(attributes.vendor_id, attributes.product_id) {
            continue;
        }
        let caps = device.caps();
        let strings = device.strings();
        let supports = |id, length| device.supports_report_id(id, length);
        let mut info = describe(path, &attributes, caps.as_ref(), strings, &supports, bus);
        info.physical_id = match paths::usb_parent(path) {
            Some(parent) => format!("pnp:{parent}"),
            None => format!("collection:{}", path.to_lowercase()),
        };
        inventory.push(info);
    }
    attest_a5v2(&mut inventory, present);
    inventory
}

fn interface_number(path: &str) -> i32 {
    let lower = path.to_ascii_lowercase();
    lower
        .match_indices("&mi_")
        .find_map(|(at, _)| {
            let hex = lower.get(at + 4..at + 6)?;
            i32::from_str_radix(hex, 16).ok()
        })
        .unwrap_or(-1)
}

/// One collection's record, including the report proofs of the listed identities.
pub(crate) fn describe(
    path: &str,
    attributes: &Attributes,
    caps: Option<&Caps>,
    [product, _, serial]: [String; 3],
    supports_report_id: &dyn Fn(u8, usize) -> bool,
    bus: &dyn HidBus,
) -> DeviceInfo {
    let mut info = DeviceInfo {
        path: path.to_string(),
        vendor_id: attributes.vendor_id,
        product_id: attributes.product_id,
        release_number: attributes.release_number,
        interface_number: interface_number(path),
        product,
        serial,
        ..Default::default()
    };
    let Some(caps) = caps else {
        return info;
    };
    info.usage_page = caps.usage_page;
    info.usage = caps.usage;
    info.input_len = Some(usize::from(caps.lengths[INPUT]));
    info.output_len = Some(usize::from(caps.lengths[OUTPUT]));
    info.feature_len = Some(usize::from(caps.lengths[FEATURE]));
    let identity = (info.vendor_id, info.product_id, info.usage_page, info.usage);
    match identity {
        (0x3837, 0x100C, 0xFF01, 0x0001) if info.product.trim() == "MCHOSE A5 V2 Ultra" => {
            feature(&mut info, caps, false);
            let proven = info.feature_sizes.as_ref().is_some_and(|sizes| {
                let maximum = usize::from(caps.lengths[FEATURE]);
                matches!(sizes.get(&17), Some(21 | 65))
                    && sizes.get(&17) == sizes.values().max()
                    && sizes.get(&17) == Some(&maximum)
            });
            info.a5v2_complete = proven;
            info.feature_proven_by = proven.then_some("caps");
        }
        (0x3837, 0x1015, 0xFF80, 0x0001) if info.product == "MCHOSE G98 V3 2.4G" => {
            info.input_ids = report_ids(caps, INPUT);
            info.output_ids = report_ids(caps, OUTPUT);
        }
        (0x3837, 0x3033, 0x0001, 0x0000) if info.product == "MCHOSE G87 V2 2.4G" => {
            info.input_ids = report_ids(caps, INPUT);
            info.output_ids = report_ids(caps, OUTPUT);
        }
        (0x046A, 0x01E0 | 0x01DE, 0xFF1C, 0x0092) => {
            // Only a unique ID gives the collection maximum an exact owner.
            let only = |kind: usize| {
                (report_ids(caps, kind).as_deref() == Some(&[4]) && caps.lengths[kind] == 64)
                    .then(|| super::Sizes::from([(4, 64)]))
            };
            info.input_sizes = only(INPUT);
            info.output_sizes = only(OUTPUT);
        }
        (0x088D, 0x052F, 0xFF00, 0x0001)
            if info.interface_number == 1 && info.product == "Wireless-Receiver" =>
        {
            feature(&mut info, caps, true);
        }
        (0x0B05, 0x1ACE, 0xFF01, 0x0001)
            if info.interface_number == 2 && is_omni_collection(path) =>
        {
            input_output(&mut info, caps, false);
        }
        // A fixed-usage array, CE input / CD output; FF02 is never touched.
        (0x3654, 0x5055, 0xFF05, 0x0001) => input_output(&mut info, caps, true),
        (0x3837, 0x1018, 0xFF01, 0x0001)
        | (0x3837, 0x1018, 0xFF0B, 0x00C4)
        | (0x3837, 0x1014, 0xFF01, 0x0001)
        | (0x373B, 0x1262 | 0x12D6, 0xFF90, 0x0001)
        | (0x373B, 0x1216, 0xFF05, 0x0001)
        | (0x35D8, 0x0133, 0xFF02, 0x0002)
        | (0x35D8, 0x0133, 0x000C, 0x0001)
        | (0x3710, 0x5501, 0xFF02, 0x0002)
        | (0x41E4, 0x2001, 0xFF04 | 0xFF02, 0x0002)
        | (0x3554, 0xFA09, 0xFF02, 0x0002)
        | (0x320F, 0x706E | 0x5088, 0xFF1C, 0x0092)
        | (0x391D, 0x1A01, 0xFF01, 0x0010)
        | (0x089D, 0x062F, 0xFF01, 0x0010)
        | (0x37D7, 0x2501, 0xFFA0, 0x0001) => {
            input_output(&mut info, caps, false);
            let may_read_descriptor = matches!(
                (info.vendor_id, info.product_id),
                (0x35D8, 0x0133) | (0x3837, 0x1018 | 0x1014) | (0x41E4, 0x2001) | (0x3554, 0xFA09)
            );
            // The alternate 1018 collection is only useful at 4D/64.
            let useful = !info.is_collection(0xFF0B, 0x00C4)
                || (caps.lengths[INPUT] == 64 && caps.lengths[OUTPUT] == 64);
            if may_read_descriptor && useful {
                descriptor_fallback(&mut info, caps, &[INPUT, OUTPUT], bus);
            }
            let incomplete = info.input_sizes.is_none() || info.output_sizes.is_none();
            if incomplete
                && identity == (0x3837, 0x1018, 0xFF01, 0x0001)
                && crate::providers::mchose::v3::windows_report_candidate(&info)
                && supports_report_id(0x4D, 64)
            {
                info.v3_windows_report_confirmed = true;
            }
        }
        (0x3554, 0xFA09, 0xFF04, 0x0002) => {
            input_output(&mut info, caps, false);
            feature(&mut info, caps, false);
            // Proven absence (empty) differs from a failed proof (none).
            if is_absent(caps, INPUT) {
                info.input_sizes = Some(Default::default());
            }
            if is_absent(caps, OUTPUT) {
                info.output_sizes = Some(Default::default());
            }
        }
        // The V9 PRO sibling must prove the read-only AA firmware report.
        (0x291D, 0x385D, 0xFF22, 0x0001) => feature(&mut info, caps, false),
        // VGN HUB's beiying receivers only, never M HUB's FF04 endpoint.
        (0x258A, 0x024F | 0x027F | 0x027B, 0xFF02, 0x0002)
        | (0x391D, 0x2A01 | 0x2A02, 0xFF02, 0x0002) => input_output(&mut info, caps, true),
        (0x24AE, product_id, 0xFF00, 0x0002)
            if crate::providers::rapoo::is_known_receiver(product_id) =>
        {
            info.input_sizes = byte_report_sizes(caps, INPUT, true);
            descriptor_fallback(&mut info, caps, &[INPUT], bus);
        }
        // FA6x is receive-only: input 03 is proven from metadata.
        (0x1D57, 0xFA60, 0x000A, 0x0000) | (0x1D57, 0xFA65, 0xFF00, 0x0001) => {
            fa6x(&mut info, caps, bus);
        }
        (0x1D57, 0xFA65, 0x000A, 0x0000) if info.release_number & 0xFF == 0x16 => {
            fa6x(&mut info, caps, bus);
        }
        (0x260D, 0x1074, 0xFF02, 0x0002) => {
            feature(&mut info, caps, false);
            info.input_sizes = byte_report_sizes(caps, INPUT, false);
        }
        (0x1915, 0xAE1C, 0xFFA0, 0x0001) => feature(&mut info, caps, false),
        (0x372E, 0x1026, 0xFF00 | 0xFF06, 0x0001) => {
            feature(&mut info, caps, false);
            descriptor_fallback(&mut info, caps, &[FEATURE], bus);
        }
        _ => {}
    }
    info
}

fn input_output(info: &mut DeviceInfo, caps: &Caps, fixed_usage: bool) {
    info.input_sizes = byte_report_sizes(caps, INPUT, fixed_usage);
    info.output_sizes = byte_report_sizes(caps, OUTPUT, fixed_usage);
    info.input_proven_by = info.input_sizes.as_ref().map(|_| "caps");
    info.output_proven_by = info.output_sizes.as_ref().map(|_| "caps");
}

fn feature(info: &mut DeviceInfo, caps: &Caps, fixed_usage: bool) {
    info.feature_sizes = byte_report_sizes(caps, FEATURE, fixed_usage);
    info.feature_proven_by = info.feature_sizes.as_ref().map(|_| "caps");
}

fn fa6x(info: &mut DeviceInfo, caps: &Caps, bus: &dyn HidBus) {
    info.input_sizes = byte_report_sizes(caps, INPUT, false);
    if info.input_sizes.is_none() {
        descriptor_fallback(info, caps, &[INPUT], bus);
    } else {
        info.input_proven_by = Some("caps");
    }
}

fn is_absent(caps: &Caps, kind: usize) -> bool {
    caps.lengths[kind] == 0 && caps.button_counts[kind] == 0 && caps.value_counts[kind] == 0
}

/// The interface segment of the path must name interface 2, collection 3.
fn is_omni_collection(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    let segments: Vec<&str> = lower.split('#').collect();
    segments.len() >= 3
        && segments[1]
            .match_indices("&mi_02&col03")
            .any(|(at, found)| {
                let rest = &segments[1][at + found.len()..];
                rest.is_empty() || rest.starts_with('&')
            })
}

fn slot(
    info: &mut DeviceInfo,
    kind: usize,
) -> (&mut Option<super::Sizes>, &mut Option<&'static str>) {
    match kind {
        INPUT => (&mut info.input_sizes, &mut info.input_proven_by),
        OUTPUT => (&mut info.output_sizes, &mut info.output_proven_by),
        _ => (&mut info.feature_sizes, &mut info.feature_proven_by),
    }
}

/// Fills unproven directions from the raw descriptor, only when its sizes agree with
/// the capability maxima and with every direction already proven. Called only for
/// explicit identities.
fn descriptor_fallback(info: &mut DeviceInfo, caps: &Caps, wanted: &[usize], bus: &dyn HidBus) {
    // Diagnostic evidence only: what is already proven, or proven absent.
    let mut declared = descriptor::Collection::default();
    let mut declared_complete = true;
    for kind in [INPUT, OUTPUT, FEATURE] {
        match slot(info, kind).0.clone() {
            Some(sizes) => declared[kind] = sizes,
            None if is_absent(caps, kind) => {}
            None => declared_complete = false,
        }
    }
    info.declared = declared_complete.then_some(declared);
    let mut missing = Vec::new();
    for &kind in wanted {
        let (sizes, proven_by) = slot(info, kind);
        if sizes.is_none() {
            missing.push(kind);
            *proven_by = None;
        } else {
            *proven_by = Some("caps");
        }
    }
    if missing.is_empty() {
        return;
    }
    let raw = bus
        .open(&info.path)
        .and_then(|mut device| device.report_descriptor())
        .map_err(|_| "descriptor read failed");
    let parsed: Result<BTreeMap<_, _>, _> = raw.and_then(|raw| descriptor::parse(&raw));
    let collection = parsed.and_then(|map| {
        map.get(&(caps.usage_page, caps.usage))
            .cloned()
            .ok_or("collection not found")
    });
    let reason = match collection {
        Err(reason) => reason,
        Ok(collection) => {
            info.declared = Some(collection.clone());
            let maxima_agree = [INPUT, OUTPUT, FEATURE].iter().all(|&kind| {
                collection[kind].values().max().copied().unwrap_or(0)
                    == usize::from(caps.lengths[kind])
            });
            let proven_agree = wanted
                .iter()
                .filter(|kind| !missing.contains(kind))
                .all(|&kind| slot(info, kind).0.as_ref() == Some(&collection[kind]));
            if !maxima_agree {
                "collection maximum mismatch"
            } else if !proven_agree {
                "caps/descriptor disagreement"
            } else {
                for kind in missing {
                    let (sizes, proven_by) = slot(info, kind);
                    *sizes = Some(collection[kind].clone());
                    *proven_by = Some("descriptor");
                }
                return;
            }
        }
    };
    info.descriptor_error = Some(reason);
}

/// Attaches the A5 V2 Ultra proof only when every present collection of that identity
/// was inspected completely, they share one USB parent, and exactly one is FF01:0001.
fn attest_a5v2(inventory: &mut [DeviceInfo], present: &[String]) {
    const VID: u16 = 0x3837;
    const PID: u16 = 0x100C;
    let mut expected: Vec<String> = present
        .iter()
        .filter(|path| proof::path_ids(path) == Some((VID, PID)))
        .map(|path| path.to_lowercase())
        .collect();
    expected.sort();
    let targets: Vec<&DeviceInfo> = inventory.iter().filter(|d| d.is(VID, PID)).collect();
    let mut actual: Vec<String> = targets.iter().map(|d| d.path.to_lowercase()).collect();
    actual.sort();
    let unique = expected.windows(2).all(|pair| pair[0] != pair[1]);
    let complete = !expected.is_empty()
        && present.len() <= MAX_PATHS
        && unique
        && actual == expected
        && targets.iter().all(|d| {
            d.a5v2_complete
                && d.product.trim() == "MCHOSE A5 V2 Ultra"
                && proof::is_usb_hid_path(&d.path, VID, PID)
        });
    let Some(parent) = targets.first().map(|d| d.physical_id.clone()) else {
        return;
    };
    let primary: Vec<&&DeviceInfo> = targets
        .iter()
        .filter(|d| d.is_collection(0xFF01, 0x0001))
        .collect();
    let [primary] = primary[..] else { return };
    let valid = complete
        && targets.iter().all(|d| d.physical_id == parent)
        && proof::is_usb_parent(&parent, VID, PID)
        && inventory
            .iter()
            .filter(|d| d.physical_id == parent)
            .all(|d| d.is(VID, PID));
    if !valid {
        return;
    }
    let attestation = A5v2Proof {
        paths: expected,
        parent,
        collection: primary.path.to_lowercase(),
    };
    for info in inventory.iter_mut().filter(|d| d.is(VID, PID)) {
        info.a5v2_topology = Some(attestation.clone());
    }
}

#[cfg(test)]
mod tests;
