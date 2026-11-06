//! Built-in plugins: optional parts of the island that are compiled in but are
//! listed, switched on, granted permissions and configured like any plugin
//! (runtime type "builtin"). They need no download and no "allow third-party
//! plugins", and cannot be uninstalled. Today: the local API and the collapsed
//! island's center pattern, Claude usage ring and agent session ring.
//!
//! A built-in plugin whose work happens in the island window (a collapsed-bar
//! ring, say) needs only an entry in BUILTINS with `native` false: it starts and
//! stops as a no-op, and the window follows it with `useBuiltinPlugin(id)`, which
//! re-reads the plugin on the `plugin-view-changed` reset sent when it starts,
//! stops or its settings change (grants.rs, commands.rs).

use serde_json::{Map, Value};

use super::manifest::{parse_builtin_manifest, LocalizedText, PluginManifest};
use super::settings::InfoItem;
use crate::{claude_usage, local_api};

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

pub(super) const CLAUDE_USAGE_ID: &str = "focusd.claude-usage";
pub(super) const CLAUDE_USAGE_ASK_ANTHROPIC: &str = "askAnthropic";

const CLAUDE_USAGE_MANIFEST: &str = r#"{
  "id": "focusd.claude-usage",
  "name": { "zh-CN": "Claude 用量环", "en": "Claude usage ring" },
  "description": {
    "zh-CN": "在收起条上用同心双环显示 Claude 订阅用量：外环 5 小时，内环 7 天，悬停显示详情。默认读 claude-hud 写出的用量快照（和 Agent 页顶部相同），不联网、不读取登录凭据；没有快照时只显示灰色底轨。没装 claude-hud 时，可以打开下面的「直接向 Anthropic 查询」。",
    "en": "Shows Claude subscription usage as two rings on the collapsed bar: 5 hours outside, 7 days inside, with details on hover. By default it reads the usage snapshot claude-hud writes (as the Agent page does), with no network access and no login credentials; without a snapshot it shows grey tracks only. Without claude-hud, switch on \"Ask Anthropic directly\" below."
  },
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "ShengLin1001",
  "runtime": { "type": "builtin" },
  "contributes": {
    "settings": [
      {
        "key": "askAnthropic",
        "type": "boolean",
        "title": { "zh-CN": "直接向 Anthropic 查询", "en": "Ask Anthropic directly" },
        "description": {
          "zh-CN": "打开后，岛屿会读取本机 Claude Code 保存的登录令牌（~/.claude/.credentials.json，只读，不刷新、不改写，也不会发给 Anthropic 以外的地方），按下面的间隔经代理请求 api.anthropic.com 的用量接口。这个接口没有公开文档，可能随时失效，失效时退回 claude-hud 的快照。Agent 页顶部的用量也会用这份数据。",
          "en": "When on, the island reads the login token Claude Code saved on this computer (~/.claude/.credentials.json; read only, never renewed or rewritten, sent nowhere but Anthropic) and asks api.anthropic.com's usage endpoint through a proxy at the interval below. The endpoint is undocumented and may stop working at any time; the island then falls back to claude-hud's snapshot. The Agent page's usage line uses these numbers too."
        },
        "default": false
      },
      {
        "key": "proxy",
        "type": "string",
        "title": { "zh-CN": "代理地址", "en": "Proxy" },
        "description": {
          "zh-CN": "http:// 或 https:// 代理，例如 http://127.0.0.1:7890。留空时依次用 HTTPS_PROXY 环境变量和 Windows 的系统代理；都没有就不请求，不会绕过代理直连。",
          "en": "An http:// or https:// proxy, such as http://127.0.0.1:7890. Empty uses the HTTPS_PROXY environment variable, then the Windows proxy; without either nothing is sent, never directly."
        },
        "default": ""
      },
      {
        "key": "intervalMinutes",
        "type": "number",
        "title": { "zh-CN": "刷新间隔（分钟）", "en": "Refresh every (minutes)" },
        "min": 5,
        "max": 120,
        "default": 5
      }
    ]
  }
}"#;

const SESSION_RING_MANIFEST: &str = r#"{
  "id": "focusd.session-ring",
  "name": { "zh-CN": "Agent 会话环", "en": "Agent session ring" },
  "description": {
    "zh-CN": "在收起条上用一个分段小环代替蓝色会话数：等你确认、等你回复、运行、刚完成各有颜色，中间是会话数，悬停列出等你处理的会话，点击打开 Agent 页。数据就是 Agent 页的会话列表（Claude Code 和 Codex），需要开启 AI Agent。",
    "en": "Replaces the blue session count on the collapsed bar with a small segmented ring: needs you, your turn, running and just done each have a colour, the count sits in the middle, hovering lists the sessions waiting on you and a click opens the Agent page. Uses the Agent page's sessions (Claude Code and Codex); needs AI Agent switched on."
  },
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "ShengLin1001",
  "runtime": { "type": "builtin" }
}"#;

/// Every built-in plugin: its id, its manifest (whose "id" must match), and
/// whether it has work in this process (`native`, see `start` and `stop`).
pub(super) const BUILTINS: &[(&str, &str, bool)] = &[
    (LOCAL_API_ID, LOCAL_API_MANIFEST, true),
    ("focusd.center-pattern", CENTER_PATTERN_MANIFEST, false),
    (CLAUDE_USAGE_ID, CLAUDE_USAGE_MANIFEST, true),
    ("focusd.session-ring", SESSION_RING_MANIFEST, false),
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

/// The usage ring's direct-request settings; None while "ask Anthropic directly" is off.
pub(super) fn claude_usage_config(settings: &Map<String, Value>) -> Option<claude_usage::UsageConfig> {
    if !settings.get(CLAUDE_USAGE_ASK_ANTHROPIC).and_then(Value::as_bool).unwrap_or(false) {
        return None;
    }
    let proxy = settings
        .get("proxy")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|proxy| !proxy.is_empty())
        .map(str::to_string);
    Some(claude_usage::UsageConfig {
        proxy,
        interval_minutes: settings.get("intervalMinutes").and_then(Value::as_u64).unwrap_or(5),
    })
}

/// Starts or stops the direct requests to match the settings; the ring itself lives in the window.
fn apply_claude_usage(settings: &Map<String, Value>) -> Result<(), String> {
    match claude_usage_config(settings) {
        Some(config) => claude_usage::start(config),
        None => {
            claude_usage::stop();
            Ok(())
        }
    }
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
        CLAUDE_USAGE_ID => apply_claude_usage(settings).map(|()| Vec::new()),
        _ => Err(format!("Built-in plugin {id} is marked native but has no start.")),
    }
}

pub(super) fn stop(id: &str) -> Result<(), String> {
    if !has_native_work(BUILTINS, id)? {
        return Ok(());
    }
    match id {
        LOCAL_API_ID => local_api::stop(),
        CLAUDE_USAGE_ID => {
            claude_usage::stop();
            Ok(())
        }
        _ => Ok(()),
    }
}

pub(super) fn settings_changed(id: &str, settings: &Map<String, Value>) -> Result<(), String> {
    match id {
        LOCAL_API_ID => local_api::set_allow_write(allow_write(settings)),
        CLAUDE_USAGE_ID => apply_claude_usage(settings),
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
