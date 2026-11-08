//! Agent sessions on other computers, read over SSH (remote_fetch.rs) into a mirror in the app
//! data folder (`remote-sessions/<host>/` laid out like a home folder, file times kept) that the
//! local scan reads like the user's own home. Each host is fetched in the background at most
//! every REFRESH_MS while sessions are being listed, so listing never waits for the network, over
//! a connection kept open between fetches (remote_fetch.rs).

use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    path::{Component, Path, PathBuf},
    sync::{Mutex, PoisonError},
    time::{Duration, UNIX_EPOCH},
};

use serde::Serialize;

use super::remote_fetch::{write_island_config, Connection, Forward, RemoteFile, Reply, TAIL_BYTES};
use super::notifications::saved_notifications;
use super::remote_hosts::{self, SshTarget};
use super::remote_setup::REMOTE_NOTIFICATIONS_DIR;
use super::session_host::SessionHost;
use super::session_scan;
use super::sessions::AgentSessionSummary;
use super::snapshot::current_unix_millis;

pub(super) const MIRROR_DIR: &str = "remote-sessions";
const REFRESH_MS: i64 = 3_000;
/// After a failure (offline, key refused) the host is tried less often.
const RETRY_AFTER_ERROR_MS: i64 = 60_000;

/// What the island knows of one host.
#[derive(Default)]
struct HostState {
    files: HashMap<String, MirroredFile>,
    /// The sessions the host's Claude Code registry lists as running; `None` without a registry.
    registry: Option<HashSet<String>>,
    in_flight: bool,
    attempted_at: i64,
    fetched_at: Option<i64>,
    error: Option<String>,
    /// Why the host's approvals cannot reach the island's cards (no reverse forward).
    approval_error: Option<String>,
    /// Sessions the last listing found in the host's mirror.
    sessions: usize,
}

struct MirroredFile {
    remote: RemoteFile,
    /// The file's first lines, kept so later fetches can send only the tail.
    head: Vec<u8>,
}

static HOSTS: Mutex<Option<HashMap<String, HostState>>> = Mutex::new(None);
/// Each host's open connection, between fetches; a fetch holds it meanwhile.
// shortcut: a connection stays open while the island lists no sessions (the Agent status switched
// off); close idle ones if the remote shells left waiting ever matter.
static CONNECTIONS: Mutex<Option<HashMap<String, Connection>>> = Mutex::new(None);

/// How reading a host went, for the settings page.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteHostStatus {
    host: String,
    fetched_at: Option<i64>,
    error: Option<String>,
    fetching: bool,
    /// Sessions of the listing window found there, once it has been read.
    sessions: usize,
    /// Why approvals from there cannot reach the island's cards; None when they can, or before
    /// the first connection.
    approval_error: Option<String>,
}

