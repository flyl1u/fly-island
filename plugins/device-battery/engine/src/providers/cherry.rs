//! CHERRY MX 2.0S wireless receivers: report 04, command 20 .. 1A 06.
use super::battery_query::{Query, Reading, Reply, READ_TIMEOUT};
use super::context::{proven_groups, Context};
use crate::hid::proof::single_report;
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x046A];

const QUERY: Query = Query {
    name: "cherry",
    vendor_id: 0x046A,
    models: &[
        (0x01E0, "CHERRY MX 2.0S WL Pro"),
        (0x01DE, "CHERRY MX 2.0S WL Pro"),
    ],
    collection: (0xFF1C, 0x0092),
    input_id: 4,
    input_bounds: (64, 64),
    output_id: 4,
    output_len: 64,
    kind: "keyboard",
    charging_known: true,
    unconfirmed: false,
    timeout: READ_TIMEOUT,
};

fn request() -> [u8; 64] {
    let mut frame = [0; 64];
    frame[..5].copy_from_slice(&[4, 0x20, 0, 0x1A, 6]);
    frame
}

fn parse(reply: &[u8]) -> Option<Reading> {
    let valid = reply.len() == 64
        && reply[..5] == [4, 0x20, 0, 0x1A, 6]
        && reply[7] == 0
        && (1..=100).contains(&reply[8])
        && reply[9] <= 1;
    valid.then(|| Reading::exact(reply[8], reply[9] == 1))
}

/// The receiver's product string must match the one verified for its PID.
fn expected_product(product_id: u16) -> &'static str {
    if product_id == 0x01E0 {
        "MX 2.0S Pro Dongle"
    } else {
        "MX 2.0S WL Pro"
    }
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for (physical, infos) in proven_groups(&context.vendor(QUERY.vendor_id)) {
        let Some((info, name)) = QUERY.pick(&infos) else {
            continue;
        };
        if info.interface_number != 1
            || info.product != expected_product(info.product_id)
            || !single_report(&info.input_sizes, 4, 64)
            || !single_report(&info.output_sizes, 4, 64)
        {
            continue;
        }
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        let exchanged = QUERY.exchange(device.as_mut(), info, &request(), &|raw| {
            Reply::from(parse(raw))
        });
        if let Ok(Some(reading)) = exchanged {
            result.push(QUERY.status(physical, name, reading));
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(level: u8, charging: u8) -> [u8; 64] {
        let mut reply = request();
        reply[8] = level;
        reply[9] = charging;
        reply
    }

    #[test]
    fn zero_percent_and_unknown_charge_bytes_are_refused() {
        assert_eq!(parse(&reply(47, 1)), Some(Reading::exact(47, true)));
        assert_eq!(parse(&reply(100, 0)), Some(Reading::exact(100, false)));
        assert_eq!(parse(&reply(0, 0)), None);
        assert_eq!(parse(&reply(101, 0)), None);
        assert_eq!(parse(&reply(47, 2)), None);
        assert_eq!(parse(&request()), None);
    }
}
