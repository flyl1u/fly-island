use super::*;
use crate::hid::fake::FakeBus;
use crate::hid::{DeviceInfo, Sizes};

fn info() -> DeviceInfo {
    DeviceInfo {
        path: "kb".into(),
        vendor_id: 0x320F,
        product_id: 0x5088,
        usage_page: 0xFF1C,
        usage: 0x0092,
        product: "VGN S99 2.4G".into(),
        physical_id: "pnp:a".into(),
        input_len: Some(64),
        output_len: Some(64),
        input_sizes: Some(Sizes::from([(4, 64)])),
        output_sizes: Some(Sizes::from([(4, 64)])),
        ..Default::default()
    }
}

fn reply(command: u8, level: u8) -> Vec<u8> {
    let mut reply = vec![0u8; 64];
    reply[0] = 4;
    reply[3] = command;
    reply[4] = 6;
    reply[8] = level;
    reply
}

#[test]
fn one_query_skips_the_echo_and_names_the_keyboard_from_the_receiver() {
    let bus = FakeBus::default();
    bus.script("kb", |s| {
        s.reads.extend([request().to_vec(), reply(0x1A, 63)])
    });
    let devices = [info()];
    let statuses = poll(&mut Context::new(&devices, &bus));
    assert_eq!(statuses.len(), 1);
    assert_eq!(statuses[0].level, Some(63));
    assert_eq!(statuses[0].name, "VGN S99 2.4G");
    assert_eq!(statuses[0].key, "vgn_keyboard:pnp:a");
    assert_eq!(statuses[0].charging_known, Some(false));
    assert_eq!(
        bus.inspect("kb", |s| s.writes.clone()),
        vec![request().to_vec()]
    );
}

#[test]
fn the_offline_reply_ends_the_read() {
    let bus = FakeBus::default();
    bus.script("kb", |s| s.reads.extend([reply(0xFF, 0), reply(0x1A, 63)]));
    assert!(poll(&mut Context::new(&[info()], &bus)).is_empty());
}

#[test]
fn nothing_is_sent_without_proof_a_single_collection_and_a_parent() {
    let unproven = DeviceInfo {
        output_sizes: None,
        ..info()
    };
    let orphan = DeviceInfo {
        physical_id: "collection:kb".into(),
        ..info()
    };
    for devices in [vec![unproven], vec![orphan], vec![info(), info()]] {
        let bus = FakeBus::default();
        bus.script("kb", |_| {});
        assert!(poll(&mut Context::new(&devices, &bus)).is_empty());
        assert!(bus.written_paths().is_empty());
    }
}
