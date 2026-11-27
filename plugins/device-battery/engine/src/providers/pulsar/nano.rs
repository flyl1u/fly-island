//! ATK / VXE NANO receiver: its own query on report 08; the input report ID is
//! whatever the descriptor declares, but there must be exactly one.
use crate::hid::DeviceInfo;
use crate::providers::battery_query::{Query, Reading, Reply, READ_TIMEOUT};
use crate::providers::context::{only, proven_groups, Context};
use crate::status::Status;

pub(super) const PRODUCT_ID: u16 = 0x1216;
const NAME: &str = "ATK / VXE NANO receiver";
const COLLECTION: (u16, u16) = (0xFF05, 0x0001);

const QUERY: Query = Query {
    name: "pulsar",
    vendor_id: 0x373B,
    models: &[(PRODUCT_ID, NAME)],
    collection: COLLECTION,
    input_id: 0,
    // Seven payload bytes at least; a conservative ceiling.
    input_bounds: (8, 64),
    output_id: 0x08,
    output_len: 64,
    kind: "mouse",
    charging_known: false,
    unconfirmed: false,
    timeout: READ_TIMEOUT,
};

fn request() -> [u8; 64] {
    let mut frame = [0; 64];
    frame[..8].copy_from_slice(&[0x08, 0x7D, 0x72, 0x02, 0x00, 0x01, 0x07, 0x01]);
    frame
}

fn parse(reply: &[u8], report_id: u8) -> Option<u8> {
    let payload = match report_id {
        0 => reply,
        id => reply.strip_prefix(&[id])?,
    };
    ((7..=63).contains(&payload.len())
        && payload[1] == 0
        && payload[4] == 0x07
        && (1..=payload.len() - 6).contains(&usize::from(payload[5]))
        && payload[6] <= 100)
        .then(|| payload[6])
}

/// The only input report ID the collection declares.
fn input_id(infos: &[&DeviceInfo]) -> Option<u8> {
    let info = only(infos, |d| {
        d.is(0x373B, PRODUCT_ID) && d.is_collection(COLLECTION.0, COLLECTION.1)
    })?;
    let sizes = info.input_sizes.as_ref()?;
    (sizes.len() == 1)
        .then(|| sizes.keys().next().copied())
        .flatten()
}

pub(super) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for (physical, infos) in proven_groups(&context.vendor(QUERY.vendor_id)) {
        let Some(id) = input_id(&infos) else {
            continue;
        };
        let query = Query {
            input_id: id,
            ..QUERY
        };
        let Some((info, name)) = query.pick(&infos) else {
            continue;
        };
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        let judge =
            |raw: &[u8]| Reply::from(parse(raw, id).map(|level| Reading::exact(level, false)));
        if let Ok(Some(reading)) = query.exchange(device.as_mut(), info, &request(), &judge) {
            result.push(query.status(physical, name, reading));
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_reply_names_its_length_and_level() {
        let reply = [0x0A, 0, 0, 0, 0, 0x07, 1, 57];
        assert_eq!(parse(&reply[1..], 0), Some(57));
        assert_eq!(parse(&reply, 0x0A), Some(57));
        assert_eq!(parse(&reply, 0x0B), None);
        assert_eq!(parse(&[0, 0, 0, 0, 0x07, 2, 57], 0), None);
        assert_eq!(parse(&[0, 1, 0, 0, 0x07, 1, 57], 0), None);
        assert_eq!(parse(&[0, 0, 0, 0, 0x07, 1, 101], 0), None);
        assert_eq!(parse(&[0, 0, 0, 0, 0x07, 1], 0), None);
    }
}
