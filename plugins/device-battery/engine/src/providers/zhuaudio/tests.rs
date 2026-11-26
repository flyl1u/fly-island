use super::frames::*;
use super::*;
use crate::hid::fake::FakeBus;
use crate::hid::Sizes;

fn padded(head: &[u8], length: usize) -> Vec<u8> {
    let mut data = head.to_vec();
    data.resize(length, 0);
    data
}

fn input(payload: &[u8]) -> Vec<u8> {
    let mut report = vec![0xCE];
    report.extend(padded(payload, 63));
    report
}

#[test]
fn the_documented_connection_reply_validates() {
    // The captured reply: 09 AA CC 00 02 C0 A0 02 01.
    let reply = padded(&[0x09, 0xAA, 0xCC, 0, 2, 0xC0, 0xA0, 2, 1], 63);
    assert_eq!(connection_reply(&reply), Some(true));
    let mut corrupt = reply.clone();
    corrupt[5] ^= 1;
    assert_eq!(connection_reply(&corrupt), None);
    let mut wrong_prefix = reply;
    wrong_prefix[0] = 8;
    assert_eq!(connection_reply(&wrong_prefix), None);
}

#[test]
fn battery_frames_need_the_sequence_and_a_real_percentage() {
    let frame = [0xFF, 1, 4, 7, 0x80 | 66, 0, 0, 0xAA];
    assert_eq!(battery_reply(&frame, 1), Some((66, true)));
    assert_eq!(battery_reply(&frame, 2), None);
    let wrapped = [0xFF, 1, 5, 0xFE, 7, 33, 0, 0, 0xAA];
    assert_eq!(battery_reply(&wrapped, 1), Some((33, false)));
    assert_eq!(battery_reply(&[0xFF, 1, 4, 7, 0, 0, 0, 0xAA], 1), None);
    assert_eq!(battery_reply(&[0xFF, 1, 1, 7, 0xAA], 1), None);
}

#[test]
fn split_frames_must_be_contiguous() {
    let part = padded(&[0xEE, 0x80, 0, 8, 0, 0xFF, 1, 4, 7, 50, 0, 0, 0xAA], 63);
    let mut assembler = Assembler::default();
    let frame = assembler.feed(&part).unwrap();
    assert_eq!(battery_reply(&frame, 1), Some((50, false)));
    assert!(assembler.feed(&part).is_none());
    let mut skipped = part;
    skipped[1] = 0x81;
    assert!(Assembler::default().feed(&skipped).is_none());
}

#[test]
fn the_battery_is_asked_only_after_a_connected_reply() {
    let info = DeviceInfo {
        path: "z".into(),
        vendor_id: 0x3654,
        product_id: 0x5055,
        usage_page: 0xFF05,
        usage: 1,
        interface_number: 4,
        product: NAME.into(),
        physical_id: "pnp:z".into(),
        input_len: Some(64),
        output_len: Some(64),
        input_sizes: Some(Sizes::from([(0xCE, 64)])),
        output_sizes: Some(Sizes::from([(0xCD, 64)])),
        input_proven_by: Some("caps"),
        output_proven_by: Some("caps"),
        ..Default::default()
    };
    let bus = FakeBus::default();
    bus.script("z", |s| {
        let connected = [0x09, 0xAA, 0xCC, 0, 2, 0xC0, 0xA0, 2, 1];
        s.on_write.insert(1, vec![input(&connected)]);
        s.on_write
            .insert(2, vec![input(&[0xFF, 1, 4, 7, 44, 0, 0, 0xAA])]);
    });
    let statuses = poll(&mut Context::new(&[info], &bus));
    assert_eq!(statuses[0].level, Some(44));
    let writes = bus.inspect("z", |s| s.writes.clone());
    assert_eq!(
        writes,
        vec![status_request().to_vec(), battery_request(1).to_vec()]
    );
}
