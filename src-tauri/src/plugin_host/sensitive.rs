//! Sensitive permissions (docs/architecture/plugin-platform.md §3.2): granted
//! when the plugin is switched on like any other, but the first call that
//! uses one also asks the user on the island: allow, deny or allow once. The
//! request waits for the answer for at most ANSWER_TIMEOUT; no answer is a
//! denial that is not remembered, so the next call asks again.
//!
//! "Allow" and "deny" are kept in plugins.json (`sensitive`) until the user
//! revokes them on the plugin's settings page; "allow once" lasts until the
//! plugin process restarts.

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Condvar, Mutex, OnceLock, PoisonError,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

use super::{grants::update_state, host, lock, manifest::LocalizedText};
use crate::island;

/// Permissions whose first use the user confirms. Each is also in
/// permissions::PERMISSIONS once its methods exist.
pub(super) const SENSITIVE_PERMISSIONS: [&str; 5] = ["clipboard:read", "messages:read", "media:read", "shelf:read", "shelf:write"];

/// Mirrored by `PLUGIN_PERMISSION_REQUEST_EVENT` in src/features/plugins/api.ts.
const REQUEST_EVENT: &str = "plugin-permission-request";
pub(super) const ANSWER_TIMEOUT: Duration = Duration::from_secs(30);

pub(super) fn is_sensitive(permission: &str) -> bool {
    SENSITIVE_PERMISSIONS.contains(&permission)
}

/// What plugins.json remembers. Mirrored by `PluginSensitiveChoice` in src/features/plugins/api.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SensitiveChoice {
    Allowed,
    Denied,
}

/// The user's answer on the island.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Answer {
    Allow,
    Deny,
    AllowOnce,
}

