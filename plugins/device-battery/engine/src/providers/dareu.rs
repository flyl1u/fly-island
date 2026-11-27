//! Dareu EM901: the 17-byte CompX power request as a feature report, the answer as
//! input report 09.
use super::battery_query::{Query, Reading, READ_TIMEOUT};
use super::context::{only, proven_groups, read_until, Context};
use super::pulsar::compx;
use crate::hid::{DeviceInfo, HidDevice, HidResult, Sizes};
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x260D];

const NAME: &str = "Dareu EM901";
const QUERY: Query = Query {
    name: "dareu",
    vendor_id: 0x260D,
    models: &[(0x1074, NAME)],
    collection: (0xFF02, 0x0002),
    input_id: 9,
    input_bounds: (8, 4096),
    output_id: 8,
    output_len: 17,
    kind: "mouse",
    charging_known: true,
    unconfirmed: false,
    timeout: READ_TIMEOUT,
};

/// Both reports must be proven, each within its bounds.
fn report_length(
    maximum: Option<usize>,
    sizes: &Option<Sizes>,
    id: u8,
    (low, high): (usize, usize),
) -> Option<usize> {
    let (maximum, sizes) = (maximum?, sizes.as_ref()?);
    let length = *sizes.get(&id)?;
    ((low..=high).contains(&maximum)
        && sizes.values().all(|&n| (2..=maximum).contains(&n))
        && sizes.values().max() == Some(&maximum)
        && (low..=high).contains(&length))
    .then_some(length)
}

fn parse(reply: &[u8], length: usize) -> Option<Reading> {
    let valid =
        reply.len() == length && length >= 8 && reply[..3] == [0x09, 0x04, 0] && reply[6] <= 100;
    valid.then(|| Reading::exact(reply[6], reply[7] != 0))
}

fn exchange(
    device: &mut dyn HidDevice,
    info: &DeviceInfo,
    length: usize,
) -> HidResult<Option<Reading>> {
    let request = compx::power_request();
    if device.send_feature(&request)? != request.len() {
        return Ok(None);
    }
    read_until(
        device,
        info.input_len.unwrap_or(0),
        QUERY.timeout,
        32,
        |raw| parse(raw, length),
    )
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for (physical, infos) in proven_groups(&context.vendor(QUERY.vendor_id)) {
        let eligible = |d: &DeviceInfo| {
            d.is(0x260D, 0x1074) && d.is_collection(0xFF02, 0x0002) && !d.path.is_empty()
        };
        let Some(info) = only(&infos, eligible) else {
            continue;
        };
        let feature = report_length(info.feature_len, &info.feature_sizes, 8, (17, 17));
        let input = report_length(info.input_len, &info.input_sizes, 9, (8, 4096));
        let (Some(_), Some(length)) = (feature, input) else {
            continue;
        };
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        if let Ok(Some(reading)) = exchange(device.as_mut(), info, length) {
            result.push(QUERY.status(physical, NAME, reading));
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::fake::FakeBus;

    fn info() -> DeviceInfo {
        DeviceInfo {
            path: "m".into(),
            vendor_id: 0x260D,
            product_id: 0x1074,
            usage_page: 0xFF02,
            usage: 2,
            physical_id: "pnp:m".into(),
            feature_len: Some(17),
            feature_sizes: Some(Sizes::from([(8, 17)])),
            input_len: Some(17),
            input_sizes: Some(Sizes::from([(9, 17)])),
            ..Default::default()
        }
    }

    #[test]
    fn the_request_is_one_feature_report_and_the_answer_an_input_report() {
        let bus = FakeBus::default();
        let mut reply = vec![0u8; 17];
        reply[..8].copy_from_slice(&[9, 4, 0, 0, 0, 0, 71, 1]);
        bus.script("m", |s| s.reads.push_back(reply));
        let statuses = poll(&mut Context::new(&[info()], &bus));
        assert_eq!((statuses[0].level, statuses[0].charging), (Some(71), true));
        let sent = bus.inspect("m", |s| s.sent_features.clone());
        assert_eq!(sent, vec![compx::power_request().to_vec()]);
        assert!(bus.inspect("m", |s| s.writes.is_empty()));
    }

    #[test]
    fn unproven_reports_send_nothing() {
        let bus = FakeBus::default();
        bus.script("m", |_| {});
        let unproven = DeviceInfo {
            feature_sizes: None,
            ..info()
        };
        assert!(poll(&mut Context::new(&[unproven], &bus)).is_empty());
        assert!(bus.written_paths().is_empty());
    }
}
