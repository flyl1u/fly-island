//! Agent statuses reported by plugins and the local API, next to the built-in
//! Codex / Claude Code ones. Kept in memory only: a source is gone after a
//! restart, and a plugin's sources are cleared when the plugin stops.

use serde::Serialize;
use serde_json::Value;
use std::sync::{Mutex, PoisonError};

use super::markers::AGENT_RUNNING_STALE_AFTER_MS;
use super::snapshot::current_unix_millis;

const MAX_SOURCES: usize = 16;
const MAX_NAME_CHARS: usize = 40;
const MAX_TITLE_CHARS: usize = 120;
const MAX_TASK_ID_CHARS: usize = 100;

/// One reported source. Mirrored by `ExternalAgentStatus` in src/features/agent-status/api.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalAgentStatus {
    /// `<owner>/<source>`, e.g. `dev.example.cursor/cursor` or `local-api/aider`.
    id: String,
    name: String,
    phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    updated_at: i64,
    #[serde(skip)]
    owner: String,
}

static SOURCES: Mutex<Vec<ExternalAgentStatus>> = Mutex::new(Vec::new());

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct AgentReport {
    pub source: String,
    pub name: Option<String>,
    pub phase: String,
    pub title: Option<String>,
    pub task_id: Option<String>,
}

/// Checks `{ source, phase, name?, title?, taskId? }`.
pub(super) fn parse_report(params: &Value) -> Result<AgentReport, String> {
    let source = params.get("source").and_then(Value::as_str).unwrap_or_default();
    if !is_valid_source(source) {
        return Err("\"source\" must be 1-32 lowercase letters, digits or '-'.".into());
    }
    let phase = params.get("phase").and_then(Value::as_str).unwrap_or_default();
    if !matches!(phase, "idle" | "running" | "completed" | "failed") {
        return Err("\"phase\" must be idle, running, completed or failed.".into());
    }
    Ok(AgentReport {
        source: source.to_string(),
        name: optional_text(params, "name", MAX_NAME_CHARS)?,
        phase: phase.to_string(),
        title: optional_text(params, "title", MAX_TITLE_CHARS)?,
        task_id: optional_text(params, "taskId", MAX_TASK_ID_CHARS)?,
    })
}

fn is_valid_source(source: &str) -> bool {
    (1..=32).contains(&source.len())
        && source.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn optional_text(params: &Value, key: &str, max_chars: usize) -> Result<Option<String>, String> {
    match params.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(text)) => {
            let text = text.trim();
            if text.chars().count() > max_chars {
                Err(format!("\"{key}\" can be at most {max_chars} characters."))
            } else {
                Ok((!text.is_empty()).then(|| text.to_string()))
            }
        }
        Some(_) => Err(format!("\"{key}\" must be a string.")),
    }
}

/// Saves a report from `owner`. `default_name` is shown when the report has no name.
pub(super) fn report(owner: &str, default_name: &str, report: AgentReport) -> Result<ExternalAgentStatus, String> {
    let id = format!("{owner}/{}", report.source);
    let mut sources = SOURCES.lock().unwrap_or_else(PoisonError::into_inner);
    let existing = sources.iter().position(|status| status.id == id);
    if existing.is_none() && sources.len() >= MAX_SOURCES {
        return Err(format!("At most {MAX_SOURCES} agent sources can report at once."));
    }
    let name = report
        .name
        .or_else(|| existing.map(|index| sources[index].name.clone()))
        .unwrap_or_else(|| default_name.to_string());
    let status = ExternalAgentStatus {
        id,
        name,
        phase: report.phase,
        task_id: report.task_id,
        title: report.title,
        updated_at: current_unix_millis(),
        owner: owner.to_string(),
    };
    match existing {
        Some(index) => sources[index] = status.clone(),
        None => sources.push(status.clone()),
    }
    Ok(status)
}

/// Removes one source of `owner`, or all of them with `None`. Returns how many went.
pub(super) fn clear(owner: &str, source: Option<&str>) -> usize {
    let mut sources = SOURCES.lock().unwrap_or_else(PoisonError::into_inner);
    let before = sources.len();
    sources.retain(|status| status.owner != owner || source.is_some_and(|source| status.id != format!("{owner}/{source}")));
    before - sources.len()
}

/// Removes a source by its full id (the settings page's clear button).
pub(super) fn clear_by_id(id: &str) -> bool {
    let mut sources = SOURCES.lock().unwrap_or_else(PoisonError::into_inner);
    let before = sources.len();
    sources.retain(|status| status.id != id);
    before != sources.len()
}

/// Current sources for a snapshot; a source running for too long without a new
/// report shows as `stale`, like the built-in agents.
pub(super) fn current() -> Vec<ExternalAgentStatus> {
    let now = current_unix_millis();
    SOURCES
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .iter()
        .cloned()
        .map(|mut status| {
            if status.phase == "running" && now.saturating_sub(status.updated_at) >= AGENT_RUNNING_STALE_AFTER_MS {
                status.phase = "stale".into();
            }
            status
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reports_are_checked() {
        let ok = parse_report(&json!({ "source": "cursor", "phase": "running", "title": "  Fix bug  " })).expect("valid");
        assert_eq!(ok.title.as_deref(), Some("Fix bug"));
        assert_eq!(ok.name, None);
        for bad in [
            json!({ "phase": "running" }),
            json!({ "source": "Cursor", "phase": "running" }),
            json!({ "source": "cursor", "phase": "stale" }),
            json!({ "source": "cursor", "phase": "running", "title": 3 }),
            json!({ "source": "cursor", "phase": "running", "name": "x".repeat(41) }),
        ] {
            assert!(parse_report(&bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn sources_are_kept_per_owner_and_cleared() {
        let report_as = |owner: &str, source: &str, name: Option<&str>| {
            let mut params = json!({ "source": source, "phase": "running" });
            if let Some(name) = name {
                params["name"] = json!(name);
            }
            report(owner, "Default", parse_report(&params).expect("valid")).expect("stored")
        };
        let first = report_as("test.owner-a", "one", None);
        assert_eq!((first.id.as_str(), first.name.as_str()), ("test.owner-a/one", "Default"));
        report_as("test.owner-a", "one", Some("Named"));
        // A later report without a name keeps the earlier one.
        assert_eq!(report_as("test.owner-a", "one", None).name, "Named");
        report_as("test.owner-a", "two", None);
        report_as("test.owner-b", "one", None);

        let ids = |owner: &str| current().into_iter().filter(|status| status.owner == owner).map(|status| status.id).collect::<Vec<_>>();
        assert_eq!(ids("test.owner-a"), vec!["test.owner-a/one", "test.owner-a/two"]);
        assert_eq!(clear("test.owner-a", Some("two")), 1);
        assert_eq!(ids("test.owner-a"), vec!["test.owner-a/one"]);
        assert_eq!(clear("test.owner-a", None), 1);
        assert!(ids("test.owner-a").is_empty());
        assert!(clear_by_id("test.owner-b/one"));
        assert!(!clear_by_id("test.owner-b/one"));
    }
}
