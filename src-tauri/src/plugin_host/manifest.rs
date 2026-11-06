//! `focusd-plugin.json`: parsing, validation and how a plugin's process is launched.

use serde::{Deserialize, Serialize};
use std::{
    ffi::OsString,
    path::{Component, Path, PathBuf},
};

use super::activation::{self, Activation};
use super::menus::{self, PluginMenus};
use super::view_specs::{self, StatusItemSpec, ViewSpec};
use super::permissions::is_known_permission;
use super::settings::{validate_specs, SettingSpec};
use crate::clipboard_history::parse_shortcut_binding;

pub(super) const MANIFEST_FILE_NAME: &str = "focusd-plugin.json";
/// The newest host API version this build speaks. Plugins declare the one they
/// were written for; any version from MIN_API_VERSION up to this one runs, and
/// the plugin is told the version it declared (see docs/plugins/README.md).
pub(super) const HOST_API_VERSION: u32 = 2;
pub(super) const MIN_API_VERSION: u32 = 1;

pub(super) fn supports_api_version(version: u32) -> bool {
    (MIN_API_VERSION..=HOST_API_VERSION).contains(&version)
}
const MAX_COMMANDS: usize = 8;
const MAX_EXPERIMENTAL_APIS: usize = 10;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalizedText {
    #[serde(rename = "zh-CN")]
    zh_cn: String,
    en: String,
}

impl LocalizedText {
    pub(super) fn new(zh_cn: &str, en: &str) -> Self {
        Self {
            zh_cn: zh_cn.to_string(),
            en: en.to_string(),
        }
    }

    pub(super) fn en(&self) -> &str {
        &self.en
    }

    pub(super) fn is_filled(&self) -> bool {
        !self.zh_cn.trim().is_empty() && !self.en.trim().is_empty()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(super) enum PluginRuntime {
    /// A program the host starts and talks to over stdio (JSON-RPC, one message per line).
    Process {
        command: String,
        #[serde(default)]
        args: Vec<String>,
    },
    /// Nothing to run; the manifest only describes the plugin.
    None,
    /// Compiled into the island (builtin.rs); refused in plugins from disk.
    Builtin,
}

/// A button the settings page shows for the plugin. Mirrored by `PluginCommand`
/// in src/features/plugins/api.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginCommand {
    id: String,
    title: LocalizedText,
    /// A global shortcut such as "Ctrl+Alt+P" (API version 2; see keybindings.rs).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    keybinding: Option<String>,
    /// When the shortcut runs the command, e.g. "island.expanded && !todos.hasActive";
    /// read by src/features/plugins/when.ts.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    when: Option<String>,
}

impl PluginCommand {
    pub(super) fn id(&self) -> &str {
        &self.id
    }

    pub(super) fn title(&self) -> &LocalizedText {
        &self.title
    }

    pub(super) fn keybinding(&self) -> Option<&str> {
        self.keybinding.as_deref()
    }

