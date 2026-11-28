use std::{collections::HashSet, io::Read, path::{Component, Path}};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Localized {
    #[serde(rename = "zh-CN")]
    pub zh: String,
    pub en: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Manifest {
    pub id: String,
    pub name: Localized,
    pub description: Localized,
    pub version: String,
    pub api_version: u32,
    pub runtime: Runtime,
    pub permissions: Vec<String>,
    pub contributes: Vec<String>,
    #[serde(default)]
    pub settings: Vec<Setting>,
    #[serde(default)]
    pub actions: Vec<Action>,
    /// Present when the plugin has a page of its own in the island.
    #[serde(default)]
    pub panel: Option<PanelMeta>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Runtime { pub command: String }

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Setting {
    pub key: String,
    pub label: Localized,
    /// One sentence under the label, when a name alone does not explain the setting.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<Localized>,
    #[serde(rename = "type")]
    pub kind: String,
    pub default: Value,
    #[serde(default)]
    pub options: Vec<SettingOption>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<u32>,
    /// Shown only while another setting has a given value (Eye Care hides its lock-mode rows in
    /// notify mode). Absent means always shown.
    #[serde(rename = "showWhen", default, skip_serializing_if = "Option::is_none")]
    pub show_when: Option<ShowWhen>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ShowWhen { pub key: String, pub value: String }

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SettingOption { pub value: String, pub label: Localized }

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Action { pub id: String, pub label: Localized }

/// A plugin page's button in the island header. Icons are a closed set the host draws, not
/// image files: a plugin cannot bring its own artwork.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PanelMeta { pub icon: String }

pub const PANEL_ICONS: &[&str] = &["battery", "heart-pulse", "activity", "timer", "gauge", "puzzle"];

pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 100 && id.as_bytes()[0].is_ascii_lowercase()
        && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'.')
        && !id.ends_with(['.', '-']) && !id.contains("..")
        && safe_component(id)
}

fn safe_component(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or_default().trim_end_matches(' ').to_ascii_uppercase();
    let device = ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str())
        || ["COM", "LPT"].iter().any(|prefix| stem.strip_prefix(*prefix).is_some_and(|suffix|
            matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³")));
    !name.is_empty() && !name.ends_with(['.', ' ']) && !device
        && !name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
}

pub fn relative_path(text: &str) -> bool {
    !text.is_empty() && text.split('/').all(safe_component)
        && Path::new(text).components().all(|c| matches!(c, Component::Normal(_)))
}

fn field_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 100 && id.as_bytes()[0].is_ascii_lowercase()
        && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'-' | b'.' | b'_'))
}

impl Manifest {
    pub fn read(path: &Path) -> Result<Self, String> {
        let mut bytes = Vec::new();
        std::fs::File::open(path).map_err(|e| e.to_string())?.take(65537)
            .read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        Self::parse(&bytes)
    }

    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() > 65536 { return Err("Manifest too large".into()); }
        let manifest: Self = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
        manifest.validate()?;
        Ok(manifest)
    }

    pub fn validate(&self) -> Result<(), String> {
        if !valid_id(&self.id) || self.api_version != 1 || semver::Version::parse(&self.version).is_err()
            || !relative_path(&self.runtime.command) || !self.runtime.command.ends_with(".exe")
            || self.name.zh.is_empty() || self.name.en.is_empty() {
            return Err("Invalid plugin identity, API version or executable path".into());
        }
        let allowed = ["network", "read-home-files", "write-home-files", "notifications", "quota", "sessions", "panel", "desktop-windows", "private-browser", "system-devices"];
        if self.permissions.iter().any(|p| !allowed.contains(&p.as_str()))
            || self.contributes.iter().any(|p| !["quota", "sessions", "notifications", "panel"].contains(&p.as_str()) || !self.permissions.contains(p)) {
            return Err("Unsupported plugin permission or contribution".into());
        }
        let has_panel = self.contributes.iter().any(|p| p == "panel");
        match &self.panel {
            Some(panel) if has_panel && PANEL_ICONS.contains(&panel.icon.as_str()) => {}
            None if !has_panel => {}
            _ => return Err("A plugin page needs the panel contribution and a known icon".into()),
        }
        let mut keys = HashSet::new();
        for s in &self.settings {
            if !field_id(&s.key) || !keys.insert(&s.key) || !s.accepts(&s.default)
                || (s.kind == "number" && !matches!((s.min, s.max), (Some(min), Some(max)) if min <= max))
                || (s.kind == "secret" && s.default != "") {
                return Err("Invalid or duplicate plugin setting".into());
            }
        }
        keys.clear();
        if self.actions.iter().any(|a| !field_id(&a.id) || !keys.insert(&a.id)) { return Err("Invalid plugin action".into()); }
        // A conditional row may only point at another row, with a value that row accepts.
        for setting in &self.settings {
            let Some(rule) = &setting.show_when else { continue };
            let source = self.settings.iter().find(|other| other.key == rule.key && other.key != setting.key);
            if !source.is_some_and(|other| other.kind != "secret" && other.accepts(&Value::String(rule.value.clone()))) {
                return Err("A setting is shown for a value its source setting does not take".into());
            }
        }
        Ok(())
    }
}

impl Setting {
    pub fn accepts(&self, value: &Value) -> bool {
        match self.kind.as_str() {
            "toggle" => value.is_boolean(),
            "text" | "secret" => value.as_str().is_some_and(|s| s.len() <= 8192),
            "number" => value.as_str().is_some_and(|s| {
                !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
                    && s.parse::<u32>().ok().is_some_and(|n| {
                        matches!((self.min, self.max), (Some(min), Some(max)) if min <= n && n <= max)
                    })
            }),
            "select" => value.as_str().is_some_and(|s| self.options.iter().any(|o| o.value == s)),
            // A short side-by-side choice (two or three options) drawn as segmented buttons.
            "choice" => value.as_str().is_some_and(|s| (2..=3).contains(&self.options.len()) && self.options.iter().any(|o| o.value == s)),
            _ => false,
        }
    }
}
