//! MOONDROP GM01 Pro: WebHID payload 80 27 00 on report 4B. FF02:0002 is preferred;
//! the consumer collection is used only when it alone is proven.
use super::battery_query::{Query, Reading, Reply, READ_TIMEOUT};
use super::context::{proven_groups, Context};
use crate::hid::proof::report_proven;
use crate::hid::DeviceInfo;
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x35D8];

const NAME: &str = "MOONDROP GM01 Pro";
const REPORT_ID: u8 = 0x4B;
const MAX_REPORT: usize = 4096;
const COLLECTIONS: [(u16, u16); 2] = [(0xFF02, 0x0002), (0x000C, 0x0001)];

const QUERY: Query = Query {
    name: "moondrop",
    vendor_id: 0x35D8,
    models: &[(0x0133, NAME)],
    collection: COLLECTIONS[0],
    input_id: REPORT_ID,
    input_bounds: (10, MAX_REPORT),
    output_id: REPORT_ID,
    output_len: 0,
    kind: "headset",
    charging_known: false,
    unconfirmed: false,
    timeout: READ_TIMEOUT,
};

fn request(length: usize) -> Vec<u8> {
    let mut frame = vec![0; length];
    frame[..4].copy_from_slice(&[REPORT_ID, 0x80, 0x27, 0x00]);
    frame
}

fn is_battery_reply(reply: &[u8]) -> bool {
    (10..=MAX_REPORT).contains(&reply.len())
        && reply[0] == REPORT_ID
        && reply[2] == 0x27
        && (6..=reply.len() - 4).contains(&usize::from(reply[3]))
}

fn parse(reply: &[u8]) -> Reply {
    if !is_battery_reply(reply) {
        Reply::Other
    } else if reply[8] == 0 {
        // The vendor's page shows zero here: unknown, not a false 0 %.
        Reply::Silent
    } else if reply[9] <= 100 {
        Reply::Reading(Reading::exact(reply[9], false))
    } else {
        Reply::Other
    }
}

fn proven(info: &DeviceInfo) -> bool {
    !info.path.is_empty()
        && report_proven(
            info.input_len,
            &info.input_sizes,
            REPORT_ID,
            (10, MAX_REPORT),
        )
        && report_proven(
            info.output_len,
            &info.output_sizes,
            REPORT_ID,
            (4, MAX_REPORT),
        )
}

fn pick<'a>(infos: &[&'a DeviceInfo]) -> Option<&'a DeviceInfo> {
    let of = |(page, usage): (u16, u16)| {
        infos
            .iter()
            .copied()
            .filter(move |d| d.is(0x35D8, 0x0133) && d.is_collection(page, usage))
    };
    if of(COLLECTIONS[0]).count() > 1 {
        return None;
    }
    for collection in COLLECTIONS {
        let mut eligible = of(collection).filter(|d| proven(d));
        if let Some(first) = eligible.next() {
            return eligible.next().is_none().then_some(first);
        }
    }
    None
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut result = Vec::new();
    for (physical, infos) in proven_groups(&context.vendor(QUERY.vendor_id)) {
        let Some(info) = pick(&infos) else {
            continue;
        };
        let Ok(mut device) = context.open(info) else {
            continue;
        };
        let request = request(info.output_len.unwrap_or(0));
        if let Ok(Some(reading)) = QUERY.exchange(device.as_mut(), info, &request, &parse) {
            result.push(QUERY.status(physical, NAME, reading));
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::fake::FakeBus;
    use crate::hid::Sizes;

    fn info(path: &str, collection: (u16, u16)) -> DeviceInfo {
        DeviceInfo {
            path: path.into(),
            vendor_id: 0x35D8,
            product_id: 0x0133,
            usage_page: collection.0,
            usage: collection.1,
            physical_id: "pnp:a".into(),
            input_len: Some(16),
            output_len: Some(16),
            input_sizes: Some(Sizes::from([(REPORT_ID, 16)])),
            output_sizes: Some(Sizes::from([(REPORT_ID, 16)])),
            ..Default::default()
        }
    }

    fn reply(ready: u8, level: u8) -> Vec<u8> {
        let mut reply = vec![0u8; 16];
        reply[..4].copy_from_slice(&[REPORT_ID, 0, 0x27, 6]);
        reply[8] = ready;
        reply[9] = level;
        reply
    }

    #[test]
    fn the_vendor_collection_wins_over_the_consumer_one() {
        let bus = FakeBus::default();
        bus.script("ff02", |s| s.reads.push_back(reply(1, 66)));
        bus.script("c", |_| {});
        let infos = [info("c", COLLECTIONS[1]), info("ff02", COLLECTIONS[0])];
        let statuses = poll(&mut Context::new(&infos, &bus));
        assert_eq!(statuses[0].level, Some(66));
        assert_eq!(bus.written_paths(), vec!["ff02".to_string()]);
        let sent = bus.inspect("ff02", |s| s.writes.clone());
        assert_eq!(sent, vec![request(16)]);
    }

    #[test]
    fn a_not_ready_reply_is_unknown_not_zero() {
        assert!(matches!(parse(&reply(0, 0)), Reply::Silent));
        assert!(matches!(parse(&reply(1, 101)), Reply::Other));
        let bus = FakeBus::default();
        bus.script("a", |s| {
            s.reads.push_back(reply(0, 0));
            s.reads.push_back(reply(1, 40));
        });
        let infos = [info("a", COLLECTIONS[0])];
        assert!(poll(&mut Context::new(&infos, &bus)).is_empty());
    }
}
