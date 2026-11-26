use super::*;
use crate::hid::caps::{ButtonCap, ValueCap};
use crate::hid::fake::FakeBus;
use crate::hid::Sizes;

const PATH: &str = r"\\?\hid#vid_24ae&pid_1417&mi_01&col05#7&1&0&0004#{guid}";

fn attributes(vendor_id: u16, product_id: u16) -> Attributes {
    Attributes {
        vendor_id,
        product_id,
        release_number: 0,
    }
}

fn value_arrays(usage_page: u16, usage: u16, entries: [Option<(u8, u16)>; 3]) -> Caps {
    let mut caps = Caps {
        usage_page,
        usage,
        ..Default::default()
    };
    for (kind, entry) in entries.into_iter().enumerate() {
        caps.buttons[kind] = Some(Vec::new());
        caps.values[kind] = Some(Vec::new());
        if let Some((report_id, length)) = entry {
            caps.lengths[kind] = length;
            caps.value_counts[kind] = 1;
            caps.values[kind] = Some(vec![ValueCap {
                report_id,
                bits: 8,
                count: length - 1,
                ..Default::default()
            }]);
        }
    }
    caps
}

fn strings(product: &str) -> [String; 3] {
    [product.into(), String::new(), String::new()]
}

#[test]
fn only_listed_identities_get_report_proofs() {
    let caps = value_arrays(0xFF1C, 0x0092, [Some((4, 64)), Some((4, 64)), None]);
    let bus = FakeBus::default();
    let known = describe(
        PATH,
        &attributes(0x320F, 0x5088),
        Some(&caps),
        strings("x"),
        &|_, _| false,
        &bus,
    );
    assert_eq!(known.input_sizes, Some(Sizes::from([(4, 64)])));
    assert_eq!(known.output_sizes, Some(Sizes::from([(4, 64)])));
    assert_eq!(known.interface_number, 1);
    let other = describe(
        PATH,
        &attributes(0x320F, 0x0001),
        Some(&caps),
        strings("x"),
        &|_, _| false,
        &bus,
    );
    assert_eq!(other.input_sizes, None);
    assert_eq!(other.input_len, Some(64));
}

#[test]
fn the_raw_descriptor_proves_a_size_caps_cannot_when_maxima_agree() {
    // Rapoo: two button caps make the caps proof fail.
    let mut caps = Caps {
        usage_page: 0xFF00,
        usage: 2,
        lengths: [19, 19, 0],
        button_counts: [2, 2, 0],
        ..Default::default()
    };
    caps.buttons = std::array::from_fn(|_| Some(vec![ButtonCap::default(); 2]));
    let descriptor = crate::hid::descriptor::tests::hex(
        "06 00 ff 09 02 a1 01 85 07 09 02 15 00 26 ff 00 75 08 95 12 81 00 \
         09 02 15 00 26 ff 00 75 08 95 12 91 00 c0",
    );
    let bus = FakeBus::default();
    bus.script(PATH, |s| s.descriptor = Some(descriptor));
    let proven = describe(
        PATH,
        &attributes(0x24AE, 0x1417),
        Some(&caps),
        strings("VT3S"),
        &|_, _| false,
        &bus,
    );
    assert_eq!(proven.input_sizes, Some(Sizes::from([(7, 19)])));
    assert_eq!(proven.input_proven_by, Some("descriptor"));
    assert!(bus.written_paths().is_empty());

    caps.lengths = [20, 19, 0];
    let refused = describe(
        PATH,
        &attributes(0x24AE, 0x1417),
        Some(&caps),
        strings("VT3S"),
        &|_, _| false,
        &bus,
    );
    assert_eq!(refused.input_sizes, None);
    assert_eq!(
        refused.descriptor_error,
        Some("collection maximum mismatch")
    );
}

#[test]
fn the_a5v2_attestation_needs_every_present_collection() {
    let path = |col: u8| format!(r"\\?\hid#vid_3837&pid_100c&mi_01&col0{col}#7&1&0&000{col}#{{g}}");
    let info = |col: u8, usage_page: u16| DeviceInfo {
        path: path(col),
        vendor_id: 0x3837,
        product_id: 0x100C,
        usage_page,
        usage: 1,
        product: "MCHOSE A5 V2 Ultra".into(),
        physical_id: r"pnp:usb\vid_3837&pid_100c\abc".into(),
        a5v2_complete: true,
        ..Default::default()
    };
    let mut inventory = vec![info(1, 0xFF01), info(2, 0x000C)];
    attest_a5v2(&mut inventory, &[path(1), path(2)]);
    let attested = inventory[0].a5v2_topology.clone().unwrap();
    assert_eq!(attested.collection, path(1));
    assert_eq!(attested.paths.len(), 2);

    let mut partial = vec![info(1, 0xFF01)];
    attest_a5v2(&mut partial, &[path(1), path(2)]);
    assert!(partial[0].a5v2_topology.is_none());
}

#[test]
fn omni_paths_must_name_interface_two_collection_three() {
    assert!(is_omni_collection(
        r"\\?\hid#vid_0b05&pid_1ace&mi_02&col03#7&1#{g}"
    ));
    assert!(!is_omni_collection(
        r"\\?\hid#vid_0b05&pid_1ace&mi_02&col031#7&1#{g}"
    ));
    assert!(!is_omni_collection(
        r"\\?\hid#vid_0b05&pid_1ace&mi_01&col03#7&1#{g}"
    ));
}
