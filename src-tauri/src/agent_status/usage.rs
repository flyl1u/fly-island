//! Claude usage limits for the Agent page: the 5-hour and 7-day windows, per-model windows and
//! the plan name. Read from the usage snapshot the claude-hud status line keeps, so the island
//! needs no network access or credentials of its own: claude-hud writes it from the
//! `rate_limits` Claude Code passes to status lines (`display.externalUsageWritePath`), or reads
//! one a script keeps up to date (`display.externalUsagePath`, e.g. from an API gateway).
//! When the usage ring's optional "ask Anthropic directly" is on, `merge` lays the
//! `claude_usage` poller's newer numbers and its last error over the snapshot.

use std::{
    env, fs,
    io::Read,
    path::{Path, PathBuf},
};

use serde::Serialize;
use serde_json::Value;

use super::sessions::parse_timestamp_ms;
use crate::claude_usage::{ClaudeUsage, UsageError};

/// A snapshot is a few hundred bytes; anything far larger is not one.
const MAX_SNAPSHOT_BYTES: u64 = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    /// Name of a per-model window ("Fable"); empty for the 5-hour and 7-day windows.
    pub(super) name: String,
    /// Percent used, 0 to 100.
    pub(super) used: f64,
    /// When the window resets, Unix milliseconds.
    pub(super) resets_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentUsage {
    /// When the snapshot was written, Unix milliseconds.
    pub(super) updated_at: Option<i64>,
    pub(super) five_hour: Option<UsageWindow>,
    pub(super) seven_day: Option<UsageWindow>,
    pub(super) models: Vec<UsageWindow>,
    /// The plan or balance claude-hud shows after the windows ("Max 20x").
    pub(super) plan: Option<String>,
    /// Where the windows come from.
    pub(super) source: UsageSource,
    /// Why the last direct request to Anthropic failed; None when it is off or worked.
    pub(super) error: Option<UsageError>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UsageSource {
    /// claude-hud's usage snapshot.
    Hud,
    /// The `claude_usage` poller (Anthropic's OAuth usage endpoint).
    Api,
    /// A local magpie gateway's quotas (magpie.rs).
    Magpie,
    /// Codex's rollout files (codex_usage.rs).
    Codex,
}

/// The snapshot claude-hud reads or writes, from its config in `claude_dir`
/// (`~/.claude`, or `CLAUDE_CONFIG_DIR`); `None` without claude-hud or without either setting.
pub(super) fn snapshot_path(claude_dir: &Path, home_dir: &Path) -> Option<PathBuf> {
    let config = fs::read_to_string(claude_dir.join("plugins").join("claude-hud").join("config.json")).ok()?;
    let config = serde_json::from_str::<Value>(&config).ok()?;
    let display = &config["display"];
    ["externalUsagePath", "externalUsageWritePath"]
        .iter()
        .filter_map(|key| display[*key].as_str())
        .find_map(|path| expand_path(path, home_dir))
}

/// claude-hud's path rules: a leading `~` and `${VAR}` are expanded; relative paths are ignored.
pub(super) fn expand_path(path: &str, home_dir: &Path) -> Option<PathBuf> {
    let path = path.trim();
    let mut expanded = String::with_capacity(path.len());
    let mut rest = match path.strip_prefix('~') {
        Some(after) if after.is_empty() || after.starts_with(['/', '\\']) => {
            expanded.push_str(&home_dir.to_string_lossy());
            after
        }
        _ => path,
    };
    while let Some(start) = rest.find("${") {
        let end = rest[start..].find('}')? + start;
        expanded.push_str(&rest[..start]);
        expanded.push_str(&env::var(&rest[start + 2..end]).ok()?);
        rest = &rest[end + 1..];
    }
    expanded.push_str(rest);
    let path = PathBuf::from(expanded);
    path.is_absolute().then_some(path)
}

/// Parses a snapshot; `None` when it has no usable window at all.
pub(super) fn parse_snapshot(text: &str) -> Option<AgentUsage> {
    let snapshot = serde_json::from_str::<Value>(text).ok()?;
    let window = |value: &Value, name: &str, used_key: &str| {
        let used = value[used_key].as_f64().filter(|used| used.is_finite())?;
        Some(UsageWindow {
            name: name.to_string(),
            used: used.clamp(0.0, 100.0),
            resets_at: value["resets_at"].as_str().and_then(parse_timestamp_ms),
        })
    };
    let models = snapshot["model_scoped"]
        .as_array()
        .map(|models| {
            models
                .iter()
                .filter_map(|model| {
                    let name = model["display_name"].as_str().map(str::trim).filter(|name| !name.is_empty())?;
                    window(model, name, "utilization")
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let usage = AgentUsage {
        updated_at: snapshot["updated_at"].as_str().and_then(parse_timestamp_ms),
        five_hour: window(&snapshot["five_hour"], "", "used_percentage"),
        seven_day: window(&snapshot["seven_day"], "", "used_percentage"),
        models,
        plan: snapshot["balance_label"].as_str().map(str::trim).filter(|plan| !plan.is_empty()).map(str::to_string),
        source: UsageSource::Hud,
        error: None,
    };
    (usage.five_hour.is_some() || usage.seven_day.is_some() || !usage.models.is_empty()).then_some(usage)
}

/// Claude Code's folder: `CLAUDE_CONFIG_DIR` when set, else `~/.claude`.
pub(super) fn claude_dir(home_dir: &Path) -> PathBuf {
    env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .filter(|dir| dir.is_absolute())
        .unwrap_or_else(|| home_dir.join(".claude"))
}

/// The current usage, or `None` when there is no snapshot to read.
pub(super) fn read_usage(home_dir: &Path) -> Option<AgentUsage> {
    let path = snapshot_path(&claude_dir(home_dir), home_dir)?;
    let mut text = String::new();
    fs::File::open(path).ok()?.take(MAX_SNAPSHOT_BYTES).read_to_string(&mut text).ok()?;
    parse_snapshot(&text)
}

/// The usage to show: claude-hud's snapshot, or the direct answer when `api` (the
/// poller, None while it is off) has numbers at least as new. The poller's last
/// error is kept either way, so a refused login is never hidden. While the poller
/// runs this is never None, so the window can say why there are no numbers yet.
pub(super) fn merge(hud: Option<AgentUsage>, api: Option<ClaudeUsage>) -> Option<AgentUsage> {
    let Some(api) = api else { return hud };
    let window = |limit: Option<crate::claude_usage::UsageWindow>| {
        limit.map(|limit| UsageWindow {
            name: String::new(),
            used: limit.percent.clamp(0.0, 100.0),
            resets_at: limit.resets_at.as_deref().and_then(parse_timestamp_ms),
        })
    };
    let api_at = api.updated_at.and_then(|ms| i64::try_from(ms).ok());
    let api_newer = api_at.is_some_and(|api_at| {
        hud.as_ref().is_none_or(|hud| hud.updated_at.is_none_or(|hud_at| api_at >= hud_at))
    });
    let mut usage = match hud {
        // claude-hud's per-model windows belong to its older snapshot, so only its plan stays.
        Some(hud) if api_newer => AgentUsage { models: Vec::new(), ..hud },
        Some(hud) => hud,
        None => AgentUsage { updated_at: None, five_hour: None, seven_day: None, models: Vec::new(), plan: None, source: UsageSource::Hud, error: None },
    };
    if api_newer {
        usage.updated_at = api_at;
        usage.five_hour = window(api.five_hour);
        usage.seven_day = window(api.seven_day);
        usage.source = UsageSource::Api;
    }
    usage.error = api.error;
    Some(usage)
}
