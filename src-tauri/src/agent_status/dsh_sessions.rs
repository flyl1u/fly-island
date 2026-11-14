//! Read-only DeepSeek Harness desktop checkpoints. Never opens the compressed conversation log
//! or activates a session: projection checkpoints may lag the live host by its write interval.

use std::{collections::HashMap, env, fs, io::Read, path::{Path, PathBuf}, sync::{Mutex, PoisonError}, time::SystemTime};

use serde_json::Value;

use super::{markers::AGENT_RUNNING_STALE_AFTER_MS, session_host::SessionHost,
    sessions::AgentSessionSummary, snapshot::system_time_to_unix_millis, title::{folder_title, shorten},
    window_focus::{self, SessionHints}};

const MAX_CHECKPOINT_BYTES: u64 = 512 * 1024;
const MAX_CHECKPOINTS: usize = 512;
type CachedJson = ((u64, Option<SystemTime>), Value);
static CHECKPOINTS: Mutex<Option<HashMap<PathBuf, CachedJson>>> = Mutex::new(None);
pub(super) const DESKTOP_APPS: &[&str] = super::dsh_desktop::APPS;

pub(super) fn read_json(path: &Path, maximum: u64) -> Option<Value> {
    let file = fs::File::open(path).ok()?;
    let metadata = file.metadata().ok()?;
    if metadata.len() > maximum { return None; }
    let stamp = (metadata.len(), metadata.modified().ok());
    let mut cache = CHECKPOINTS.lock().unwrap_or_else(PoisonError::into_inner);
    let entries = cache.get_or_insert_with(HashMap::new);
    if let Some((_, value)) = entries.get(path).filter(|(known, _)| *known == stamp) { return Some(value.clone()); }
    let mut text = String::new();
    file.take(maximum + 1).read_to_string(&mut text).ok()?;
    if text.len() as u64 > maximum { return None; }
    let value: Value = serde_json::from_str(&text).ok()?;
    if entries.len() >= MAX_CHECKPOINTS || entries.values().map(|(stamp, _)| stamp.0).sum::<u64>() + stamp.0 > 8 * 1024 * 1024 { entries.clear(); }
    entries.insert(path.to_path_buf(), (stamp, value.clone()));
    Some(value)
}

pub(super) fn is_session_id(id: &str) -> bool {
    id.strip_prefix("session-").is_some_and(|id| {
        id.len() == 36 && id.bytes().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) { c == b'-' } else { c.is_ascii_hexdigit() }
        })
    })
}

/// Projection versions move independently between DSH releases (observed 2026-11: contextPressure
/// 4→5, contextBreakdown 4→6, titleInput 1→3). A row is read at its known version or any newer one;
/// callers validate the fields they need, so a reshaped row is skipped rather than guessed.
fn row<'a>(rows: &'a Value, key: &str, version: u64) -> Option<&'a Value> {
    let row = &rows[key];
    row["ver"].as_u64().is_some_and(|ver| ver >= version).then_some(&row["val"])
}

/// The domain and record generations DSH has shipped so far are 3–7 and 3/4; later ones keep the
/// `{version, record: {identity, rows}}` envelope, which `parse_checkpoint` still checks field by field.
pub(super) fn known_envelope(value: &Value) -> bool {
    value["version"].as_u64().is_some_and(|v| v >= 3) && value["record"]["rows"].is_object()
}

fn text(value: &Value, maximum: usize) -> Option<String> {
    value.as_str().map(str::trim).filter(|s| !s.is_empty()).and_then(|s| shorten(s, maximum))
}