impl Answer {
    pub(super) fn parse(text: &str) -> Option<Self> {
        match text {
            "allow" => Some(Self::Allow),
            "deny" => Some(Self::Deny),
            "once" => Some(Self::AllowOnce),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Decision {
    Allow,
    Deny,
    Ask,
}

/// Before a call: whether to run it, refuse it, or ask first.
pub(super) fn decide(stored: Option<SensitiveChoice>, allowed_this_run: bool) -> Decision {
    match stored {
        Some(SensitiveChoice::Allowed) => Decision::Allow,
        Some(SensitiveChoice::Denied) => Decision::Deny,
        None if allowed_this_run => Decision::Allow,
        None => Decision::Ask,
    }
}

/// After asking (`None`: no answer in time): whether the call runs, what to
/// remember in plugins.json, and whether to allow it for this run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Outcome {
    pub allowed: bool,
    pub remember: Option<SensitiveChoice>,
    pub this_run: bool,
}

pub(super) fn outcome(answer: Option<Answer>) -> Outcome {
    match answer {
        Some(Answer::Allow) => Outcome { allowed: true, remember: Some(SensitiveChoice::Allowed), this_run: false },
        Some(Answer::Deny) => Outcome { allowed: false, remember: Some(SensitiveChoice::Denied), this_run: false },
        Some(Answer::AllowOnce) => Outcome { allowed: true, remember: None, this_run: true },
        None => Outcome { allowed: false, remember: None, this_run: false },
    }
}

/// An open question: which plugin asks, for which permission, and its answer.
type OpenPrompt = (String, &'static str, Arc<Prompt>);

#[derive(Default)]
struct Prompt {
    answer: Mutex<Option<Answer>>,
    answered: Condvar,
}

struct Prompts {
    next_id: AtomicU64,
    /// Open prompts by request id, with the plugin and permission they ask about.
    open: Mutex<HashMap<u64, OpenPrompt>>,
    /// (plugin, permission) allowed until the plugin process restarts.
    this_run: Mutex<HashSet<(String, &'static str)>>,
}

fn prompts() -> &'static Prompts {
    static PROMPTS: OnceLock<Prompts> = OnceLock::new();
    PROMPTS.get_or_init(|| Prompts {
        next_id: AtomicU64::new(1),
        open: Mutex::default(),
        this_run: Mutex::default(),
    })
}

/// Forgets "allow once" answers; called when the plugin's process (re)starts.
pub(super) fn forget_this_run(plugin_id: &str) {
    lock(&prompts().this_run).retain(|(plugin, _)| plugin != plugin_id);
}

/// Whether `plugin_id` may use `permission` now, asking the user if needed.
/// Blocks the calling (request) thread for at most ANSWER_TIMEOUT.
pub(super) fn check(app: &AppHandle, plugin_id: &str, permission: &'static str) -> bool {
    let stored = host()
        .ok()
        .and_then(|host| lock(&host.state).plugins.get(plugin_id).and_then(|grant| grant.sensitive.get(permission).copied()));
    let this_run = lock(&prompts().this_run).contains(&(plugin_id.to_string(), permission));
    match decide(stored, this_run) {
        Decision::Allow => return true,
        Decision::Deny => return false,
        Decision::Ask => {}
    }
    let result = outcome(ask(app, plugin_id, permission));
    if result.this_run {
        lock(&prompts().this_run).insert((plugin_id.to_string(), permission));
    }
    if let Some(choice) = result.remember {
        let saved = update_state(|state, _| {
            state.plugins.entry(plugin_id.to_string()).or_default().sensitive.insert(permission.to_string(), choice);
            Ok(())
        });
        if let Err(error) = saved {
            eprintln!("could not save the answer for {plugin_id} {permission}: {error}");
        }
    }
    result.allowed
}

/// Shows the prompt (or joins one already open for the same plugin and
/// permission) and waits for the answer.
fn ask(app: &AppHandle, plugin_id: &str, permission: &'static str) -> Option<Answer> {
    let prompts = prompts();
    let (id, prompt, is_new) = {
        let mut open = lock(&prompts.open);
        let existing = open
            .iter()
            .find(|(_, (plugin, asked, _))| plugin == plugin_id && *asked == permission)
            .map(|(id, (_, _, prompt))| (*id, Arc::clone(prompt)));
        match existing {
            Some((id, prompt)) => (id, prompt, false),
            None => {
                let id = prompts.next_id.fetch_add(1, Ordering::Relaxed);
                let prompt = Arc::new(Prompt::default());
                open.insert(id, (plugin_id.to_string(), permission, Arc::clone(&prompt)));
                (id, prompt, true)
            }
        }
    };
    if is_new {
        let plugin_name: Option<LocalizedText> = host().ok().and_then(|host| {
            lock(&host.installed)
                .iter()
                .find(|plugin| plugin.folder == plugin_id)
                .and_then(|plugin| plugin.manifest.as_ref().ok())
                .map(|manifest| manifest.name.clone())
        });
        let payload = json!({
            "requestId": id,
            "pluginId": plugin_id,
            "pluginName": plugin_name,
            "permission": permission,
            "timeoutMs": ANSWER_TIMEOUT.as_millis() as u64,
        });
        if app.emit_to(island::WINDOW_LABEL, REQUEST_EVENT, payload).is_err() {
            lock(&prompts.open).remove(&id);
            return None;
        }
    }
    let deadline = Instant::now() + ANSWER_TIMEOUT;
    let mut answer = lock(&prompt.answer);
    while answer.is_none() {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            break;
        }
        answer = prompt.answered.wait_timeout(answer, left).unwrap_or_else(PoisonError::into_inner).0;
    }
    let result = *answer;
    drop(answer);
    lock(&prompts.open).remove(&id);
    result
}

/// The user's answer to a prompt; an unknown id (already timed out) is ignored.
pub(super) fn answer(request_id: u64, answer: Answer) {
    let prompt = lock(&prompts().open).get(&request_id).map(|(_, _, prompt)| Arc::clone(prompt));
    if let Some(prompt) = prompt {
        *lock(&prompt.answer) = Some(answer);
        prompt.answered.notify_all();
    }
}

/// Whether `plugin_id` may use `permission` right now without asking: the
/// user allowed it, or allowed it once for this run. Checked before each
/// event that carries sensitive data.
pub(super) fn allowed_now(plugin_id: &str, permission: &str) -> bool {
    let stored = host()
        .ok()
        .and_then(|host| lock(&host.state).plugins.get(plugin_id).and_then(|grant| grant.sensitive.get(permission).copied()));
    let this_run = lock(&prompts().this_run).iter().any(|(plugin, asked)| plugin == plugin_id && *asked == permission);
    decide(stored, this_run) == Decision::Allow
}

/// Removes a remembered answer and any "allow once": the next call asks
/// again. The running plugin also loses its subscriptions to events that need
/// the permission, so data stops flowing at once, not after a restart.
pub(super) fn revoke(plugin_id: &str, permission: &str) -> Result<(), String> {
    lock(&prompts().this_run).retain(|(plugin, asked)| !(plugin == plugin_id && *asked == permission));
    update_state(|state, _| {
        if let Some(grant) = state.plugins.get_mut(plugin_id) {
            grant.sensitive.remove(permission);
        }
        Ok(())
    })?;
    if let Ok(host) = host() {
        if let Some(supervisor) = lock(&host.supervisors).get(plugin_id) {
            supervisor.unsubscribe_needing(permission);
        }
    }
    Ok(())
}
