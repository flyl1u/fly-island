use std::collections::BTreeMap;
use serde::{Deserialize, Serialize};
use super::data::TransferFiles;
use crate::legacy_migration;

pub(super) const MAX_BACKUP_BYTES: usize = 256 * 1024 * 1024;

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct Backup {
    pub app: String,
    pub format_version: u32,
    pub exported_at: String,
    pub app_version: String,
    pub local_storage: BTreeMap<String, String>,
    pub files: TransferFiles,
}

pub(super) fn storage_key(key: &str) -> bool {
    key.starts_with("fly-island-") && !matches!(key,
        "fly-island-position" | "fly-island-settings-focus" | "fly-island-position-reset" | "fly-island-panel-preview")
}

impl Backup {
    pub(super) fn parse(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() > MAX_BACKUP_BYTES { return Err("configTransfer:tooLarge".into()); }
        let mut value: serde_json::Value = serde_json::from_slice(bytes).map_err(|_| "configTransfer:invalidJson")?;
        legacy_migration::normalize_legacy_backup_value(&mut value);
        if value.get("app").and_then(|v| v.as_str()) != Some("fly-island") { return Err("configTransfer:wrongApp".into()); }
        if value.get("formatVersion").and_then(|v| v.as_u64()) != Some(1) { return Err("configTransfer:unsupportedVersion".into()); }
        let backup: Self = serde_json::from_value(value).map_err(|e| format!("configTransfer:invalidStructure: {e}"))?;
        backup.validate()?;
        Ok(backup)
    }

    pub(super) fn normalize_legacy(self) -> Result<Self, String> {
        let mut value = serde_json::to_value(self).map_err(|e| format!("configTransfer:invalidStructure: {e}"))?;
        legacy_migration::normalize_legacy_backup_value(&mut value);
        serde_json::from_value(value).map_err(|e| format!("configTransfer:invalidStructure: {e}"))
    }

    pub(super) fn validate(&self) -> Result<(), String> {
        if self.app != "fly-island" { return Err("configTransfer:wrongApp".into()); }
        if self.format_version != 1 { return Err("configTransfer:unsupportedVersion".into()); }
        if self.exported_at.len() < 20 || self.exported_at.len() > 64 || self.app_version.is_empty()
            || self.app_version.len() > 100 || self.local_storage.len() > 10000
            || self.local_storage.keys().any(|key| key.len() > 512) {
            return Err("configTransfer:invalidStructure".into());
        }
        self.files.validate().map_err(|e| format!("configTransfer:invalidStructure: {e}"))
    }
}
