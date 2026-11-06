//! Which host API methods exist and the permission each one needs. Permissions
//! only gate the host API: a plugin process still runs with the user's rights.

/// Mirrored by `PLUGIN_PERMISSIONS` in src/features/plugins/api.ts.
pub(super) const PERMISSIONS: [&str; 14] = [
    "todos:read",
    "todos:write",
    "notes:read",
    "notes:write",
    "agent-status:read",
    "agent-status:write",
    "island:notify",
    "secrets",
    "clipboard:read",
    "messages:read",
    "media:read",
    "media:control",
    "shelf:read",
    "shelf:write",
];

/// (method, permission). `agentStatus.*` is handled natively (agent_status),
/// `island.notify` in notify.rs, `secrets.*` in storage.rs, `clipboard.*` in
/// clipboard_history, `messages.*` / `media.*` in feeds.rs, `shelf.*` in file_shelf; the rest are
/// answered by the island window, see src/features/todos/apiCommands.ts.
pub(super) const METHODS: [(&str, &str); 22] = [
    ("todos.list", "todos:read"),
    ("todos.days", "todos:read"),
    ("todos.add", "todos:write"),
    ("todos.update", "todos:write"),
    ("todos.remove", "todos:write"),
    ("note.get", "notes:read"),
    ("note.set", "notes:write"),
    ("agentStatus.report", "agent-status:write"),
    ("agentStatus.clear", "agent-status:write"),
    ("island.notify", "island:notify"),
    ("secrets.get", "secrets"),
    ("secrets.set", "secrets"),
    ("secrets.delete", "secrets"),
    ("clipboard.history", "clipboard:read"),
    ("messages.list", "messages:read"),
    ("media.nowPlaying", "media:read"),
    ("media.playPause", "media:control"),
    ("media.next", "media:control"),
    ("media.previous", "media:control"),
    ("shelf.list", "shelf:read"),
    ("shelf.add", "shelf:write"),
    ("shelf.remove", "shelf:write"),
];

/// Host features added after API version 1, sent in `initialize`. Plugins
/// check these instead of the island's version. plugins/schema/rpc.json lists
/// the same names (checked by a test).
pub(super) const CAPABILITIES: [&str; 9] = ["events", "notifications", "storage", "secrets", "views", "status", "webview", "permissions", "openView"];

pub(super) fn is_known_permission(name: &str) -> bool {
    PERMISSIONS.contains(&name)
}

/// The method's static name and the permission it needs, or `None` if the
/// method does not exist.
pub(super) fn method_permission(method: &str) -> Option<(&'static str, &'static str)> {
    METHODS.iter().copied().find(|(name, _)| *name == method)
}

/// Requested permissions the user has not granted yet.
pub(super) fn missing_permissions(requested: &[String], granted: &[String]) -> Vec<String> {
    requested
        .iter()
        .filter(|name| !granted.contains(name))
        .cloned()
        .collect()
}
