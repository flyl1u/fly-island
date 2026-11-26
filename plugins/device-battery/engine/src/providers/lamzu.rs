//! LAMZU Maya X: the WLmouse feature request, only on interface 2 / usage page FFFF.
use super::context::{sleep, Context};
use super::wlmouse::{parse_feature, request};
use crate::hid::{DeviceInfo, HidResult};
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x373E];

const NAME: &str = "LAMZU Maya X";
/// The cable first, then the dongle.
const PRODUCTS: [u16; 2] = [0x001C, 0x001E];

fn read(context: &Context, info: &DeviceInfo) -> HidResult<Option<(u8, bool)>> {
    let mut device = context.open(info)?;
    device.send_feature(&request())?;
    for _ in 0..10 {
        sleep(50);
        let reply = device.get_feature(0, 65).ok();
        if let Some(reading) = reply.and_then(|r| parse_feature(&r)) {
            return Ok(Some(reading));
        }
    }
    Ok(None)
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    for product_id in PRODUCTS {
        let candidate = context.vendor(0x373E).into_iter().find(|d| {
            d.product_id == product_id && d.interface_number == 2 && d.usage_page == 0xFFFF
        });
        let Some(info) = candidate else {
            continue;
        };
        if let Ok(Some((level, charging))) = read(context, info) {
            return vec![Status::new("lamzu", NAME, Some(level), charging, "mouse")];
        }
    }
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::fake::FakeBus;

    #[test]
    fn nothing_is_sent_outside_the_vendor_collection() {
        let wrong = DeviceInfo {
            path: "l".into(),
            vendor_id: 0x373E,
            product_id: 0x001E,
            interface_number: 1,
            usage_page: 0xFFFF,
            ..Default::default()
        };
        let bus = FakeBus::default();
        bus.script("l", |_| {});
        assert!(poll(&mut Context::new(&[wrong], &bus)).is_empty());
        assert!(bus.written_paths().is_empty());
    }
}
