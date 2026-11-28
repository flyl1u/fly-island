//! Eye-care reminder, inspired by the behavior of kaima2022/Health-reminder (MIT).
mod clock;
mod panel;
mod win32;

use clock::Clock;
pub(crate) use clock::Phase;
use fly_island_plugin_sdk::{json, run, Value};
use std::{
    sync::{Arc, Mutex, PoisonError},
    time::{Duration, Instant},
};
use win32::{fullscreen, idle};

pub(crate) struct Settings {
    period_minutes: u64,
    rest_minutes: u64,
    idle: Duration,
    allow_skip: bool,
    fullscreen_pause: bool,
    hosted_windows: bool,
    english: bool,
}

impl Settings {
    fn parse(settings: &Value) -> Self {
        Self {
            period_minutes: number(settings, "period", 20, 1, 720),
            rest_minutes: rest_minutes(settings),
            idle: Duration::from_secs(number(settings, "idle", 5, 1, 120) * 60),
            allow_skip: settings["allow-skip"].as_bool().unwrap_or(true),
            fullscreen_pause: settings["pause-fullscreen"].as_bool().unwrap_or(true),
            hosted_windows: settings["_host-eye-care-windows"]
                .as_bool()
                .unwrap_or(false),
            english: settings["language"] == "en",
        }
    }
    fn period(&self) -> Duration {
        Duration::from_secs(self.period_minutes * 60)
    }
    fn rest(&self) -> Duration {
        Duration::from_secs(self.rest_minutes * 60)
    }
    pub(crate) fn text<'a>(&self, zh: &'a str, en: &'a str) -> &'a str {
        if self.english {
            en
        } else {
            zh
        }
    }
}

fn rest_minutes(settings: &Value) -> u64 {
    if let Some(value) = settings.get("rest-minutes") {
        return value
            .as_str()
            .and_then(|value| value.trim().parse::<f64>().ok())
            .filter(|minutes| minutes.is_finite() && (1.0 / 60.0..=60.0).contains(minutes))
            .map(|minutes| minutes.ceil() as u64)
            .unwrap_or(1);
    }
    // An old host may still initialize the new executable with its saved seconds setting.
    if settings.get("rest").is_some() {
        return number(settings, "rest", 20, 1, 3600).div_ceil(60);
    }
    1
}

fn number(settings: &Value, key: &str, fallback: u64, min: u64, max: u64) -> u64 {
    settings[key]
        .as_str()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|value| (min..=max).contains(value))
        .unwrap_or(fallback)
}

pub(crate) struct Shared {
    clock: Clock,
    settings: Settings,
    idle: bool,
    fullscreen: bool,
}

struct Reminder {
    shared: Arc<Mutex<Shared>>,
}

impl Reminder {
    fn new(settings: Settings) -> Self {
        Self {
            shared: Arc::new(Mutex::new(Shared {
                clock: Clock::new(Instant::now(), settings.period(), settings.rest()),
                settings,
                idle: false,
                fullscreen: false,
            })),
        }
    }

    fn refresh(&mut self) -> Value {
        if !self
            .shared
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .settings
            .hosted_windows
        {
            let shared = self.shared.lock().unwrap_or_else(PoisonError::into_inner);
            return panel::unsupported(&shared.settings);
        }
        let mut shared = self.shared.lock().unwrap_or_else(PoisonError::into_inner);
        shared.idle = idle::elapsed().is_some_and(|elapsed| elapsed >= shared.settings.idle);
        shared.fullscreen = shared.settings.fullscreen_pause && fullscreen::active() == Some(true);
        let (idle, fullscreen) = (shared.idle, shared.fullscreen);
        shared.clock.tick(Instant::now(), idle, fullscreen);
        panel::snapshot(&shared)
    }

    fn action(&mut self, id: &str) -> Result<(), String> {
        let mut shared = self.shared.lock().unwrap_or_else(PoisonError::into_inner);
        if !shared.settings.hosted_windows {
            return Err("Update the host for themed break windows".into());
        }
        let at = Instant::now();
        let (idle, fullscreen) = (shared.idle, shared.fullscreen);
        shared.clock.tick(at, idle, fullscreen);
        let accepted = match id {
            "rest_now" if shared.clock.phase() == Phase::Working => {
                shared.clock.rest_now(at);
                true
            }
            "reset_work" => shared.clock.reset_work(at),
            "skip" => {
                let allowed = shared.settings.allow_skip;
                shared.clock.skip_rest(at, allowed)
            }
            _ => id
                .strip_prefix("snooze_")
                .and_then(|minutes| minutes.parse::<u64>().ok())
                .is_some_and(|minutes| shared.clock.snooze(at, minutes)),
        };
        if accepted {
            Ok(())
        } else {
            Err("Action unavailable in the current phase".into())
        }
    }
}