    pub(super) fn when(&self) -> Option<&str> {
        self.when.as_deref()
    }
}

const MAX_WHEN_CHARS: usize = 200;

/// Checks a command's keybinding and when clause; version 1 plugins never had
/// them, so theirs are dropped to keep version 1 behaviour.
fn check_keybinding(command: &mut PluginCommand, api_version: u32) -> Result<(), String> {
    if api_version < 2 {
        command.keybinding = None;
        command.when = None;
        return Ok(());
    }
    if let Some(keybinding) = &command.keybinding {
        let binding = parse_shortcut_binding(keybinding).ok_or_else(|| {
            format!("Command \"{}\" has keybinding \"{keybinding}\": use modifiers and one key, like \"Ctrl+Alt+P\".", command.id)
        })?;
        command.keybinding = Some(binding.label);
    }
    if let Some(when) = &command.when {
        let allowed = |c: char| c.is_ascii_alphanumeric() || " ._-&|!=()'\"".contains(c);
        if when.chars().count() > MAX_WHEN_CHARS || !when.chars().all(allowed) {
            return Err(format!("Command \"{}\" has a \"when\" that is too long or uses other characters.", command.id));
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub(super) struct PluginContributions {
    #[serde(default)]
    pub commands: Vec<PluginCommand>,
    /// Drawn and stored by the island; see settings.rs.
    #[serde(default)]
    pub settings: Vec<SettingSpec>,
    /// Commands listed in island menus (API version 2); see menus.rs.
    #[serde(default)]
    pub menus: PluginMenus,
    /// As written; read by view_specs::check, which version 1 plugins skip.
    #[serde(default, rename = "views", skip_serializing)]
    pub views_raw: serde_json::Value,
    #[serde(default, rename = "statusItems", skip_serializing)]
    pub status_items_raw: serde_json::Value,
    /// Pages on the expanded island (API version 2); see view_specs.rs.
    #[serde(skip)]
    pub views: Vec<ViewSpec>,
    /// Short texts on the collapsed bar (API version 2).
    #[serde(skip)]
    pub status_items: Vec<StatusItemSpec>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginManifest {
    pub id: String,
    pub name: LocalizedText,
    #[serde(default = "empty_text")]
    pub description: LocalizedText,
    pub version: String,
    pub api_version: u32,
    #[serde(default)]
    pub min_app_version: Option<String>,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub homepage: String,
    pub runtime: PluginRuntime,
    #[serde(default)]
    pub permissions: Vec<String>,
    /// Permissions the plugin asks for while it runs (`permissions.request`,
    /// API version 2) instead of when it is switched on; see optional.rs.
    #[serde(default)]
    pub optional_permissions: Vec<String>,
    #[serde(default)]
    pub contributes: PluginContributions,
    /// As written; read by activation::read, which version 1 plugins skip.
    #[serde(default, rename = "activationEvents", skip_serializing)]
    pub activation_raw: serde_json::Value,
    /// When the host starts the plugin's process (API version 2); see activation.rs.
    #[serde(skip)]
    pub activation: Activation,
    /// APIs still being designed; only development plugins may list them (dev.rs).
    #[serde(default)]
    pub experimental_apis: Vec<String>,
}

fn empty_text() -> LocalizedText {
    LocalizedText {
        zh_cn: String::new(),
        en: String::new(),
    }
}

/// Parses and checks a manifest found in the folder `folder_name`.
pub(super) fn parse_manifest(text: &str, folder_name: &str, app_version: &str) -> Result<PluginManifest, String> {
    let manifest = parse_any_manifest(text, folder_name, app_version)?;
    if manifest.runtime == PluginRuntime::Builtin {
        return Err("Only plugins that come with FocuSD Island can use runtime \"builtin\".".into());
    }
    Ok(manifest)
}

/// Parses a manifest compiled into the island (builtin.rs).
pub(super) fn parse_builtin_manifest(text: &str, id: &str, app_version: &str) -> Result<PluginManifest, String> {
    parse_any_manifest(text, id, app_version)
}

fn parse_any_manifest(text: &str, folder_name: &str, app_version: &str) -> Result<PluginManifest, String> {
    let mut manifest: PluginManifest = serde_json::from_str(text)
        .map_err(|error| format!("{MANIFEST_FILE_NAME} is not valid: {error}"))?;

    if !is_valid_id(&manifest.id) {
        return Err(format!(
            "Plugin id \"{}\" may only use lowercase letters, digits, '.' and '-' (3-64 characters).",
            manifest.id
        ));
    }
    if manifest.id != folder_name {
        return Err(format!(
            "The folder must be named after the plugin id \"{}\".",
            manifest.id
        ));
    }
    if !supports_api_version(manifest.api_version) {
        return Err(format!(
            "The plugin needs plugin API version {}; this FocuSD Island supports versions {MIN_API_VERSION}-{HOST_API_VERSION}.",
            manifest.api_version
        ));
    }
    if let Some(min) = manifest.min_app_version.as_deref() {
        if !version_at_least(app_version, min) {
            return Err(format!("The plugin needs FocuSD Island {min} or later."));
        }
    }
    if !manifest.name.is_filled() {
        return Err("The plugin name needs both \"zh-CN\" and \"en\".".into());
    }
    let version = manifest.version.trim();
    if version.is_empty() || version.len() > 32 {
        return Err("The plugin version must be 1-32 characters.".into());
    }
    if let Some(unknown) = manifest.permissions.iter().find(|name| !is_known_permission(name)) {
        return Err(format!("Unknown permission \"{unknown}\"."));
    }
    manifest.permissions.sort();
    manifest.permissions.dedup();
    if let Some(unknown) = manifest.optional_permissions.iter().find(|name| !is_known_permission(name)) {
        return Err(format!("Unknown permission \"{unknown}\" in optionalPermissions."));
    }
    if manifest.api_version < 2 {
        // Version 1 had no permissions.request; its manifests keep behaving as before.
        manifest.optional_permissions.clear();
    }
    let required = manifest.permissions.clone();
    manifest.optional_permissions.retain(|name| !required.contains(name));
    manifest.optional_permissions.sort();
    manifest.optional_permissions.dedup();
    if let PluginRuntime::Process { command, .. } = &manifest.runtime {
        relative_command_path(command)?;
        launch_kind(command)?;
    }
    validate_specs(&manifest.contributes.settings)?;
    if manifest.experimental_apis.len() > MAX_EXPERIMENTAL_APIS || !manifest.experimental_apis.iter().all(|name| is_valid_api_name(name)) {
        return Err(format!("experimentalApis takes at most {MAX_EXPERIMENTAL_APIS} names like \"views.chart\"."));
    }
    let commands = &manifest.contributes.commands;
    if commands.len() > MAX_COMMANDS {
        return Err(format!("A plugin can add at most {MAX_COMMANDS} commands."));
    }
    if let Some(bad) = commands.iter().find(|command| !is_valid_command_id(&command.id) || !command.title.is_filled()) {
        return Err(format!(
            "Command \"{}\" needs an id (letters, digits, '-') and a title in both languages.",
            bad.id
        ));
    }
    let api_version = manifest.api_version;
    for command in &mut manifest.contributes.commands {
        check_keybinding(command, api_version)?;
    }
    let contributes = &mut manifest.contributes;
    let command_ids: Vec<&str> = contributes.commands.iter().map(PluginCommand::id).collect();
    menus::check(&mut contributes.menus, &command_ids, api_version)?;
    (contributes.views, contributes.status_items) = view_specs::check(&contributes.views_raw, &contributes.status_items_raw, api_version)?;
    manifest.activation = activation::read(
        &manifest.activation_raw,
        api_version,
        &manifest.contributes.commands,
        &manifest.contributes.views,
        &manifest.permissions,
    )?;
    Ok(manifest)
}

/// An experimental API name such as `views.chart`.
fn is_valid_api_name(name: &str) -> bool {
    (1..=64).contains(&name.len())
        && name.starts_with(|first: char| first.is_ascii_lowercase())
        && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'.')
}

fn is_valid_id(id: &str) -> bool {
    (3..=64).contains(&id.len())
        && id.starts_with(|first: char| first.is_ascii_lowercase() || first.is_ascii_digit())
        && id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'.' || byte == b'-')
        && !id.contains("..")
}

fn is_valid_command_id(id: &str) -> bool {
    (1..=32).contains(&id.len()) && id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

/// `have >= need`, comparing dot-separated numbers; missing parts count as 0 and
/// anything after `-` / `+` (pre-release, build) is ignored.
pub(super) fn version_at_least(have: &str, need: &str) -> bool {
    let parts = |version: &str| -> Vec<u64> {
        version
            .split(['-', '+'])
            .next()
            .unwrap_or("")
            .split('.')
            .map(|part| part.trim().parse().unwrap_or(0))
            .collect()
    };
    let (have, need) = (parts(have), parts(need));
    let length = have.len().max(need.len());
    let at = |list: &[u64], index: usize| list.get(index).copied().unwrap_or(0);
    for index in 0..length {
        match at(&have, index).cmp(&at(&need, index)) {
            std::cmp::Ordering::Greater => return true,
            std::cmp::Ordering::Less => return false,
            std::cmp::Ordering::Equal => {}
        }
    }
    true
}

/// Semantic-version order, pre-releases included: `1.3.0-beta.1` < `1.3.0-beta.2`
/// < `1.3.0`. Used to decide whether a market version is newer than the installed
/// one; `version_at_least` (app compatibility) still ignores the pre-release part.
pub(super) fn compare_versions(left: &str, right: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    let split = |version: &str| -> (Vec<u64>, Option<String>) {
        let version = version.split('+').next().unwrap_or("").trim();
        let (core, pre) = match version.split_once('-') {
            Some((core, pre)) => (core, Some(pre.to_string())),
            None => (version, None),
        };
        (core.split('.').map(|part| part.trim().parse().unwrap_or(0)).collect(), pre)
    };
    let ((left_core, left_pre), (right_core, right_pre)) = (split(left), split(right));
    let length = left_core.len().max(right_core.len());
    let at = |list: &[u64], index: usize| list.get(index).copied().unwrap_or(0);
    for index in 0..length {
        let order = at(&left_core, index).cmp(&at(&right_core, index));
        if order != Ordering::Equal {
            return order;
        }
    }
    match (left_pre, right_pre) {
        (None, None) => Ordering::Equal,
        (None, Some(_)) => Ordering::Greater,
        (Some(_), None) => Ordering::Less,
        (Some(left), Some(right)) => {
            let (left, right): (Vec<&str>, Vec<&str>) = (left.split('.').collect(), right.split('.').collect());
            for (a, b) in left.iter().zip(&right) {
                let order = match (a.parse::<u64>(), b.parse::<u64>()) {
                    (Ok(a), Ok(b)) => a.cmp(&b),
                    (Ok(_), Err(_)) => Ordering::Less,
                    (Err(_), Ok(_)) => Ordering::Greater,
                    (Err(_), Err(_)) => a.cmp(b),
                };
                if order != Ordering::Equal {
                    return order;
                }
            }
            left.len().cmp(&right.len())
        }
    }
}

/// The command must stay inside the plugin folder.
fn relative_command_path(command: &str) -> Result<PathBuf, String> {
    let path = Path::new(command);
    let inside = !command.trim().is_empty()
        && path.components().all(|component| matches!(component, Component::Normal(_)));
    if inside {
        Ok(path.to_path_buf())
    } else {
        Err(format!("runtime.command \"{command}\" must be a path inside the plugin folder."))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum LaunchKind {
    Executable,
    PowerShell,
    Node,
}

pub(super) fn launch_kind(command: &str) -> Result<LaunchKind, String> {
    let extension = Path::new(command)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);
    match extension.as_deref() {
        Some("exe") => Ok(LaunchKind::Executable),
        Some("ps1") => Ok(LaunchKind::PowerShell),
        Some("js" | "mjs" | "cjs") => Ok(LaunchKind::Node),
        _ => Err(format!(
            "runtime.command \"{command}\" must end in .exe, .ps1, .js, .mjs or .cjs."
        )),
    }
}

/// What a plugin needs installed to run, shown on the settings page: "exe" and
/// "powershell" need nothing, "node" needs Node.js, "none" runs nothing.
pub(super) fn runtime_requirement(runtime: &PluginRuntime) -> &'static str {
    match runtime {
        PluginRuntime::None => "none",
        PluginRuntime::Builtin => "builtin",
        PluginRuntime::Process { command, .. } => match launch_kind(command) {
            Ok(LaunchKind::Executable) => "exe",
            Ok(LaunchKind::PowerShell) => "powershell",
            Ok(LaunchKind::Node) => "node",
            Err(_) => "none",
        },
    }
}

/// The program and arguments that start a plugin. Scripts go through their
/// interpreter: Windows PowerShell or `node` on PATH. Batch files are not
/// supported: stopping cmd.exe would leave the program it started running.
pub(super) fn launch_command(plugin_dir: &Path, command: &str, args: &[String]) -> Result<(OsString, Vec<OsString>), String> {
    let script = plugin_dir.join(relative_command_path(command)?);
    let extra = args.iter().map(OsString::from);
    let (program, mut arguments): (OsString, Vec<OsString>) = match launch_kind(command)? {
        LaunchKind::Executable => (script.into_os_string(), Vec::new()),
        LaunchKind::PowerShell => (
            "powershell.exe".into(),
            ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"]
                .into_iter()
                .map(OsString::from)
                .chain([script.into_os_string()])
                .collect(),
        ),
        LaunchKind::Node => ("node".into(), vec![script.into_os_string()]),
    };
    arguments.extend(extra);
    Ok((program, arguments))
}
