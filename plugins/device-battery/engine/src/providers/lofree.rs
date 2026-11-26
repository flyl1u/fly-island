//! Lofree Hyzen over its 2.4G dongle: the web driver's report 04 transaction
//! (start, command, end). Nothing is read while the cable PID is also present.
use super::context::Context;
use crate::hid::{HidDevice, HidResult};
use crate::status::Status;
use std::time::{Duration, Instant};

pub(crate) const VENDORS: &[u16] = &[0x388D];

const DONGLE: u16 = 0x0025;
const WIRED: u16 = 0x0024;
const REPORT_ID: u8 = 0x04;
/// Report ID plus 31 bytes on the dongle.
const FRAME_BYTES: usize = 32;
const START: u8 = 0x01;
const END: u8 = 0x02;
const ONLINE: u8 = 0xAA;
const BATTERY: u8 = 0x1A;
/// The answer's first data byte, counted after the report ID.
const DATA_AT: usize = 7;
/// The web driver's minimum transaction timeout.
const TIMEOUT: Duration = Duration::from_secs(3);

fn frame(byte: u8) -> [u8; FRAME_BYTES] {
    let mut frame = [0; FRAME_BYTES];
    frame[0] = REPORT_ID;
    frame[3] = byte;
    frame
}

/// Reads report 04 until `want` accepts its payload or the deadline passes.
fn wait(
    device: &mut dyn HidDevice,
    deadline: Instant,
    want: impl Fn(&[u8]) -> bool,
) -> HidResult<Option<Vec<u8>>> {
    while Instant::now() < deadline {
        let report = device.read(64, Duration::from_millis(100))?;
        if report.len() >= 2 && report[0] == REPORT_ID && want(&report[1..]) {
            return Ok(Some(report[1..].to_vec()));
        }
    }
    Ok(None)
}

fn command(device: &mut dyn HidDevice, command: u8) -> HidResult<Option<u8>> {
    let deadline = Instant::now() + TIMEOUT;
    let marker = |expected: u8| move |p: &[u8]| p.len() >= 3 && p[2] == expected;
    device.write(&frame(START))?;
    if wait(device, deadline, marker(START))?.is_none() {
        return Ok(None);
    }
    device.write(&frame(command))?;
    let answer = wait(device, deadline, |p| {
        p.len() > DATA_AT && (p[2] == command || p[2] == 0) && p[4] == 0 && p[5] == 0
    })?;
    device.write(&frame(END))?;
    let closing = deadline.min(Instant::now() + Duration::from_millis(500));
    wait(device, closing, marker(END))?;
    Ok(answer.map(|p| p[DATA_AT]))
}

fn read(device: &mut dyn HidDevice) -> HidResult<Option<u8>> {
    // An offline keyboard is not asked for its battery.
    if command(device, ONLINE)?.is_none_or(|online| online == 0) {
        return Ok(None);
    }
    Ok(command(device, BATTERY)?.filter(|&level| level <= 100))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let infos = context.vendor(0x388D);
    if infos.iter().any(|d| d.product_id == WIRED) {
        return Vec::new();
    }
    let mut result = Vec::new();
    for info in infos {
        if info.product_id != DONGLE || !info.is_collection(0xFF1C, 0x0092) {
            continue;
        }
        let product = info.product.split('@').next().unwrap_or("").trim();
        let name = if product.is_empty() {
            "Lofree Hyzen".to_string()
        } else {
            format!("Lofree {product}")
        };
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        if let Ok(Some(level)) = read(device.as_mut()) {
            result.push(Status::new(
                format!("lofree:{DONGLE:04x}"),
                name,
                Some(level),
                false,
                "keyboard",
            ));
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::fake::FakeBus;
    use crate::hid::DeviceInfo;

    fn info(product_id: u16) -> DeviceInfo {
        DeviceInfo {
            path: format!("p{product_id}"),
            vendor_id: 0x388D,
            product_id,
            usage_page: 0xFF1C,
            usage: 0x0092,
            product: "Hyzen@2.4G".into(),
            ..Default::default()
        }
    }

    fn answer(command: u8, value: u8) -> Vec<u8> {
        let mut report = vec![0u8; FRAME_BYTES];
        report[0] = REPORT_ID;
        report[3] = command;
        report[1 + DATA_AT] = value;
        report
    }

    #[test]
    fn online_then_battery_each_in_its_own_transaction() {
        let bus = FakeBus::default();
        bus.script("p37", |s| {
            for (first, command, value) in [(1, ONLINE, 1), (4, BATTERY, 77)] {
                s.on_write.insert(first, vec![answer(START, 0)]);
                s.on_write.insert(first + 1, vec![answer(command, value)]);
                s.on_write.insert(first + 2, vec![answer(END, 0)]);
            }
        });
        let statuses = poll(&mut Context::new(&[info(DONGLE)], &bus));
        assert_eq!(statuses[0].level, Some(77));
        assert_eq!(statuses[0].name, "Lofree Hyzen");
        assert_eq!(bus.inspect("p37", |s| s.writes.len()), 6);
    }

    #[test]
    fn the_cable_blocks_the_dongle_read() {
        let bus = FakeBus::default();
        bus.script("p37", |_| {});
        let infos = [info(DONGLE), info(WIRED)];
        assert!(poll(&mut Context::new(&infos, &bus)).is_empty());
        assert!(bus.written_paths().is_empty());
    }
}
