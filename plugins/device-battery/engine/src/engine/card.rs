//! One reading as the card the host shows. A value is shown only when this poll
//! acquired it; nothing is carried over and nothing is estimated here.
use super::clock::public_id;
use crate::status::Status;
use serde_json::{json, Value};

const MAX_NAME_CHARS: usize = 80;
const FALLBACK_NAME: &str = "Wireless device";
/// Every reader is "protocol wired up, not yet verified on this project's hardware".
const VERIFICATION_LEVEL: &str = "C";
const VERIFICATION_LABEL: &str = "协议已接入，待本项目实机验证";
/// Families whose protocols carry no charging evidence unless the reader says so.
const NO_CHARGING_EVIDENCE: [&str; 7] = [
    "bluetooth",
    "xinput",
    "standard_hid",
    "lofree",
    "keychron",
    "am_infinity",
    "astro",
];
const MOUSE_FAMILIES: [&str; 8] = [
    "wlmouse",
    "mchose",
    "pulsar",
    "asus",
    "gwolves",
    "lamzu",
    "am_infinity",
    "nzxt",
];

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Card {
    pub id: String,
    pub legacy_id: Option<String>,
    /// The private physical key; only its hash is published.
    pub physical: String,
    pub name: String,
    pub kind: &'static str,
    pub percent: Option<u8>,
    pub charging: Option<bool>,
    pub online: bool,
    pub connection_known: bool,
    pub fresh: bool,
    pub approximate: bool,
    pub family: &'static str,
    pub unconfirmed: bool,
    pub transport: &'static str,
    pub confirmed_at: Option<String>,
    measured_at: Option<String>,
    queried_at: Option<String>,
    checked_at: String,
    source_quality: &'static str,
    /// The device answered with a level in this poll.
    pub current: bool,
    refresh_scope: &'static str,
}

fn kind_of(status: &Status) -> &'static str {
    match status.kind {
        "mouse" => return "mouse",
        "headset" => return "headset",
        "keyboard" => return "keyboard",
        "gamepad" => return "gamepad",
        _ => {}
    }
    let name = status.name.to_lowercase();
    let mentions = |words: &[&str]| words.iter().any(|word| name.contains(word));
    if mentions(&["keyboard", "blackwidow", "deathstalker", "lofree"]) {
        return "keyboard";
    }
    match status.source {
        "bluetooth" | "standard_hid" => "device",
        "razer" | "logitech" => {
            let headset = mentions(&[
                "headset",
                "blackshark",
                "kraken",
                "barracuda",
                "g733",
                "g pro x",
            ]);
            if headset {
                "headset"
            } else {
                "mouse"
            }
        }
        family if MOUSE_FAMILIES.contains(&family) => "mouse",
        _ => "headset",
    }
}

fn clean_name(name: &str) -> String {
    let name = if name.is_empty() { FALLBACK_NAME } else { name };
    name.chars()
        .filter(|c| !c.is_control())
        .take(MAX_NAME_CHARS)
        .collect()
}

fn optional_id(key: &str) -> Option<String> {
    (!key.is_empty()).then(|| public_id(key))
}

impl Card {
    /// `status.source` must already be filled in. `now` is when it was read.
    pub(crate) fn from_status(status: &Status, now: &str) -> Self {
        let system = status.system_property || status.source == "bluetooth";
        let online = status.online;
        let connection_known = status.connection_known.unwrap_or(online);
        // An explicit "no current level" answer, as opposed to silence.
        let unavailable = status.level_unavailable
            && status.connection_known == Some(true)
            && (!system || status.source == "xinput");
        let level = status.level.filter(|&level| level <= 100 && !unavailable);
        let acquired = online && level.is_some();
        let fresh = acquired && !system;
        let charging_known = status
            .charging_known
            .unwrap_or(!NO_CHARGING_EVIDENCE.contains(&status.source));
        let charging =
            ((fresh || (unavailable && online)) && charging_known).then_some(status.charging);
        let at = |wanted: bool| wanted.then(|| now.to_string());
        let refresh_scope = match status.refresh_scope {
            "device" => "device",
            "provider" => "provider",
            _ if system || matches!(status.source, "logitech" | "standard_hid") => "provider",
            _ if !status.physical_id.is_empty() => "device",
            _ => "provider",
        };
        Self {
            id: public_id(&status.key),
            legacy_id: optional_id(&status.legacy_key),
            physical: status.physical_id.clone(),
            name: clean_name(&status.name),
            kind: kind_of(status),
            percent: level.filter(|_| acquired),
            charging,
            online,
            connection_known,
            fresh,
            approximate: status.approximate,
            family: status.source,
            unconfirmed: status.unconfirmed,
            transport: if system && status.source != "xinput" {
                "Bluetooth"
            } else {
                "USB / 2.4G"
            },
            confirmed_at: at(acquired),
            measured_at: at(fresh),
            queried_at: at(acquired || unavailable),
            checked_at: now.to_string(),
            source_quality: if !unavailable && !acquired {
                "cached"
            } else if system {
                "system_property"
            } else {
                "device_reply"
            },
            current: acquired,
            refresh_scope,
        }
    }

    /// `model` is the (vendor ID, product ID) when the physical device has only one.
    pub(crate) fn to_json(&self, model: Option<(u16, u16)>) -> Value {
        let connection = match (self.connection_known, self.online) {
            (false, _) => "unconfirmed",
            (true, true) => "connected",
            (true, false) => "disconnected",
        };
        let mut card = json!({
            "id": self.id,
            "legacyId": self.legacy_id,
            "physicalId": optional_id(&self.physical),
            "unitId": null,
            "name": self.name,
            "kind": self.kind,
            "percent": self.percent,
            "charging": self.charging,
            "chargingKnown": self.charging.is_some(),
            "online": self.online,
            "connectionState": connection,
            "fresh": self.fresh,
            "approximate": self.approximate,
            "provider": self.family,
            "transport": self.transport,
            "confirmedAtUtc": self.confirmed_at,
            "measuredAtUtc": self.measured_at,
            "queriedAtUtc": self.queried_at,
            "connectionCheckedAtUtc": self.connection_known.then_some(&self.checked_at),
            "chargingCheckedAtUtc": self.charging.map(|_| &self.checked_at),
            "sourceQuality": self.source_quality,
            "verificationLevel": VERIFICATION_LEVEL,
            "verificationLabel": VERIFICATION_LABEL,
            "measurementState": if self.current { "current" } else { "unknown" },
            "refreshScope": self.refresh_scope,
            "dpi": null,
        });
        if self.unconfirmed {
            card["unconfirmed"] = json!(true);
        }
        if let Some((vendor_id, product_id)) = model {
            card["vendorId"] = json!(vendor_id);
            card["productId"] = json!(product_id);
        }
        card
    }
}

#[cfg(test)]
mod tests;