fn main() {
    win32::initialize_dpi();
    let reminder: Arc<Mutex<Option<Reminder>>> = Arc::new(Mutex::new(None));
    let poll = {
        let reminder = Arc::clone(&reminder);
        move |settings: &Value| {
            let mut slot = reminder.lock().unwrap_or_else(PoisonError::into_inner);
            Ok(slot
                .get_or_insert_with(|| Reminder::new(Settings::parse(settings)))
                .refresh())
        }
    };
    let action = {
        let reminder = Arc::clone(&reminder);
        move |id: &str, settings: &Value| {
            let mut slot = reminder.lock().unwrap_or_else(PoisonError::into_inner);
            let reminder = slot.get_or_insert_with(|| Reminder::new(Settings::parse(settings)));
            reminder.action(id)?;
            Ok(json!({ "success": true }))
        }
    };
    // The host owns break windows; shutdown/EOF releases only in-memory timer state.
    let result = run(Duration::from_secs(1), poll, action);
    reminder
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .take();
    if result.is_err() {
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_are_bounded_and_skip_is_explicit() {
        let parsed = Settings::parse(&json!({
            "period":" 30 ", "rest":"1", "idle":"8", "allow-skip":false,
            "pause-fullscreen":false, "language":"en"
        }));
        assert_eq!(parsed.period_minutes, 30);
        assert_eq!(parsed.rest(), Duration::from_secs(60));
        assert_eq!(parsed.idle, Duration::from_secs(480));
        assert!(!parsed.allow_skip);
        assert!(!parsed.fullscreen_pause);
        assert!(parsed.english);
        for input in ["0", "721", "-1", "abc", "18446744073709551616"] {
            assert_eq!(Settings::parse(&json!({"period":input})).period_minutes, 20);
        }
        assert!(Settings::parse(&json!({})).allow_skip);
        assert!(Settings::parse(&json!({})).fullscreen_pause);
    }

    #[test]
    fn break_minutes_are_whole_and_legacy_durations_round_up() {
        for (value, seconds) in [("1", 60), ("2.5", 180), ("60", 3600)] {
            assert_eq!(
                Settings::parse(&json!({"rest-minutes":value})).rest(),
                Duration::from_secs(seconds)
            );
        }
        for value in ["0", "61", "-1", "NaN", "inf", "abc"] {
            assert_eq!(
                Settings::parse(&json!({"rest-minutes":value})).rest(),
                Duration::from_secs(60)
            );
        }
        assert_eq!(
            Settings::parse(&json!({"rest":"20"})).rest(),
            Duration::from_secs(60)
        );
        assert_eq!(
            Settings::parse(&json!({"rest":"20","rest-minutes":"2"})).rest(),
            Duration::from_secs(120)
        );
    }

    #[test]
    fn host_window_actions_preserve_phase_permissions_and_one_postponement() {
        let mut reminder = Reminder::new(Settings::parse(&json!({
            "_host-eye-care-windows":true, "allow-skip":false
        })));
        assert!(reminder.action("skip").is_err());
        assert!(reminder.action("snooze_10").is_err());
        assert!(reminder.action("rest_now").is_ok());
        assert!(reminder.action("rest_now").is_err());
        assert!(reminder.action("snooze_11").is_err());
        assert!(reminder.action("skip").is_err());
        assert!(reminder.action("snooze_25").is_ok());
        {
            let shared = reminder.shared.lock().unwrap();
            let remaining = shared.clock.remaining(Instant::now()).as_secs();
            assert!((1498..=1500).contains(&remaining));
        }
        assert!(reminder.action("rest_now").is_ok());
        assert!(reminder.action("snooze_10").is_err());
        reminder.shared.lock().unwrap().settings.allow_skip = true;
        assert!(reminder.action("skip").is_ok());
    }

    #[test]
    fn older_hosts_get_an_upgrade_notice_instead_of_silent_missing_windows() {
        let mut reminder = Reminder::new(Settings::parse(&json!({"language":"en"})));
        let snapshot = reminder.refresh();
        assert_eq!(snapshot["panel"]["attention"], false);
        assert_eq!(snapshot["panel"]["actions"], json!([]));
        assert!(snapshot["panel"]["headline"]
            .as_str()
            .unwrap()
            .contains("Update"));
        assert!(reminder.action("rest_now").is_err());
    }
}
