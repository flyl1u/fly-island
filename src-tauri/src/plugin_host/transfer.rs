//! Portable registry preferences. Packages, local directories and credentials never leave here.
use std::{collections::{BTreeMap, BTreeSet}, path::Path};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use super::{manifest::{valid_id, Manifest}, storage::{self, Installed, Registry}};

const PENDING: &str = "plugins-restore.json";
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct PluginTransfer {
    developer_mode: bool,
    index_url: String,
    installed: Vec<Preference>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Preference { id: String, version: String, enabled: bool, settings: BTreeMap<String, Value> }

fn pending(root: &Path) -> Vec<Preference> {
    std::fs::read(root.join(PENDING)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn safe_settings(manifest: &Manifest, settings: &BTreeMap<String, Value>) -> BTreeMap<String, Value> {
    settings.iter().filter(|(key, value)| manifest.settings.iter()
        .any(|s| &s.key == *key && s.kind != "secret" && s.accepts(value)))
        .map(|(k, v)| (k.clone(), v.clone())).collect()
}

pub(crate) fn export(root: &Path) -> PluginTransfer {
    let registry = storage::load(root);
    let mut entries: BTreeMap<String, Preference> = pending(root).into_iter().map(|p| (p.id.clone(), p)).collect();
    for (id, p) in registry.installed {
        let settings = safe_settings(&p.manifest, &p.settings);
        entries.insert(id.clone(), Preference { id, version: p.manifest.version, enabled: p.enabled, settings });
    }
    PluginTransfer { developer_mode: registry.developer_mode, index_url: registry.index_url, installed: entries.into_values().collect() }
}

impl PluginTransfer {
    pub(crate) fn validate(&self) -> Result<(), String> {
        let mut ids = BTreeSet::new();
        if self.installed.len() > 500 || self.index_url.len() > 8192 { return Err("Invalid plugin preferences".into()); }
        for p in &self.installed {
            if !valid_id(&p.id) || !ids.insert(&p.id) || semver::Version::parse(&p.version).is_err()
                || p.settings.len() > 200 || p.settings.values().any(|v| !v.is_boolean() && !v.as_str().is_some_and(|s| s.len() <= 8192)) {
                return Err("Invalid plugin identity, version or settings".into());
            }
        }
        Ok(())
    }

    pub(crate) fn plan(&self, root: &Path) -> Result<(Registry, Vec<String>, Vec<u8>), String> {
        self.validate()?;
        let current = storage::load(root);
        let mut next = Registry { developer_mode: self.developer_mode, index_url: self.index_url.clone(), installed: BTreeMap::new() };
        let mut missing = Vec::new();
        let mut restore = Vec::new();
        for p in &self.installed {
            let local = current.installed.get(&p.id).filter(|local| local.manifest.version == p.version
                && local.directory.join(&local.manifest.runtime.command).is_file()
                && Manifest::read(&local.directory.join("fly-island-plugin.json")).is_ok_and(|actual|
                    serde_json::to_value(actual).ok() == serde_json::to_value(&local.manifest).ok()));
            if let Some(local) = local {
                let mut installed = local.clone();
                installed.enabled = p.enabled;
                installed.settings = safe_settings(&installed.manifest, &p.settings);
                next.installed.insert(p.id.clone(), installed);
            } else {
                missing.push(format!("{}@{}", p.id, p.version));
                restore.push(p.clone());
            }
        }
        Ok((next, missing, serde_json::to_vec_pretty(&restore).map_err(|e| e.to_string())?))
    }
}

/// A later install of the requested version picks up the restored preferences.
pub(super) fn restore_install(root: &Path, installed: &mut Installed) {
    if let Some(p) = pending(root).into_iter().find(|p| p.id == installed.manifest.id && p.version == installed.manifest.version) {
        installed.settings = safe_settings(&installed.manifest, &p.settings);
        installed.enabled = p.enabled;
    }
}

pub(super) fn forget(root: &Path, id: &str) -> Result<(), String> {
    let mut entries = pending(root);
    entries.retain(|p| p.id != id);
    std::fs::write(root.join(PENDING), serde_json::to_vec_pretty(&entries).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exported_preferences_drop_secrets_and_unknown_settings() {
        let manifest: Manifest = serde_json::from_value(serde_json::json!({
            "id": "demo", "version": "1.0.0", "apiVersion": 1,
            "name": { "zh-CN": "测试", "en": "Demo" }, "description": { "zh-CN": "", "en": "" },
            "runtime": { "command": "demo.exe" }, "permissions": [], "contributes": [],
            "settings": [
                { "key": "label", "label": { "zh-CN": "名称", "en": "Label" }, "type": "text", "default": "" },
                { "key": "token", "label": { "zh-CN": "密钥", "en": "Secret" }, "type": "secret", "default": "" }
            ] })).unwrap();
        let values = BTreeMap::from([("label".into(), Value::from("keep")), ("token".into(), Value::from("secret")), ("unknown".into(), Value::from("drop"))]);
        assert_eq!(safe_settings(&manifest, &values), BTreeMap::from([("label".into(), Value::from("keep"))]));
    }
    #[test]
    fn no_package_is_invented_and_missing_preferences_survive() {
        let p = PluginTransfer { installed: vec![Preference { id: "demo".into(), version: "1.0.0".into(), enabled: true, settings: BTreeMap::new() }], ..Default::default() };
        let (registry, missing, bytes) = p.plan(Path::new("not-installed")).unwrap();
        assert!(registry.installed.is_empty());
        assert_eq!(missing, ["demo@1.0.0"]);
        assert!(String::from_utf8(bytes).unwrap().contains("demo"));
        let invalid = PluginTransfer { installed: vec![Preference { id: "../bad".into(), version: "1.0.0".into(), enabled: true, settings: BTreeMap::new() }], ..Default::default() };
        assert!(invalid.validate().is_err());
    }
}
