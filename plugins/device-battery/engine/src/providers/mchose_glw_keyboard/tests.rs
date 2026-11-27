use super::*;
use crate::hid::fake::FakeBus;
use crate::hid::DeviceInfo;

fn info() -> DeviceInfo {
    DeviceInfo {
        path: "g87".into(),
        vendor_id: 0x3837,
        product_id: 0x3033,
        usage_page: 1,
        usage: 0,
        product: "MCHOSE G87 V2 2.4G".into(),
        physical_id: "pnp:g".into(),
        input_len: Some(65),
        output_len: Some(65),
        input_ids: Some(vec![0]),
        output_ids: Some(vec![0]),
        ..Default::default()
    }
}

fn reply(step: Read, data: &[u8]) -> Vec<u8> {
    let [low, high] = step.offset.to_le_bytes();
    let mut reply = vec![0xAA, step.command, 0, 0, step.length, low, high, 0];
    reply.extend_from_slice(data);
    reply.resize(64, 0);
    reply
}

#[test]
fn the_active_profile_page_holds_the_battery_byte() {
    let mut base = [0u8; 56];
    base[..6].copy_from_slice(&[1, 0, 3, 2, 1, 0]); // active slot 1 -> profile 2
    let first = Read {
        command: 5,
        offset: 128,
        length: 56,
    };
    let tail = Read {
        command: 5,
        offset: 184,
        length: 8,
    };
    let mut page = [0u8; 56];
    page[32] = 0x80 | 73;
    let bus = FakeBus::default();
    bus.script("g87", |s| {
        s.on_write.insert(1, vec![reply(Read::BASE, &base)]);
        s.on_write.insert(2, vec![reply(first, &page)]);
        s.on_write.insert(3, vec![reply(tail, &[0; 8])]);
    });
    let statuses = poll(&mut Context::new(&[info()], &bus));
    assert_eq!((statuses[0].level, statuses[0].charging), (Some(73), true));
    let writes = bus.inspect("g87", |s| s.writes.clone());
    assert_eq!(writes.len(), 3);
    assert!(writes.iter().all(|w| w.len() == 65 && w[..2] == [0, 0x55]));
    assert_eq!(&writes[2][1..8], &[0x55, 5, 0, 8 + 184, 8, 184, 0]);
}

#[test]
fn profiles_outside_the_table_are_refused() {
    let mut data = [0u8; 56];
    data[0] = 4;
    assert_eq!(active_profile(&data), None);
    data[0] = 3; // legacy direct index: slots are not a permutation
    assert_eq!(active_profile(&data), Some(3));
    assert_eq!(active_profile(&data[..55]), None);
    assert_eq!(battery(&[101; 64]), None);
}

#[test]
fn ambiguous_report_ids_send_nothing() {
    let bus = FakeBus::default();
    bus.script("g87", |_| {});
    let ambiguous = DeviceInfo {
        input_ids: Some(vec![0, 1]),
        ..info()
    };
    assert!(poll(&mut Context::new(&[ambiguous], &bus)).is_empty());
    assert!(bus.written_paths().is_empty());
}
