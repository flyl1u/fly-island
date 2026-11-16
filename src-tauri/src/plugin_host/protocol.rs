use serde::{Deserialize, Serialize};
use serde_json::Value;
use super::manifest::Manifest;

pub const MAX_LINE: usize = 256 * 1024;

#[derive(Clone, Default, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Contributions {
    #[serde(default)]
    pub quota: Vec<Quota>,
    #[serde(default)]
    pub sessions: Vec<Session>,
    #[serde(default)]
    pub notifications: Vec<Notification>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Quota {
    pub id: String,
    pub label: String,
    pub remaining_percent: Option<f64>,
    pub secondary_percent: Option<f64>,
    pub balance: Option<String>,
    pub resets_at: Option<i64>,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub title: String,
    pub cwd: Option<String>,
    pub status: String,
    pub updated_at: i64,
    pub action: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Notification {
    pub id: String,
    pub source_id: String,
    pub app_name: String,
    pub icon: String,
    pub title: String,
    pub body: String,
    pub received_at: i64,
    pub action: Option<String>,
}

pub fn parse_publish(line: &str, manifest: &Manifest) -> Result<Option<Contributions>, String> {
    if line.len() > MAX_LINE { return Err("RPC line too large".into()); }
    let v: Value = serde_json::from_str(line).map_err(|_| "Invalid JSON-RPC".to_owned())?;
    if v["jsonrpc"] != "2.0" || !v.is_object() { return Err("Invalid JSON-RPC version".into()); }
    if v.get("id").is_some() {
        if v.get("result").is_some() != v.get("error").is_some() { return Ok(None); }
        return Err("Invalid RPC response".into());
    }
    if v["method"] != "publish" { return Err("Unsupported plugin method".into()); }
    let c: Contributions = serde_json::from_value(v["params"].clone()).map_err(|_| "Invalid contribution".to_owned())?;
    if c.quota.len() > 32 || c.sessions.len() > 200 || c.notifications.len() > 100
        || (!c.quota.is_empty() && !manifest.contributes.iter().any(|p| p == "quota"))
        || (!c.sessions.is_empty() && !manifest.contributes.iter().any(|p| p == "sessions"))
        || (!c.notifications.is_empty() && !manifest.contributes.iter().any(|p| p == "notifications")) {
        return Err("Undeclared or excessive contributions".into());
    }
    let text = |s: &str| s.len() <= 4096 && !s.contains('\0');
    let action = |value: &Option<String>| value.as_deref().is_none_or(text);
    let unique = |ids: Vec<&str>| {
        let mut seen = std::collections::HashSet::new();
        ids.into_iter().all(|id| !id.is_empty() && seen.insert(id))
    };
    let percent = |p: Option<f64>| p.is_none_or(|v| v.is_finite() && (0.0..=100.0).contains(&v));
    if c.quota.iter().any(|q| !text(&q.id) || !text(&q.label) || !percent(q.remaining_percent) || !percent(q.secondary_percent) || q.balance.as_deref().is_some_and(|b| !text(b)))
        || c.sessions.iter().any(|s| !text(&s.id) || !text(&s.title) || !action(&s.action) || !["running", "waiting", "completed"].contains(&s.status.as_str()) || s.cwd.as_deref().is_some_and(|v| !text(v)))
        || c.notifications.iter().any(|n| !action(&n.action) || [&n.id, &n.source_id, &n.app_name, &n.icon, &n.title, &n.body].iter().any(|s| !text(s)))
        || !unique(c.quota.iter().map(|q| q.id.as_str()).collect())
        || !unique(c.sessions.iter().map(|s| s.id.as_str()).collect())
        || !unique(c.notifications.iter().map(|n| n.id.as_str()).collect()) {
        return Err("Invalid contribution fields".into());
    }
    Ok(Some(c))
}
