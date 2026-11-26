//! Listed CompX identities.

pub(super) const ATK_VENDOR: u16 = 0x373B;
pub(super) const LINK8K: (u16, u16) = (0x3710, 0x5501);
/// ATK headsets share the vendor ID but not this protocol.
pub(super) const ATK_HEADSETS: [u16; 3] = [0x1204, 0x1262, 0x12D6];

/// Identities read only on FF02:0002 with a proven 17-byte output report.
pub(super) const STRICT_IDS: [(u16, u16); 5] = [
    (0x3554, 0xF517),
    (0x3554, 0xFB56),
    (0x3554, 0xF58E),
    (0x3554, 0xF505),
    (0x3554, 0xF503),
];

pub(super) const MODELS: [(u16, u16, &str); 16] = [
    (0x3554, 0xF508, "Pulsar X2 V2 Mini (wireless)"),
    (0x3554, 0xF507, "Pulsar X2 V2 Mini (wired)"),
    (0x3554, 0xF58F, "ATK VXE R1 SE+ (wired)"),
    (0x3554, 0xF58A, "VXE R1 Pro Max (2.4 GHz)"),
    (0x3554, 0xF58C, "VXE R1 Pro Max (wired)"),
    (0x3554, 0xF517, "Scyrox 8K 接收器"),
    (0x3554, 0xFB56, "VGN Dragonfly F2 Master+"),
    (0x3554, 0xF58E, "VXE R1 SE 1K 接收器"),
    (0x3554, 0xF505, "VGN Dragonfly 4K Receiver"),
    (0x3554, 0xF503, "VGN F1 Moba F503"),
    (0x373B, 0x1085, "ATK VXE R1 SE+ (2.4 GHz)"),
    (0x3770, 0x0200, "Hitscan Hyperlight (2.4 GHz)"),
    (0x3770, 0x0100, "Hitscan Hyperlight (wired)"),
    (0x3710, 0x5406, "Pulsar X2 CrazyLight Mini (2.4 GHz)"),
    (0x3710, 0x3414, "Pulsar X2 CrazyLight Mini (wired)"),
    (0x3710, 0x5501, "Pulsar Link 8K Dongle"),
];
