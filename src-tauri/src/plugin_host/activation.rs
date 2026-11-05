//! `activationEvents` (API version 2): when the host starts a plugin's process.
//! Like VS Code since 1.74, commands and views imply `onCommand:<id>` and
//! `onView:<id>`. A manifest without the field runs from start-up, as before;
//! so do all version 1 plugins.

use serde_json::Value;

use super::{events::event_permission, manifest::PluginCommand, view_specs::ViewSpec};

const MAX_EVENTS: usize = 20;
pub(super) const MIN_SCHEDULE_MINUTES: u32 = 5;
const MAX_SCHEDULE_MINUTES: u32 = 24 * 60;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum ActivationEvent {
    /// Runs while the island runs (and is not stopped when idle).
    Startup,
    /// Started 10 s after the island starts.
    StartupFinished,
    Command(String),
    View(String),
    /// One of the events plugins subscribe to, e.g. `todos.changed`.
    Event(&'static str),
    /// Woken every N minutes.
    Schedule(u32),
}

impl ActivationEvent {
    fn parse(text: &str) -> Option<Self> {
        match text {
            "onStartup" => return Some(Self::Startup),
            "onStartupFinished" => return Some(Self::StartupFinished),
            _ => {}
        }
        let (kind, value) = text.split_once(':')?;
        match kind {
            "onCommand" => Some(Self::Command(value.to_string())),
            "onView" => Some(Self::View(value.to_string())),
            "onEvent" => event_permission(value).map(|(name, _)| Self::Event(name)),
            "onSchedule" => value
                .parse::<u32>()
                .ok()
                .filter(|minutes| (MIN_SCHEDULE_MINUTES..=MAX_SCHEDULE_MINUTES).contains(minutes))
                .map(Self::Schedule),
            _ => None,
        }
    }

    /// As written in the manifest; also told to the plugin in `initialize.activationEvent`.
    pub(super) fn label(&self) -> String {
        match self {
            Self::Startup => "onStartup".into(),
            Self::StartupFinished => "onStartupFinished".into(),
            Self::Command(id) => format!("onCommand:{id}"),
            Self::View(id) => format!("onView:{id}"),
            Self::Event(name) => format!("onEvent:{name}"),
            Self::Schedule(minutes) => format!("onSchedule:{minutes}"),
        }
    }
}

/// When a plugin runs. Eager plugins run from start-up; the others start on one
/// of `events` and stop again when idle.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Activation {
    pub events: Vec<ActivationEvent>,
}

impl Default for Activation {
    fn default() -> Self {
        Self { events: vec![ActivationEvent::Startup] }
    }
}

impl Activation {
    pub(super) fn is_eager(&self) -> bool {
        self.events.contains(&ActivationEvent::Startup)
    }

    pub(super) fn on_event(&self, name: &str) -> bool {
        self.events.iter().any(|event| matches!(event, ActivationEvent::Event(known) if *known == name))
    }

    pub(super) fn on_startup_finished(&self) -> bool {
        self.events.contains(&ActivationEvent::StartupFinished)
    }

    /// The shortest `onSchedule` interval, if any.
    pub(super) fn schedule_minutes(&self) -> Option<u32> {
        self.events
            .iter()
            .filter_map(|event| match event {
                ActivationEvent::Schedule(minutes) => Some(*minutes),
                _ => None,
            })
            .min()
    }
}

/// Reads `activationEvents` as written and adds what the contributions imply.
/// `permissions` is what the manifest asks for: an `onEvent` needs the event's permission.
pub(super) fn read(
    raw: &Value,
    api_version: u32,
    commands: &[PluginCommand],
    views: &[ViewSpec],
    permissions: &[String],
) -> Result<Activation, String> {
    if api_version < 2 || raw.is_null() {
        return Ok(Activation::default());
    }
    let list = raw.as_array().ok_or("activationEvents must be a list of strings.")?;
    if list.len() > MAX_EVENTS {
        return Err(format!("A plugin can list at most {MAX_EVENTS} activation events."));
    }
    let mut events = Vec::new();
    for value in list {
        let text = value.as_str().unwrap_or_default();
        let event = ActivationEvent::parse(text).ok_or_else(|| format!("Unknown activation event \"{text}\"."))?;
        match &event {
            ActivationEvent::Command(id) if !commands.iter().any(|command| command.id() == id) => {
                return Err(format!("Activation event \"{text}\" names a command the plugin does not declare."));
            }
            ActivationEvent::View(id) if !views.iter().any(|view| view.id == *id) => {
                return Err(format!("Activation event \"{text}\" names a view the plugin does not declare."));
            }
            ActivationEvent::Event(name) => {
                if let Some((_, Some(permission))) = event_permission(name) {
                    if !permissions.iter().any(|asked| asked == permission) {
                        return Err(format!("Activation event \"{text}\" needs the \"{permission}\" permission."));
                    }
                }
            }
            _ => {}
        }
        if !events.contains(&event) {
            events.push(event);
        }
    }
    let implied = commands
        .iter()
        .map(|command| ActivationEvent::Command(command.id().to_string()))
        .chain(views.iter().map(|view| ActivationEvent::View(view.id.clone())));
    for event in implied {
        if !events.contains(&event) {
            events.push(event);
        }
    }
    Ok(Activation { events })
}
