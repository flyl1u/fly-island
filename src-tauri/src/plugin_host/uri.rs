//! `focusd://plugin/<id>/<path>?<query>` links (activation event `onUri`),
//! like VS Code's `vscode://<publisher>.<name>/...`: a web page or another
//! program hands something to a plugin, e.g. the code of a sign-in.
//!
//! The island registers the scheme for the current user at start-up. Windows
//! starts it with the link as its argument, or, when it already runs, the
//! single-instance plugin passes the link on (lib.rs). Only plugins that list
//! `onUri` get links, and the first one asks the user on the island like a
//! sensitive permission (sensitive.rs) does, because anyone can put a link in
//! a page: "allow" and "deny" are remembered until revoked on the plugin's
//! settings page.

use serde_json::json;
use std::{thread, time::Duration};
use tauri::AppHandle;

use super::{host, lifecycle, lock, sensitive};

pub(super) const SCHEME: &str = "focusd";
/// The key of the remembered answer in `PluginGrant.sensitive`. Mirrored by
/// `PLUGIN_URI_PERMISSION` in src/features/plugins/api.ts.
pub(super) const URI_PERMISSION: &str = "uri";
const MAX_LINK_LENGTH: usize = 2048;
/// A link that started the island waits this long for the island window to
/// listen, so that the question can be shown.
const COLD_START_DELAY: Duration = Duration::from_secs(3);

/// A link meant for one plugin.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct PluginLink {
    pub plugin_id: String,
    /// What follows the plugin id, starting with "/" (or "" when nothing does).
    pub path: String,
    /// After "?", without "#fragment"; still percent-encoded.
    pub query: String,
}

/// Reads `focusd://plugin/<id>[/path][?query][#fragment]`; `None` for anything else.
pub(super) fn parse(link: &str) -> Option<PluginLink> {
    if link.len() > MAX_LINK_LENGTH || link.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return None;
    }
    let (scheme, rest) = link.split_once("://")?;
    if !scheme.eq_ignore_ascii_case(SCHEME) {
        return None;
    }
    let rest = rest.split_once('#').map_or(rest, |(before, _)| before);
    let (target, query) = rest.split_once('?').unwrap_or((rest, ""));
    let (authority, path) = target.split_once('/').map_or((target, ""), |(authority, path)| (authority, path));
    if !authority.eq_ignore_ascii_case("plugin") {
        return None;
    }
    let (plugin_id, path) = path.split_once('/').map_or((path, String::new()), |(id, path)| (id, format!("/{path}")));
    let valid_id = !plugin_id.is_empty()
        && plugin_id.len() <= 100
        && !plugin_id.starts_with('.')
        && plugin_id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    valid_id.then(|| PluginLink { plugin_id: plugin_id.to_string(), path, query: query.to_string() })
}

/// The link among a program's arguments, if any.
pub(crate) fn find_link(args: &[String]) -> Option<&str> {
    let prefix = format!("{SCHEME}:");
    args.iter()
        .map(String::as_str)
        .find(|arg| arg.len() > prefix.len() && arg.get(..prefix.len()).is_some_and(|start| start.eq_ignore_ascii_case(&prefix)))
}

/// Points `focusd://` at this executable.
pub(super) fn register_scheme() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|error| format!("Could not resolve the executable: {error}"))?;
    let command = format!("\"{}\" \"%1\"", exe.display());
    crate::win32::url_protocol::register(SCHEME, "FocuSD Island", &command)
}

/// Hands `link` to its plugin, asking the user first if needed. `cold_start`:
/// the link started the island, whose window is not listening yet.
pub(crate) fn open(app: &AppHandle, link: &str, cold_start: bool) {
    let Some(target) = parse(link) else {
        eprintln!("ignored a link that is not focusd://plugin/<id>/...: {link}");
        return;
    };
    let (app, link) = (app.clone(), link.to_string());
    // Asking blocks for up to sensitive::ANSWER_TIMEOUT.
    let spawned = thread::Builder::new().name("plugin-uri".into()).spawn(move || {
        if cold_start {
            thread::sleep(COLD_START_DELAY);
        }
        if let Err(error) = deliver(&app, &link, &target) {
            eprintln!("could not open {link}: {error}");
        }
    });
    if let Err(error) = spawned {
        eprintln!("could not open a link: {error}");
    }
}

fn deliver(app: &AppHandle, link: &str, target: &PluginLink) -> Result<(), String> {
    let id = &target.plugin_id;
    let handles_links = {
        let host = host()?;
        let installed = lock(&host.installed);
        installed
            .iter()
            .find(|plugin| plugin.folder == *id)
            .and_then(|plugin| plugin.manifest.as_ref().ok())
            .is_some_and(|manifest| manifest.activation.on_uri())
    };
    if !handles_links {
        return Err(format!("{id} is not installed or does not list onUri."));
    }
    if !lifecycle::is_runnable(id) {
        return Err(format!("{id} is switched off."));
    }
    if !sensitive::check(app, id, URI_PERMISSION) {
        return Err("the user did not allow it.".into());
    }
    let params = json!({ "uri": link, "path": target.path, "query": target.query });
    lifecycle::deliver(id, "onUri".into(), "uri", params)
}

#[cfg(test)]
mod tests {
    use super::{find_link, parse, PluginLink};

    fn link(plugin_id: &str, path: &str, query: &str) -> Option<PluginLink> {
        Some(PluginLink { plugin_id: plugin_id.into(), path: path.into(), query: query.into() })
    }

    #[test]
    fn a_plugin_link_names_the_plugin_path_and_query() {
        assert_eq!(parse("focusd://plugin/dev.focusd.todo-digest/auth?code=a%20b#top"), link("dev.focusd.todo-digest", "/auth", "code=a%20b"));
        assert_eq!(parse("FOCUSD://Plugin/my_plugin"), link("my_plugin", "", ""));
        assert_eq!(parse("focusd://plugin/x/a/b/"), link("x", "/a/b/", ""));
        assert_eq!(parse("focusd://plugin/x?y=1"), link("x", "", "y=1"));
    }

    #[test]
    fn other_links_are_refused() {
        let long = format!("focusd://plugin/x/{}", "a".repeat(2048));
        for text in [
            "https://plugin/x/y",
            "focusd://settings/x",
            "focusd://plugin/",
            "focusd://plugin/../x",
            "focusd://plugin/x y/z",
            "focusd://plugin/a\\b",
            "focusd:plugin/x",
            &long,
        ] {
            assert_eq!(parse(text), None, "{text}");
        }
    }

    #[test]
    fn the_link_is_found_among_the_arguments() {
        let args = |list: &[&str]| list.iter().map(|arg| arg.to_string()).collect::<Vec<_>>();
        assert_eq!(find_link(&args(&["island.exe", "focusd://plugin/x"])), Some("focusd://plugin/x"));
        assert_eq!(find_link(&args(&["island.exe", "--flag", "日本語の引数"])), None);
        assert_eq!(find_link(&args(&["island.exe"])), None);
    }
}

