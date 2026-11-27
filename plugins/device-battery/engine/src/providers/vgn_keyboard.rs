//! VGN 2.4G keyboard receiver: report 04, command 1A 06.
use super::battery_query::{Query, Reading, Reply};
use super::context::{proven_groups, Context};
use crate::status::Status;
use std::time::Duration;

pub(crate) const VENDORS: &[u16] = &[0x320F];

const QUERY: Query = Query {
    name: "vgn_keyboard",
    vendor_id: 0x320F,
    models: &[(0x5088, "VGN 2.4G 键盘")],
    collection: (0xFF1C, 0x0092),
    input_id: 0x04,
    input_bounds: (64, 64),
    output_id: 0x04,
    output_len: 64,
    kind: "keyboard",
    charging_known: false,
    unconfirmed: false,
    timeout: Duration::from_millis(2500),
};

fn request() -> [u8; 64] {
    let mut frame = [0; 64];
    frame[..5].copy_from_slice(&[0x04, 0x00, 0x00, 0x1A, 0x06]);
    frame
}

fn parse(reply: &[u8]) -> Reply {
    if reply.len() == 64 && reply[0] == 0x04 && reply[3] == 0xFF {
        return Reply::Silent;
    }
    let valid = reply.len() == 64
        && reply[0] == 0x04
        && reply[3] == 0x1A
        && reply[4] == 0x06
        && reply[8] <= 100
        && reply != request();
    Reply::from(valid.then(|| Reading::exact(reply[8], false)))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut statuses = QUERY.poll(context, &request(), parse);
    // The receiver's own product string names the keyboard better than the table.
    for (physical, infos) in proven_groups(&context.vendor(QUERY.vendor_id)) {
        let Some((info, _)) = QUERY.pick(&infos) else {
            continue;
        };
        if info.product.is_empty() {
            continue;
        }
        for status in statuses.iter_mut().filter(|s| s.physical_id == physical) {
            status.name = info.product.clone();
        }
    }
    statuses
}

#[cfg(test)]
mod tests;
