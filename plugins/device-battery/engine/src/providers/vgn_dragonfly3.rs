//! VGN Dragonfly3 SE receiver: unnumbered 55 30.
use super::battery_query::{Query, Reading, Reply, READ_TIMEOUT};
use super::context::Context;
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x391D];

const QUERY: Query = Query {
    name: "vgn_dragonfly3",
    vendor_id: 0x391D,
    models: &[(0x1A01, "VGN Dragonfly3 SE")],
    collection: (0xFF01, 0x0010),
    input_id: 0,
    input_bounds: (65, 65),
    output_id: 0,
    output_len: 65,
    kind: "mouse",
    charging_known: false,
    unconfirmed: false,
    timeout: READ_TIMEOUT,
};

fn request() -> [u8; 65] {
    let mut frame = [0; 65];
    frame[1] = 0x55;
    frame[2] = 0x30;
    frame
}

fn parse(reply: &[u8]) -> Option<Reading> {
    let valid = reply.len() == 64
        && reply[1] == 0x30
        && reply[9] != 1
        && reply[8] <= 100
        && reply != &request()[1..];
    valid.then(|| Reading::exact(reply[8], false))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    QUERY.poll(context, &request(), |raw| Reply::from(parse(raw)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_byte_eight_unless_flagged() {
        let mut reply = [0u8; 64];
        reply[1] = 0x30;
        reply[8] = 55;
        assert_eq!(parse(&reply), Some(Reading::exact(55, false)));
        assert_eq!(parse(&request()[1..]), None);
        reply[9] = 1;
        assert_eq!(parse(&reply), None);
        reply[9] = 0;
        reply[8] = 101;
        assert_eq!(parse(&reply), None);
    }
}
