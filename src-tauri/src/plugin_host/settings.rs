//! Declarative plugin UI: settings a plugin declares in `contributes.settings`
//! (the island draws and stores them) and info items it shows with `ui.setInfo`
//! (address, token, last sync...). Plugins never ship UI code of their own.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::manifest::LocalizedText;

const MAX_SETTINGS: usize = 20;
const MAX_STRING_CHARS: usize = 1000;
const MAX_INFO_ITEMS: usize = 10;
const MAX_INFO_CHARS: usize = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SettingKind {
    Boolean,
    String,
    Number,
    Select,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SettingOption {
    value: String,
    title: LocalizedText,
}

/// One declared setting. Mirrored by `PluginSettingSpec` in src/features/plugins/api.ts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingSpec {
    key: String,
    #[serde(rename = "type")]
    kind: SettingKind,
    title: LocalizedText,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    description: Option<LocalizedText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    default: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    options: Vec<SettingOption>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    min: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    max: Option<f64>,
}

impl SettingSpec {
    pub(super) fn key(&self) -> &str {
        &self.key
    }
}

fn is_valid_key(key: &str) -> bool {
    (1..=32).contains(&key.len()) && key.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

/// Checks the declared settings when the manifest is read.
pub(super) fn validate_specs(specs: &[SettingSpec]) -> Result<(), String> {
    if specs.len() > MAX_SETTINGS {
        return Err(format!("A plugin can declare at most {MAX_SETTINGS} settings."));
    }
    for (index, spec) in specs.iter().enumerate() {
        if !is_valid_key(&spec.key) || specs[..index].iter().any(|other| other.key == spec.key) {
            return Err(format!("Setting key \"{}\" must be unique and use letters, digits, '-' or '_'.", spec.key));
        }
        if !spec.title.is_filled() || spec.options.iter().any(|option| !option.title.is_filled()) {
            return Err(format!("Setting \"{}\" needs titles in both languages.", spec.key));
        }
        if spec.kind == SettingKind::Select && spec.options.is_empty() {
            return Err(format!("Select setting \"{}\" needs options.", spec.key));
        }
        if let Some(default) = &spec.default {
            coerce(spec, default).map_err(|error| format!("Default of \"{}\": {error}", spec.key))?;
        }
    }
    Ok(())
}

/// Checks a value against its setting; returns the value to store.
pub(super) fn coerce(spec: &SettingSpec, value: &Value) -> Result<Value, String> {
    match spec.kind {
        SettingKind::Boolean => value.as_bool().map(Value::Bool).ok_or_else(|| "must be true or false".into()),
        SettingKind::String => match value.as_str() {
            Some(text) if text.chars().count() <= MAX_STRING_CHARS => Ok(Value::String(text.to_string())),
            Some(_) => Err(format!("can be at most {MAX_STRING_CHARS} characters")),
            None => Err("must be text".into()),
        },
        SettingKind::Number => {
            let number = value.as_f64().ok_or("must be a number")?;
            if spec.min.is_some_and(|min| number < min) || spec.max.is_some_and(|max| number > max) {
                return Err("is out of range".into());
            }
            Ok(value.clone())
        }
        SettingKind::Select => match value.as_str() {
            Some(choice) if spec.options.iter().any(|option| option.value == choice) => Ok(Value::String(choice.to_string())),
            _ => Err("is not one of the options".into()),
        },
    }
}

fn fallback(spec: &SettingSpec) -> Value {
    match spec.kind {
        SettingKind::Boolean => Value::Bool(false),
        SettingKind::String => Value::String(String::new()),
        SettingKind::Number => spec.min.map_or_else(|| Value::from(0), Value::from),
        SettingKind::Select => spec
            .options
            .first()
            .map_or(Value::Null, |option| Value::String(option.value.clone())),
    }
}

/// Every declared setting with its value: the stored one if still valid,
/// else the default. Stored values for settings that are gone are dropped.
pub(super) fn resolve(specs: &[SettingSpec], stored: &Map<String, Value>) -> Map<String, Value> {
    specs
        .iter()
        .map(|spec| {
            let value = stored
                .get(&spec.key)
                .and_then(|value| coerce(spec, value).ok())
                .or_else(|| spec.default.clone())
                .unwrap_or_else(|| fallback(spec));
            (spec.key.clone(), value)
        })
        .collect()
}

/// One line of information a running plugin shows on its settings page.
/// Mirrored by `PluginInfoItem` in src/features/plugins/api.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InfoItem {
    label: LocalizedText,
    value: String,
    /// Offer a Copy button.
    #[serde(default)]
    copy: bool,
    /// Hidden until the user asks to see it (tokens, passwords).
    #[serde(default)]
    secret: bool,
}

/// `ui.setInfo` params: `{ items: [...] }`; an empty list clears the info.
pub(super) fn parse_info(params: &Value) -> Result<Vec<InfoItem>, String> {
    let items = params.get("items").cloned().unwrap_or(Value::Array(Vec::new()));
    let items: Vec<InfoItem> =
        serde_json::from_value(items).map_err(|error| format!("\"items\" is not valid: {error}"))?;
    if items.len() > MAX_INFO_ITEMS {
        return Err(format!("At most {MAX_INFO_ITEMS} info items."));
    }
    if let Some(bad) = items
        .iter()
        .find(|item| !item.label.is_filled() || item.value.chars().count() > MAX_INFO_CHARS)
    {
        return Err(format!(
            "Info item \"{}\" needs a label in both languages and a value of at most {MAX_INFO_CHARS} characters.",
            bad.value.chars().take(20).collect::<String>()
        ));
    }
    Ok(items)
}