/// The chosen hosts' sessions from their mirrors, starting a background fetch for each host that
/// is due. `window_ms` is how far back a session may have changed, as for local sessions.
pub(super) fn sessions(app_dir: &Path, window_ms: i64) -> Vec<AgentSessionSummary> {
    let targets = remote_hosts::chosen_targets(app_dir);
    let hosts: Vec<String> = targets.iter().map(|(host, _)| host.clone()).collect();
    let now = current_unix_millis();
    {
        let mut states = HOSTS.lock().unwrap_or_else(PoisonError::into_inner);
        let states = states.get_or_insert_with(HashMap::new);
        states.retain(|host, _| hosts.contains(host));
        if let Some(connections) = CONNECTIONS.lock().unwrap_or_else(PoisonError::into_inner).as_mut() {
            connections.retain(|host, _| hosts.contains(host));
        }
        for (host, target) in targets {
            let state = states.entry(host.clone()).or_default();
            let wait = if state.error.is_some() { RETRY_AFTER_ERROR_MS } else { REFRESH_MS };
            if !state.in_flight && now - state.attempted_at >= wait {
                state.in_flight = true;
                state.attempted_at = now;
                let app_dir = app_dir.to_path_buf();
                std::thread::spawn(move || fetch(&host, &target, &app_dir, window_ms));
            }
        }
    }
    let registries: HashMap<String, Option<HashSet<String>>> = {
        let states = HOSTS.lock().unwrap_or_else(PoisonError::into_inner);
        let states = states.as_ref();
        hosts.iter().map(|host| (host.clone(), states.and_then(|states| states.get(host)?.registry.clone()))).collect()
    };
    let mut all = Vec::new();
    let mut counts = Vec::new();
    for host in &hosts {
        let registry = registries.get(host).cloned().flatten();
        let root = mirror_root(app_dir, host);
        let saved = saved_notifications(&root.join(REMOTE_NOTIFICATIONS_DIR), now, false);
        let mut found = session_scan::list_mirrored_sessions(&root, &saved, window_ms, registry);
        for session in &mut found {
            session.host = Some(SessionHost { name: host.clone(), exe: None, kind: "remote" });
            session.remote_host = Some(host.clone());
        }
        counts.push((host, found.len()));
        all.extend(found);
    }
    if let Some(states) = HOSTS.lock().unwrap_or_else(PoisonError::into_inner).as_mut() {
        for (host, count) in counts {
            if let Some(state) = states.get_mut(host) {
                state.sessions = count;
            }
        }
    }
    all
}

pub(super) fn statuses(app_dir: &Path) -> Vec<RemoteHostStatus> {
    let states = HOSTS.lock().unwrap_or_else(PoisonError::into_inner);
    remote_hosts::read(app_dir)
        .into_iter()
        .map(|host| {
            let state = states.as_ref().and_then(|states| states.get(&host));
            RemoteHostStatus {
                fetched_at: state.and_then(|state| state.fetched_at),
                error: state.and_then(|state| state.error.clone()),
                fetching: state.is_some_and(|state| state.in_flight),
                sessions: state.map_or(0, |state| state.sessions),
                approval_error: state.and_then(|state| state.approval_error.clone()),
                host,
            }
        })
        .collect()
}

/// Lets the next listing fetch every host at once, over new connections (after the hosts were
/// changed, so a computer added in the island may now point elsewhere).
pub(super) fn refresh_soon() {
    CONNECTIONS.lock().unwrap_or_else(PoisonError::into_inner).take();
    if let Some(states) = HOSTS.lock().unwrap_or_else(PoisonError::into_inner).as_mut() {
        for state in states.values_mut() {
            state.attempted_at = 0;
        }
    }
}

fn mirror_root(app_dir: &Path, host: &str) -> PathBuf {
    app_dir.join(MIRROR_DIR).join(host)
}

fn fetch(host: &str, target: &SshTarget, app_dir: &Path, window_ms: i64) {
    let known: HashMap<String, RemoteFile> = {
        let states = HOSTS.lock().unwrap_or_else(PoisonError::into_inner);
        states
            .as_ref()
            .and_then(|states| states.get(host))
            .map(|state| state.files.iter().map(|(path, file)| (path.clone(), file.remote.clone())).collect())
            .unwrap_or_default()
    };
    let open = CONNECTIONS.lock().unwrap_or_else(PoisonError::into_inner).as_mut().and_then(|connections| connections.remove(host));
    // Kept from when the connection opened unless it says otherwise now.
    let reused = open.is_some();
    let mut approval_error = None;
    let result = open.map_or_else(|| open_connection(host, target, app_dir, &mut approval_error), Ok).and_then(|mut connection| {
        let replies = connection.fetch(window_ms / 60_000, &known)?;
        Ok((connection, replies))
    });
    let result = result.map(|(connection, replies)| {
        approval_error = approval_error.take().or_else(|| connection.forward_error());
        CONNECTIONS.lock().unwrap_or_else(PoisonError::into_inner).get_or_insert_with(HashMap::new).insert(host.to_string(), connection);
        apply(&mirror_root(app_dir, host), host, replies)
    });

    let mut states = HOSTS.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some(state) = states.as_mut().and_then(|states| states.get_mut(host)) {
        state.in_flight = false;
        match result {
            Ok((files, registry)) => {
                state.files = files;
                state.registry = registry;
                state.fetched_at = Some(current_unix_millis());
                state.error = None;
                if !reused || approval_error.is_some() {
                    state.approval_error = approval_error;
                }
            }
            Err(error) => state.error = Some(error),
        }
    }
}

