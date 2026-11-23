//! Z Code Coding Plan API key settings. The secret and platform stay in Windows Credential Manager.

use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "com.flyisland.app.zcode-coding-plan";
const USER: &str = "usage";
const SETTINGS_ERROR: &str = "zcode_api_key:storage";

#[derive(Clone, Copy, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ApiKeyPlatform {
    #[default]
    Bigmodel,
    Zai,
}

impl ApiKeyPlatform {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "bigmodel" => Ok(Self::Bigmodel),
            "zai" => Ok(Self::Zai),
            _ => Err("zcode_api_key:platform".to_string()),
        }
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Bigmodel => "bigmodel",
            Self::Zai => "zai",
        }
    }
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiKeyConfig {
    #[serde(default)]
    pub(crate) api_key: Option<String>,
    #[serde(default)]
    pub(crate) platform: ApiKeyPlatform,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiKeySettings {
    platform: String,
    has_key: bool,
    masked_key: Option<String>,
}

fn credential() -> Result<Entry, String> {
    Entry::new(SERVICE, USER).map_err(|_| SETTINGS_ERROR.to_string())
}

pub(crate) fn read_config() -> Result<ApiKeyConfig, String> {
    match crate::legacy_migration::read_credential_with_fallback(SERVICE, USER) {
        Ok(Some(value)) => serde_json::from_str(&value).map_err(|_| SETTINGS_ERROR.to_string()),
        Ok(None) => Ok(ApiKeyConfig::default()),
        Err(_) => Err(SETTINGS_ERROR.to_string()),
    }
}

fn write_config(config: &ApiKeyConfig) -> Result<(), String> {
    let value = serde_json::to_string(config).map_err(|_| SETTINGS_ERROR.to_string())?;
    credential()?.set_password(&value).map_err(|_| SETTINGS_ERROR.to_string())
}

fn mask_key(key: &str) -> String {
    const MASK: &str = "····";
    match key.char_indices().rev().nth(4) {
        Some((index, preceding)) => format!("{MASK}{}", &key[index + preceding.len_utf8()..]),
        None => MASK.to_string(),
    }
}

fn settings(config: &ApiKeyConfig) -> ApiKeySettings {
    ApiKeySettings {
        platform: config.platform.as_str().to_string(),
        has_key: config.api_key.is_some(),
        masked_key: config.api_key.as_deref().map(mask_key),
    }
}

fn normalize_key(value: &str) -> Result<String, String> {
    let key = value.trim();
    if key.is_empty() || key.len() > 2048 || !key.bytes().all(|byte| byte.is_ascii_graphic()) {
        return Err("zcode_api_key:invalid".to_string());
    }
    Ok(key.to_string())
}

#[tauri::command]
pub fn get_zcode_api_key_settings() -> Result<ApiKeySettings, String> {
    read_config().map(|config| settings(&config))
}

#[tauri::command]
pub fn save_zcode_api_key_settings(platform: String, api_key: Option<String>) -> Result<ApiKeySettings, String> {
    let mut config = read_config()?;
    config.platform = ApiKeyPlatform::parse(&platform)?;
    if let Some(value) = api_key.filter(|value| !value.trim().is_empty()) {
        config.api_key = Some(normalize_key(&value)?);
    }
    write_config(&config)?;
    super::zcode_usage::invalidate_cache();
    Ok(settings(&config))
}

#[tauri::command]
pub fn clear_zcode_api_key() -> Result<ApiKeySettings, String> {
    let mut config = read_config()?;
    config.api_key = None;
    write_config(&config)?;
    super::zcode_usage::invalidate_cache();
    Ok(settings(&config))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_expose_only_the_last_four_characters() {
        let config = ApiKeyConfig { api_key: Some("example-key-1a2b".to_string()), platform: ApiKeyPlatform::Zai };
        let response = serde_json::to_value(settings(&config)).unwrap();
        assert_eq!(response, serde_json::json!({ "platform": "zai", "hasKey": true, "maskedKey": "····1a2b" }));
    }

    #[test]
    fn short_keys_are_fully_masked() {
        for key in ["", "a", "a12", "1a2b"] {
            assert_eq!(mask_key(key), "····");
        }
        assert_eq!(mask_key("x1a2b"), "····1a2b");
        assert_eq!(mask_key("前缀中文密钥"), "····中文密钥");
        assert_eq!(settings(&ApiKeyConfig::default()).masked_key, None);
    }
}
