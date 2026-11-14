//! Tool approvals a DSH session is waiting on. The projection checkpoint has no approval row
//! (approvals are host-side transient state), but the host appends `approval/asked` and
//! `approval/decided` to the session log as they happen. The log is a series of appended
//! Zstandard frames, so each file is read once and afterwards only its newly appended frames;
//! only the approval and turn events are parsed, everything else is skipped unread.

use std::{collections::HashMap, fs, io::{Read, Seek, SeekFrom}, path::{Path, PathBuf}, sync::{Mutex, PoisonError}};

use serde_json::Value;

use super::tool_call::ToolCall;

/// Larger logs are skipped rather than decoded on the polling thread.
const MAX_LOG_BYTES: u64 = 64 * 1024 * 1024;
const MAX_LOGS: usize = 64;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct PendingApproval {
    pub tool: Option<String>,
    pub asked_at: i64,
}

#[derive(Default)]
pub(super) struct LogState {
    /// Compressed bytes consumed, always at a frame boundary.
    consumed: u64,
    /// The end of a line that continues in the next frame.
    partial: Vec<u8>,
    pending: Vec<(String, PendingApproval)>,
}

impl LogState {
    pub(super) fn pending(&self) -> Option<&PendingApproval> {
        self.pending.iter().map(|(_, approval)| approval).max_by_key(|approval| approval.asked_at)
    }

    /// Decodes the complete frames in `bytes` (which start at `self.consumed`); a frame still
    /// being written stays for the next read.
    pub(super) fn feed(&mut self, bytes: &[u8]) {
        let mut offset = 0;
        while offset < bytes.len() {
            let Ok(size) = zstd::zstd_safe::find_frame_compressed_size(&bytes[offset..]) else { break };
            if size == 0 || offset + size > bytes.len() { break; }
            if let Ok(decoded) = zstd::stream::decode_all(&bytes[offset..offset + size]) { self.lines(&decoded); }
            offset += size;
        }
        self.consumed += offset as u64;
    }

    fn lines(&mut self, decoded: &[u8]) {
        let mut text = std::mem::take(&mut self.partial);
        text.extend_from_slice(decoded);
        let mut rest = text.as_slice();
        while let Some(end) = rest.iter().position(|&b| b == b'\n') {
            self.event(&rest[..end]);
            rest = &rest[end + 1..];
        }
        // A tool result can be huge; a never-ending line is not an event we read.
        if rest.len() <= 1024 * 1024 { self.partial = rest.to_vec(); }
    }

    fn event(&mut self, line: &[u8]) {
        const KINDS: [&[u8]; 4] = [b"\"approval/asked\"", b"\"approval/decided\"", b"\"turn/end\"", b"\"turn/start\""];
        if !KINDS.iter().any(|kind| line.windows(kind.len()).any(|w| w == *kind)) { return; }
        let Ok(value) = serde_json::from_slice::<Value>(line) else { return };
        let id = value["data"]["id"].as_str().map(str::to_string);
        match value["type"].as_str() {
            Some("approval/asked") => if let Some(id) = id {
                let tool = value["data"]["toolName"].as_str().filter(|s| !s.is_empty()).map(str::to_string);
                self.pending.retain(|(known, _)| *known != id);
                self.pending.push((id, PendingApproval { tool, asked_at: value["time"].as_i64().unwrap_or_default() }));
            },
            Some("approval/decided") => if let Some(id) = id { self.pending.retain(|(known, _)| *known != id); },
            // A turn that ended (or a new one) leaves nothing to approve, even if the host
            // never wrote the decision, for example after it was stopped.
            Some("turn/end" | "turn/start") => self.pending.clear(),
            _ => {}
        }
    }
}

static LOGS: Mutex<Option<HashMap<PathBuf, LogState>>> = Mutex::new(None);

fn read_from(path: &Path, start: u64, end: u64) -> Option<Vec<u8>> {
    let mut file = fs::File::open(path).ok()?;
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut bytes = Vec::new();
    file.take(end - start).read_to_end(&mut bytes).ok()?;
    Some(bytes)
}

/// The newest approval the session is waiting on, read from its `session.v*.jsonl.zstd` log.
pub(super) fn pending(log: &Path) -> Option<PendingApproval> {
    let len = fs::metadata(log).ok()?.len();
    if len > MAX_LOG_BYTES { return None; }
    let mut cache = LOGS.lock().unwrap_or_else(PoisonError::into_inner);
    let logs = cache.get_or_insert_with(HashMap::new);
    // A log that shrank was rewritten: read it again from the start.
    if logs.get(log).is_some_and(|state| state.consumed > len) { logs.remove(log); }
    if !logs.contains_key(log) && logs.len() >= MAX_LOGS { logs.clear(); }
    let state = logs.entry(log.to_path_buf()).or_default();
    if state.consumed < len {
        let bytes = read_from(log, state.consumed, len)?;
        state.feed(&bytes);
    }
    state.pending().cloned()
}

/// Shown on the island like a Claude Code permission prompt: the tool waiting for approval.
pub(super) fn tool_call(approval: &PendingApproval) -> Option<ToolCall> {
    approval.tool.clone().map(|name| ToolCall { name, detail: None })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(lines: &[&str]) -> Vec<u8> {
        let text: String = lines.iter().map(|line| format!("{line}\n")).collect();
        zstd::stream::encode_all(text.as_bytes(), 3).unwrap()
    }

    const ASKED: &str = r#"{"type":"approval/asked","seq":48,"time":1000,"data":{"id":"a1","toolName":"pwsh","callId":"c1","reason":"x"}}"#;
    const DECIDED: &str = r#"{"type":"approval/decided","seq":49,"time":1100,"data":{"id":"a1","outcome":"allowed-once"}}"#;

    #[test]
    fn waits_until_the_approval_is_decided_across_appended_frames() {
        let mut state = LogState::default();
        let mut log = frame(&[r#"{"type":"turn/start","seq":1}"#, r#"{"type":"tool/call","seq":2,"data":{"id":"approval/asked"}}"#]);
        log.extend(frame(&[ASKED]));
        state.feed(&log);
        assert_eq!(state.pending(), Some(&PendingApproval { tool: Some("pwsh".into()), asked_at: 1000 }));
        assert_eq!(state.consumed, log.len() as u64);
        state.feed(&frame(&[DECIDED]));
        assert_eq!(state.pending(), None);
    }

    #[test]
    fn keeps_an_unfinished_frame_and_a_split_line_for_later() {
        let mut state = LogState::default();
        let whole = frame(&[ASKED]);
        state.feed(&whole[..whole.len() - 3]);
        assert_eq!((state.consumed, state.pending()), (0, None));
        let (head, tail) = ASKED.split_at(30);
        state.feed(&zstd::stream::encode_all(head.as_bytes(), 3).unwrap());
        state.feed(&frame(&[tail]));
        assert_eq!(state.pending().and_then(|p| p.tool.as_deref()), Some("pwsh"));
    }

    #[test]
    fn a_finished_turn_clears_an_undecided_approval() {
        let mut state = LogState::default();
        state.feed(&frame(&[ASKED, r#"{"type":"turn/end","seq":60}"#]));
        assert_eq!(state.pending(), None);
    }
}
