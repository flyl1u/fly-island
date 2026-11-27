use super::*;
use crate::hid::fake::FakeBus;

#[test]
fn a_reply_without_a_reading_yet_is_unknown() {
    assert_eq!(parse_battery(&[0x66, 0x89, 1, 0, 76]), Some(76));
    assert_eq!(parse_battery(&[0x66, 0x0D, 0, 1, 76]), Some(76));
    assert_eq!(parse_battery(&[0x66, 0x89, 0, 0, 76]), None);
    assert_eq!(parse_battery(&[0x66, 0x89, 1, 0, 101]), None);
    assert_eq!(parse_charging(&[0x66, 0x0C, 2]), Some(true));
    assert_eq!(parse_charging(&[0x66, 0x8A, 9]), None);
    assert_eq!(parse_charging(&[0x66, 0x89, 1]), None);
}

#[test]
fn the_feature_fallback_needs_the_incorrect_function_error() {
    let info = DeviceInfo {
        path: "c".into(),
        vendor_id: 0x03F0,
        product_id: 0x0C9D,
        usage_page: 0xFF13,
        usage: 1,
        ..Default::default()
    };
    let bus = FakeBus::default();
    bus.script("c", |s| {
        s.write_error = Some("函数不正确。 (0x80070001)".into());
        s.reads.push_back(vec![0x66, 0x89, 1, 0, 33]);
    });
    let statuses = poll(&mut Context::new(std::slice::from_ref(&info), &bus));
    assert_eq!(statuses[0].key, "hyperx:05b7");
    assert_eq!(statuses[0].charging_known, Some(false));
    assert_eq!(bus.inspect("c", |s| s.sent_features.len()), 2);

    bus.script("c", |s| {
        s.write_error = Some("access denied".into());
        s.sent_features.clear();
    });
    assert!(poll(&mut Context::new(&[info], &bus)).is_empty());
    assert!(bus.inspect("c", |s| s.sent_features.is_empty()));
}
