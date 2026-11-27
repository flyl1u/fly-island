//! Every reader, in the order it is scheduled.
use super::context::Context;
use crate::status::Status;

pub(crate) type Poll = fn(&mut Context) -> Vec<Status>;

#[derive(Clone, Copy)]
pub(crate) enum Source {
    /// Asked once per physical device that has one of these vendor IDs.
    Vendors(&'static [u16], Poll),
    /// Asked for every physical device.
    AnyDevice(Poll),
    /// Windows controller slots; no HID inventory.
    XInput,
    /// Windows Bluetooth properties; no HID inventory.
    Bluetooth,
}

#[derive(Clone, Copy)]
pub(crate) struct Reader {
    pub name: &'static str,
    pub source: Source,
}

macro_rules! hid_readers {
    ($($module:ident),* $(,)?) => {
        [$(Reader {
            name: stringify!($module),
            source: Source::Vendors(super::$module::VENDORS, super::$module::poll),
        }),*]
    };
}

const VENDOR_READERS: [Reader; 45] = hid_readers![
    razer,
    audeze,
    wlmouse,
    mchose,
    mchose_headset,
    atk_headset,
    moondrop,
    zhuaudio,
    g3m,
    eweadn,
    eweadn_s9pro,
    vgn_keyboard,
    cherry,
    lingbao,
    vgn_beiying,
    vgn_dragonfly3,
    ninjutso_legacy,
    flydigi,
    mchose_qhw_keyboard,
    mchose_glw_keyboard,
    mchose_by_keyboard,
    hyperx_alpha2,
    hyperx_cloud3,
    hyperx,
    keychron,
    pulsar,
    jbl,
    dareu,
    rapoo,
    fa6x_passive,
    logitech,
    steelseries,
    barracuda,
    asus,
    asus_omni,
    gwolves,
    lofree,
    astro,
    corsair,
    lamzu,
    am_infinity,
    steelseries_elite,
    logitech_centurion,
    hyperx_cloud3s,
    nzxt,
];

const OTHER_READERS: [Reader; 3] = [
    Reader {
        name: "bluetooth",
        source: Source::Bluetooth,
    },
    Reader {
        name: "xinput",
        source: Source::XInput,
    },
    Reader {
        name: "standard_hid",
        source: Source::AnyDevice(super::standard_hid::poll),
    },
];

pub(crate) const READER_COUNT: usize = VENDOR_READERS.len() + OTHER_READERS.len();

pub(crate) fn readers() -> impl Iterator<Item = Reader> {
    VENDOR_READERS.into_iter().chain(OTHER_READERS)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    #[test]
    fn every_reader_is_registered_once() {
        let names: BTreeSet<&str> = readers().map(|r| r.name).collect();
        assert_eq!(READER_COUNT, 48);
        assert_eq!(names.len(), READER_COUNT);
    }

    #[test]
    fn vendor_readers_name_their_vendors() {
        for reader in VENDOR_READERS {
            let Source::Vendors(vendors, _) = reader.source else {
                panic!("{} is not a vendor reader", reader.name);
            };
            assert!(!vendors.is_empty(), "{}", reader.name);
        }
    }
}
