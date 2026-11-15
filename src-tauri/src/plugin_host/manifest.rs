use std::{collections::HashSet, path::{Component, Path}};
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
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Runtime { pub command: String }

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Setting {
    pub key: String,
    pub label: Localized,
    #[serde(rename = "type")]
    pub kind: String,
    pub default: Value,
    #[serde(default)]
    pub options: Vec<SettingOption>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SettingOption { pub value: String, pub label: Localized }

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Action { pub id: String, pub label: Localized }

pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 100 && id.as_bytes()[0].is_ascii_lowercase()
        && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'.')
        && !id.ends_with(['.', '-']) && !id.contains("..")
        && !["con", "prn", "aux", "nul", "com1", "lpt1"].contains(&id.split('.').next().unwrap_or_default())
}

pub fn relative_path(text: &str) -> bool {
    !text.is_empty() && !text.contains([':', '\\'])
        && Path::new(text).components().all(|c| matches!(c, Component::Normal(_)))
}

impl Manifest {
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
        let allowed = ["network", "read-home-files", "notifications", "quota", "sessions", "desktop-windows", "private-browser"];
        if self.permissions.iter().any(|p| !allowed.contains(&p.as_str()))
            || self.contributes.iter().any(|p| !["quota", "sessions", "notifications"].contains(&p.as_str()) || !self.permissions.contains(p)) {
            return Err("Unsupported plugin permission or contribution".into());
        }
        let mut keys = HashSet::new();
        for s in &self.settings {
            if !valid_id(&s.key) || !keys.insert(&s.key) || !s.accepts(&s.default)
                || (s.kind == "secret" && s.default != "") {
                return Err("Invalid or duplicate plugin setting".into());
            }
        }
        keys.clear();
        if self.actions.iter().any(|a| !valid_id(&a.id) || !keys.insert(&a.id)) { return Err("Invalid plugin action".into()); }
        Ok(())
    }
}

impl Setting {
    pub fn accepts(&self, value: &Value) -> bool {
        match self.kind.as_str() {
            "toggle" => value.is_boolean(),
            "text" | "secret" => value.as_str().is_some_and(|s| s.len() <= 8192),
            "select" => value.as_str().is_some_and(|s| self.options.iter().any(|o| o.value == s)),
            _ => false,
        }
    }
}
