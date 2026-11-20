use std::{fs::{self, OpenOptions}, io::Write, path::PathBuf, sync::atomic::{AtomicUsize, Ordering}, time::{Duration, SystemTime}};

use serde_json::json;

use super::CodexActivity;
use super::super::{notifications::WaitingNotifications, session_scan::{list_sessions, ACTIVE_WINDOW_MS}, sessions::{parse_codex_meta, parse_codex_tail, parse_timestamp_ms, SessionTail, TurnState}};

const THINKING: &str = include_str!("fixtures/codex-desktop-thinking.jsonl");
const ID: &str = "00000000-0000-7000-8000-000000000001";
static NEXT: AtomicUsize = AtomicUsize::new(0);

struct Home(PathBuf);
impl Home {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("fly-island-codex-activity-{}-{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
        fs::create_dir_all(&root).unwrap();
        Self(root)
    }
    fn rollout(&self) -> PathBuf {
        let day = self.0.join(".codex/sessions/2026/10/01");
        fs::create_dir_all(&day).unwrap();
        day.join(format!("rollout-old-{ID}.jsonl"))
    }
}
impl Drop for Home {
    fn drop(&mut self) { fs::remove_dir_all(&self.0).unwrap(); }
}
fn append(path: &std::path::Path, text: &str) {
    OpenOptions::new().append(true).open(path).unwrap().write_all(text.as_bytes()).unwrap();
}
fn listed(home: &Home) -> super::super::sessions::AgentSessionSummary {
    let sessions = list_sessions(&home.0, None, &WaitingNotifications::new(), ACTIVE_WINDOW_MS);
    assert_eq!(sessions.len(), 1);
    sessions[0].clone()
}

#[test]
fn real_desktop_thinking_turn_needs_no_tools_or_user_message_event() {
    let lines: Vec<_> = THINKING.lines().collect();
    assert_eq!(parse_codex_meta(lines[0]).unwrap().0, ID);
    for end in 2..lines.len() {
        let parsed = parse_codex_tail(&lines[..end].join("\n"));
        let finished = lines[..end].iter().any(|line| line.contains("\"task_complete\""));
        assert_eq!(parsed.state, if finished { TurnState::Done } else { TurnState::Working });
        if end >= 4 { assert!(parsed.owner_prompt_at.is_some()); }
        assert!(parsed.current_tool.is_none());
    }
    let parsed = parse_codex_tail(THINKING);
    assert_eq!(parsed.context_tokens, Some(213_419));
    assert_eq!(parsed.last_completed_at, parse_timestamp_ms("2026-11-11T04:43:05.333Z"));
    assert_eq!(parsed.last_prompt.as_deref(), Some("[redacted]"));
}

#[test]
fn old_date_long_tail_cold_and_incremental_scans_keep_the_lifecycle() {
    let home = Home::new();
    let path = home.rollout();
    // Newer date directories must not exclude a still-active thread in its creation directory.
    for day in ["2026/11/14", "2026/11/15", "2026/11/16"] {
        fs::create_dir_all(home.0.join(".codex/sessions").join(day)).unwrap();
    }
    let start = THINKING.lines().take(4).collect::<Vec<_>>().join("\n") + "\n";
    fs::write(&path, start).unwrap();
    let huge = json!({"type":"response_item", "payload":{"type":"reasoning", "encrypted_content":"x".repeat(300_000)}});
    append(&path, &format!("{huge}\n"));
    // Cold start: the start and user input are already outside the 256 KiB display tail.
    let first = listed(&home);
    assert_eq!(first.phase, "running");
    assert!(first.owner_prompt_at.is_some());
    assert_eq!(first.title.as_deref(), Some("[redacted]"));
    let quiet = SystemTime::now() - Duration::from_secs(11 * 60);
    fs::File::options().write(true).open(&path).unwrap().set_modified(quiet).unwrap();
    assert_eq!(listed(&home).phase, "running", "no heartbeat guarantee during reasoning");
    append(&path, "{\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\"}}\n");
    assert!(listed(&home).updated_at > first.updated_at - 1);
    let completion = THINKING.lines().find(|line| line.contains("\"task_complete\"")).unwrap();
    append(&path, &format!("{completion}\n"));
    let done = listed(&home);
    assert_eq!(done.phase, "completed");
    assert!(done.last_completed_at.is_some());
    // Metadata after completion must not manufacture a new finish.
    append(&path, "{\"type\":\"turn_context\",\"payload\":{}}\n");
    assert_eq!(listed(&home).last_completed_at, done.last_completed_at);
}

#[test]
fn partial_records_abort_and_truncation_do_not_inherit_a_finish() {
    let home = Home::new();
    let path = home.rollout();
    fs::write(&path, THINKING).unwrap();
    let mut activity = CodexActivity::default();
    activity.refresh(&path).unwrap();
    assert_eq!(activity.state, TurnState::Done);
    append(&path, "{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_started\"}");
    activity.refresh(&path).unwrap();
    assert_eq!(activity.state, TurnState::Done);
    append(&path, "}\n");
    activity.refresh(&path).unwrap();
    assert_eq!(activity.state, TurnState::Working);
    append(&path, "{\"type\":\"event_msg\",\"payload\":{\"type\":\"turn_aborted\"}}\n");
    activity.refresh(&path).unwrap();
    assert_eq!(activity.state, TurnState::Done);
    fs::write(&path, "{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_started\"}}\n").unwrap();
    activity.refresh(&path).unwrap();
    let mut tail = SessionTail::default();
    activity.apply(&mut tail);
    assert_eq!(tail.state, TurnState::Working);
    assert_eq!(tail.last_completed_at, None);
}

