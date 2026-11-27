//! What a reader reports. It describes evidence: nothing here is inferred merely from
//! a value being present.

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Status {
    /// Stable device identifier. Private: only its hash is ever published.
    pub key: String,
    pub name: String,
    /// 0..=100; `None` means unknown, never zero.
    pub level: Option<u8>,
    pub charging: bool,
    /// False: the receiver is present but the device is asleep or off.
    pub online: bool,
    /// The device only reports coarse levels.
    pub approximate: bool,
    /// mouse / keyboard / headset / gamepad, or empty to guess from the reader.
    pub kind: &'static str,
    /// A Windows property (Bluetooth, XInput) instead of a reply from the device.
    pub system_property: bool,
    /// `None`: a reply proves online; silence proves neither sleep nor off.
    pub connection_known: Option<bool>,
    pub charging_known: Option<bool>,
    /// An explicit reply says there is no current level.
    pub level_unavailable: bool,
    /// The reported battery field still needs hardware validation.
    pub unconfirmed: bool,
    /// The family shown on the card and used by presentation rules. A reader sets it
    /// only when it differs from its own name; otherwise the engine fills it in.
    pub source: &'static str,
    // Filled in by the engine.
    pub physical_id: String,
    /// The key without the physical instance suffix.
    pub legacy_key: String,
    /// "device" or "provider".
    pub refresh_scope: &'static str,
}

impl Status {
    /// A live reading from the device.
    pub(crate) fn new(
        key: impl Into<String>,
        name: impl Into<String>,
        level: Option<u8>,
        charging: bool,
        kind: &'static str,
    ) -> Self {
        Self {
            key: key.into(),
            name: name.into(),
            level,
            charging,
            online: true,
            kind,
            ..Default::default()
        }
    }
}
