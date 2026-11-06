//! The last host API calls of each plugin, for its settings page: which
//! method, how it ended and when. Only the method name is kept, never the
//! parameters or the answer, so the log holds none of the user's data. The
//! same call ending the same way several times in a row is one entry with a count.

use serde::Serialize;
use serde_json::Value;
use std::{
    collections::VecDeque,
    time::{SystemTime, UNIX_EPOCH},
};

use super::{update_entry, Context};
use crate::plugin_host::rpc;

/// Entries kept per plugin.
pub(super) const CALL_LOG_ENTRIES: usize = 200;
/// Plugins may send any method name; longer ones are cut.
const MAX_METHOD_CHARS: usize = 64;

/// Mirrored by `PluginCallRecord` in src/features/plugins/api.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallRecord {
    pub method: String,
    /// "ok", "denied" (no permission, or the user said no), "unknown" (no such method) or "error".
    pub outcome: &'static str,
    /// The host's status for "error" (400, 404, 409, 413, 429, 500, 504).
    pub status: Option<u16>,
    /// Times in a row this method ended this way.
    pub count: u32,
    /// The last time, in ms since 1970.
    pub at: u64,
}

/// How an answer line ended: ("ok" | "denied" | "unknown" | "error", status).
pub(super) fn outcome_of(answer: &str) -> (&'static str, Option<u16>) {
    let Ok(message) = serde_json::from_str::<Value>(answer) else { return ("error", None) };
    let Some(error) = message.get("error") else { return ("ok", None) };
    let status = error.pointer("/data/status").and_then(Value::as_u64).and_then(|status| u16::try_from(status).ok());
    match error.get("code").and_then(Value::as_i64) {
        Some(rpc::PERMISSION_DENIED) => ("denied", None),
        Some(rpc::METHOD_NOT_FOUND) => ("unknown", None),
        _ => ("error", status),
    }
}

/// Adds a call to `log`, folding it into the newest entry when it is the same call with the same end.
pub(super) fn push(log: &mut VecDeque<CallRecord>, method: &str, (outcome, status): (&'static str, Option<u16>), at: u64) {
    let method: String = method.chars().take(MAX_METHOD_CHARS).collect();
    if let Some(last) = log.back_mut().filter(|last| last.method == method && last.outcome == outcome && last.status == status) {
        last.count = last.count.saturating_add(1);
        last.at = at;
        return;
    }
    log.push_back(CallRecord { method, outcome, status, count: 1, at });
    while log.len() > CALL_LOG_ENTRIES {
        log.pop_front();
    }
}

/// Records how a request of the plugin was answered.
pub(super) fn record(context: &Context, method: &str, answer: &str) {
    let at = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |time| u64::try_from(time.as_millis()).unwrap_or(u64::MAX));
    let outcome = outcome_of(answer);
    update_entry(context, |info| push(&mut info.calls, method, outcome, at));
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn answers_are_sorted_into_outcomes() {
        let id = json!(1);
        assert_eq!(outcome_of(&rpc::result_line(&id, json!({}))), ("ok", None));
        assert_eq!(outcome_of(&rpc::error_line(&id, rpc::PERMISSION_DENIED, "no", None)), ("denied", None));
        assert_eq!(outcome_of(&rpc::error_line(&id, rpc::METHOD_NOT_FOUND, "no", None)), ("unknown", None));
        assert_eq!(outcome_of(&rpc::error_line(&id, rpc::HOST_ERROR, "busy", Some(json!({ "status": 429 })))), ("error", Some(429)));
    }

    #[test]
    fn repeated_calls_fold_and_the_log_is_capped() {
        let mut log = VecDeque::new();
        push(&mut log, "todos.list", ("ok", None), 1);
        push(&mut log, "todos.list", ("ok", None), 2);
        push(&mut log, "todos.list", ("denied", None), 3);
        assert_eq!(log.len(), 2);
        assert_eq!((log[0].count, log[0].at), (2, 2));
        for index in 0..300 {
            push(&mut log, &format!("m{index}"), ("ok", None), 4);
        }
        assert_eq!(log.len(), CALL_LOG_ENTRIES);
        assert_eq!(log.back().map(|last| last.method.as_str()), Some("m299"));
        push(&mut log, &"x".repeat(500), ("ok", None), 5);
        assert_eq!(log.back().map(|last| last.method.chars().count()), Some(MAX_METHOD_CHARS));
    }
}
