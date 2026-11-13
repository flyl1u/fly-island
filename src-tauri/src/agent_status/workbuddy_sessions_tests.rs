use super::*;

const SESSION: &str = "00db0691-77f6-4c92-8c63-908c6318c563";

fn lines(records: &[Value]) -> String {
    records.iter().map(|record| format!("{record}\n")).collect()
}

fn user(text: &str, at: i64) -> Value {
    serde_json::json!({ "type": "message", "role": "user", "sessionId": SESSION, "cwd": "C:\\Users\\me\\WorkBuddy\\demo",
        "timestamp": at, "content": [{ "type": "input_text", "text": text }] })
}

fn assistant(text: &str, status: &str) -> Value {
    serde_json::json!({ "type": "message", "role": "assistant", "status": status, "sessionId": SESSION,
        "content": [{ "type": "output_text", "text": text }],
        "providerData": { "requestModelName": "DeepSeek-V4.1-Flash", "model": "deepseek-v4.1-flash", "rawUsage": { "total_tokens": 61137 } } })
}

fn call(id: &str) -> Value {
    serde_json::json!({ "type": "function_call", "name": "Bash", "callId": id, "arguments": "{\"command\":\"ls -la\"}" })
}

fn result(id: &str) -> Value {
    serde_json::json!({ "type": "function_call_result", "name": "Bash", "callId": id, "status": "completed" })
}

#[test]
fn reads_title_model_reply_and_prompt() {
    let parsed = parse(&lines(&[
        serde_json::json!({ "type": "session-meta", "sessionId": SESSION, "meta": {} }),
        user("建一个 test.txt", 1_000),
        serde_json::json!({ "type": "ai-title", "aiTitle": "新建测试文件", "sessionId": SESSION }),
        call("a"),
        result("a"),
        assistant("已经建好了。", "completed"),
    ]));
    assert_eq!(parsed.session_id.as_deref(), Some(SESSION));
    assert_eq!(parsed.title.as_deref(), Some("新建测试文件"));
    assert_eq!(parsed.first_prompt.as_deref(), Some("建一个 test.txt"));
    assert_eq!(parsed.last_prompt_at, Some(1_000));
    assert_eq!(parsed.model.as_deref(), Some("DeepSeek-V4.1-Flash"));
    assert_eq!(parsed.last_message.as_deref(), Some("已经建好了。"));
    assert_eq!(parsed.context_tokens, Some(61137));
    assert_eq!(parsed.cwd.as_deref(), Some("C:\\Users\\me\\WorkBuddy\\demo"));
    assert!(!parsed.working);
    assert_eq!(parsed.tool, None);
}

#[test]
fn a_turn_works_until_a_finished_reply_with_no_open_tool_call() {
    assert!(parse(&lines(&[user("hi", 1)])).working);
    assert!(parse(&lines(&[user("hi", 1), serde_json::json!({ "type": "reasoning" })])).working);
    let running = parse(&lines(&[user("hi", 1), assistant("先看看目录", "completed"), call("a")]));
    assert!(running.working);
    assert_eq!(running.tool.map(|tool| (tool.name, tool.detail)), Some(("Bash".to_string(), Some("ls -la".to_string()))));
    assert!(parse(&lines(&[user("hi", 1), call("a"), result("a")])).working);
    assert!(parse(&lines(&[user("hi", 1), assistant("…", "in_progress")])).working);
    assert!(!parse(&lines(&[user("hi", 1), call("a"), result("a"), assistant("done", "completed")])).working);
}

#[test]
fn skips_damaged_lines_and_keeps_the_newest_title() {
    let text = format!(
        "{}\n{{broken\n{}\n{}\n",
        serde_json::json!({ "type": "ai-title", "aiTitle": "old" }),
        serde_json::json!({ "type": "ai-title", "aiTitle": "new" }),
        assistant("ok", "completed"),
    );
    let parsed = parse(&text);
    assert_eq!(parsed.title.as_deref(), Some("new"));
    assert!(!parsed.working);
}

#[test]
fn phase_follows_the_turn_its_age_and_the_registry() {
    let working = parse(&lines(&[user("hi", 1), call("a")]));
    let now = 100 * 60 * 1000;
    let phase = |parsed: &Parsed, updated_at: i64, closed: bool| summary(parsed.clone(), "file", updated_at, now, closed, None).phase;
    assert_eq!(phase(&working, now - 1_000, false), "running");
    assert_eq!(phase(&working, now - AGENT_RUNNING_STALE_AFTER_MS, false), "stale");
    assert_eq!(phase(&working, now - 1_000, true), "completed");
    let done = parse(&lines(&[user("hi", 1), assistant("done", "completed")]));
    assert_eq!(phase(&done, now - 1_000, false), "completed");
    let row = summary(working, "file", now, now, true, None);
    assert_eq!((row.provider, row.current_tool, row.closed), ("workbuddy", None, true));
    assert_eq!(row.host.map(|host| host.name), Some("WorkBuddy".to_string()));
}

#[test]
fn titles_fall_back_to_the_first_prompt_then_the_folder() {
    let now = 10_000;
    let prompted = summary(parse(&lines(&[user("  整理   周报 ", 1)])), "file", now, now, false, None);
    assert_eq!(prompted.title.as_deref(), Some("整理 周报"));
    let bare = Parsed { cwd: Some("C:\\work\\island\\".to_string()), ..Parsed::default() };
    let row = summary(bare, "file-id", now, now, false, None);
    assert_eq!((row.title.as_deref(), row.session_id.as_str()), (Some("island"), "file-id"));
}

#[test]
fn only_interactive_registry_entries_name_open_conversations() {
    assert_eq!(registry_entry(&format!(r#"{{"pid":42,"sessionId":"{SESSION}","kind":"interactive"}}"#)), Some((SESSION.to_string(), 42)));
    assert_eq!(registry_entry(&format!(r#"{{"pid":42,"sessionId":"{SESSION}","kind":"prewarm"}}"#)), None);
    assert_eq!(registry_entry(r#"{"pid":42,"sessionId":"","kind":"interactive"}"#), None);
    assert_eq!(registry_entry("not json"), None);
}

/// Prints this computer's WorkBuddy sessions without their text: `cargo test -- --ignored local_workbuddy`.
#[test]
#[ignore]
fn local_workbuddy_sessions() {
    let Ok(home) = crate::system::windows_home_dir() else { return };
    let now = super::super::snapshot::current_unix_millis();
    for session in list_sessions(&home, now, 24 * 60 * 60 * 1000) {
        println!(
            "{} phase={} closed={} model={:?} title_chars={} tool={:?}",
            &session.session_id[..8.min(session.session_id.len())],
            session.phase,
            session.closed,
            session.model,
            session.title.as_deref().map_or(0, |title| title.chars().count()),
            session.current_tool.map(|tool| tool.name),
        );
    }
}
