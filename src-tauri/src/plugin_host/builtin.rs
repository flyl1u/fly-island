//! Built-in plugins: optional parts of the island that are compiled in but are
//! listed, switched on, granted permissions and configured like any plugin
//! (runtime type "builtin"). They need no download and no "allow third-party
//! plugins", and cannot be uninstalled. Today: the local API and the collapsed
//! island's center pattern.
//!
//! A built-in plugin whose work happens in the island window (a collapsed-bar
//! ring, say) needs only an entry in BUILTINS with `native` false: it starts and
//! stops as a no-op, and the window follows it with `useBuiltinPlugin(id)`, which
//! re-reads the plugin on the `plugin-view-changed` reset sent when it starts,
//! stops or its settings change (grants.rs, commands.rs).

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

// Works only in the island window (src/features/center-pattern). `pet` holds a pet's folder
// name; the plugin page offers the pets found on disk as a list (PluginDetailPage).
const CENTER_PATTERN_MANIFEST: &str = r#"{
  "id": "focusd.center-pattern",
  "name": { "zh-CN": "中心图案", "en": "Center pattern" },
  "description": {
    "zh-CN": "收起的岛上没有文字时，在中间显示一个小动画：跟随光标的眼睛、小鸟、呼吸光点、小猫，或一只 Codex 宠物（随 AI Agent 的状态换动作；岛上显示 Agent 标题时，宠物站在标题前代替 Agent 图标）。",
    "en": "When the collapsed island shows no text, a small animation sits in its middle: eyes that follow the cursor, a bird, a breathing light, a cat, or a Codex pet that acts out what your AI agents are doing (while the island shows an agent's title, the pet stands before it in place of the agent icon)."
  },
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "ShengLin1001",
  "runtime": { "type": "builtin" },
  "contributes": {
    "settings": [
      {
        "key": "pattern",
        "type": "select",
        "title": { "zh-CN": "图案", "en": "Pattern" },
        "default": "eyes",
        "options": [
          { "value": "eyes", "title": { "zh-CN": "眼睛", "en": "Eyes" } },
          { "value": "bird", "title": { "zh-CN": "小鸟", "en": "Bird" } },
          { "value": "orb", "title": { "zh-CN": "光点", "en": "Light" } },
          { "value": "cat", "title": { "zh-CN": "小猫", "en": "Cat" } },
          { "value": "pet", "title": { "zh-CN": "宠物", "en": "Pet" } }
        ]
      },
      {
        "key": "pet",
        "type": "string",
        "title": { "zh-CN": "宠物", "en": "Pet" },
        "description": {
          "zh-CN": "图案选「宠物」时显示哪一只。宠物包（pet.json + spritesheet）放在 ~/.codex/pets 或应用数据目录的 pets 文件夹里；找不到时显示眼睛。",
          "en": "Which pet the Pet pattern shows. Pet packs (pet.json + spritesheet) go in ~/.codex/pets or the pets folder of the app data directory; without one the eyes show."
        },
        "default": ""
      }
    ]
  }
}"#;

/// Every built-in plugin: its id, its manifest (whose "id" must match), and
/// whether it has work in this process (`native`, see `start` and `stop`).
pub(super) const BUILTINS: &[(&str, &str, bool)] = &[
    (LOCAL_API_ID, LOCAL_API_MANIFEST, true),
    ("focusd.center-pattern", CENTER_PATTERN_MANIFEST, false),
];

/// Every built-in plugin's id and manifest.
pub(super) fn manifests(app_version: &str) -> Vec<(&'static str, Result<PluginManifest, String>)> {
    BUILTINS.iter().map(|&(id, text, _)| (id, parse_builtin_manifest(text, id, app_version))).collect()
}

pub(super) fn is_builtin(id: &str) -> bool {
    BUILTINS.iter().any(|&(builtin, _, _)| builtin == id)
}

/// Whether built-in plugin `id` has work in this process; an error for an id
/// that is not in `builtins`.
pub(super) fn has_native_work(builtins: &[(&str, &str, bool)], id: &str) -> Result<bool, String> {
    builtins
        .iter()
        .find(|&&(builtin, _, _)| builtin == id)
        .map(|&(_, _, native)| native)
        .ok_or_else(|| format!("Unknown built-in plugin {id}."))
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

/// Starts a built-in plugin; returns the info for its page. Plugins that live in
/// the island window have nothing to start here.
pub(super) fn start(id: &str, settings: &Map<String, Value>) -> Result<Vec<InfoItem>, String> {
    if !has_native_work(BUILTINS, id)? {
        return Ok(Vec::new());
    }
    match id {
        LOCAL_API_ID => local_api::start(allow_write(settings)).map(local_api_info),
        _ => Err(format!("Built-in plugin {id} is marked native but has no start.")),
    }
}

pub(super) fn stop(id: &str) -> Result<(), String> {
    if !has_native_work(BUILTINS, id)? {
        return Ok(());
    }
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
