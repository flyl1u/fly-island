//! The persisted agent status file and the snapshot returned to the frontend.

use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AgentTaskStatus {
    #[serde(default = "default_agent_phase")]
    pub(super) phase: String,
    #[serde(default)]
    pub(super) task_id: Option<String>,
    #[serde(default)]
    pub(super) updated_at: i64,
}

impl Default for AgentTaskStatus {
    fn default() -> Self {
        Self {
            phase: default_agent_phase(),
            task_id: None,
            updated_at: 0,
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PersistedAgentStatus {
    #[serde(default)]
    pub(super) codex: AgentTaskStatus,
    #[serde(default)]
    pub(super) claude_code: AgentTaskStatus,
    #[serde(default)]
    pub(super) updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusSnapshot {
    pub(super) codex: AgentTaskStatus,
    pub(super) claude_code: AgentTaskStatus,
    pub(super) updated_at: i64,
    pub(super) status_path: String,
}

pub(super) fn default_agent_phase() -> String {
    "idle".to_string()
}

pub(super) fn default_agent_status_snapshot(status_path: String) -> AgentStatusSnapshot {
    AgentStatusSnapshot {
        codex: AgentTaskStatus::default(),
        claude_code: AgentTaskStatus::default(),
        updated_at: current_unix_millis(),
        status_path,
    }
}

pub(super) fn default_persisted_agent_status() -> PersistedAgentStatus {
    PersistedAgentStatus {
        codex: AgentTaskStatus::default(),
        claude_code: AgentTaskStatus::default(),
        updated_at: current_unix_millis(),
    }
}

pub(super) fn agent_status_snapshot_from_persisted(
    persisted: PersistedAgentStatus,
    status_path: String,
) -> AgentStatusSnapshot {
    AgentStatusSnapshot {
        codex: normalize_agent_task_status(persisted.codex),
        claude_code: normalize_agent_task_status(persisted.claude_code),
        updated_at: if persisted.updated_at > 0 {
            persisted.updated_at
        } else {
            current_unix_millis()
        },
        status_path,
    }
}

pub(super) fn normalize_agent_task_status(mut status: AgentTaskStatus) -> AgentTaskStatus {
    if !matches!(
        status.phase.as_str(),
        "idle" | "running" | "completed" | "failed" | "stale"
    ) {
        status.phase = default_agent_phase();
    }

    status
}

pub(super) fn current_unix_millis() -> i64 {
    system_time_to_unix_millis(SystemTime::now()).unwrap_or_default()
}

pub(super) fn system_time_to_unix_millis(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .ok()
}
