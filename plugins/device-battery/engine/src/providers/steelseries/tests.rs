use super::*;
use crate::hid::fake::FakeBus;

fn info(path: &str, product_id: u16, usage_page: u16, interface_number: i32) -> DeviceInfo {
    DeviceInfo {
        path: path.into(),
        vendor_id: 0x1038,
        product_id,
        usage_page,
        usage: 1,
        interface_number,
        ..Default::default()
    }
}

#[test]
fn a_headset_reply_is_picked_out_of_other_reports() {
    let bus = FakeBus::default();
    bus.script("config", |s| {
        s.on_write
            .insert(1, vec![vec![1, 0, 0x63, 2], vec![0xB0, 3, 87, 3]]);
    });
    let infos = [
        info("other", 0x22A1, 0xFF00, 3),
        info("config", 0x22A1, 0xFFC0, 3),
        info("unlisted", 0x9999, 0xFFC0, 3),
    ];
    let statuses = poll(&mut Context::new(&infos, &bus));
    assert_eq!(statuses.len(), 1);
    assert_eq!(statuses[0].key, "steelseries:22a1");
    assert_eq!(statuses[0].level, Some(87));
    assert_eq!(bus.written_paths(), vec!["config".to_string()]);
}

#[test]
fn a_mouse_request_is_sent_as_64_bytes() {
    let bus = FakeBus::default();
    bus.script("mouse", |s| {
        s.on_write.insert(1, vec![vec![0xD2, 0x0B]]);
    });
    let infos = [info("mouse", 0x1838, 0xFFC0, 0)];
    let statuses = poll(&mut Context::new(&infos, &bus));
    assert_eq!(statuses[0].level, Some(50));
    assert_eq!(statuses[0].kind, "mouse");
    bus.inspect("mouse", |s| {
        assert_eq!(s.writes[0].len(), 64);
        assert_eq!(s.writes[0][..3], [0x00, 0xD2, 0x00]);
    });
}

#[test]
fn classic_models_need_their_interface_and_page() {
    let bus = FakeBus::default();
    bus.script("classic", |s| {
        s.on_write.insert(1, vec![vec![0x06, 0x12, 0, 64]]);
    });
    let infos = [
        info("wrong", 0x12B3, 0xFF00, 3),
        info("classic", 0x12B3, 0xFF43, 3),
    ];
    let statuses = poll(&mut Context::new(&infos, &bus));
    assert_eq!(statuses[0].name, "Arctis 1 Wireless");
    assert_eq!(statuses[0].level, Some(64));
    assert!(!statuses[0].approximate);
    assert_eq!(bus.written_paths(), vec!["classic".to_string()]);
}