pub(super) fn parse_checkpoint(value: &Value, id: &str, updated_at: i64, now: i64, open: bool) -> Option<AgentSessionSummary> {
    if !is_session_id(id) || !known_envelope(value) { return None; }
    let record = &value["record"];
    if !record["identity"]["formatVersion"].as_u64().is_some_and(|v| v >= 3) { return None; }
    let rows = &record["rows"];
    let metadata = row(rows, "sessionListMetadata", 1)?;
    if metadata["blank"].as_bool()? { return None; }
    let boundary = row(rows, "turnBoundary", 2)?;
    // A reshaped boundary (no turn counter) cannot tell running from done: skip, don't guess.
    boundary["lastTurn"].as_u64()?;
    let in_turn = boundary["openTurnStartSeq"].as_u64().is_some();
    // Continued timed questions no longer block the agent. Permissions are host-only transient
    // state and cannot be reconstructed from this cache (see docs/deepseek-harness.md).
    let question = row(rows, "userQuestions", 2)
        .and_then(|v| v["questions"]["active"].as_array())
        .is_some_and(|questions| questions.iter().any(|q| q["state"] == "open"));
    let phase = match (open, question, in_turn) {
        (false, _, _) => "completed",
        (_, true, _) => "waiting",
        (_, _, true) if now.saturating_sub(updated_at) > AGENT_RUNNING_STALE_AFTER_MS => "stale",
        (_, _, true) => "running",
        _ => "completed",
    };
    let cwd = record["identity"]["cwd"].as_str().filter(|s| !s.is_empty()).map(str::to_string);
    let outline = row(rows, "turnOutline", 2).and_then(|v| v["turns"].as_array()).and_then(|v| v.last());
    let title = row(rows, "title", 1).and_then(|v| text(v, 80))
        .or_else(|| row(rows, "titleInput", 1).and_then(|v| text(&v["first"]["text"], 80)))
        .or_else(|| cwd.as_deref().and_then(folder_title));
    let selection = row(rows, "modelSelection", 2).map(|v| &v["lastUsed"]);
    Some(AgentSessionSummary {
        provider: "dsh", session_id: id.to_string(), cwd, title,
        model: selection.and_then(|v| text(&v["model"], 80)),
        effort: selection.and_then(|v| text(&v["reasoningEffort"], 40)),
        phase, last_message: outline.and_then(|v| text(&v["response"], 200)),
        reply_marker: None, reply_asks: false, updated_at,
        host: Some(SessionHost { name: "DeepSeek Harness".to_string(), exe: None, kind: "app" }),
        turn_started_at: metadata["lastPromptAt"].as_i64(),
        owner_prompt_at: metadata["lastPromptAt"].as_i64(),
        last_prompt: outline.and_then(|v| text(&v["prompt"], 80)),
        current_tool: None, permission_mode: None, subagents: 0, background_tasks: 0,
        compacting: false, todos: None, closed: !open, remote_host: None,
        context_tokens: row(rows, "contextPressure", 4).and_then(|v| v["surfaceTokens"].as_u64()),
    })
}

/// The conversation log's generation (v3, v4 today) changes with DSH; any `session.v<N>.jsonl*` counts.
fn has_source_log(shards: &[PathBuf], id: &str) -> bool {
    shards.iter().any(|shard| fs::read_dir(shard.join(id)).into_iter().flatten().flatten().any(|file| {
        file.file_name().to_str().is_some_and(|name| {
            name.strip_prefix("session.v").and_then(|rest| rest.split_once('.'))
                .is_some_and(|(version, ext)| !version.is_empty() && version.bytes().all(|c| c.is_ascii_digit()) && ext.starts_with("jsonl"))
        })
    }))
}

pub(super) fn has_checkpoints(root: &Path) -> bool {
    root.join("storages/session_projcache/sessions").is_dir()
}

