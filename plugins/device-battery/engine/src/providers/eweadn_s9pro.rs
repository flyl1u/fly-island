//! EWEADN S9 PRO 8K: one read command as Feature 03, then the same report read back.
use super::battery_query::{Query, Reading, READ_TIMEOUT};
use super::context::{only, proven_groups, sleep, Context};
use crate::hid::{DeviceInfo, HidDevice, HidResult};
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x372E];

const NAME: &str = "EWEADN S9 PRO 8K";
const REPORT_ID: u8 = 0x03;
const REPORT_BYTES: usize = 64;

const QUERY: Query = Query {
    name: "eweadn_s9pro",
    vendor_id: 0x372E,
    models: &[(0x1026, NAME)],
    collection: (0xFF00, 0x0001),
    input_id: REPORT_ID,
    input_bounds: (REPORT_BYTES, REPORT_BYTES),
    output_id: REPORT_ID,
    output_len: REPORT_BYTES,
    kind: "mouse",
    charging_known: true,
    unconfirmed: false,
    timeout: READ_TIMEOUT,
};

fn request() -> [u8; REPORT_BYTES] {
    let mut frame = [0; REPORT_BYTES];
    frame[..7].copy_from_slice(&[REPORT_ID, 0x20, 0x50, 0x00, 0x00, 0x4F, 0x81]);
    frame
}

fn parse(reply: &[u8]) -> Option<Reading> {
    let lowest = match reply.len() {
        16 => {
            if reply[..3] != [REPORT_ID, 0x50, 0] || reply[5] != 1 {
                return None;
            }
            1
        }
        REPORT_BYTES => {
            if reply[0] != REPORT_ID
                || reply[2] != 0
                || reply[4] != 0
                || !(7..=REPORT_BYTES - 6).contains(&usize::from(reply[3]))
            {
                return None;
            }
            0
        }
        _ => return None,
    };
    let level = reply[6] & 0x7F;
    (lowest..=100)
        .contains(&level)
        .then(|| Reading::exact(level, reply[6] & 0x80 != 0))
}

fn eligible(info: &DeviceInfo) -> bool {
    if info.vendor_id != 0x372E
        || info.product_id != 0x1026
        || !(info.is_collection(0xFF00, 1) || info.is_collection(0xFF06, 1))
    {
        return false;
    }
    let (Some(maximum), Some(sizes)) = (info.feature_len, info.feature_sizes.as_ref()) else {
        return false;
    };
    (REPORT_BYTES..=4096).contains(&maximum)
        && sizes.values().all(|&n| (2..=maximum).contains(&n))
        && sizes.values().max() == Some(&maximum)
        && sizes.get(&REPORT_ID) == Some(&REPORT_BYTES)
}

fn exchange(device: &mut dyn HidDevice) -> HidResult<Option<Reading>> {
    let request = request();
    if device.send_feature(&request)? != request.len() {
        return Ok(None);
    }
    sleep(100); // The vendor SDK's receive delay.
    Ok(parse(&device.get_feature(REPORT_ID, REPORT_BYTES)?))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for (physical, infos) in proven_groups(&context.vendor(QUERY.vendor_id)) {
        let Some(info) = only(&infos, eligible).filter(|d| !d.path.is_empty()) else {
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

    #[test]
    fn short_and_full_replies_have_their_own_rules() {
        let mut short = [0u8; 16];
        short[..7].copy_from_slice(&[3, 0x50, 0, 0, 0, 1, 0x80 | 58]);
        assert_eq!(parse(&short), Some(Reading::exact(58, true)));
        short[6] = 0;
        assert_eq!(parse(&short), None);

        let mut full = [0u8; 64];
        full[..7].copy_from_slice(&[3, 0, 0, 7, 0, 0, 0]);
        assert_eq!(parse(&full), Some(Reading::exact(0, false)));
        full[3] = 59;
        assert_eq!(parse(&full), None);
        assert_eq!(parse(&request()), None);
    }
}
