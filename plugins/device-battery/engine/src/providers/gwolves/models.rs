//! The vendor web driver's PID table: which read each model takes and which
//! PIDs belong to one mouse.

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum Exchange {
    New,
    Old,
}

pub(super) struct Model {
    pub product_id: u16,
    pub name: &'static str,
    /// The receiver PID: the cable and the receiver share one card.
    pub family: u16,
    pub exchange: Exchange,
    pub cable: bool,
}

pub(super) const SHARED_RECEIVER: u16 = 0x3854;

/// Cable PIDs behind the shared receiver.
pub(super) const SHARED_CABLES: [(u16, &str); 11] = [
    (0x5418, "G-Wolves HTS Plus"),
    (0x5419, "G-Wolves HTS Plus"),
    (0x5219, "G-Wolves HTS Plus Pro"),
    (0x4718, "G-Wolves Lycan"),
    (0x4719, "G-Wolves Lycan"),
    (0x5618, "G-Wolves HTXU"),
    (0x5619, "G-Wolves HTXU"),
    (0x3619, "G-Wolves Fenrir Pro"),
    (0x3519, "G-Wolves Fenrir Asym"),
    (0x2719, "G-Wolves HTX Mini"),
    (0x4219, "G-Wolves WARG"),
];

use Exchange::{New, Old};

const fn entry(
    product_id: u16,
    name: &'static str,
    family: u16,
    exchange: Exchange,
    cable: bool,
) -> Model {
    Model {
        product_id,
        name,
        family,
        exchange,
        cable,
    }
}

const MODELS: [Model; 48] = [
    entry(0x3808, "G-Wolves HTM Plus", 0x3817, New, true),
    entry(0x3817, "G-Wolves HTM Plus", 0x3817, New, false),
    entry(0x6808, "G-Wolves HSK Pro 2.0", 0x6817, New, true),
    entry(0x6817, "G-Wolves HSK Pro 2.0", 0x6817, New, false),
    entry(0x5608, "G-Wolves HTXU", 0x5617, New, true),
    entry(0x5617, "G-Wolves HTXU", 0x5617, New, false),
    entry(0x3608, "G-Wolves Fenrir Pro", 0x3617, New, true),
    entry(0x3617, "G-Wolves Fenrir Pro", 0x3617, New, false),
    entry(0x3908, "G-Wolves VUK", 0x3917, Old, true),
    entry(0x3917, "G-Wolves VUK", 0x3917, Old, false),
    entry(0x7904, "G-Wolves HT-S2", 0x7913, Old, true),
    entry(0x7913, "G-Wolves HT-S2", 0x7913, Old, false),
    entry(0x3708, "G-Wolves Fenrir Max", 0x3717, Old, true),
    entry(0x3717, "G-Wolves Fenrir Max", 0x3717, Old, false),
    entry(0x5308, "G-Wolves HTS Ultra", 0x5317, Old, true),
    entry(0x5317, "G-Wolves HTS Ultra", 0x5317, Old, false),
    entry(0x7704, "G-Wolves HTR", 0x7713, Old, true),
    entry(0x7713, "G-Wolves HTR", 0x7713, Old, false),
    entry(0x3508, "G-Wolves Fenrir", 0x3517, Old, true),
    entry(0x3517, "G-Wolves Fenrir", 0x3517, Old, false),
    entry(0x7908, "G-Wolves HT-S2 Pro", 0x7917, Old, true),
    entry(0x7917, "G-Wolves HT-S2 Pro", 0x7917, Old, false),
    entry(0x5808, "G-Wolves HSK Pro", 0x5817, Old, true),
    entry(0x5817, "G-Wolves HSK Pro", 0x5817, Old, false),
    entry(0x5807, "G-Wolves HSK Pro", 0x5817, Old, false),
    entry(0x2708, "G-Wolves HTX Mini", 0x2717, Old, true),
    entry(0x2717, "G-Wolves HTX Mini", 0x2717, Old, false),
    entry(0x5408, "G-Wolves HTS Plus", 0x5417, Old, true),
    entry(0x5417, "G-Wolves HTS Plus", 0x5417, Old, false),
    entry(0x5407, "G-Wolves HTS Plus", 0x5417, Old, false),
    entry(0x5708, "G-Wolves HTX", 0x5717, Old, true),
    entry(0x5717, "G-Wolves HTX", 0x5717, Old, false),
    entry(0x5707, "G-Wolves HTX", 0x5717, Old, false),
    entry(0x5908, "G-Wolves HSK Plus", 0x5917, Old, true),
    entry(0x5917, "G-Wolves HSK Plus", 0x5917, Old, false),
    entry(0x5907, "G-Wolves HSK Plus", 0x5917, Old, false),
    entry(0x7204, "G-Wolves HSK Lite", 0x7203, Old, true),
    entry(0x7203, "G-Wolves HSK Lite", 0x7203, Old, false),
    entry(0x7708, "G-Wolves HTR Pro", 0x7717, Old, true),
    entry(0x7717, "G-Wolves HTR Pro", 0x7717, Old, false),
    entry(0x5804, "G-Wolves HSK Pro ACE", 0x5803, Old, true),
    entry(0x5803, "G-Wolves HSK Pro ACE", 0x5803, Old, false),
    entry(0x5404, "G-Wolves HTS Plus ACE", 0x5403, Old, true),
    entry(0x5403, "G-Wolves HTS Plus ACE", 0x5403, Old, false),
    entry(0x5704, "G-Wolves HTX ACE", 0x5703, Old, true),
    entry(0x5703, "G-Wolves HTX ACE", 0x5703, Old, false),
    entry(0x5904, "G-Wolves HSK Plus ACE", 0x5903, Old, true),
    entry(0x5903, "G-Wolves HSK Plus ACE", 0x5903, Old, false),
];

pub(super) fn model(product_id: u16) -> Option<&'static Model> {
    MODELS.iter().find(|m| m.product_id == product_id)
}
