//! Claude's usage limits as the Claude desktop app last read them. Whenever the app asks Anthropic
//! for the account's usage (every few minutes while it is open), it appends a sample to
//! `plan-usage-history.json` in its data folder: `{"version": 2, "samples": [{"t": <Unix ms>,
//! "org": <organization>, "u": {"fh": <5-hour % used>, "sd": <7-day % used>, ...}}]}`. Version 1
//! kept `fh` and `sd` beside `t`. The island only reads the file: no login, no network.
//!
//! The samples carry no reset times. A sample older than a window's length may describe a window
//! that has since reset, so that window is left out rather than shown with an old figure.

use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

use serde_json::Value;

use super::conversation_link::claude_desktop_roots;
use super::usage::{AgentUsage, UsageSource, UsageWindow};

const FILE_NAME: &str = "plan-usage-history.json";
/// A month of samples every few minutes is well under this.
const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;
const FIVE_HOURS_MS: i64 = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS: i64 = 7 * 24 * 60 * 60 * 1000;
/// Per-model weekly windows the app records, by key, with the name the card gives them.
const MODEL_WINDOWS: &[(&str, &str)] = &[("so", "Opus"), ("sn", "Sonnet")];

/// The newest sample among the Claude desktop installs on this computer; `None` without one.
pub(super) fn read_usage(now: i64) -> Option<AgentUsage> {
    claude_desktop_roots()
        .iter()
        .flat_map(|root| [root.join(FILE_NAME), root.join("appdata").join(FILE_NAME)])
        .filter_map(|path| read_text(&path))
        .filter_map(|text| parse_history(&text, now))
        .max_by_key(|usage| usage.updated_at)
}

fn read_text(path: &PathBuf) -> Option<String> {
    let mut text = String::new();
    File::open(Path::new(path)).ok()?.take(MAX_FILE_BYTES).read_to_string(&mut text).ok()?;
    Some(text)
}

/// The usage in the history's newest sample, as of `now` (Unix ms); `None` when it has no window
/// that can still be current.
pub(super) fn parse_history(text: &str, now: i64) -> Option<AgentUsage> {
    let history = serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}')).ok()?;
    let sample = history["samples"]
        .as_array()?
        .iter()
        .filter(|sample| sample["t"].as_i64().is_some())
        .max_by_key(|sample| sample["t"].as_i64())?;
    let at = sample["t"].as_i64()?;
    // Version 2 nests the figures under "u"; version 1 kept them beside "t".
    let figures = if sample["u"].is_object() { &sample["u"] } else { sample };
    let age = now.saturating_sub(at);
    let window = |key: &str, name: &str, length_ms: i64| {
        let used = figures[key].as_f64().filter(|used| used.is_finite())?;
        (age <= length_ms).then(|| UsageWindow { name: name.to_string(), used: used.clamp(0.0, 100.0), resets_at: None })
    };
    let usage = AgentUsage {
        updated_at: Some(at),
        five_hour: window("fh", "", FIVE_HOURS_MS),
        seven_day: window("sd", "", SEVEN_DAYS_MS),
        models: MODEL_WINDOWS.iter().filter_map(|(key, name)| window(key, name, SEVEN_DAYS_MS)).collect(),
        plan: None,
        source: UsageSource::ClaudeDesktop,
    };
    (usage.five_hour.is_some() || usage.seven_day.is_some()).then_some(usage)
}
