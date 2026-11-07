//! Codex's usage limits for the Agent page (roadmap B4), from the rollout files
//! Codex writes anyway: every `token_count` event carries the account's
//! `rate_limits`, two windows told apart by length (300 minutes is the 5-hour
//! window, 10080 the weekly one) in the `primary` / `secondary` slots, either
//! of which can be null. The newest event that has a window wins. Nothing is
//! asked over the network and no Codex login is read.

use std::{
    env,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    time::SystemTime,
};

use serde_json::Value;

use super::sessions::parse_timestamp_ms;
use super::usage::{AgentUsage, UsageSource, UsageWindow};

/// Rollouts are read from the end; a few token counts fit in far less.
const TAIL_BYTES: u64 = 256 * 1024;
/// Day folders and files looked at, newest first, before giving up.
const MAX_DAYS: usize = 7;
const MAX_FILES: usize = 20;
/// A window up to a day long is the short (5-hour, 300-minute) one; longer is the weekly (10080).
const DAY_MINUTES: i64 = 24 * 60;

/// Codex's folder: `CODEX_HOME` when set, else `~/.codex`.
pub(super) fn codex_home(home_dir: &Path) -> PathBuf {
    env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .filter(|dir| dir.is_absolute())
        .unwrap_or_else(|| home_dir.join(".codex"))
}

fn dir_paths(dir: &Path) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = fs::read_dir(dir)
        .map(|entries| entries.filter_map(Result::ok).map(|entry| entry.path()).collect())
        .unwrap_or_default();
    paths.sort();
    paths
}

/// The newest rollout files: `sessions/<year>/<month>/<day>/rollout-*.jsonl`, by change time.
pub(super) fn newest_rollouts(codex_home: &Path) -> Vec<PathBuf> {
    let mut days = Vec::new();
    for year in dir_paths(&codex_home.join("sessions")) {
        for month in dir_paths(&year) {
            days.extend(dir_paths(&month));
        }
    }
    let mut files: Vec<(SystemTime, PathBuf)> = days
        .iter()
        .rev()
        .take(MAX_DAYS)
        .flat_map(|day| dir_paths(day))
        .filter(|path| path.extension().is_some_and(|extension| extension == "jsonl"))
        .filter_map(|path| Some((fs::metadata(&path).ok()?.modified().ok()?, path)))
        .collect();
    files.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
    files.into_iter().take(MAX_FILES).map(|(_, path)| path).collect()
}

fn read_tail(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let start = file.metadata().ok()?.len().saturating_sub(TAIL_BYTES);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    if start > 0 {
        let first_newline = bytes.iter().position(|&byte| byte == b'\n')?;
        bytes.drain(..=first_newline);
    }
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

/// One limit window, when it has a usage figure; `at_ms` is when the event was written.
fn window(value: &Value, at_ms: Option<i64>) -> Option<(Option<i64>, UsageWindow)> {
    let used = value["used_percent"].as_f64().filter(|used| used.is_finite())?;
    // Unix seconds, an ISO time, or seconds from the event.
    let resets_at = match &value["resets_at"] {
        Value::Number(seconds) => seconds.as_i64().map(|seconds| seconds * 1000),
        Value::String(text) => parse_timestamp_ms(text),
        _ => None,
    }
    .or_else(|| Some(at_ms? + value["resets_in_seconds"].as_i64()? * 1000));
    let minutes = value["window_minutes"].as_i64();
    Some((minutes, UsageWindow { name: String::new(), used: used.clamp(0.0, 100.0), resets_at }))
}

/// "pro" → "Pro".
fn plan_label(plan: &str) -> Option<String> {
    let mut chars = plan.trim().chars();
    let first = chars.next()?;
    Some(first.to_uppercase().chain(chars).collect())
}

/// The newest usable `rate_limits` in a rollout's text as usage; `None` when no event has a window.
pub(super) fn parse_rollout(text: &str) -> Option<AgentUsage> {
    text.lines().rev().find_map(|line| {
        if !line.contains("\"token_count\"") {
            return None;
        }
        let record = serde_json::from_str::<Value>(line).ok()?;
        let payload = &record["payload"];
        if payload["type"] != "token_count" {
            return None;
        }
        let limits = &payload["rate_limits"];
        let at_ms = record["timestamp"].as_str().and_then(parse_timestamp_ms);
        let mut usage = AgentUsage {
            updated_at: at_ms,
            five_hour: None,
            seven_day: None,
            models: Vec::new(),
            plan: limits["plan_type"].as_str().and_then(plan_label),
            source: UsageSource::Codex,
            error: None,
        };
        // The window's length says which it is; without one, the slot does.
        for (slot, fallback_five_hours) in [("primary", true), ("secondary", false)] {
            let Some((minutes, limit)) = window(&limits[slot], at_ms) else { continue };
            let five_hours = minutes.map_or(fallback_five_hours, |minutes| minutes <= DAY_MINUTES);
            let target = if five_hours { &mut usage.five_hour } else { &mut usage.seven_day };
            target.get_or_insert(limit);
        }
        (usage.five_hour.is_some() || usage.seven_day.is_some()).then_some(usage)
    })
}

/// Codex's latest usage limits; `None` without Codex or without a rollout that reports them.
pub(super) fn read_usage(home_dir: &Path) -> Option<AgentUsage> {
    newest_rollouts(&codex_home(home_dir))
        .iter()
        .find_map(|path| read_tail(path).as_deref().and_then(parse_rollout))
}
