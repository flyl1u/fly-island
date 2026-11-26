//! Flydigi APEX5: five battery tiers; while charging there is no tier at all.
use super::battery_query::{Query, Reading, Reply, READ_TIMEOUT};
use super::context::Context;
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x37D7];

const QUERY: Query = Query {
    name: "flydigi",
    vendor_id: 0x37D7,
    models: &[(0x2501, "Flydigi APEX5")],
    collection: (0xFFA0, 1),
    input_id: 4,
    input_bounds: (32, 32),
    output_id: 3,
    output_len: 32,
    kind: "gamepad",
    charging_known: true,
    unconfirmed: false,
    timeout: READ_TIMEOUT,
};

fn request() -> [u8; 32] {
    let mut frame = [0; 32];
    frame[..6].copy_from_slice(&[0x03, 0x5A, 0xA5, 0x01, 0x02, 0x03]);
    frame
}

fn parse(reply: &[u8]) -> Option<Reading> {
    if reply.len() != 32
        || reply[..7] != [4, 0x5A, 0xA5, 1, 1, 0, 0x80]
        || !matches!(reply[7], 1 | 2)
    {
        return None;
    }
    let (tier, charge) = (reply[12] & 0x0F, reply[12] >> 4);
    match charge {
        1 => Some(Reading {
            level: None,
            charging: true,
            approximate: false,
        }),
        0 if tier <= 5 => Some(Reading {
            level: Some(tier * 20),
            charging: false,
            approximate: true,
        }),
        _ => None,
    }
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    QUERY.poll(context, &request(), |raw| Reply::from(parse(raw)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(battery: u8) -> [u8; 32] {
        let mut reply = [0u8; 32];
        reply[..8].copy_from_slice(&[4, 0x5A, 0xA5, 1, 1, 0, 0x80, 2]);
        reply[12] = battery;
        reply
    }

    #[test]
    fn tiers_are_approximate_and_charging_has_no_level() {
        let half = parse(&reply(0x03)).unwrap();
        assert_eq!((half.level, half.approximate), (Some(60), true));
        assert_eq!(parse(&reply(0x13)).unwrap().level, None);
        assert_eq!(parse(&reply(0x06)), None);
        assert_eq!(parse(&reply(0x23)), None);
        assert_eq!(parse(&request()), None);
    }
}
