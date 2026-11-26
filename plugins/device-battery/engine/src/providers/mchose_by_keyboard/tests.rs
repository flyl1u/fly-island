use super::*;
use crate::hid::fake::FakeBus;

fn info(vendor_id: u16, product_id: u16) -> DeviceInfo {
    DeviceInfo {
        path: "by".into(),
        vendor_id,
        product_id,
        usage_page: PRIMARY.0,
        usage: PRIMARY.1,
        product: RECEIVER_NAMES[1].into(),
        physical_id: "pnp:by".into(),
        input_len: Some(20),
        output_len: Some(20),
        input_sizes: Some(Sizes::from([(0x13, 20)])),
        output_sizes: Some(Sizes::from([(0x13, 20)])),
        ..Default::default()
    }
}

fn reply(command: u8, data: &[u8]) -> Vec<u8> {
    let mut reply = vec![0x13, command, 1, 0, 0];
    reply.extend_from_slice(data);
    reply.resize(20, 0);
    reply
}

fn run(info: DeviceInfo, identity: &[u8], power: &[u8]) -> (Vec<Status>, usize) {
    let bus = FakeBus::default();
    bus.script("by", |s| {
        s.on_write.insert(1, vec![reply(0x05, identity)]);
        s.on_write.insert(2, vec![reply(0x4A, power)]);
    });
    let statuses = poll(&mut Context::new(&[info], &bus));
    (statuses, bus.inspect("by", |s| s.writes.len()))
}

#[test]
fn a_known_model_names_the_card_and_trusts_the_charge_nibble() {
    let (statuses, writes) = run(info(0x41E4, 0x2001), &[0x0A, 0, 0, 0, 0, 0x34], &[62, 0x10]);
    assert_eq!(statuses[0].name, "MCHOSE G87 V2");
    assert_eq!((statuses[0].level, statuses[0].charging), (Some(62), true));
    assert_eq!(statuses[0].charging_known, Some(true));
    assert_eq!(writes, 2);
}

#[test]
fn an_unknown_model_is_read_only_on_the_generic_receiver() {
    let unknown = [9, 9, 9, 9, 9, 9];
    let (statuses, writes) = run(info(0x41E4, 0x2001), &unknown, &[50, 0]);
    assert!(statuses.is_empty());
    assert_eq!(writes, 1);
    let (statuses, _) = run(info(GENERIC.0, GENERIC.1), &unknown, &[50, 0x10]);
    assert_eq!(statuses[0].charging_known, Some(false));
    assert!(!statuses[0].charging);
}

#[test]
fn zero_percent_and_unknown_flags_are_refused() {
    assert_eq!(parse_identified(&reply(0x4A, &[0, 0])), None);
    assert_eq!(parse_identified(&reply(0x4A, &[50, 0x02])), None);
    assert_eq!(parse_identified(&reply(0x4A, &[50, 0x20])), None);
    assert_eq!(
        parse_identified(&reply(0x4A, &[100, 0x11])),
        Some(Reading::exact(100, false))
    );
}

#[test]
fn a_foreign_product_string_sends_nothing() {
    let foreign = DeviceInfo {
        product: "USB Receiver".into(),
        ..info(0x41E4, 0x2001)
    };
    let (statuses, writes) = run(foreign, &[0; 6], &[50, 0]);
    assert!(statuses.is_empty());
    assert_eq!(writes, 0);
}
