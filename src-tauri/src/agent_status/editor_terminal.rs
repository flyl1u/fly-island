//! Switching to a session's terminal inside VS Code and editors built on it. They have no way to
//! select a terminal from outside, so the island opens a link handled by its own extension
//! (packages/vscode-extension), which shows the terminal whose shell is one of the session's
//! processes. The link is only opened when the extension is installed in that editor: otherwise the
//! editor would offer to install it.

use std::{fs, path::Path};

use serde_json::Value;

/// `<publisher>.<name>` of the extension; also the authority of the links it handles.
const EXTENSION_ID: &str = "tixxin.focusd-island";

/// Editors by executable name (lowercase, no ".exe"): their link scheme and the folder under the
/// user's home that holds their extensions.
const EDITORS: &[(&str, &str, &str)] = &[
    ("code", "vscode", ".vscode"),
    ("code - insiders", "vscode-insiders", ".vscode-insiders"),
    ("cursor", "cursor", ".cursor"),
    ("windsurf", "windsurf", ".windsurf"),
    ("vscodium", "vscodium", ".vscode-oss"),
    ("trae", "trae", ".trae"),
    ("kiro", "kiro", ".kiro"),
];

/// The link scheme and extensions folder (under the home folder) of an editor app.
pub(super) fn editor_of_app(app: &str) -> Option<(&'static str, &'static str)> {
    EDITORS
        .iter()
        .find(|(name, _, _)| *name == app)
        .map(|&(_, scheme, folder)| (scheme, folder))
}

/// Whether the extension is installed in `extensions_dir`: a `tixxin.focusd-island-<version>`
/// folder that is not listed in `.obsolete`, where the editor keeps uninstalled extensions until it
/// restarts.
pub(super) fn extension_installed(extensions_dir: &Path) -> bool {
    let obsolete = fs::read_to_string(extensions_dir.join(".obsolete"))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .unwrap_or(Value::Null);
    let prefix = format!("{EXTENSION_ID}-");
    let Ok(entries) = fs::read_dir(extensions_dir) else {
        return false;
    };
    entries.flatten().any(|entry| {
        let name = entry.file_name().to_string_lossy().to_string();
        let is_version = name
            .to_lowercase()
            .strip_prefix(&prefix)
            .is_some_and(|version| version.starts_with(|c: char| c.is_ascii_digit()));
        is_version && entry.path().is_dir() && obsolete[&name] != true
    })
}

/// The link that asks the extension to show the terminal of the session: `chain` is the session's
/// process and its ancestors, `title` its title for when no process is known.
pub(super) fn focus_link(scheme: &str, chain: &[u32], title: Option<&str>) -> String {
    let pids = chain.iter().map(u32::to_string).collect::<Vec<_>>().join(",");
    let mut link = format!("{scheme}://{EXTENSION_ID}/focus?pids={pids}");
    if let Some(title) = title.filter(|title| !title.is_empty()) {
        link.push_str("&title=");
        link.push_str(&percent_encode(title));
    }
    link
}

fn percent_encode(text: &str) -> String {
    text.bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (byte as char).to_string(),
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

/// What happened when asking an editor to show the session's terminal.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum EditorTerminal {
    /// The link was opened.
    Sent,
    /// The editor does not have the extension.
    NoExtension,
    /// Nothing identifies the session's terminal, or the link could not be opened.
    Failed,
}

/// Asks the editor `app`, whose window is in front, to show the session's terminal. `None` when
/// `app` is not an editor built on VS Code.
pub(super) fn show_session_terminal(
    home_dir: &Path,
    app: &str,
    chain: &[u32],
    title: Option<&str>,
) -> Option<EditorTerminal> {
    let (scheme, folder) = editor_of_app(app)?;
    if !extension_installed(&home_dir.join(folder).join("extensions")) {
        return Some(EditorTerminal::NoExtension);
    }
    if chain.is_empty() && title.is_none_or(str::is_empty) {
        return Some(EditorTerminal::Failed);
    }
    let opened = tauri_plugin_opener::open_url(focus_link(scheme, chain, title), None::<&str>);
    Some(if opened.is_ok() { EditorTerminal::Sent } else { EditorTerminal::Failed })
}
