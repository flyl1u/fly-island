//! `contributes.agentEffortLabels`: how the Agent page names a session's reasoning effort, per
//! agent, e.g. `{ "claudeCode": { "medium": "xhigh" } }`. Only the shown text changes; the
//! session keeps the effort the agent reported. A manifest-only plugin (`runtime: none`) is
//! enough, so nothing runs for it.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::{host, lock, permissions::missing_permissions, revocations};

/// The agents whose effort can be renamed, as in AgentProvider (src/features/agent-status/api.ts).
const AGENTS: [&str; 2] = ["claudeCode", "codex"];
const MAX_LABELS: usize = 8;
const MAX_CHARS: usize = 16;

/// Per agent, effort as reported -> effort as shown.
pub(super) type EffortLabels = BTreeMap<String, BTreeMap<String, String>>;

/// What the Agent page applies; mirrored by `AgentEffortLabels` in src/features/agent-status/effortLabels.ts.
#[derive(Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentEffortLabels(EffortLabels);

/// Checks the manifest's labels: known agents, short labels, effort names in lower case.
pub(super) fn check(labels: &mut EffortLabels) -> Result<(), String> {
    for (agent, map) in labels.iter_mut() {
        if !AGENTS.contains(&agent.as_str()) {
            return Err(format!("agentEffortLabels: unknown agent \"{agent}\"; use \"claudeCode\" or \"codex\"."));
        }
        if map.len() > MAX_LABELS {
            return Err(format!("agentEffortLabels.{agent} takes at most {MAX_LABELS} labels."));
        }
        let mut checked = BTreeMap::new();
        for (from, to) in map.iter() {
            let from = from.trim().to_ascii_lowercase();
            let to = to.trim().to_string();
            let short = |text: &str| (1..=MAX_CHARS).contains(&text.chars().count()) && !text.chars().any(char::is_control);
            if !short(&from) || !short(&to) {
                return Err(format!("agentEffortLabels.{agent}: \"{from}\" -> \"{to}\" must be 1-{MAX_CHARS} characters on both sides."));
            }
            checked.insert(from, to);
        }
        *map = checked;
    }
    labels.retain(|_, map| !map.is_empty());
    Ok(())
}

/// Merges the labels of the plugins in `plugins`, in id order; the first plugin to rename an
/// effort wins.
pub(super) fn merge<'a>(plugins: impl IntoIterator<Item = (&'a str, &'a EffortLabels)>) -> EffortLabels {
    let mut plugins: Vec<_> = plugins.into_iter().collect();
    plugins.sort_by_key(|(id, _)| *id);
    let mut merged = EffortLabels::new();
    for (_, labels) in plugins {
        for (agent, map) in labels {
            let target = merged.entry(agent.clone()).or_default();
            for (from, to) in map {
                target.entry(from.clone()).or_insert_with(|| to.clone());
            }
        }
    }
    merged
}

/// The effort labels of the plugins that are switched on.
#[tauri::command]
pub fn list_agent_effort_labels() -> Result<AgentEffortLabels, String> {
    let host = host()?;
    let state = lock(&host.state);
    let installed = lock(&host.installed);
    let on = installed.iter().filter_map(|plugin| {
        let manifest = plugin.manifest.as_ref().ok()?;
        if manifest.contributes.agent_effort_labels.is_empty() {
            return None;
        }
        let revoked = revocations::find(&state.revoked, &manifest.id, &manifest.version).is_some();
        let switched_on = plugin.dev
            || !revoked
                && state.plugins.get(&manifest.id).is_some_and(|grant| {
                    (plugin.builtin || state.allow_third_party)
                        && grant.enabled
                        && missing_permissions(&manifest.permissions, &grant.granted_permissions).is_empty()
                });
        switched_on.then_some((manifest.id.as_str(), &manifest.contributes.agent_effort_labels))
    });
    Ok(AgentEffortLabels(merge(on)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels(json: serde_json::Value) -> EffortLabels {
        serde_json::from_value(json).expect("labels")
    }

    #[test]
    fn labels_are_checked_and_effort_names_lower_cased() {
        let mut ok = labels(serde_json::json!({ "claudeCode": { " Medium ": "xhigh", "high": "max" }, "codex": {} }));
        check(&mut ok).expect("valid");
        assert_eq!(ok, labels(serde_json::json!({ "claudeCode": { "medium": "xhigh", "high": "max" } })));
        assert!(check(&mut labels(serde_json::json!({ "cursor": { "a": "b" } }))).is_err());
        assert!(check(&mut labels(serde_json::json!({ "codex": { "low": "" } }))).is_err());
        assert!(check(&mut labels(serde_json::json!({ "codex": { "low": "a very long effort label" } }))).is_err());
    }

    #[test]
    fn the_first_plugin_by_id_wins() {
        let a = labels(serde_json::json!({ "claudeCode": { "medium": "xhigh" } }));
        let b = labels(serde_json::json!({ "claudeCode": { "medium": "max", "high": "max" } }));
        let merged = merge([("z.plugin", &b), ("a.plugin", &a)]);
        assert_eq!(merged, labels(serde_json::json!({ "claudeCode": { "medium": "xhigh", "high": "max" } })));
    }
}