pub(super) fn list_from_root(root: &Path, now: i64, window_ms: i64, exe: Option<&str>) -> Vec<AgentSessionSummary> {
    let dir = root.join("storages/session_projcache/sessions");
    let shards: Vec<PathBuf> = fs::read_dir(root.join("sessions")).into_iter().flatten().flatten().map(|shard| shard.path()).collect();
    let mut paths: Vec<_> = fs::read_dir(dir).into_iter().flatten().flatten().filter_map(|entry| {
        let modified = entry.metadata().ok()?.modified().ok().and_then(system_time_to_unix_millis)?;
        (now.saturating_sub(modified) <= window_ms).then_some((modified, entry.path()))
    }).collect();
    paths.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
    paths.into_iter().take(MAX_CHECKPOINTS).filter_map(|(modified, path)| {
        if path.extension()? != "json" { return None; }
        let id = path.file_stem()?.to_str()?;
        let mut summary = parse_checkpoint(&read_json(&path, MAX_CHECKPOINT_BYTES)?, id, modified, now, exe.is_some())?;
        // Deleted logs may leave a checkpoint. Only sessions with a corresponding source file
        // are listed. Checking existence does not read or decompress the conversation body.
        if !has_source_log(&shards, id) { return None; }
        if let Some(host) = &mut summary.host { host.exe = exe.map(str::to_string); }
        Some(summary)
    }).collect()
}

fn merge_session(sessions: &mut HashMap<String, AgentSessionSummary>, session: AgentSessionSummary) {
    if sessions.get(&session.session_id).is_none_or(|old| session.updated_at > old.updated_at) {
        sessions.insert(session.session_id.clone(), session);
    }
}

pub(super) fn list_sessions(home: &Path, now: i64, window_ms: i64) -> Vec<AgentSessionSummary> {
    let mut sessions: HashMap<String, AgentSessionSummary> = HashMap::new();
    let mut windows = None;
    for (root, owner) in super::dsh_desktop::roots(home, env::var_os("APPDATA").map(PathBuf::from)) {
        // Most users have one store. Probing processes for every absent root made each scan
        // enumerate windows and process snapshots six times over.
        if !has_checkpoints(&root) { continue; }
        let windows = windows.get_or_insert_with(super::dsh_desktop::windows);
        let exe = super::dsh_desktop::exe_for(owner, windows);
        let name = exe.as_deref().map(super::dsh_desktop::name).unwrap_or(owner);
        for mut session in list_from_root(&root, now, window_ms, exe.as_deref()) {
            if let Some(host) = &mut session.host {
                host.name = name.to_string();
            }
            merge_session(&mut sessions, session);
        }
    }
    let mut sessions: Vec<_> = sessions.into_values().collect();
    sessions.sort_by_key(|session| std::cmp::Reverse(session.updated_at));
    sessions
}

pub(super) fn focus_desktop(id: Option<&str>) -> bool {
    let owner = crate::system::windows_home_dir().ok().and_then(|home| {
        list_sessions(&home, super::snapshot::current_unix_millis(), i64::MAX)
            .into_iter().find(|session| Some(session.session_id.as_str()) == id)
            .and_then(|session| session.host).and_then(|host| host.exe)
    });
    let windows = super::dsh_desktop::windows();
    let target = super::dsh_desktop::preferred_window(&windows, owner.as_deref()).and_then(|index| windows.get(index));
    target.is_some_and(|(_, pid)| window_focus::focus_session_window(&SessionHints::default(), &[*pid], None).is_some())
}

/// Do not mark every desktop conversation as read merely because the app is foreground.
pub(super) fn session_in_front(home: &Path, id: &str) -> bool {
    let front = crate::win32::process::window_process_id(crate::win32::window::foreground_window());
    let front_exe = crate::win32::process::image_path(front);
    super::dsh_desktop::roots(home, env::var_os("APPDATA").map(PathBuf::from)).into_iter().any(|(root, owner)| {
        if !front_exe.as_deref().is_some_and(|exe| super::dsh_desktop::owns(owner, exe)) { return false; }
        ["desktop", "web"].iter().any(|profile| {
            read_json(&root.join("profiles").join(profile).join("desktop-storage.json"), MAX_CHECKPOINT_BYTES)
                .and_then(|v| v["dsh.sessions.current"].as_str().and_then(|s| serde_json::from_str::<Value>(s).ok()))
                .is_some_and(|current| current["sessionId"] == id)
        })
    })
}

#[cfg(test)]
#[path = "dsh_sessions_tests.rs"]
mod tests;
