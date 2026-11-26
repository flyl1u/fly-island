//! EWEADN S9: unnumbered 30; a model tag and a validity flag surround the level.
use super::battery_query::{Query, Reading, Reply, READ_TIMEOUT};
use super::context::Context;
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x089D];

const QUERY: Query = Query {
    name: "eweadn",
    vendor_id: 0x089D,
    models: &[(0x062F, "EWEADN S9")],
    collection: (0xFF01, 0x0010),
    input_id: 0,
    input_bounds: (16, 34),
    output_id: 0,
    output_len: 33,
    kind: "mouse",
    charging_known: false,
    unconfirmed: false,
    timeout: READ_TIMEOUT,
};

fn request() -> [u8; 33] {
    let mut frame = [0; 33];
    frame[1] = 0x30;
    frame
}

fn parse(reply: &[u8]) -> Option<Reading> {
    let valid = (15..=33).contains(&reply.len())
        && reply[..2] == [0x30, 0]
        && reply[3] >= 11
        && usize::from(reply[3]) <= reply.len() - 4
        && &reply[4..8] == b"M156"
        && reply[13] <= 100
        && reply[14] == 1;
    valid.then(|| Reading::exact(reply[13], false))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    QUERY.poll(context, &request(), |raw| Reply::from(parse(raw)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn needs_the_model_tag_length_and_flag() {
        let mut reply = vec![0u8; 32];
        reply[0] = 0x30;
        reply[3] = 11;
        reply[4..8].copy_from_slice(b"M156");
        reply[13] = 88;
        reply[14] = 1;
        assert_eq!(parse(&reply), Some(Reading::exact(88, false)));
        for (index, value) in [(3, 10), (3, 29), (4, b'X'), (13, 101), (14, 0), (1, 1)] {
            let mut bad = reply.clone();
            bad[index] = value;
            assert_eq!(parse(&bad), None, "{index}");
        }
        assert_eq!(parse(&reply[..14]), None);
    }
}
