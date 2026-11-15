use std::{collections::BTreeMap, path::{Path, PathBuf}};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use super::manifest::Manifest;

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Registry {
    #[serde(default)]
    pub developer_mode: bool,
    #[serde(default)]
    pub index_url: String,
    #[serde(default)]
    pub installed: BTreeMap<String, Installed>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    pub manifest: Manifest,
    pub enabled: bool,
    pub directory: PathBuf,
    #[serde(default)]
    pub development: bool,
    #[serde(default)]
    pub settings: BTreeMap<String, Value>,
}

pub fn load(root: &Path) -> Registry {
    let mut registry: Registry = std::fs::read(root.join("plugins-state.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    registry.installed.retain(|id, p| *id == p.manifest.id && p.manifest.validate().is_ok());
    registry
}

pub fn save(root: &Path, registry: &Registry) -> Result<(), String> {
    let path = root.join("plugins-state.json");
    let temporary = root.join("plugins-state.json.tmp");
    std::fs::write(&temporary, serde_json::to_vec_pretty(registry).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(temporary, path).map_err(|e| e.to_string())
}

fn entry(id: &str, key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.focusd.island.plugins", &format!("{id}/{key}")).map_err(|e| e.to_string())
}

pub fn set_secret(id: &str, key: &str, value: &str) -> Result<(), String> {
    if value.is_empty() {
        match entry(id, key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Cannot remove plugin credential".into()),
        }
    } else { entry(id, key)?.set_password(value).map_err(|_| "Cannot save plugin credential".into()) }
}

pub fn runtime_settings(plugin: &Installed) -> Result<Value, String> {
    let mut map = serde_json::Map::new();
    for s in &plugin.manifest.settings {
        let value = if s.kind == "secret" {
            match entry(&plugin.manifest.id, &s.key)?.get_password() {
                Ok(v) => Value::String(v),
                Err(keyring::Error::NoEntry) => s.default.clone(),
                Err(_) => return Err("Cannot read plugin credential".into()),
            }
        } else { plugin.settings.get(&s.key).filter(|v| s.accepts(v)).unwrap_or(&s.default).clone() };
        map.insert(s.key.clone(), value);
    }
    Ok(Value::Object(map))
}
