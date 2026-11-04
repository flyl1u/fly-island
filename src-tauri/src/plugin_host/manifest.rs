//! `focusd-plugin.json`: parsing, validation and how a plugin's process is launched.

use serde::{Deserialize, Serialize};
use std::{
    ffi::OsString,
    path::{Component, Path, PathBuf},
};

use super::permissions::is_known_permission;

pub(super) const MANIFEST_FILE_NAME: &str = "focusd-plugin.json";
/// The host API version this build speaks. Plugins declare the one they need.
pub(super) const HOST_API_VERSION: u32 = 1;
const MAX_COMMANDS: usize = 8;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalizedText {
    #[serde(rename = "zh-CN")]
    zh_cn: String,
    en: String,
}

impl LocalizedText {
    fn is_filled(&self) -> bool {
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
}

/// A button the settings page shows for the plugin. Mirrored by `PluginCommand`
/// in src/features/plugins/api.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginCommand {
    id: String,
    title: LocalizedText,
}

impl PluginCommand {
    pub(super) fn id(&self) -> &str {
        &self.id
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct PluginContributions {
    #[serde(default)]
    pub commands: Vec<PluginCommand>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
    #[serde(default)]
    pub contributes: PluginContributions,
}

fn empty_text() -> LocalizedText {
    LocalizedText {
        zh_cn: String::new(),
        en: String::new(),
    }
}

/// Parses and checks a manifest found in the folder `folder_name`.
pub(super) fn parse_manifest(text: &str, folder_name: &str, app_version: &str) -> Result<PluginManifest, String> {
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
    if manifest.api_version != HOST_API_VERSION {
        return Err(format!(
            "The plugin needs plugin API version {}; this FocuSD Island supports version {HOST_API_VERSION}.",
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
    if let PluginRuntime::Process { command, .. } = &manifest.runtime {
        relative_command_path(command)?;
        launch_kind(command)?;
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
    Ok(manifest)
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
