use super::*;
use crate::hid::fake::FakeBus;

/// An input report whose length byte covers `payload` after the flags byte.
fn report(payload: &[u8]) -> Vec<u8> {
    frame(payload).to_vec()
}

fn bridge_event(bridge: u8, sub: u8, function: u8, data: &[u8]) -> Vec<u8> {
    let mut payload = vec![bridge, BRIDGE_SEND, 0, 0, 0, sub, function_id(function)];
    payload.extend_from_slice(data);
    report(&payload)
}

#[test]
fn request_frames_carry_their_lengths() {
    let direct = direct_frame(0, 0x00, &FEATURE_SET);
    assert_eq!(&direct[..7], &[0x51, 5, 0, 0, 1, 0, 1]);
    let bridged = bridge_frame(3, 2, 0x10, &[7]);
    assert_eq!(
        &bridged[..12],
        &[0x51, 9, 0, 3, 0x11, 0, 4, 0, 2, 0x11, 7, 0]
    );
}

#[test]
fn the_battery_feature_is_discovered_then_read() {
    let info = DeviceInfo {
        path: "c".into(),
        vendor_id: 0x046D,
        product_id: PRODUCT_ID,
        usage_page: 0xFFA0,
        usage: 1,
        ..Default::default()
    };
    let bus = FakeBus::default();
    bus.script("c", |s| {
        let replies = [
            report(&[0, 0x01, 1]),
            report(&[1, 0x01, 1]),
            report(&[1, 0x11, 0, 0x00, 0x03]),
            bridge_event(0, 0, 0x00, &[1]),
            bridge_event(0, 1, 0x00, &[1]),
            bridge_event(0, 1, 0x10, &[0, 0x01, 0x04]),
            bridge_event(0, 0, 0x00, &[58, 0, 1]),
        ];
        for (index, reply) in replies.into_iter().enumerate() {
            s.on_write.insert(index + 1, vec![reply]);
        }
    });
    let statuses = poll(&mut Context::new(&[info], &bus));
    assert_eq!((statuses[0].level, statuses[0].charging), (Some(58), true));
    assert_eq!(statuses[0].source, "logitech");
    assert_eq!(bus.inspect("c", |s| s.writes.len()), 7);
}

#[test]
fn the_legacy_report_has_fixed_offsets() {
    let mut reply = [0u8; 13];
    reply[..2].copy_from_slice(&[0x51, 0x0B]);
    reply[8] = 4;
    reply[10] = 90;
    reply[12] = 2;
    assert_eq!(parse_legacy(&reply), Some((90, true)));
    reply[10] = 101;
    assert_eq!(parse_legacy(&reply), None);
    assert_eq!(parse_battery(&[101]), None);
    assert_eq!(parse_battery(&[40, 0, 9]), Some((40, false)));
}
