use super::*;
use crate::hid::fake::FakeBus;

fn info(path: &str, vendor_id: u16, product_id: u16, page: u16) -> DeviceInfo {
    DeviceInfo {
        path: path.into(),
        vendor_id,
        product_id,
        usage_page: page,
        usage: 2,
        physical_id: "pnp:p".into(),
        output_len: Some(FRAME_BYTES),
        ..Default::default()
    }
}

fn reply(level: u8) -> Vec<u8> {
    let mut reply = power_request();
    reply[6] = level;
    reply[16] = compx::checksum(&reply[..16]);
    reply.to_vec()
}

#[test]
fn strict_identities_need_the_vendor_collection() {
    let bus = FakeBus::default();
    bus.script("other", |_| {});
    let other = [info("other", 0x3554, 0xF505, 0xFF00)];
    assert!(poll(&mut Context::new(&other, &bus)).is_empty());
    assert!(bus.written_paths().is_empty());

    bus.script("control", |s| {
        s.on_write.insert(1, vec![reply(66)]);
    });
    let control = [info("control", 0x3554, 0xF505, 0xFF02)];
    let statuses = poll(&mut Context::new(&control, &bus));
    assert_eq!(statuses[0].key, "pulsar:3554f505");
    assert_eq!(statuses[0].name, "VGN Dragonfly 4K Receiver");
    assert_eq!(statuses[0].level, Some(66));
}

#[test]
fn unknown_atk_ids_follow_the_listed_ones_and_headsets_are_excluded() {
    let infos = [
        info("a", ATK_VENDOR, 0x2222, 0xFF02),
        info("b", ATK_VENDOR, 0x1204, 0xFF02),
        info("c", ATK_VENDOR, nano::PRODUCT_ID, 0xFF02),
    ];
    let refs: Vec<&DeviceInfo> = infos.iter().collect();
    assert_eq!(candidates(ATK_VENDOR, &refs), vec![0x1085, 0x2222]);
}
