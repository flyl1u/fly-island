use super::*;
use crate::hid::fake::FakeBus;

fn info(path: &str, vendor_id: u16, product_id: u16, usage_page: u16) -> DeviceInfo {
    DeviceInfo {
        path: path.into(),
        vendor_id,
        product_id,
        usage_page,
        usage: 1,
        physical_id: "pnp:p".into(),
        ..Default::default()
    }
}

#[test]
fn the_measured_receiver_reads_the_inverted_status() {
    let bus = FakeBus::default();
    bus.script("config", |s| {
        s.features
            .push_back(legacy::tests::status_reply(55, 0, 0x31));
    });
    let infos = [info("config", 0x5253, 0x1020, CONFIG_PAGE)];
    let statuses = poll(&mut Context::new(&infos, &bus));
    assert_eq!(statuses.len(), 1);
    assert_eq!(statuses[0].key, "mchose");
    assert_eq!(statuses[0].name, "MCHOSE M7 Ultra");
    assert_eq!(statuses[0].level, Some(55));
}

#[test]
fn unlisted_ids_and_other_collections_are_never_opened() {
    let bus = FakeBus::default();
    let infos = [
        info("a", 0xA8A5, 0x1111, CONFIG_PAGE),
        info("b", A5_VID, 0xF001, A5_USAGE_PAGE),
        info("c", MCHOSE_VID, 0x600A, CONFIG_PAGE),
        info("d", MCHOSE_VID, 0x2000, 0x000C),
        // No FF01 or FF0B collection that proves report 4D.
        info("e", MCHOSE_VID, 0x1014, CONFIG_PAGE),
        // No topology proof.
        info("f", a5v2::IDENTITY.0, a5v2::IDENTITY.1, CONFIG_PAGE),
    ];
    assert!(poll(&mut Context::new(&infos, &bus)).is_empty());
    assert!(bus.written_paths().is_empty());
}

#[test]
fn keys_separate_vendors_and_exact_receivers() {
    assert_eq!(device_key(0x5253, 0x1), "mchose");
    assert_eq!(device_key(0xA8A5, 0x2255), "mchose:a8a5");
    assert_eq!(device_key(0x3837, 0x1018), "mchose:3837:1018");
    assert_eq!(device_key(0x3837, 0x100C), "mchose:3837:100c");
}
