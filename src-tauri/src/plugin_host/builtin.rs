//! Built-in plugins: optional parts of the island that are compiled in but are
//! listed, switched on, granted permissions and configured like any plugin
//! (runtime type "builtin"). They need no download and no "allow third-party
//! plugins", and cannot be uninstalled. Today: the local API.

use serde_json::{Map, Value};

use super::manifest::{parse_builtin_manifest, LocalizedText, PluginManifest};
use super::settings::InfoItem;
use crate::local_api;

pub(super) const LOCAL_API_ID: &str = "focusd.local-api";
pub(super) const LOCAL_API_ALLOW_WRITE: &str = "allowWrite";

const LOCAL_API_MANIFEST: &str = r#"{
  "id": "focusd.local-api",
  "name": { "zh-CN": "本地接口", "en": "Local API" },
  "description": {
    "zh-CN": "让脚本和其他程序通过 HTTP 读写待办和每日笔记，并上报 AI Agent 状态。只接受本机请求，并且需要访问令牌。用法见 docs/local-api.md。",
    "en": "Lets scripts and other programs read and change todos and the daily note and report AI agent status over HTTP. Only accepts requests from this computer, with an access token. See docs/local-api.md."
  },
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "TixXin",
  "runtime": { "type": "builtin" },
  "permissions": ["todos:read", "todos:write", "notes:read", "notes:write", "agent-status:write"],
  "contributes": {
    "settings": [
      {
        "key": "allowWrite",
        "type": "boolean",
        "title": { "zh-CN": "允许修改待办、笔记和 Agent 状态", "en": "Allow changes to todos, notes and agent status" },
        "description": { "zh-CN": "关闭时只能读取。", "en": "When off, it can only read." },
        "default": false
      }
    ],
    "commands": [
      { "id": "reset-token", "title": { "zh-CN": "重新生成令牌", "en": "Regenerate token" } }
    ]
  }
}"#;

/// Every built-in plugin's id and manifest.
pub(super) fn manifests(app_version: &str) -> Vec<(&'static str, Result<PluginManifest, String>)> {
    vec![(LOCAL_API_ID, parse_builtin_manifest(LOCAL_API_MANIFEST, LOCAL_API_ID, app_version))]
}

pub(super) fn is_builtin(id: &str) -> bool {
    id == LOCAL_API_ID
}

fn allow_write(settings: &Map<String, Value>) -> bool {
    settings.get(LOCAL_API_ALLOW_WRITE).and_then(Value::as_bool).unwrap_or(false)
}

fn local_api_info(status: local_api::LocalApiStatus) -> Vec<InfoItem> {
    vec![
        InfoItem::new(LocalizedText::new("地址", "Address"), status.url, true, false),
        InfoItem::new(LocalizedText::new("访问令牌", "Access token"), status.token, true, true),
        InfoItem::new(LocalizedText::new("配置文件", "Config file"), status.config_path, true, false),
    ]
}

/// Starts a built-in plugin; returns the info for its page.
pub(super) fn start(id: &str, settings: &Map<String, Value>) -> Result<Vec<InfoItem>, String> {
    match id {
        LOCAL_API_ID => local_api::start(allow_write(settings)).map(local_api_info),
        _ => Err(format!("Unknown built-in plugin {id}.")),
    }
}

pub(super) fn stop(id: &str) -> Result<(), String> {
    match id {
        LOCAL_API_ID => local_api::stop(),
        _ => Ok(()),
    }
}

pub(super) fn settings_changed(id: &str, settings: &Map<String, Value>) -> Result<(), String> {
    match id {
        LOCAL_API_ID => local_api::set_allow_write(allow_write(settings)),
        _ => Ok(()),
    }
}

/// Runs one of the plugin's commands; returns its new info.
pub(super) fn run_command(id: &str, command: &str) -> Result<Vec<InfoItem>, String> {
    match (id, command) {
        (LOCAL_API_ID, "reset-token") => local_api::reset_token().map(local_api_info),
        _ => Err("Unknown plugin command.".into()),
    }
}
