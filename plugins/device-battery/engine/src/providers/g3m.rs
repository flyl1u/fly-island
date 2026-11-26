//! HECATE G3M PRO: report 04, command 1A.
use super::battery_query::{Query, Reading, Reply, READ_TIMEOUT};
use super::context::Context;
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x320F];

const QUERY: Query = Query {
    name: "g3m",
    vendor_id: 0x320F,
    models: &[(0x706E, "HECATE G3M PRO")],
    collection: (0xFF1C, 0x0092),
    input_id: 0x04,
    input_bounds: (64, 64),
    output_id: 0x04,
    output_len: 64,
    kind: "mouse",
    charging_known: false,
    unconfirmed: false,
    timeout: READ_TIMEOUT,
};

fn request() -> [u8; 64] {
    let mut frame = [0; 64];
    frame[..5].copy_from_slice(&[0x04, 0x20, 0x00, 0x1A, 0x06]);
    frame
}

fn parse(reply: &[u8]) -> Option<Reading> {
    let valid = reply.len() == 64
        && reply[0] == 0x04
        && reply[3] == 0x1A
        && !matches!(reply[7], 0xFE | 0xFF)
        && reply[8] <= 100
        && reply != request();
    valid.then(|| Reading::exact(reply[8], false))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    QUERY.poll(context, &request(), |raw| Reply::from(parse(raw)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_byte_eight_and_refuses_echo_and_error_bytes() {
        let mut reply = request();
        reply[8] = 76;
        assert_eq!(parse(&reply), Some(Reading::exact(76, false)));
        assert_eq!(parse(&request()), None);
        for (index, value) in [(7, 0xFF), (7, 0xFE), (8, 101), (3, 0x1B), (0, 5)] {
            let mut bad = reply;
            bad[index] = value;
            assert_eq!(parse(&bad), None, "{index}");
        }
        assert_eq!(parse(&reply[..63]), None);
    }
}
