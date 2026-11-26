//! VGN beiying 2.4G keyboard receivers (VGN HUB's direct read 4A). Only the
//! hardware-confirmed 258A:024F reports a trustworthy charging bit.
use super::battery_query::{Query, Reading, Reply};
use super::by_frame::{battery_request, payload};
use super::context::{proven_groups, Context};
use crate::hid::proof::single_report;
use crate::status::Status;
use std::time::Duration;

pub(crate) const VENDORS: &[u16] = &[0x258A, 0x391D];

const fn query(vendor_id: u16, models: &'static [(u16, &'static str)]) -> Query {
    Query {
        name: "vgn_beiying",
        vendor_id,
        models,
        collection: (0xFF02, 0x0002),
        input_id: 0x13,
        input_bounds: (20, 20),
        output_id: 0x13,
        output_len: 20,
        kind: "keyboard",
        charging_known: false,
        unconfirmed: false,
        timeout: Duration::from_millis(2500),
    }
}

const QUERIES: [Query; 2] = [
    query(
        0x258A,
        &[
            (0x024F, "VGN V98 Pro V3 2.4G receiver"),
            (0x027F, "VGN V98 Pro V3 2.4G receiver"),
            (0x027B, "VGN V87 V2 2.4G receiver"),
        ],
    ),
    query(
        0x391D,
        &[
            (0x2A01, "VGN N75 V2 2.4G receiver"),
            (0x2A02, "VGN V108 2.4G receiver"),
        ],
    ),
];

fn parse(reply: &[u8]) -> Option<Reading> {
    let data = payload(reply, 0x4A, true)?;
    (data[0] <= 100).then(|| Reading::exact(data[0], data[1] & 0x10 != 0))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for query in &QUERIES {
        for (physical, infos) in proven_groups(&context.vendor(query.vendor_id)) {
            let Some((info, name)) = query.pick(&infos) else {
                continue;
            };
            if !single_report(&info.input_sizes, 0x13, 20)
                || !single_report(&info.output_sizes, 0x13, 20)
            {
                continue;
            }
            let Ok(mut device) = context.open(info) else {
                continue;
            };
            let exchanged = query.exchange(device.as_mut(), info, &battery_request(), &|raw| {
                Reply::from(parse(raw))
            });
            if let Ok(Some(reading)) = exchanged {
                let mut status = query.status(physical, name, reading);
                status.charging_known = Some(info.is(0x258A, 0x024F));
                result.push(status);
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The captured charging reply of issue #190, rebuilt from its documented bytes.
    fn reply(level: u8, flags: u8) -> [u8; 20] {
        let mut reply = [0u8; 20];
        reply[..7].copy_from_slice(&[0x13, 0x4A, 1, 0, 2, level, flags]);
        reply[19] = reply[..19].iter().fold(0u8, |s, &b| s.wrapping_add(b));
        reply
    }

    #[test]
    fn bit_four_is_external_power() {
        assert_eq!(parse(&reply(99, 0x10)), Some(Reading::exact(99, true)));
        assert_eq!(parse(&reply(99, 0)), Some(Reading::exact(99, false)));
        assert_eq!(parse(&reply(101, 0)), None);
        assert_eq!(parse(&battery_request()), None);
    }
}
