//! Codex's usage limits for the Agent page (roadmap B4), from the rollout files
//! Codex writes anyway: every `token_count` event carries the account's
//! `rate_limits`, two windows told apart by length (300 minutes is the 5-hour
//! window, 10080 the weekly one) in the `primary` / `secondary` slots, either
//! of which can be null. A free plan has one 30-day window (43200) instead,
//! shown under its own name rather than as the weekly one. The newest event that
//! has a window wins, by its own time across the recent rollouts: switching
//! accounts leaves older files (another plan's windows) changed later than the
//! last event in them. Nothing is asked over the network and no Codex login is read.

use std::{
    env,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::Value;

use super::sessions::parse_timestamp_ms;
use super::usage::{AgentUsage, UsageSource, UsageWindow};

/// Rollouts are read from the end; a few token counts fit in far less.
const TAIL_BYTES: u64 = 256 * 1024;
/// Day folders and files looked at, newest first, before giving up.
const MAX_DAYS: usize = 7;
const MAX_FILES: usize = 20;
/// A window up to a day long is the short (5-hour, 300-minute) one; up to about a week, the weekly
/// one (10080); a longer one (a free plan's 30 days) is listed by its length in days.
const DAY_MINUTES: i64 = 24 * 60;
const WEEK_MINUTES_AT_MOST: i64 = 8 * DAY_MINUTES;

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

/// The newest rollout files: `sessions/<year>/<month>/<day>/rollout-*.jsonl` (a long thread's
/// pages, `-<thread>_<page>.jsonl`, too) and `archived_sessions/rollout-*.jsonl`, by change time.
pub(super) fn newest_rollouts(codex_home: &Path) -> Vec<PathBuf> {
    rollouts_by_change(codex_home).into_iter().map(|(_, path)| path).collect()
}

/// The newest rollout files with when each last changed, newest first.
fn rollouts_by_change(codex_home: &Path) -> Vec<(SystemTime, PathBuf)> {
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
    // A session archived from the app moves to `archived_sessions/` (flat; older ones compressed
    // as `.jsonl.zst`, which are left alone), and may hold the newest event.
    files.extend(
        dir_paths(&codex_home.join("archived_sessions"))
            .into_iter()
            .filter(|path| path.extension().is_some_and(|extension| extension == "jsonl"))
            .filter_map(|path| Some((fs::metadata(&path).ok()?.modified().ok()?, path))),
    );
    files.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
    files.truncate(MAX_FILES);
    files
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
        // The account's own limits are `limit_id: "codex"` (older Codex writes none); other ids are
        // separate buckets (a model's or a feature's), not the 5-hour and weekly windows.
        if limits["limit_id"].as_str().is_some_and(|id| id != "codex") {
            return None;
        }
        let at_ms = record["timestamp"].as_str().and_then(parse_timestamp_ms);
        let mut usage = AgentUsage {
            updated_at: at_ms,
            five_hour: None,
            seven_day: None,
            models: Vec::new(),
            plan: limits["plan_type"].as_str().and_then(plan_label),
            source: UsageSource::Codex,
        };
        // The window's length says which it is; without one, the slot does.
        for (slot, fallback_minutes) in [("primary", 300), ("secondary", 10080)] {
            let Some((minutes, limit)) = window(&limits[slot], at_ms) else { continue };
            let minutes = minutes.unwrap_or(fallback_minutes);
            if minutes <= DAY_MINUTES {
                usage.five_hour.get_or_insert(limit);
            } else if minutes <= WEEK_MINUTES_AT_MOST {
                usage.seven_day.get_or_insert(limit);
            } else {
                let days = (minutes + DAY_MINUTES / 2) / DAY_MINUTES;
                usage.models.push(UsageWindow { name: format!("{days}d"), ..limit });
            }
        }
        (usage.five_hour.is_some() || usage.seven_day.is_some() || !usage.models.is_empty()).then_some(usage)
    })
}

/// Codex's latest usage limits; `None` without Codex or without a rollout that reports them.
pub(super) fn read_usage(home_dir: &Path) -> Option<AgentUsage> {
    newest_usage(
        rollouts_by_change(&codex_home(home_dir))
            .into_iter()
            .map(|(changed, path)| (millis(changed), read_tail(&path).as_deref().and_then(parse_rollout))),
    )
}

fn millis(time: SystemTime) -> i64 {
    time.duration_since(UNIX_EPOCH).map_or(0, |since| since.as_millis() as i64)
}

/// Of rollouts (when each last changed, newest first, and its usage), the usage written last.
/// A file's events are no newer than the file, so the search stops at one older than the best.
pub(super) fn newest_usage(rollouts: impl Iterator<Item = (i64, Option<AgentUsage>)>) -> Option<AgentUsage> {
    let mut best: Option<AgentUsage> = None;
    for (changed_ms, usage) in rollouts {
        let best_ms = best.as_ref().map(|usage| usage.updated_at.unwrap_or(i64::MAX));
        if best_ms.is_some_and(|best_ms| changed_ms < best_ms) {
            break;
        }
        let Some(usage) = usage else { continue };
        if best_ms.is_none_or(|best_ms| usage.updated_at.unwrap_or(i64::MIN) > best_ms) {
            best = Some(usage);
        }
    }
    best
}
