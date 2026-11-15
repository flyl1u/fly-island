//! Incremental lifecycle reads: a long context/reasoning item can push the turn's start out of
//! the display tail. Keep its boundaries independently of tools and of the hooks being trusted.

use std::{fs::File, io::{self, BufRead, BufReader, Seek, SeekFrom}, path::Path};

use serde_json::Value;

use super::sessions::{codex_user_prompt, parse_timestamp_ms, SessionTail, TurnState};

#[derive(Clone, Default)]
pub(super) struct CodexActivity {
    offset: u64,
    pub(super) state: TurnState,
    started_at: Option<i64>,
    owner_at: Option<i64>,
    completed_at: Option<i64>,
    pub(super) first_prompt: Option<String>,
    prompt: Option<String>,
}

#[cfg(test)]
#[path = "codex_activity_tests.rs"]
mod tests;

impl CodexActivity {
    /// Only commit newline-terminated records: the writer may be midway through the last one.
    /// A replaced/truncated file starts a fresh lifecycle rather than inheriting an old turn.
    pub(super) fn refresh(&mut self, path: &Path) -> io::Result<()> {
        let mut file = File::open(path)?;
        let len = file.metadata()?.len();
        if len < self.offset {
            *self = Self::default();
        } else if len == self.offset {
            return Ok(());
        }
        file.seek(SeekFrom::Start(self.offset))?;
        let mut reader = BufReader::new(file);
        let mut bytes = Vec::new();
        loop {
            bytes.clear();
            if reader.read_until(b'\n', &mut bytes)? == 0 || bytes.last() != Some(&b'\n') {
                break;
            }
            self.offset += bytes.len() as u64;
            let line = String::from_utf8_lossy(&bytes);
            self.record(&line);
        }
        Ok(())
    }

    fn record(&mut self, line: &str) {
        let Ok(record) = serde_json::from_str::<Value>(line) else { return };
        let payload = &record["payload"];
        let time = record["timestamp"].as_str().and_then(parse_timestamp_ms);
        if let Some(prompt) = codex_user_prompt(line) {
            self.first_prompt.get_or_insert_with(|| prompt.clone());
            self.prompt = Some(prompt);
        }
        let user = (record["type"] == "event_msg" && payload["type"] == "user_message")
            || (record["type"] == "response_item" && payload["type"] == "message" && payload["role"] == "user");
        if user {
            self.owner_at = time;
            self.started_at = time;
            self.state = TurnState::Working;
        } else if record["type"] == "event_msg" {
            match payload["type"].as_str() {
                Some("task_started") => {
                    self.started_at = time;
                    self.state = TurnState::Working;
                }
                Some("task_complete") => {
                    self.completed_at = time;
                    self.state = if payload["error"].is_null() { TurnState::Done } else { TurnState::Failed };
                }
                Some("turn_aborted") => self.state = TurnState::Done,
                _ => {}
            }
        }
    }

    pub(super) fn apply(&self, tail: &mut SessionTail) {
        tail.state = self.state;
        tail.turn_started_at = self.started_at;
        tail.owner_prompt_at = self.owner_at;
        tail.last_completed_at = self.completed_at;
        tail.last_prompt = self.prompt.clone();
        if !matches!(self.state, TurnState::Working | TurnState::AwaitingUser) {
            tail.current_tool = None;
        }
    }
}
