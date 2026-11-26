use super::*;
use crate::hid::fake::FakeBus;

fn info(path: &str, product_id: u16, collection: (u16, u16), release: u16) -> DeviceInfo {
    DeviceInfo {
        path: path.into(),
        vendor_id: 0x1D57,
        product_id,
        usage_page: collection.0,
        usage: collection.1,
        release_number: release,
        physical_id: "pnp:f".into(),
        input_len: Some(8),
        input_sizes: Some(Sizes::from([(INPUT_ID, 8)])),
        ..Default::default()
    }
}

#[test]
fn each_route_has_its_own_model_rules() {
    let web = Route::Web(0xFA60);
    assert_eq!(parse(&[3, 0x07, 0x40, 9, 55], web), Some(55));
    assert_eq!(parse(&[3, 0x71, 0x40, 0, 55], web), None);
    assert_eq!(parse(&[3, 0x07, 0x42, 0, 55], web), None);
    assert_eq!(parse(&[3, 0x07, 0x40, 0, 0], web), None);
    assert_eq!(parse(&[3, 0x8E, 0x41, 1, 55], web), None);
    assert_eq!(parse(&[3, 0x93, 0x40, 1, 55], Route::Legacy), Some(55));
    assert_eq!(parse(&[3, 0x93, 0x40, 2, 55], Route::Legacy), None);
    let frame = [3, 0x8E, 0x40, 1, 80];
    assert_eq!(parse(&frame, Route::Unnumbered), Some(80));
}

#[test]
fn the_newest_queued_value_wins_and_nothing_is_sent() {
    let bus = FakeBus::default();
    bus.script("a", |s| {
        s.reads.push_back(vec![3, 0x07, 0x40, 0, 51, 0, 0, 0]);
        s.reads.push_back(vec![3, 0x07, 0x40, 0, 52, 0, 0, 0]);
    });
    let infos = [info("a", 0xFA60, (0x000A, 0), 0x0100)];
    let statuses = poll(&mut Context::new(&infos, &bus));
    assert_eq!(statuses[0].level, Some(52));
    assert_eq!(statuses[0].charging_known, Some(false));
    assert!(bus.written_paths().is_empty());
}

#[test]
fn legacy_firmware_needs_both_collections() {
    let alone = [info("s", 0xFA65, (0x000A, 0), 0x0116)];
    let refs: Vec<&DeviceInfo> = alone.iter().collect();
    assert!(select(&refs).is_none());
    let pair = [
        info("s", 0xFA65, (0x000A, 0), 0x0116),
        info("c", 0xFA65, (0xFF00, 1), 0x0116),
    ];
    let refs: Vec<&DeviceInfo> = pair.iter().collect();
    assert_eq!(
        select(&refs).map(|(d, route)| (d.path.as_str(), route)),
        Some(("s", Route::Legacy))
    );
}