#[test]
fn equal_length_replacement_resets_lifecycle() {
    let home = Home::new(); let path = home.rollout();
    let event = |kind| format!("{}\n", json!({"type":"event_msg","payload":{"type":kind}}));
    fs::write(&path, event("task_complete")).unwrap();
    let mut activity = CodexActivity::default(); activity.refresh(&path).unwrap();
    assert_eq!(activity.state, TurnState::Done);
    let replacement = event("task_started");
    fs::write(&path, replacement.trim_end().to_owned() + " \n").unwrap();
    activity.refresh(&path).unwrap();
    assert_eq!(activity.state, TurnState::Working);
    assert_eq!(activity.completed_at, None);
}

#[test]
fn oversized_records_are_bounded_and_do_not_hide_later_completion() {
    let home = Home::new(); let path = home.rollout();
    fs::write(&path, THINKING.lines().take(4).collect::<Vec<_>>().join("\n") + "\n").unwrap();
    let mut activity = CodexActivity::default(); activity.refresh(&path).unwrap();
    append(&path, &"x".repeat(5 * 1024 * 1024));
    let offset = activity.offset; activity.refresh(&path).unwrap();
    assert_eq!(activity.offset, offset, "partial huge records remain uncommitted");
    append(&path, "\n");
    let completion = THINKING.lines().find(|s| s.contains("\"task_complete\"")).unwrap();
    append(&path, &format!("{completion}\n")); activity.refresh(&path).unwrap();
    assert_eq!(activity.state, TurnState::Done);
    assert_eq!(activity.offset, fs::metadata(&path).unwrap().len());
    assert!(activity.checkpoint.len() <= 256);
}

#[test]
fn codex_working_turn_becomes_stale_after_thirty_minutes() {
    let home = Home::new(); let path = home.rollout();
    fs::write(&path, THINKING.lines().take(4).collect::<Vec<_>>().join("\n") + "\n").unwrap();
    assert_eq!(listed(&home).phase, "running");
    let quiet = SystemTime::now() - Duration::from_secs(31 * 60);
    fs::File::options().write(true).open(&path).unwrap().set_modified(quiet).unwrap();
    assert_eq!(listed(&home).phase, "stale");
}

#[test]
fn desktop_source_is_kept_and_background_sources_are_filtered() {
    for source in [json!("vscode"), json!("app"), json!({"custom":"desktop"})] {
        let meta = json!({"type":"session_meta","payload":{"id":ID,"originator":"Codex Desktop","source":source}});
        assert!(parse_codex_meta(&format!("\u{feff}{meta}")).is_some());
    }
    for source in [json!("internal"), json!("subagent"), json!({"subagent":{}}), json!({"internal":"guardian"})] {
        let meta = json!({"type":"session_meta","payload":{"id":ID,"source":source}});
        assert!(parse_codex_meta(&meta.to_string()).is_none());
    }
}

#[test]
fn fallback_links_use_the_rollout_id_and_only_unambiguous_installed_hosts() {
    use super::super::conversation_link::codex_fallback_link;
    let home = Home::new();
    let path = home.rollout();
    fs::write(&path, THINKING).unwrap();
    // More than 14 newer directories must not hide an old resumed thread when clicking it.
    for day in 1..=20 { fs::create_dir_all(home.0.join(format!(".codex/sessions/2026/11/{day:02}"))).unwrap(); }
    assert_eq!(codex_fallback_link(&home.0, ID), Some(format!("codex://threads/{ID}")));
    assert_eq!(codex_fallback_link(&home.0, "../bad"), None);
    fs::write(&path, format!("{}\n", json!({"type":"session_meta","payload":{"id":ID,"originator":"codex_vscode"}}))).unwrap();
    assert_eq!(codex_fallback_link(&home.0, ID), None);
    fs::create_dir_all(home.0.join(".vscode/extensions/openai.chatgpt-1.0.0")).unwrap();
    assert_eq!(codex_fallback_link(&home.0, ID), Some(format!("vscode://openai.chatgpt/local/{ID}")));
    fs::create_dir_all(home.0.join(".cursor/extensions/openai.chatgpt-1.0.0")).unwrap();
    assert_eq!(codex_fallback_link(&home.0, ID), None);
}

#[test]
#[ignore = "只读本机真实 rollout，手动运行并记录冷/热扫描时间"]
fn live_rollout_scan() {
    let home = crate::system::windows_home_dir().unwrap();
    for label in ["cold", "warm"] {
        let start = std::time::Instant::now();
        let sessions = list_sessions(&home, None, &WaitingNotifications::new(), ACTIVE_WINDOW_MS);
        let codex: Vec<_> = sessions.iter().filter(|session| session.provider == "codex").collect();
        println!("{label}: {:?}, listed={}, codex={}, running={}, owned={}", start.elapsed(), sessions.len(), codex.len(), codex.iter().filter(|s| s.phase == "running").count(), codex.iter().filter(|s| s.owner_prompt_at.is_some()).count());
        let now = super::super::snapshot::current_unix_millis();
        assert!(codex.iter().filter(|s| now - s.updated_at < 30 * 60 * 1000).all(|s| s.phase != "stale"));
    }
}
