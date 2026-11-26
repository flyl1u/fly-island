use super::*;
use crate::hid::fake::FakeBus;
use crate::hid::DeviceInfo;

fn info(path: &str, product_id: u16, usage_page: u16, usage: u16) -> DeviceInfo {
    DeviceInfo {
        path: path.into(),
        vendor_id: 0x046D,
        product_id,
        usage_page,
        usage,
        ..Default::default()
    }
}

const PATH: &str = r"\\?\hid#vid_046d&pid_c547&mi_02&col02#7&abc&0&0001#{guid}";
const SHORT_PATH: &str = r"\\?\hid#vid_046d&pid_c547&mi_02&col01#7&abc&0&0000#{guid}";

fn reply(slot: u8, feature: u8, function_byte: u8, data: &[u8]) -> Vec<u8> {
    let mut reply = vec![0x11, slot, feature, function_byte];
    reply.extend_from_slice(data);
    reply.resize(20, 0);
    reply
}

#[test]
fn collections_of_one_receiver_share_an_instance() {
    let infos = [
        info(SHORT_PATH, 0xC547, 0xFF00, 1),
        info(PATH, 0xC547, 0xFF00, 2),
    ];
    let refs: Vec<&DeviceInfo> = infos.iter().collect();
    let found = receivers(&refs);
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].instance, "7&abc&0");
    assert!(found[0].short.is_some() && found[0].long.is_some());
}

#[test]
fn only_listed_headsets_get_their_own_collection() {
    let infos = [
        info("headset", 0x0AC4, 0x000C, 1),
        info("consumer", 0xC547, 0x000C, 1),
        info("vendor", 0x0A87, 0xFF43, 0x0202),
    ];
    let refs: Vec<&DeviceInfo> = infos.iter().collect();
    let paths: Vec<&str> = receivers(&refs)
        .iter()
        .filter_map(|r| r.long.map(|d| d.path.as_str()))
        .collect();
    assert_eq!(paths, ["headset", "vendor"]);
}

#[test]
fn a_cabled_device_reads_the_unified_battery() {
    let bus = FakeBus::default();
    bus.script("cable", |s| {
        // ping, name index (none), information index (none), 1004 index, battery.
        s.on_write.insert(1, vec![reply(0xFF, 0, 0x1B, &[])]);
        s.on_write.insert(2, vec![reply(0xFF, 0, 0x0C, &[0])]);
        s.on_write.insert(3, vec![reply(0xFF, 0, 0x0D, &[0])]);
        s.on_write.insert(
            4,
            vec![
                // A late reply to another software ID is ignored.
                reply(0xFF, 0, 0x0A, &[9]),
                reply(0xFF, 0, 0x0E, &[6]),
            ],
        );
        s.on_write
            .insert(5, vec![reply(0xFF, 6, 0x1F, &[80, 8, 0])]);
    });
    let infos = [info("cable", 0xC09B, 0xFF00, 2)];
    let statuses = poll(&mut Context::new(&infos, &bus));
    assert_eq!(statuses.len(), 1);
    assert_eq!(statuses[0].key, "logitech:c09b:255");
    assert_eq!(statuses[0].name, "Logitech device");
    assert_eq!(statuses[0].level, Some(80));
    bus.inspect("cable", |s| assert_eq!(s.writes[0].len(), 20));
}

#[test]
fn an_old_device_is_read_through_registers() {
    let bus = FakeBus::default();
    bus.script("long", |s| {
        s.on_write
            .insert(1, vec![vec![0x10, 0xFF, 0x8F, 0, 0x1B, 0x01, 0]]);
    });
    bus.script("short", |s| {
        s.on_write
            .insert(1, vec![vec![0x10, 0xFF, 0x81, 0x0D, 60, 0, 0x30]]);
    });
    let infos = [
        info("short", 0xC09C, 0xFF00, 1),
        info("long", 0xC09C, 0xFF00, 2),
    ];
    let statuses = poll(&mut Context::new(&infos, &bus));
    assert_eq!(statuses[0].level, Some(60));
    bus.inspect("short", |s| {
        assert_eq!(s.writes, vec![vec![0x10, 0xFF, 0x81, 0x0D, 0, 0, 0]]);
    });
}
