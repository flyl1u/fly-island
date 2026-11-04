//! Which host API methods exist and the permission each one needs. Permissions
//! only gate the host API: a plugin process still runs with the user's rights.

/// Mirrored by `PLUGIN_PERMISSIONS` in src/features/plugins/api.ts.
pub(super) const PERMISSIONS: [&str; 5] = ["todos:read", "todos:write", "notes:read", "notes:write", "agent-status:write"];

/// (method, permission). `agentStatus.*` is handled natively (agent_status);
/// the rest are answered by the island window, see src/features/todos/apiCommands.ts.
const METHODS: [(&str, &str); 8] = [
    ("todos.list", "todos:read"),
    ("todos.add", "todos:write"),
    ("todos.update", "todos:write"),
    ("todos.remove", "todos:write"),
    ("note.get", "notes:read"),
    ("note.set", "notes:write"),
    ("agentStatus.report", "agent-status:write"),
    ("agentStatus.clear", "agent-status:write"),
];

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
