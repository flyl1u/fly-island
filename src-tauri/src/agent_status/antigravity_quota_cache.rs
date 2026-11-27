//! Only the last successful quota snapshot, never the daemon's token or account credentials.
use std::{fs, path::Path};

use serde::{Deserialize, Serialize};

use super::{local_agent_files::read_small_text, usage::{AgentUsage, UsageSource, UsageWindow}};

const FILE: &str = "antigravity-quota.json";
const MAX_AGE_MS: i64 = 7 * 24 * 60 * 60 * 1000;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    version: u8,
    updated_at: i64,
    plan: Option<String>,
    models: Vec<Model>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Model {
    name: String,
    used: f64,
    resets_at: Option<i64>,
}

pub(super) fn empty() -> AgentUsage {
    AgentUsage { updated_at: None, five_hour: None, seven_day: None, models: Vec::new(), plan: None, source: UsageSource::Antigravity }
}

pub(super) fn read(root: &Path, now: i64) -> Option<AgentUsage> {
    let snapshot: Snapshot = serde_json::from_str(&read_small_text(root, FILE, 64 * 1024)?).ok()?;
    if snapshot.version != 1 || snapshot.updated_at <= 0 || snapshot.updated_at > now.saturating_add(60_000)
        || now.saturating_sub(snapshot.updated_at) > MAX_AGE_MS || snapshot.models.is_empty() || snapshot.models.len() > 32
        || snapshot.plan.as_ref().is_some_and(|plan| plan.len() > 256)
        || snapshot.models.iter().any(|model| model.name.is_empty() || model.name.len() > 256
            || !model.used.is_finite() || !(0.0..=100.0).contains(&model.used) || model.resets_at.is_some_and(|at| at <= 0)) {
        return None;
    }
    Some(AgentUsage { updated_at: Some(snapshot.updated_at), plan: snapshot.plan,
        models: snapshot.models.into_iter().map(|model| UsageWindow { name: model.name, used: model.used, resets_at: model.resets_at }).collect(), ..empty() })
}

pub(super) fn write(root: &Path, usage: &AgentUsage) {
    let Some(updated_at) = usage.updated_at else { return };
    let snapshot = Snapshot { version: 1, updated_at, plan: usage.plan.clone(),
        models: usage.models.iter().map(|model| Model { name: model.name.clone(), used: model.used, resets_at: model.resets_at }).collect() };
    let Ok(bytes) = serde_json::to_vec(&snapshot) else { return };
    let temp = root.join(format!("{FILE}.tmp"));
    if fs::create_dir_all(root).and_then(|()| fs::write(&temp, bytes)).and_then(|()| fs::rename(&temp, root.join(FILE))).is_err() {
        let _ = fs::remove_file(temp);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovers_the_last_success_after_restart_without_extending_its_timestamp() {
        let root = crate::agent_status::local_agent_files::scratch::tempdir();
        let usage = AgentUsage { updated_at: Some(10_000), models: vec![UsageWindow {
            name: "Gemini".into(), used: 30.0, resets_at: Some(100_000),
        }], ..empty() };
        write(root.path(), &usage);
        assert_eq!(read(root.path(), 20_000), Some(usage));
        assert!(read(root.path(), MAX_AGE_MS + 10_001).is_none());
        assert!(!root.path().join(format!("{FILE}.tmp")).exists());
    }

    #[test]
    fn broken_future_and_invalid_percentages_cannot_become_live_quota() {
        let root = crate::agent_status::local_agent_files::scratch::tempdir();
        for text in ["{", r#"{"version":2,"updatedAt":1,"plan":null,"models":[]}"#,
            r#"{"version":1,"updatedAt":999999,"plan":null,"models":[{"name":"x","used":50,"resetsAt":null}]}"#,
            r#"{"version":1,"updatedAt":1,"plan":null,"models":[{"name":"x","used":101,"resetsAt":null}]}"#] {
            fs::write(root.path().join(FILE), text).unwrap();
            assert!(read(root.path(), 10_000).is_none());
        }
    }
}