/// Opens a connection through the island's ssh config, which forwards the approval endpoint's
/// port back here; when that config cannot be made, or connecting through it fails, through the
/// user's own with no forward, and `approval_error` says why. The island's config is rebuilt from
/// `ssh -G` and can miss what the user's works with (a value with a space, a rewritten
/// ProxyJump), and the sessions must still come.
fn open_connection(host: &str, target: &SshTarget, app_dir: &Path, approval_error: &mut Option<String>) -> Result<Connection, String> {
    let endpoint = crate::agent_approval::endpoint()
        .map(|endpoint| endpoint.port)
        .zip(crate::agent_approval::remote_hook_token(host));
    let Some((port, token)) = endpoint else {
        *approval_error = Some("The approval endpoint is not running".into());
        return Connection::open(target, None, None);
    };
    let island = write_island_config(app_dir, host, target, Some(port))
        .and_then(|config| Connection::open(target, Some(&config), Some(Forward { port, token })));
    match island {
        Ok(connection) => Ok(connection),
        Err(error) => {
            *approval_error = Some(error);
            Connection::open(target, None, None)
        }
    }
}

/// Writes the changed files into the mirror and removes those the host no longer lists; returns
/// what the mirror now holds, and the host's registry of running sessions.
fn apply(root: &Path, host: &str, replies: Vec<Reply>) -> (HashMap<String, MirroredFile>, Option<HashSet<String>>) {
    let mut previous = {
        let mut states = HOSTS.lock().unwrap_or_else(PoisonError::into_inner);
        states
            .as_mut()
            .and_then(|states| states.get_mut(host))
            .map(|state| std::mem::take(&mut state.files))
            .unwrap_or_default()
    };
    let mut files = HashMap::new();
    let mut registry: Option<HashSet<String>> = None;
    for reply in replies {
        match reply {
            Reply::Registry => registry = Some(HashSet::new()),
            Reply::Running(id) => {
                if let Some(registry) = &mut registry {
                    registry.insert(id);
                }
            }
            Reply::Same(path) => {
                if let Some(file) = previous.remove(&path) {
                    files.insert(path, file);
                }
            }
            Reply::Changed { path, file, head, tail } => {
                let Some(target) = mirror_path(root, &path) else { continue };
                let whole = file.size <= TAIL_BYTES;
                let head = if whole {
                    first_lines(&tail)
                } else if head.is_empty() {
                    previous.remove(&path).map(|known| known.head).unwrap_or_default()
                } else {
                    head
                };
                let content = if whole || head.is_empty() { tail } else { [head.as_slice(), b"\n", tail.as_slice()].concat() };
                if write_mirrored(&target, &content, file.mtime).is_ok() {
                    files.insert(path, MirroredFile { remote: file, head });
                }
            }
        }
    }
    // Left the window, or deleted on the host.
    for path in previous.keys() {
        if let Some(target) = mirror_path(root, path) {
            let _ = fs::remove_file(target);
        }
    }
    (files, registry)
}

/// Where a remote path goes in the mirror; `None` for anything but session files and the Codex
/// index, so a reply can never write elsewhere.
fn mirror_path(root: &Path, remote: &str) -> Option<PathBuf> {
    let path = Path::new(remote);
    let plain = path.components().all(|component| matches!(component, Component::Normal(_)));
    let allowed = remote == ".codex/session_index.jsonl"
        || (remote.strip_prefix(REMOTE_NOTIFICATIONS_DIR).and_then(|name| name.strip_prefix('/'))
            .is_some_and(|name| !name.contains('/') && name.ends_with(".json")))
        || ((remote.starts_with(".claude/projects/") || remote.starts_with(".codex/sessions/"))
            && remote.ends_with(".jsonl"));
    (plain && allowed).then(|| root.join(path))
}

