use std::{collections::HashMap, fs, path::Path};

use serde_json::Value;

use super::local_agent_files::{directory, read_small_text};
use crate::win32::process_times;

const MAX_BYTES: u64 = 16 * 1024;
const MAX_ENTRIES: usize = 256;

fn registry_entry(text: &str) -> Option<(String, u32)> {
    let entry: Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    if entry["kind"] != "interactive" {
        return None;
    }
    let id = entry["sessionId"]
        .as_str()
        .filter(|id| !id.is_empty() && id.len() <= 128)?;
    let pid = u32::try_from(entry["pid"].as_u64()?)
        .ok()
        .filter(|pid| *pid != 0)?;
    Some((id.to_string(), pid))
}

pub(super) fn open_sessions(root: &Path) -> HashMap<String, u32> {
    let Some(sessions) = directory(root, "sessions") else {
        return HashMap::new();
    };
    fs::read_dir(&sessions)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|item| {
            let name = item.file_name().into_string().ok()?;
            let pid: u32 = name.strip_suffix(".json")?.parse().ok()?;
            Some((name, pid))
        })
        .take(MAX_ENTRIES)
        .filter_map(|(name, pid)| {
            let (id, entry_pid) = registry_entry(&read_small_text(&sessions, name, MAX_BYTES)?)?;
            (pid == entry_pid && process_times::start_time(pid).is_some()).then_some((id, pid))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_status::local_agent_files::scratch::tempdir;
    use serde_json::json;

    #[test]
    fn only_interactive_registry_entries_name_open_conversations() {
        assert_eq!(
            registry_entry(r#"{"pid":42,"sessionId":"test","kind":"interactive"}"#),
            Some(("test".to_owned(), 42))
        );
        assert_eq!(
            registry_entry(r#"{"pid":42,"sessionId":"test","kind":"prewarm"}"#),
            None
        );
        assert_eq!(
            registry_entry(r#"{"pid":42,"sessionId":"","kind":"interactive"}"#),
            None
        );
        assert_eq!(registry_entry("not json"), None);
    }

    #[test]
    fn a_registry_filename_must_match_the_running_pid() {
        let root = tempdir();
        assert!(open_sessions(root.path()).is_empty());
        let sessions = root.path().join("sessions");
        fs::create_dir(&sessions).unwrap();
        let pid = std::process::id();
        let record = json!({"pid": pid, "sessionId": "fixture", "kind": "interactive"}).to_string();
        fs::write(sessions.join("unrelated.json"), &record).unwrap();
        fs::write(sessions.join("0.json"), &record).unwrap();
        assert!(open_sessions(root.path()).is_empty());
        fs::write(sessions.join(format!("{pid}.json")), &record).unwrap();
        assert_eq!(open_sessions(root.path()).get("fixture"), Some(&pid));
    }
}
