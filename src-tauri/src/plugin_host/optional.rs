//! Optional permissions (manifest `optionalPermissions`, API version 2). They
//! are not granted when the plugin is switched on; the plugin asks for them
//! with `permissions.request` while it runs, and the user answers on the
//! island: allow, deny or allow once. The prompt and the remembered answers
//! are those of sensitive.rs, so the plugin's settings page lists them and
//! revoking one works the same way (it also drops the event subscriptions
//! that need it). A remembered "deny" is not asked again until the user
//! revokes it there.

use serde_json::{json, Value};
use tauri::AppHandle;

use super::{permissions::PERMISSIONS, sensitive};

/// Whether a plugin may use `permission` now: it asked for it in
/// `permissions` (granted when it was switched on), or in
/// `optionalPermissions` and the user allowed it.
pub(super) fn has(plugin_id: &str, granted: &[String], optional: &[String], permission: &str) -> bool {
    granted.iter().any(|name| name == permission) || optional.iter().any(|name| name == permission) && sensitive::allowed_now(plugin_id, permission)
}

/// The permissions a plugin may use right now, for `initialize` and `host.info`.
pub(super) fn usable(plugin_id: &str, granted: &[String], optional: &[String]) -> Vec<String> {
    let mut usable = granted.to_vec();
    usable.extend(optional.iter().filter(|name| sensitive::allowed_now(plugin_id, name)).cloned());
    usable.sort();
    usable.dedup();
    usable
}

/// The names in `{ permissions: [name] }`, each one the plugin listed.
pub(super) fn requested<'a>(params: &'a Value, granted: &[String], optional: &[String]) -> Result<Vec<&'a str>, (u16, String)> {
    let bad = |message: String| (400, message);
    let names = params
        .get("permissions")
        .and_then(Value::as_array)
        .filter(|names| !names.is_empty() && names.len() <= PERMISSIONS.len())
        .ok_or_else(|| bad(format!("Expected {{ permissions: [name] }} with 1-{} names.", PERMISSIONS.len())))?;
    let mut list = Vec::with_capacity(names.len());
    for name in names {
        let name = name.as_str().ok_or_else(|| bad("Permission names must be strings.".into()))?;
        if !granted.iter().chain(optional).any(|listed| listed == name) {
            return Err(bad(format!("\"{name}\" is not in the plugin's permissions or optionalPermissions.")));
        }
        if !list.contains(&name) {
            list.push(name);
        }
    }
    Ok(list)
}

/// `permissions.request { permissions }`: asks the user about each optional
/// permission not answered yet (one prompt at a time, at most
/// sensitive::ANSWER_TIMEOUT each) and answers `{ granted, denied }`.
pub(super) fn request(app: &AppHandle, plugin_id: &str, granted: &[String], optional: &[String], params: &Value) -> Result<Value, (u16, String)> {
    let mut allowed = Vec::new();
    let mut denied = Vec::new();
    for name in requested(params, granted, optional)? {
        let Some(permission) = PERMISSIONS.iter().copied().find(|known| *known == name) else { continue };
        let yes = granted.iter().any(|listed| listed == name) && !sensitive::is_sensitive(permission)
            || sensitive::check(app, plugin_id, permission);
        if yes {
            allowed.push(permission);
        } else {
            denied.push(permission);
        }
    }
    Ok(json!({ "granted": allowed, "denied": denied }))
}
