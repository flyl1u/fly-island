//! Per-plugin data kept by the host: `storage.*` (JSON values in
//! `plugins-data/<id>/storage.json`, no permission needed) and `secrets.*`
//! (strings in the Windows Credential Manager under
//! `com.focusd.island.plugin.<id>`, needs the `secrets` permission). The names
//! of a plugin's secrets are kept in `plugin-secrets.json` next to
//! `plugins.json`, so clearing a plugin's data can find them again.

use keyring::{Entry, Error as KeyringError};
use serde_json::{json, Map, Value};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use super::{host, lock};

const STORAGE_FILE_NAME: &str = "storage.json";
const SECRETS_INDEX_FILE_NAME: &str = "plugin-secrets.json";
const SECRET_SERVICE_PREFIX: &str = "com.focusd.island.plugin.";
pub(super) const MAX_VALUE_BYTES: usize = 64 * 1024;
pub(super) const MAX_TOTAL_BYTES: usize = 1024 * 1024;
const MAX_KEY_CHARS: usize = 128;
const MAX_SECRET_KEY_CHARS: usize = 64;
const MAX_SECRET_CHARS: usize = 1024;
const MAX_SECRETS: usize = 32;

/// One storage or secrets call at a time, so read-change-write cannot interleave.
static FILES: Mutex<()> = Mutex::new(());

type Answer = Result<Value, (u16, String)>;

fn bad(message: impl Into<String>) -> (u16, String) {
    (400, message.into())
}

fn key_param(params: &Value, max: usize, secret: bool) -> Result<String, (u16, String)> {
    let key = params.get("key").and_then(Value::as_str).ok_or_else(|| bad("Expected a string \"key\"."))?;
    let allowed = |c: char| !secret || c.is_ascii_alphanumeric() || "._-".contains(c);
    if key.is_empty() || key.chars().count() > max || !key.chars().all(allowed) {
        let rule = if secret { "letters, digits, '.', '_' and '-', " } else { "" };
        return Err(bad(format!("\"key\" must be {rule}1 to {max} characters.")));
    }
    Ok(key.to_string())
}

/// Puts `value` under `key` unless that breaks the size limits.
pub(super) fn set_value(values: &mut Map<String, Value>, key: String, value: Value) -> Result<(), String> {
    let size = value.to_string().len();
    if size > MAX_VALUE_BYTES {
        return Err(format!("The value is {size} bytes; at most {MAX_VALUE_BYTES} are allowed."));
    }
    let previous = values.insert(key.clone(), value);
    if Value::Object(values.clone()).to_string().len() > MAX_TOTAL_BYTES {
        match previous {
            Some(previous) => values.insert(key, previous),
            None => values.remove(&key),
        };
        return Err(format!("The plugin's storage would grow past {MAX_TOTAL_BYTES} bytes."));
    }
    Ok(())
}

fn read_map(path: &Path) -> Map<String, Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<Map<String, Value>>(&text).ok())
        .unwrap_or_default()
}

/// Writes next to the file and renames, so a crash leaves the old file whole.
fn write_json(path: &Path, value: &Value) -> Result<(), (u16, String)> {
    let fail = |error: std::io::Error| (500, format!("Could not write {}: {error}", path.display()));
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(fail)?;
    }
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, value.to_string()).map_err(fail)?;
    fs::rename(&temp, path).map_err(fail)
}

/// Answers `storage.get` / `storage.set` / `storage.delete` / `storage.keys`.
pub(super) fn answer_storage(data_dir: &Path, method: &str, params: &Value) -> Answer {
    let _files = lock(&FILES);
    let path = data_dir.join(STORAGE_FILE_NAME);
    let mut values = read_map(&path);
    match method {
        "storage.keys" => Ok(json!({ "keys": values.keys().collect::<Vec<_>>() })),
        "storage.get" => {
            let key = key_param(params, MAX_KEY_CHARS, false)?;
            Ok(json!({ "value": values.get(&key).cloned().unwrap_or(Value::Null) }))
        }
        "storage.set" => {
            let key = key_param(params, MAX_KEY_CHARS, false)?;
            let value = params.get("value").cloned().ok_or_else(|| bad("Expected a \"value\"."))?;
            set_value(&mut values, key, value).map_err(|message| (413, message))?;
            write_json(&path, &Value::Object(values))?;
            Ok(json!({}))
        }
        "storage.delete" => {
            let key = key_param(params, MAX_KEY_CHARS, false)?;
            let deleted = values.remove(&key).is_some();
            if deleted {
                write_json(&path, &Value::Object(values))?;
            }
            Ok(json!({ "deleted": deleted }))
        }
        _ => Err((404, format!("Unknown method \"{method}\"."))),
    }
}

