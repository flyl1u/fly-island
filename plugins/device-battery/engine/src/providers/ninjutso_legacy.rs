//! Ninjutso Sora V2, legacy firmware: read the active profile (Feature 05), then
//! that profile's settings page (Feature 04), which ends in a 16-bit sum.
use super::battery_query::{Query, Reading, READ_TIMEOUT};
use super::context::{only, proven_groups, sleep, Context};
use crate::hid::{DeviceInfo, HidDevice, HidResult};
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x1915];

const NAME: &str = "Ninjutso Sora V2";
const PROFILE_BYTES: usize = 32;
const SETTINGS_BYTES: usize = 704;

const QUERY: Query = Query {
    name: "ninjutso_legacy",
    vendor_id: 0x1915,
    models: &[(0xAE1C, NAME)],
    collection: (0xFFA0, 0x0001),
    input_id: 4,
    input_bounds: (SETTINGS_BYTES, SETTINGS_BYTES),
    output_id: 4,
    output_len: SETTINGS_BYTES,
    kind: "mouse",
    charging_known: true,
    unconfirmed: false,
    timeout: READ_TIMEOUT,
};

fn profile_request() -> [u8; PROFILE_BYTES] {
    let mut frame = [0; PROFILE_BYTES];
    frame[..8].copy_from_slice(&[5, 0x0D, 0, 0, 1, 0, 0, 0x16]);
    frame
}

fn settings_request(profile: u8) -> [u8; 704] {
    let mut frame = [0; 704];
    frame[..7].copy_from_slice(&[4, 0x26, 0, 0, 1, 0, profile]);
    frame
}

fn parse_profile(reply: &[u8]) -> Option<u8> {
    (reply.len() == PROFILE_BYTES && reply[0] == 5 && reply[9] != 0).then(|| reply[9])
}

fn parse(reply: &[u8]) -> Option<Reading> {
    if reply.len() != SETTINGS_BYTES || reply[0] != 4 || reply[16] > 100 || reply[17] > 1 {
        return None;
    }
    let sum: u32 = reply[..701].iter().map(|&b| u32::from(b)).sum();
    let stored = u32::from(u16::from_le_bytes([reply[702], reply[703]]));
    (sum == stored).then(|| Reading::exact(reply[16], reply[17] == 1))
}

fn eligible(info: &DeviceInfo) -> bool {
    info.product == NAME
        && info.feature_len == Some(SETTINGS_BYTES)
        && info.feature_sizes.as_ref().is_some_and(|sizes| {
            sizes.values().all(|&n| (2..=SETTINGS_BYTES).contains(&n))
                && sizes.get(&4) == Some(&SETTINGS_BYTES)
                && sizes.get(&5) == Some(&PROFILE_BYTES)
        })
}

fn read_profile(device: &mut dyn HidDevice) -> HidResult<Option<u8>> {
    // A zero profile is retried once; anything else invalid is not.
    for _ in 0..2 {
        let request = profile_request();
        if device.send_feature(&request)? != request.len() {
            return Ok(None);
        }
        sleep(15);
        let reply = device.get_feature(5, PROFILE_BYTES)?;
        if let Some(profile) = parse_profile(&reply) {
            return Ok(Some(profile));
        }
        if reply.len() != PROFILE_BYTES || reply[0] != 5 || reply[9] != 0 {
            break;
        }
    }
    Ok(None)
}

fn exchange(device: &mut dyn HidDevice) -> HidResult<Option<Reading>> {
    let Some(profile) = read_profile(device)? else {
        return Ok(None);
    };
    let request = settings_request(profile);
    if device.send_feature(&request)? != request.len() {
        return Ok(None);
    }
    sleep(90);
    Ok(parse(&device.get_feature(4, SETTINGS_BYTES)?))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for (physical, infos) in proven_groups(&context.vendor(QUERY.vendor_id)) {
        let candidate = only(&infos, |d| {
            d.product_id == 0xAE1C && d.is_collection(0xFFA0, 1)
        });
        let Some(info) = candidate.filter(|d| !d.path.is_empty() && eligible(d)) else {
            continue;
        };
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        if let Ok(Some(reading)) = exchange(device.as_mut()) {
            result.push(QUERY.status(physical, NAME, reading));
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::fake::FakeBus;
    use crate::hid::Sizes;

    fn settings(level: u8, charging: u8) -> Vec<u8> {
        let mut reply = vec![0u8; SETTINGS_BYTES];
        reply[0] = 4;
        reply[16] = level;
        reply[17] = charging;
        let sum: u32 = reply[..701].iter().map(|&b| u32::from(b)).sum();
        reply[702..].copy_from_slice(&(sum as u16).to_le_bytes());
        reply
    }

    #[test]
    fn the_settings_page_needs_its_checksum() {
        assert_eq!(parse(&settings(80, 1)), Some(Reading::exact(80, true)));
        assert_eq!(parse(&settings(101, 0)), None);
        assert_eq!(parse(&settings(80, 2)), None);
        let mut bad = settings(80, 0);
        bad[100] = 1;
        assert_eq!(parse(&bad), None);
    }

    #[test]
    fn a_zero_profile_is_retried_once_then_given_up() {
        let info = DeviceInfo {
            path: "n".into(),
            vendor_id: 0x1915,
            product_id: 0xAE1C,
            usage_page: 0xFFA0,
            usage: 1,
            product: NAME.into(),
            physical_id: "pnp:n".into(),
            feature_len: Some(704),
            feature_sizes: Some(Sizes::from([(4, 704), (5, 32)])),
            ..Default::default()
        };
        let bus = FakeBus::default();
        let mut zero = vec![0u8; 32];
        zero[0] = 5;
        bus.script("n", |s| {
            s.features.push_back(zero.clone());
            s.features.push_back(zero.clone());
        });
        assert!(poll(&mut Context::new(&[info], &bus)).is_empty());
        let sent = bus.inspect("n", |s| s.sent_features.clone());
        assert_eq!(sent, vec![profile_request().to_vec(); 2]);
    }
}
