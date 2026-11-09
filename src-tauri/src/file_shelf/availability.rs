//! Whether shelf paths still exist, without hanging on a network share or drive that
//! stopped answering: each volume is probed on its own thread with a short deadline.

use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::{mpsc, Mutex, PoisonError},
    thread,
    time::{Duration, Instant},
};

/// How long one check waits for every volume to answer.
const PROBE_DEADLINE: Duration = Duration::from_millis(300);
/// A volume that missed the deadline is not probed again for this long.
const SLOW_VOLUME_BACKOFF: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Presence {
    Present,
    /// The volume answered and the path is gone (moved, renamed or deleted).
    Missing,
    /// The volume did not answer in time or is gone (a disconnected share, an
    /// unplugged drive); whether the file still exists is unknown.
    Unreachable,
}

/// The volume a Windows path lives on, lower-cased: `c:\` or `\\server\share\`.
/// `None` for paths that are neither.
pub(super) fn volume_root(path: &str) -> Option<String> {
    let path = path.replace('/', "\\").to_lowercase();
    if let Some(rest) = path.strip_prefix(r"\\") {
        let mut parts = rest.split('\\').filter(|part| !part.is_empty());
        let (server, share) = (parts.next()?, parts.next()?);
        return Some(format!(r"\\{server}\{share}\"));
    }
    let bytes = path.as_bytes();
    (bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':')
        .then(|| format!(r"{}\", &path[..2]))
}

#[derive(Default)]
pub(super) struct Availability {
    slow_until: Mutex<HashMap<String, Instant>>,
}

impl Availability {
    /// Presence of each of `paths`. Volumes are probed in parallel; one that is slow or
    /// gone makes its paths `Unreachable` instead of holding up the others.
    pub(super) fn check(&self, paths: &[String]) -> HashMap<String, Presence> {
        let roots: HashSet<String> = paths.iter().filter_map(|path| volume_root(path)).collect();
        let reachable = self.reachable_roots(roots);
        paths
            .iter()
            .map(|path| {
                let presence = match volume_root(path) {
                    Some(root) if !reachable.contains(&root) => Presence::Unreachable,
                    _ if Path::new(path).exists() => Presence::Present,
                    _ => Presence::Missing,
                };
                (path.clone(), presence)
            })
            .collect()
    }

    fn reachable_roots(&self, roots: HashSet<String>) -> HashSet<String> {
        let now = Instant::now();
        let mut slow_until = self.slow_until.lock().unwrap_or_else(PoisonError::into_inner);
        slow_until.retain(|_, until| *until > now);

        let (sender, receiver) = mpsc::channel();
        let mut pending: HashSet<String> = HashSet::new();
        for root in roots.into_iter().filter(|root| !slow_until.contains_key(root)) {
            let sender = sender.clone();
            pending.insert(root.clone());
            // A probe stuck on a dead share finishes on its own later; nothing waits on it.
            thread::spawn(move || {
                let exists = Path::new(&root).exists();
                let _ = sender.send((root, exists));
            });
        }
        drop(sender);

        let deadline = now + PROBE_DEADLINE;
        let mut reachable = HashSet::new();
        while !pending.is_empty() {
            let Some(left) = deadline.checked_duration_since(Instant::now()) else {
                break;
            };
            match receiver.recv_timeout(left) {
                Ok((root, exists)) => {
                    pending.remove(&root);
                    if exists {
                        reachable.insert(root);
                    }
                }
                Err(_) => break,
            }
        }
        for root in pending {
            slow_until.insert(root, now + SLOW_VOLUME_BACKOFF);
        }
        reachable
    }
}
