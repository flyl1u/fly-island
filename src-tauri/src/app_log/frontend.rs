use serde::Deserialize;
use serde_json::{Map, Value};

use super::{event, Category};

#[derive(Deserialize)]
pub(crate) struct FrontendDiagnostic {
    category: Category,
    name: String,
    fields: Map<String, Value>,
}

#[tauri::command]
pub(crate) fn record_diagnostic(window: tauri::Window, diagnostic: FrontendDiagnostic) {
    if window.label() != "main" { return; }
    if let (Category::Startup, "settings") = (diagnostic.category, diagnostic.name.as_str()) {
        let settings = safe_settings(&diagnostic.fields);
        let values: Vec<_> = settings.iter().map(|(key, value)| (key.as_str(), value.as_str().map_or_else(|| value.to_string(), str::to_owned))).collect();
        let mut fields = vec![("reason", "webview_ready")];
        fields.extend(values.iter().map(|(key, value)| (*key, value.as_str())));
        event(Category::Startup, "settings", &fields);
    } else if let (Category::Startup, "builtin_plugin") = (diagnostic.category, diagnostic.name.as_str()) {
        let id = diagnostic.fields.get("id").and_then(Value::as_str);
        let enabled = diagnostic.fields.get("enabled").and_then(Value::as_bool);
        if let (Some(id @ ("dingtalk" | "feishu" | "wecom" | "cursor" | "kimiCode" | "zcode" | "hermes" | "clockWeather" | "calendarMarks")), Some(enabled)) = (id, enabled) {
            event(Category::Startup, "builtin_plugin", &[("reason", "webview_ready"), ("id", id), ("version", env!("CARGO_PKG_VERSION")), ("enabled", &enabled.to_string())]);
        }
    }
}

fn safe_settings(settings: &Map<String, Value>) -> Map<String, Value> {
    let mut safe = Map::new();
    for key in ["autoTuck", "autoTuckRetract", "collapsedAutoWidth", "gameAutoTuck", "gameDoNotDisturb", "keepVisibleWhileAgentRunning", "keepVisibleWhileLyrics", "keepVisibleWhileTodoRunning", "revealOnMessage"] {
        if let Some(value) = settings.get(key).and_then(Value::as_bool) { safe.insert(key.into(), value.into()); }
    }
    for (key, max) in [("islandFontPercent", 300), ("collapsedWidth", 4096), ("tuckDelaySeconds", 120), ("tuckEdgeHeight", 256), ("autoTuckRetractDelayMs", 120_000)] {
        if let Some(value) = settings.get(key).and_then(Value::as_u64).filter(|value| *value <= max) { safe.insert(key.into(), value.into()); }
    }
    for (key, choices) in [
        ("tuckStyle", &["edge", "line", "hidden"][..]), ("minimizeAction", &["tray", "tuck"]),
        ("islandMonitor", &["primary", "cursor", "foreground"]), ("expandTrigger", &["click", "hover"]),
        ("islandShape", &["notch", "capsule"]), ("material", &["classic", "liquidGlass", "frostedGlass"]),
    ] {
        if let Some(value) = settings.get(key).and_then(Value::as_str).filter(|value| choices.contains(value)) { safe.insert(key.into(), value.into()); }
    }
    safe
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_export_uses_an_allowlist_with_value_validation() {
        let raw = serde_json::json!({ "autoTuck": true, "collapsedWidth": 240, "tuckStyle": "line",
            "expandTrigger": "SECRET", "fontName": "C:\\Users\\Ada\\private", "token": "SECRET", "todo": "PRIVATE" });
        assert_eq!(safe_settings(raw.as_object().unwrap()), serde_json::json!({ "autoTuck": true, "collapsedWidth": 240, "tuckStyle": "line" }).as_object().unwrap().clone());
    }
}
