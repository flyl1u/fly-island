//! Devices that declare a standard HID battery usage (Generic Device Controls 0x20
//! or Battery System 0x64) as a feature value. Only that report is fetched.
use super::context::Context;
use crate::hid::caps::{Caps, ValueCap, FEATURE};
use crate::status::Status;
use crate::win32::hid_meta::MetaDevice;

/// The battery usage this capability declares, if it covers one.
fn battery_usage(cap: &ValueCap) -> Option<u16> {
    let usage = match cap.usage_page {
        0x06 => 0x20,
        0x85 => 0x64,
        _ => return None,
    };
    let covers = if cap.is_range {
        (cap.usage_min..=cap.usage_max).contains(&usage)
    } else {
        cap.usage_min == usage
    };
    (covers && cap.bits <= 32 && cap.count >= 1).then_some(usage)
}

/// The value scaled to 0..=100 inside the declared logical range.
fn percent(value: u32, low: i32, high: i32) -> Option<u8> {
    let (value, low, high) = (i64::from(value), i64::from(low), i64::from(high));
    if low < 0 || high <= low || high > 65535 || !(low..=high).contains(&value) {
        return None;
    }
    let scaled = (value - low) as f64 * 100.0 / (high - low) as f64;
    u8::try_from(scaled.round_ties_even() as i64).ok()
}

/// Only collections with a small, complete list of feature values are inspected.
fn inspectable(caps: &Caps) -> bool {
    (1..=128).contains(&caps.value_counts[FEATURE]) && (2..=4096).contains(&caps.lengths[FEATURE])
}

fn read(path: &str, product: &str) -> Option<Status> {
    let mut device = MetaDevice::open(path)?;
    let caps = device.caps().filter(inspectable)?;
    let length = usize::from(caps.lengths[FEATURE]);
    let (level, span) = caps.values[FEATURE].as_ref()?.iter().find_map(|field| {
        let usage = battery_usage(field)?;
        let value = device.feature_usage_value(
            field.report_id,
            length,
            field.usage_page,
            field.link,
            usage,
        )?;
        let level = percent(value, field.logical_min, field.logical_max)?;
        Some((level, field.logical_max - field.logical_min))
    })?;
    let kind = match (caps.usage_page, caps.usage) {
        (1, 6) => "keyboard",
        (1, 2) => "mouse",
        _ => "",
    };
    let name = if product.is_empty() {
        "Wireless HID device"
    } else {
        product
    };
    Some(Status {
        approximate: span < 100,
        charging_known: Some(false),
        ..Status::new(format!("standard:{path}"), name, Some(level), false, kind)
    })
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    context
        .devices
        .iter()
        .filter_map(|info| read(&info.path, &info.product))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cap(usage_page: u16, usage_min: u16, usage_max: u16) -> ValueCap {
        ValueCap {
            usage_page,
            usage_min,
            usage_max,
            is_range: usage_min != usage_max,
            bits: 8,
            count: 1,
            ..Default::default()
        }
    }

    #[test]
    fn only_the_two_battery_usages_count() {
        assert_eq!(battery_usage(&cap(0x06, 0x20, 0x20)), Some(0x20));
        assert_eq!(battery_usage(&cap(0x85, 0x60, 0x70)), Some(0x64));
        assert_eq!(battery_usage(&cap(0x06, 0x21, 0x21)), None);
        assert_eq!(battery_usage(&cap(0x01, 0x20, 0x20)), None);
        let wide = ValueCap {
            bits: 33,
            ..cap(0x06, 0x20, 0x20)
        };
        assert_eq!(battery_usage(&wide), None);
    }

    #[test]
    fn values_scale_inside_a_sane_logical_range() {
        assert_eq!(percent(50, 0, 100), Some(50));
        assert_eq!(percent(2, 0, 4), Some(50));
        assert_eq!(percent(255, 0, 255), Some(100));
        assert_eq!(percent(101, 0, 100), None);
        assert_eq!(percent(0, -1, 100), None);
        assert_eq!(percent(0, 5, 5), None);
        assert_eq!(percent(1, 0, 70000), None);
    }
}
