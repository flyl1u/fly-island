use super::*;
use crate::hid::fake::FakeBus;

fn feature_reply(level: u8, charging: u8) -> Vec<u8> {
    let mut reply = vec![0u8; 65];
    reply[2..10].copy_from_slice(&[0xA1, 0, 0, 2, 0, 0x83, charging, level]);
    reply
}

fn info(path: &str, product_id: u16, product: &str) -> DeviceInfo {
    DeviceInfo {
        path: path.into(),
        vendor_id: 0x36A7,
        product_id,
        usage_page: 0xFFFF,
        product: product.into(),
        ..Default::default()
    }
}

#[test]
fn the_marker_is_required_before_the_values() {
    assert_eq!(parse_feature(&feature_reply(73, 1)), Some((73, true)));
    assert_eq!(parse_feature(&feature_reply(101, 0)), None);
    assert_eq!(parse_feature(&request()), None);
    assert_eq!(parse_feature(&[]), None);
    assert_eq!(parse_heartbeat(&[3, 0, 55, 0]), Some((55, false)));
    assert_eq!(parse_heartbeat(&[9, 3, 0, 55, 1]), Some((55, true)));
    assert_eq!(parse_heartbeat(&[3, 1, 55, 0]), None);
}

#[test]
fn a_charging_cable_wins_and_the_receiver_is_left_alone() {
    let bus = FakeBus::default();
    bus.script("cable", |s| s.features.push_back(feature_reply(40, 1)));
    bus.script("dongle", |_| {});
    let infos = [info("dongle", 0xA880, ""), info("cable", 0x1000, "Beast")];
    let statuses = poll(&mut Context::new(&infos, &bus));
    assert_eq!(statuses.len(), 1);
    assert_eq!(statuses[0].name, "WLmouse Beast");
    assert_eq!((statuses[0].level, statuses[0].charging), (Some(40), true));
    assert_eq!(bus.written_paths(), vec!["cable".to_string()]);
    assert_eq!(
        bus.inspect("cable", |s| s.sent_features.clone()),
        vec![request().to_vec()]
    );
}
