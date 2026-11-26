//! What one round has learned: cards and reader health, and the snapshot made of them.
use super::card::Card;
use super::clock::{public_id, utc_now};
use super::platform::ReadResult;
use super::{presentation, redact};
use crate::hid::DeviceInfo;
use crate::status::Status;
use serde_json::{json, Value};

const MAX_DEVICES: usize = 64;
const MAX_HEALTH: usize = 128;
const MAX_ERRORS: usize = 32;
/// Only these may report game controllers.
const GAMEPAD_READERS: [&str; 3] = ["flydigi", "bluetooth", "xinput"];
/// Readers whose cards are refreshed together even when they report one.
const PROVIDER_SCOPED: [&str; 2] = ["logitech", "standard_hid"];

/// One reader asked about one physical device (empty for the system readers).
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Subject {
    pub reader: &'static str,
    pub physical: String,
}

impl Subject {
    pub(crate) fn key(&self) -> String {
        if self.physical.is_empty() {
            self.reader.to_string()
        } else {
            format!("{}|{}", self.reader, self.physical)
        }
    }

    fn scope(&self) -> &'static str {
        if self.physical.is_empty() {
            "provider"
        } else {
            "device"
        }
    }
}

struct Health {
    subject: Subject,
    state: &'static str,
    device_count: usize,
    reason: Option<&'static str>,
    scope: &'static str,
    checked_at: Option<String>,
    error_code: Option<String>,
}

impl Health {
    fn new(subject: &Subject, state: &'static str) -> Self {
        Self {
            subject: subject.clone(),
            state,
            device_count: 0,
            reason: None,
            scope: subject.scope(),
            checked_at: Some(utc_now()),
            error_code: None,
        }
    }

    fn to_json(&self) -> Value {
        let physical = &self.subject.physical;
        let mut health = json!({
            "provider": self.subject.reader,
            "readerId": public_id(&self.subject.key()),
            "state": self.state,
            "deviceCount": self.device_count,
            "scope": self.scope,
            "physicalId": (!physical.is_empty()).then(|| public_id(physical)),
        });
        let optional = [
            ("reason", self.reason.map(str::to_string)),
            ("checkedAtUtc", self.checked_at.clone()),
            ("errorCode", self.error_code.clone()),
        ];
        for (name, value) in optional {
            if let Some(value) = value {
                health[name] = json!(value);
            }
        }
        health
    }
}

/// The scope shared by the cards of one reader and device.
fn instance_scope(reader: &str, count: usize) -> &'static str {
    if PROVIDER_SCOPED.contains(&reader) || count > 1 {
        "provider"
    } else {
        "device"
    }
}

#[derive(Default)]
pub(crate) struct Round {
    pub request_id: u64,
    pub generation: u64,
    pub provider_count: usize,
    /// Present physical devices and their collections.
    pub groups: Vec<(String, Vec<DeviceInfo>)>,
    pub native_mouse: Option<bool>,
    cards: Vec<Card>,
    health: Vec<(String, Health)>,
}

impl Round {
    fn set_health(&mut self, health: Health) {
        let key = health.subject.key();
        match self
            .health
            .iter_mut()
            .find(|(existing, _)| *existing == key)
        {
            Some((_, slot)) => *slot = health,
            None => self.health.push((key, health)),
        }
    }

    /// A reader none of the present devices belong to.
    pub(crate) fn no_devices(&mut self, reader: &'static str) {
        let subject = Subject {
            reader,
            physical: String::new(),
        };
        self.set_health(Health {
            checked_at: None,
            ..Health::new(&subject, "no_devices")
        });
    }

    pub(crate) fn fail(&mut self, subject: &Subject, code: &'static str) {
        let state = if code == "timeout" {
            "timeout"
        } else {
            "error"
        };
        self.set_health(Health {
            error_code: Some(code.to_string()),
            scope: "provider",
            ..Health::new(subject, state)
        });
    }

    /// The round's time budget ran out before this reader was asked.
    pub(crate) fn defer(&mut self, subject: &Subject) {
        self.set_health(Health {
            reason: Some("round_budget"),
            ..Health::new(subject, "deferred")
        });
    }

    fn group(&self, physical: &str) -> &[DeviceInfo] {
        self.groups
            .iter()
            .find(|(id, _)| id == physical)
            .map_or(&[], |(_, infos)| infos)
    }

    /// Binds a reading to its physical device and removes private text from it.
    /// `ambiguous`: the reader matched several devices, so its plain key names none.
    fn qualify(&self, subject: &Subject, status: &mut Status, count: usize, ambiguous: bool) {
        if status.source.is_empty() {
            status.source = subject.reader;
        }
        if !subject.physical.is_empty() {
            let original = status.key.clone();
            status.key = format!("{original}:instance:{}", subject.physical);
            status.legacy_key = if ambiguous { String::new() } else { original };
            status.physical_id.clone_from(&subject.physical);
            status.refresh_scope = instance_scope(subject.reader, count);
        }
        let private = self
            .group(&subject.physical)
            .iter()
            .flat_map(|info| [&info.serial, &info.path, &info.physical_id].map(String::as_str));
        status.name = redact::secrets(&status.name, private);
    }

