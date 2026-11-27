//! Product IDs on the `00 b0` headset exchange and on the two mouse exchanges.
//! Of these, upstream measured the 22A1 (and an Aerox 9 level); the rest follow
//! the referenced projects' device lists.
use super::parsers::{aerox3, arctis7_plus, gamebuds, nova5, nova7, nova7_discrete, rival3, Parse};

pub(super) struct HeadsetModel {
    pub product_id: u16,
    pub name: &'static str,
    pub parse: Parse,
}

pub(super) struct MouseModel {
    pub product_id: u16,
    pub name: &'static str,
    pub parse: Parse,
    pub request: &'static [u8],
    pub echo: u8,
}

const fn headset(product_id: u16, name: &'static str, parse: Parse) -> HeadsetModel {
    HeadsetModel {
        product_id,
        name,
        parse,
    }
}

/// Rival 3 family: `00 aa 01`.
const fn rival(product_id: u16, name: &'static str) -> MouseModel {
    MouseModel {
        product_id,
        name,
        parse: rival3,
        request: &[0x00, 0xAA, 0x01],
        echo: 0xAA,
    }
}

/// Aerox 3 / 5 / 9 Wireless: the receiver's flagged battery query `00 d2`.
const fn aerox(product_id: u16, name: &'static str) -> MouseModel {
    MouseModel {
        product_id,
        name,
        parse: aerox3,
        request: &[0x00, 0xD2],
        echo: 0xD2,
    }
}

pub(super) const HEADSETS: [HeadsetModel; 25] = [
    headset(0x22A1, "Arctis Nova 7", nova7),
    headset(0x2202, "Arctis Nova 7", nova7_discrete),
    headset(0x227E, "Arctis Nova 7 Gen 2", nova7),
    headset(0x2206, "Arctis Nova 7x", nova7_discrete),
    headset(0x2258, "Arctis Nova 7x", nova7),
    headset(0x229E, "Arctis Nova 7x", nova7),
    headset(0x22AD, "Arctis Nova 7x", nova7),
    headset(0x22A4, "Arctis Nova 7X", nova7_discrete),
    headset(0x22A5, "Arctis Nova 7X", nova7),
    headset(0x223A, "Arctis Nova 7 Diablo IV", nova7_discrete),
    headset(0x22A9, "Arctis Nova 7 Diablo IV", nova7),
    headset(0x227A, "Arctis Nova 7 WoW Edition", nova7_discrete),
    headset(0x2232, "Arctis Nova 5", nova5),
    headset(0x2253, "Arctis Nova 5X", nova5),
    headset(0x220A, "Arctis Nova 7P", nova7_discrete),
    headset(0x22A7, "Arctis Nova 7P", nova7),
    headset(0x2298, "Arctis Nova 7P", nova7),
    headset(0x2269, "Arctis Nova 3P Wireless", nova5),
    headset(0x226D, "Arctis Nova 3X Wireless", nova5),
    headset(0x220E, "Arctis 7+", arctis7_plus),
    headset(0x2212, "Arctis 7+ PS5", arctis7_plus),
    headset(0x2216, "Arctis 7+ Xbox", arctis7_plus),
    headset(0x2236, "Arctis 7+ Destiny", arctis7_plus),
    headset(0x230A, "Arctis GameBuds", gamebuds),
    headset(0x2317, "Arctis GameBuds X", gamebuds),
];

pub(super) const MICE: [MouseModel; 9] = [
    rival(0x1830, "SteelSeries Rival 3 Wireless"),
    rival(0x1872, "SteelSeries Rival 3 Wireless Gen 2"),
    aerox(0x1838, "SteelSeries Aerox 3 Wireless"),
    aerox(0x1878, "SteelSeries Aerox 3 Wireless CS2 Dragon Lore"),
    aerox(0x1852, "SteelSeries Aerox 5 Wireless"),
    aerox(0x185C, "SteelSeries Aerox 5 Wireless Destiny 2 Edition"),
    aerox(0x1860, "SteelSeries Aerox 5 Wireless Diablo IV Edition"),
    aerox(0x1858, "SteelSeries Aerox 9 Wireless"),
    aerox(0x1874, "SteelSeries Aerox 9 Wireless WOW Edition"),
];
