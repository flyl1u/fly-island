//! ATK N9 V2 headset receivers: report 55, command 65.
use super::battery_query::{Query, Reading, Reply, READ_TIMEOUT};
use super::context::Context;
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x373B];

const QUERY: Query = Query {
    name: "atk_headset",
    vendor_id: 0x373B,
    models: &[(0x1262, "ATK N9 V2 Ultimate"), (0x12D6, "ATK N9 V2 ULTRA")],
    collection: (0xFF90, 0x0001),
    input_id: 0x55,
    input_bounds: (22, 64),
    output_id: 0x55,
    output_len: 64,
    kind: "headset",
    charging_known: true,
    unconfirmed: false,
    timeout: READ_TIMEOUT,
};

fn request() -> [u8; 64] {
    let mut frame = [0; 64];
    frame[..3].copy_from_slice(&[0x55, 0x65, 0x01]);
    frame
}

fn parse(reply: &[u8]) -> Reply {
    if !(22..=64).contains(&reply.len()) || reply[0] != 0x55 {
        return Reply::Other;
    }
    if (reply[1] == 0x65 && reply[3] == 0x1A) || reply[1..3] == [0x0A, 0x01] {
        return Reply::Silent;
    }
    let valid = reply[1] == 0x65 && reply[2] <= 100 && matches!(reply[3], 0x02..=0x04);
    Reply::from(valid.then(|| Reading::exact(reply[2], reply[3] == 0x03)))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    QUERY.poll(context, &request(), parse)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(bytes: [u8; 4]) -> Vec<u8> {
        let mut reply = vec![0u8; 22];
        reply[..4].copy_from_slice(&bytes);
        reply
    }

    #[test]
    fn state_three_is_charging_and_offline_replies_stop() {
        assert!(matches!(parse(&reply([0x55, 0x65, 80, 3])),
            Reply::Reading(r) if r == Reading::exact(80, true)));
        assert!(matches!(parse(&reply([0x55, 0x65, 80, 4])),
            Reply::Reading(r) if !r.charging));
        assert!(matches!(
            parse(&reply([0x55, 0x65, 0, 0x1A])),
            Reply::Silent
        ));
        assert!(matches!(
            parse(&reply([0x55, 0x0A, 0x01, 0])),
            Reply::Silent
        ));
        for bytes in [
            [0x55, 0x65, 101, 2],
            [0x55, 0x65, 50, 1],
            [0x55, 0x66, 50, 2],
        ] {
            assert!(matches!(parse(&reply(bytes)), Reply::Other), "{bytes:?}");
        }
    }
}
