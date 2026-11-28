use serde::{Deserialize, Serialize};
use serde_json::Value;
use super::manifest::Manifest;

pub const MAX_LINE: usize = 256 * 1024;

#[derive(Clone, Default, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Contributions {
    #[serde(default)]
    pub quota: Vec<Quota>,
    #[serde(default)]
    pub sessions: Vec<Session>,
    #[serde(default)]
    pub notifications: Vec<Notification>,
    /// The plugin's own island page; null when it has nothing to show.
    #[serde(default)]
    pub panel: Option<Panel>,
}

/// What a plugin's island page shows. The host draws it with its own components: no HTML,
/// no styles and no images come from the plugin.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Panel {
    /// One line at the top, such as "专注中" or "2 个设备".
    pub headline: String,
    /// A quieter second line; null when there is nothing to add.
    pub note: Option<String>,
    /// The entries, each a title and at most a percentage or a deadline.
    #[serde(default)]
    pub rows: Vec<PanelRow>,
    /// Ids of the plugin's declared actions to offer as buttons.
    #[serde(default)]
    pub actions: Vec<String>,
    /// The subset of `actions` the page shows; null shows all of them. A plugin keeps actions
    /// its own windows offer (a break window's postpone and skip) in `actions` and leaves them
    /// out here, so the page and the window can offer different ones from one payload.
    #[serde(default)]
    pub island_actions: Option<Vec<String>>,
    /// A dot on the page's button, for something the user should look at (a break is due,
    /// a battery is low) without a notification.
    #[serde(default)]
    pub attention: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PanelRow {
    pub id: String,
    pub title: String,
    /// A short line under the title.
    pub detail: Option<String>,
    /// A 0–100 bar under the title, when the entry measures something.
    pub percent: Option<f64>,
    /// Unix milliseconds the host counts down to, when the entry is a deadline.
    pub countdown_to: Option<i64>,
    /// Milliseconds of a fixed duration the host shows as it is, when the entry stopped counting:
    /// a held timer's remaining time or a finished round's total. Never combined with a deadline.
    #[serde(default)]
    pub duration_ms: Option<i64>,
    /// "normal", "warning" or "danger"; anything else reads as normal.
    pub tone: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
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

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub title: String,
    pub cwd: Option<String>,
    pub status: String,
    pub updated_at: i64,
    pub action: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
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
        || c.panel.as_ref().is_some_and(|p| p.rows.len() > 16 || p.actions.len() > 4)
        || (!c.quota.is_empty() && !manifest.contributes.iter().any(|p| p == "quota"))
        || (!c.sessions.is_empty() && !manifest.contributes.iter().any(|p| p == "sessions"))
        || (!c.notifications.is_empty() && !manifest.contributes.iter().any(|p| p == "notifications"))
        || (c.panel.is_some() && !manifest.contributes.iter().any(|p| p == "panel")) {
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
    if let Some(panel) = &c.panel {
        let declared = |id: &str| manifest.actions.iter().any(|a| a.id == id);
        if !text(&panel.headline) || panel.note.as_deref().is_some_and(|note| !text(note))
            || panel.rows.iter().any(|r| {
                !text(&r.id) || !text(&r.title) || r.detail.as_deref().is_some_and(|detail| !text(detail))
                    || !percent(r.percent)
                    || r.countdown_to.is_some_and(|deadline| deadline <= 0)
                    || r.duration_ms.is_some_and(|total| total < 0 || r.countdown_to.is_some())
                    || r.tone.as_deref().is_some_and(|tone| !["normal", "warning", "danger"].contains(&tone))
            })
            || !unique(panel.rows.iter().map(|r| r.id.as_str()).collect())
            || !unique(panel.actions.iter().map(String::as_str).collect())
            || panel.actions.iter().any(|id| !declared(id))
            || panel.island_actions.as_ref().is_some_and(|island| {
                island.len() > 4
                    || !unique(island.iter().map(String::as_str).collect())
                    || island.iter().any(|id| !panel.actions.contains(id))
            }) {
            return Err("Invalid plugin panel".into());
        }
    }
    Ok(Some(c))
}
