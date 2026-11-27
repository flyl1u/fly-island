use super::protocol::tests::reply;
use super::protocol::{BATTERY_LEVEL, CHARGING, STATUS_OK};
use super::*;
use crate::hid::fake::FakeBus;

fn info(path: &str, product_id: u16, serial: &str, product: &str) -> DeviceInfo {
    DeviceInfo {
        path: path.into(),
        vendor_id: 0x1532,
        product_id,
        serial: serial.into(),
        product: product.into(),
        usage_page: 1,
        usage: 2,
        ..Default::default()
    }
}

#[test]
fn a_listed_mouse_reports_level_and_charging() {
    let bus = FakeBus::default();
    bus.script("mouse", |s| {
        s.features.extend([
            reply(STATUS_OK, BATTERY_LEVEL, 204),
            reply(STATUS_OK, CHARGING, 1),
        ]);
    });
    let infos = [info("mouse", 0x00B7, "S1", "")];
    let mut context = Context::new(&infos, &bus);
    let statuses = poll(&mut context);
    assert_eq!(statuses[0].key, "razer:00b7:S1");
    assert_eq!(statuses[0].name, "Razer DeathAdder V3 Pro");
    assert_eq!((statuses[0].level, statuses[0].charging), (Some(80), true));
    assert_eq!(context.failure, None);
    bus.inspect("mouse", |s| assert_eq!(s.sent_features[0][2], 0x1F));
}

#[test]
fn an_unanswered_charging_query_is_unknown() {
    let bus = FakeBus::default();
    bus.script("mouse", |s| {
        s.features.push_back(reply(STATUS_OK, BATTERY_LEVEL, 255));
    });
    let infos = [info("mouse", 0x00B7, "", "")];
    let statuses = poll(&mut Context::new(&infos, &bus));
    assert_eq!(statuses[0].level, Some(100));
    assert_eq!(statuses[0].charging_known, Some(false));
}

#[test]
fn a_sleeping_device_gives_a_failure_code_and_no_card() {
    let bus = FakeBus::default();
    bus.script("mouse", |s| {
        s.features
            .push_back(reply(STATUS_TIMEOUT, BATTERY_LEVEL, 0));
    });
    let infos = [info("mouse", 0x00B7, "", "")];
    let mut context = Context::new(&infos, &bus);
    assert!(poll(&mut context).is_empty());
    assert_eq!(context.failure.as_deref(), Some("razer_device_timeout_04"));
}

#[test]
fn cables_barracuda_and_wired_devices_are_left_alone() {
    let bus = FakeBus::default();
    for path in ["cable", "barracuda", "wired"] {
        bus.script(path, |_| {});
    }
    let infos = [
        info("cable", 0x052E, "", "Razer BlackShark"),
        info("barracuda", BARRACUDA_PRO, "", "Razer Barracuda Pro"),
        info("wired", 0x0999, "", "Razer Huntsman V2"),
    ];
    let mut context = Context::new(&infos, &bus);
    assert!(poll(&mut context).is_empty());
    assert_eq!(context.failure, None);
    assert!(bus.written_paths().is_empty());
}

#[test]
fn virtual_children_join_the_one_named_device() {
    let infos = [
        info("child", 0x00B7, "", ""),
        info("real", 0x00B7, "S1", ""),
        info("other", 0x00A5, "", ""),
    ];
    let refs: Vec<&DeviceInfo> = infos.iter().collect();
    let found = groups(&refs);
    let sizes: Vec<_> = found.iter().map(|(key, list)| (*key, list.len())).collect();
    assert_eq!(sizes, [((0x00B7, "S1"), 2), ((0x00A5, ""), 1)]);
}

#[test]
fn failure_codes_match_the_reader_health_vocabulary() {
    assert_eq!(Failure::ReplyStatus(5).code(), "razer_reply_status_05");
    assert!(Failure::ForeignReply > Failure::DeviceTimeout);
    assert!(Failure::DeviceTimeout > Failure::ReplyStatus(0xFF));
    assert!(Failure::ReplyStatus(0) > Failure::ShortReply);
}