fn secrets_index_path() -> Result<PathBuf, (u16, String)> {
    Ok(host().map_err(|message| (500, message))?.state_path.with_file_name(SECRETS_INDEX_FILE_NAME))
}

fn read_index(path: &Path) -> BTreeMap<String, Vec<String>> {
    fs::read_to_string(path).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

fn entry(plugin_id: &str, key: &str) -> Result<Entry, (u16, String)> {
    Entry::new(&format!("{SECRET_SERVICE_PREFIX}{plugin_id}"), key)
        .map_err(|_| (500, "Could not open the Windows Credential Manager.".to_string()))
}

/// Answers `secrets.get` / `secrets.set` / `secrets.delete`.
pub(super) fn answer_secret(plugin_id: &str, method: &str, params: &Value) -> Answer {
    let key = key_param(params, MAX_SECRET_KEY_CHARS, true)?;
    let _files = lock(&FILES);
    let index_path = secrets_index_path()?;
    let mut index = read_index(&index_path);
    let names = index.entry(plugin_id.to_string()).or_default();
    let credential = entry(plugin_id, &key)?;
    match method {
        "secrets.get" => match credential.get_password() {
            Ok(value) => Ok(json!({ "value": value })),
            Err(KeyringError::NoEntry) => Ok(json!({ "value": null })),
            Err(_) => Err((500, "Could not read the Windows Credential Manager.".into())),
        },
        "secrets.set" => {
            let value = params.get("value").and_then(Value::as_str).ok_or_else(|| bad("Expected a string \"value\"."))?;
            if value.chars().count() > MAX_SECRET_CHARS {
                return Err(bad(format!("A secret holds at most {MAX_SECRET_CHARS} characters.")));
            }
            if !names.contains(&key) {
                if names.len() >= MAX_SECRETS {
                    return Err((413, format!("A plugin keeps at most {MAX_SECRETS} secrets.")));
                }
                names.push(key.clone());
                names.sort();
                write_json(&index_path, &json!(index))?;
            }
            credential
                .set_password(value)
                .map_err(|_| (500, "Could not write to the Windows Credential Manager.".to_string()))?;
            Ok(json!({}))
        }
        "secrets.delete" => {
            let deleted = match credential.delete_credential() {
                Ok(()) => true,
                Err(KeyringError::NoEntry) => false,
                Err(_) => return Err((500, "Could not delete from the Windows Credential Manager.".into())),
            };
            if let Some(position) = names.iter().position(|name| *name == key) {
                names.remove(position);
                write_json(&index_path, &json!(index))?;
            }
            Ok(json!({ "deleted": deleted }))
        }
        _ => Err((404, format!("Unknown method \"{method}\"."))),
    }
}

/// "清除数据": deletes the plugin's data folder (storage.json and whatever the
/// plugin wrote to dataDir) and its secrets. The plugin must be stopped.
pub(super) fn clear_plugin_data(plugin_id: &str, data_dir: &Path) -> Result<(), String> {
    let _files = lock(&FILES);
    if data_dir.exists() {
        fs::remove_dir_all(data_dir)
            .map_err(|error| format!("Could not delete {} (is a file in it open?): {error}", data_dir.display()))?;
    }
    let index_path = secrets_index_path().map_err(|(_, message)| message)?;
    let mut index = read_index(&index_path);
    for key in index.remove(plugin_id).unwrap_or_default() {
        let credential = entry(plugin_id, &key).map_err(|(_, message)| message)?;
        match credential.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => {}
            Err(_) => return Err("Could not delete a secret from the Windows Credential Manager.".into()),
        }
    }
    write_json(&index_path, &json!(index)).map_err(|(_, message)| message)
}