/// The head the fetch script would send: the first lines, at most 40.
fn first_lines(bytes: &[u8]) -> Vec<u8> {
    let end = bytes
        .iter()
        .enumerate()
        .filter(|(_, &byte)| byte == b'\n')
        .nth(39)
        .map_or(bytes.len(), |(index, _)| index + 1);
    bytes[..end].to_vec()
}

/// Writes through a temporary file, so a scan never reads half a file, with the remote time.
fn write_mirrored(target: &Path, content: &[u8], mtime: i64) -> Result<(), String> {
    let parent = target.parent().ok_or("No parent folder")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = target.with_extension("jsonl.tmp");
    fs::write(&temporary, content).map_err(|error| error.to_string())?;
    let modified = UNIX_EPOCH + Duration::from_secs(u64::try_from(mtime).unwrap_or(0));
    File::options()
        .write(true)
        .open(&temporary)
        .and_then(|file| file.set_modified(modified))
        .map_err(|error| error.to_string())?;
    fs::rename(&temporary, target).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_session_files_and_the_codex_index_map_into_the_mirror() {
        let root = Path::new("m");
        assert_eq!(mirror_path(root, ".claude/projects/p/a.jsonl"), Some(root.join(".claude/projects/p/a.jsonl")));
        assert!(mirror_path(root, ".codex/sessions/2026/11/06/r.jsonl").is_some());
        assert!(mirror_path(root, ".codex/session_index.jsonl").is_some());
        assert!(mirror_path(root, ".focusd-island/agent-notifications/focusd-agent-12-34.json").is_some());
        assert_eq!(mirror_path(root, ".focusd-island/agent-notifications/x/y.json"), None);
        assert_eq!(mirror_path(root, ".focusd-island/other.json"), None);
        assert_eq!(mirror_path(root, ".claude/projects/../../evil.jsonl"), None);
        assert_eq!(mirror_path(root, "/etc/passwd"), None);
        assert_eq!(mirror_path(root, ".claude/settings.json"), None);
    }

    #[test]
    fn a_head_is_the_first_forty_lines() {
        let text: String = (0..50).map(|i| format!("{i}\n")).collect();
        let head = first_lines(text.as_bytes());
        assert_eq!(head.iter().filter(|&&byte| byte == b'\n').count(), 40);
        assert_eq!(first_lines(b"a\nb"), b"a\nb");
    }

    #[test]
    fn changed_files_are_written_with_the_remote_time_and_dropped_ones_removed() {
        let root = std::env::temp_dir().join(format!("focusd-remote-mirror-{}", std::process::id()));
        let path = ".claude/projects/p/s.jsonl".to_string();
        let changed = Reply::Changed {
            path: path.clone(),
            file: RemoteFile { size: 3, mtime: 1_700_000_000 },
            head: Vec::new(),
            tail: b"{}\n".to_vec(),
        };
        let (files, registry) = apply(&root, "test-host-a", vec![changed, Reply::Registry, Reply::Running("a".into())]);
        assert_eq!(registry, Some(HashSet::from(["a".to_string()])));
        let target = root.join(&path);
        assert_eq!(fs::read(&target).unwrap(), b"{}\n");
        let modified = fs::metadata(&target).unwrap().modified().unwrap();
        assert_eq!(modified, UNIX_EPOCH + Duration::from_secs(1_700_000_000));
        assert_eq!(files[&path].head, b"{}\n");

        // The host keeps the mirror's files while it fetches; put them back as `fetch` would.
        HOSTS.lock().unwrap().get_or_insert_with(HashMap::new).insert(
            "test-host-a".into(),
            HostState { files, ..HostState::default() },
        );
        let (files, registry) = apply(&root, "test-host-a", Vec::new());
        assert!(files.is_empty() && registry.is_none());
        assert!(!target.exists());
        let _ = fs::remove_dir_all(&root);
    }
}
