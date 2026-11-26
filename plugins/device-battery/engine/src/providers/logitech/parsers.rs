//! Battery replies of HID++ 2.0 features and of the older HID++ 1.0 registers
//! (Logitech's documentation, Solaar and HeadsetControl).

pub(super) const UNIFIED_BATTERY: u16 = 0x1004;
pub(super) const BATTERY_STATUS: u16 = 0x1000;
pub(super) const BATTERY_VOLTAGE: u16 = 0x1001;
pub(super) const ADC_MEASUREMENT: u16 = 0x1F20;
/// The first one the device has is read.
pub(super) const BATTERY_FEATURES: [u16; 4] = [
    UNIFIED_BATTERY,
    BATTERY_STATUS,
    BATTERY_VOLTAGE,
    ADC_MEASUREMENT,
];

pub(super) const REGISTER_CHARGE: u8 = 0x0D;
pub(super) const REGISTER_STATUS: u8 = 0x07;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Battery {
    pub level: u8,
    /// On the charger, full or not.
    pub charging: bool,
    /// A level word or a voltage estimate rather than a percentage.
    pub approximate: bool,
}

fn exact(level: u8, charging: bool) -> Battery {
    Battery {
        level,
        charging,
        approximate: false,
    }
}

fn approximate(level: u8, charging: bool) -> Battery {
    Battery {
        approximate: true,
        ..exact(level, charging)
    }
}

fn percentage(raw: u8, charging: bool) -> Option<Battery> {
    (1..=100).contains(&raw).then(|| exact(raw, charging))
}

/// Solaar's Li-ion discharge curve, (mV, percent).
const VOLTAGE_CURVE: [(u16, u8); 13] = [
    (4186, 100),
    (4067, 90),
    (3989, 80),
    (3922, 70),
    (3859, 60),
    (3811, 50),
    (3778, 40),
    (3751, 30),
    (3717, 20),
    (3671, 10),
    (3646, 5),
    (3579, 2),
    (3500, 0),
];

fn voltage_to_percent(millivolts: u16) -> u8 {
    if millivolts >= VOLTAGE_CURVE[0].0 {
        return VOLTAGE_CURVE[0].1;
    }
    VOLTAGE_CURVE
        .windows(2)
        .find(|pair| millivolts >= pair[1].0)
        .map_or(0, |pair| {
            let ((high_mv, high), (low_mv, low)) = (pair[0], pair[1]);
            let slope = f64::from(high - low) / f64::from(high_mv - low_mv);
            (f64::from(low) + f64::from(millivolts - low_mv) * slope).round_ties_even() as u8
        })
}

/// The parameters of a battery feature reply. `None`: no valid reading (for the
/// headset measurement also: the headset is off).
pub(super) fn feature_reply(feature: u16, params: &[u8]) -> Option<Battery> {
    let &[first, second, third, ..] = params else {
        return None;
    };
    // 1 charging, 2 almost full, 3 full, 4 slow charging.
    let on_charger = matches!(third, 1..=4);
    match feature {
        UNIFIED_BATTERY if first == 0 => {
            // No percentage: the level flags give a rough one.
            let level = match second {
                8 => 90,
                4 => 50,
                2 => 20,
                1 => 5,
                _ => return None,
            };
            Some(approximate(level, on_charger))
        }
        UNIFIED_BATTERY | BATTERY_STATUS => percentage(first, on_charger),
        BATTERY_VOLTAGE | ADC_MEASUREMENT => {
            let millivolts = u16::from_be_bytes([first, second]);
            let adc = feature == ADC_MEASUREMENT;
            if (adc && third & 0x01 == 0) || millivolts < 2500 {
                return None;
            }
            let charging = third & if adc { 0x02 } else { 0x80 } != 0;
            Some(approximate(voltage_to_percent(millivolts), charging))
        }
        _ => None,
    }
}

/// The data of a HID++ 1.0 battery register, as Solaar reads it.
pub(super) fn register_reply(register: u8, params: &[u8]) -> Option<Battery> {
    let &[first, second, third, ..] = params else {
        return None;
    };
    match register {
        REGISTER_CHARGE => percentage(first, matches!(third & 0xF0, 0x50 | 0x90)),
        REGISTER_STATUS => {
            let level = match first {
                7 => 90,
                5 => 50,
                3 => 20,
                1 => 5,
                _ => return None,
            };
            let charging = second & 0x21 == 0x21 || second & 0x22 == 0x22;
            Some(approximate(level, charging))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(feature: u16, params: [u8; 3]) -> Option<(u8, bool, bool)> {
        feature_reply(feature, &params).map(|b| (b.level, b.charging, b.approximate))
    }

    #[test]
    fn percentages_and_level_flags() {
        assert_eq!(read(UNIFIED_BATTERY, [80, 8, 0]), Some((80, false, false)));
        assert_eq!(read(UNIFIED_BATTERY, [0, 4, 3]), Some((50, true, true)));
        assert_eq!(read(UNIFIED_BATTERY, [0, 0, 0]), None);
        assert_eq!(read(UNIFIED_BATTERY, [101, 0, 0]), None);
        assert_eq!(read(BATTERY_STATUS, [55, 50, 1]), Some((55, true, false)));
        assert_eq!(read(BATTERY_STATUS, [0, 0, 0]), None);
    }

    #[test]
    fn voltages_follow_the_curve() {
        assert_eq!(voltage_to_percent(4200), 100);
        assert_eq!(voltage_to_percent(3811), 50);
        assert_eq!(voltage_to_percent(3400), 0);
        let [high, low] = 3989u16.to_be_bytes();
        assert_eq!(
            read(BATTERY_VOLTAGE, [high, low, 0x80]),
            Some((80, true, true))
        );
        assert_eq!(
            read(ADC_MEASUREMENT, [high, low, 0x01]),
            Some((80, false, true))
        );
        assert_eq!(read(ADC_MEASUREMENT, [high, low, 0x02]), None);
        assert_eq!(read(BATTERY_VOLTAGE, [0, 100, 0]), None);
    }

    #[test]
    fn registers() {
        let level = |register, params: [u8; 3]| {
            register_reply(register, &params).map(|b| (b.level, b.charging, b.approximate))
        };
        assert_eq!(
            level(REGISTER_CHARGE, [70, 0, 0x50]),
            Some((70, true, false))
        );
        assert_eq!(
            level(REGISTER_CHARGE, [70, 0, 0x30]),
            Some((70, false, false))
        );
        assert_eq!(level(REGISTER_STATUS, [5, 0x25, 0]), Some((50, true, true)));
        assert_eq!(level(REGISTER_STATUS, [0, 0x21, 0]), None);
    }
}