    pub(crate) fn accept(
        &mut self,
        subject: &Subject,
        result: ReadResult,
        ambiguous: bool,
        now: &str,
    ) {
        let count = result.statuses.len().min(MAX_DEVICES);
        let any_online = result.statuses.iter().any(|status| status.online);
        let mut accepted: Vec<String> = Vec::new();
        for mut status in result.statuses.into_iter().take(MAX_DEVICES) {
            self.qualify(subject, &mut status, count, ambiguous);
            if status.kind == "gamepad"
                && (!GAMEPAD_READERS.contains(&subject.reader) || status.source != subject.reader)
            {
                continue;
            }
            let card = Card::from_status(&status, now);
            if !accepted.contains(&card.id) {
                accepted.push(card.id.clone());
            }
            match self
                .cards
                .iter_mut()
                .find(|existing| existing.id == card.id)
            {
                Some(existing) => *existing = card,
                None => self.cards.push(card),
            }
        }
        // Passive readers only count when something was actually heard.
        let passive = matches!(subject.reader, "rapoo" | "fa6x_passive");
        let measured = !accepted.is_empty()
            && (!passive
                || self
                    .cards
                    .iter()
                    .any(|c| c.current && accepted.contains(&c.id)));
        let (state, reason) = if measured {
            ("ok", "")
        } else if subject.physical.is_empty() {
            ("no_devices", "no_device")
        } else if subject.reader == "standard_hid" {
            ("unsupported", "no_declared_battery")
        } else {
            ("unavailable", "no_measurement")
        };
        self.set_health(Health {
            device_count: accepted.len(),
            reason: Some(reason),
            error_code: result.failure.filter(|_| !any_online),
            ..Health::new(subject, state)
        });
    }

    /// The cards the host should show, and the names of the hidden duplicates.
    fn visible(&self) -> (Vec<Card>, Vec<Value>) {
        let mut cards: Vec<Card> = self.cards.iter().take(MAX_DEVICES).cloned().collect();
        let legacy: Vec<Option<String>> = cards.iter().map(|c| c.legacy_id.clone()).collect();
        for card in &mut cards {
            let shared = legacy.iter().filter(|id| **id == card.legacy_id).count() > 1;
            if shared {
                card.legacy_id = None;
            }
        }
        presentation::hide_bluetooth_xinput(&mut cards);
        let rank = |kind: &str| match kind {
            "mouse" => 0,
            "keyboard" => 1,
            "headset" => 2,
            _ => 3,
        };
        cards.sort_by(|a, b| (rank(a.kind), &a.name, &a.id).cmp(&(rank(b.kind), &b.name, &b.id)));
        let suppressed = presentation::hide_old_connections(&mut cards);
        (cards, suppressed)
    }

    /// The (vendor ID, product ID) of a device whose collections agree on one.
    fn model_of(&self, physical: &str) -> Option<(u16, u16)> {
        let mut models = self
            .group(physical)
            .iter()
            .map(|info| (info.vendor_id, info.product_id));
        let first = models.next()?;
        models.all(|model| model == first).then_some(first)
    }

    pub(crate) fn snapshot(&self, complete: bool) -> Value {
        let (cards, suppressed) = self.visible();
        let devices: Vec<Value> = cards
            .iter()
            .map(|card| card.to_json(self.model_of(&card.physical)))
            .collect();
        let unadapted = if complete {
            presentation::unadapted(&self.groups, &self.cards)
        } else {
            Vec::new()
        };
        let health: Vec<&Health> = self
            .health
            .iter()
            .take(MAX_HEALTH)
            .map(|(_, h)| h)
            .collect();
        let errors: Vec<String> = health
            .iter()
            .filter_map(|h| {
                let code = h.error_code.as_ref()?;
                Some(format!("{}: {code}", h.subject.reader))
            })
            .take(MAX_ERRORS)
            .collect();
        let health: Vec<Value> = health.into_iter().map(Health::to_json).collect();
        let mut snapshot = super::envelope(self.request_id, self.generation, complete);
        snapshot["devices"] = json!(devices);
        snapshot["nativeMousePresent"] = json!(self.native_mouse);
        snapshot["unadapted"] = json!(unadapted);
        snapshot["suppressed"] = json!(suppressed);
        snapshot["providerCount"] = json!(self.provider_count);
        snapshot["errors"] = json!(errors);
        snapshot["health"] = json!(health);
        snapshot
    }
}

#[cfg(test)]
mod tests;
