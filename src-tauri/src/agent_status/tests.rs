use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

use serde_json::json;

use super::notifications::WaitingNotifications;
use super::title::*;

fn first_prompt(transcript: &str) -> Option<String> {
    transcript.lines().find_map(user_prompt_in_record)
}

fn line(value: serde_json::Value) -> String {
    format!("{value}\n")
}

fn user_line(content: serde_json::Value) -> String {
    line(json!({"type": "user", "message": {"role": "user", "content": content}}))
}

#[test]
fn first_prompt_skips_system_records_and_command_output() {
    let transcript = [
        line(json!({"type": "user", "isMeta": true, "message": {"content": "<local-command-caveat>x"}})),
        user_line(json!("<command-name>/model</command-name>")),
        user_line(json!("<local-command-stdout>Set model</local-command-stdout>")),
        user_line(json!([{"type": "tool_result", "content": "ok"}])),
        user_line(json!([{"type": "text", "text": "[Image #2] 展开后的最小化"}, {"type": "image"}])),
        user_line(json!("later prompt")),
    ]
    .concat();
    assert_eq!(first_prompt(&transcript).as_deref(), Some("展开后的最小化"));
}

#[test]
fn prompt_titles_drop_wrappers_but_keep_text() {
    assert_eq!(
        prompt_title("  <pasted_content id=\"2373\">\n继续重构 Phase 4\n</pasted_content>")
            .as_deref(),
        Some("继续重构 Phase 4")
    );
    assert_eq!(
        prompt_title("if a < b > c [Image #x]").as_deref(),
        Some("if a < b > c [Image #x]")
    );
    assert_eq!(prompt_title("<tag></tag> [Image #1]"), None);
}

#[test]
fn titles_are_cut_by_characters() {
    let title = display_title(&"标".repeat(TITLE_MAX_CHARS + 5)).unwrap();
    assert_eq!(title.chars().count(), TITLE_MAX_CHARS);
    assert!(title.ends_with('…'));
    assert_eq!(
        display_title(&"😀".repeat(TITLE_MAX_CHARS))
            .unwrap()
            .chars()
            .count(),
        TITLE_MAX_CHARS
    );
    assert_eq!(display_title(" \n\t "), None);
}

#[test]
fn codex_index_and_folder_titles() {
    let index = [
        line(json!({"id": "a", "thread_name": "旧名字"})),
        line(json!({"id": "b", "thread_name": "别的会话"})),
        line(json!({"id": "a", "thread_name": "恢复 Windows 发布机环境"})),
    ]
    .concat();
    assert_eq!(
        codex_thread_name(&index, "a").as_deref(),
        Some("恢复 Windows 发布机环境")
    );
    assert_eq!(codex_thread_name(&index, "missing"), None);

    assert_eq!(
        folder_title(r"E:\Projects\fly-island\").as_deref(),
        Some("fly-island")
    );
    assert_eq!(folder_title("/home/me/repo").as_deref(), Some("repo"));
    assert_eq!(folder_title(r"C:\"), None);
}

/// A fresh directory per test with `home/` and `app/` inside.
fn temp_dirs() -> (PathBuf, PathBuf) {
    static COUNTER: AtomicUsize = AtomicUsize::new(0);
    let base = std::env::temp_dir().join(format!(
        "focusd-title-test-{}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = fs::remove_dir_all(&base);
    let (home, app) = (base.join("home"), base.join("app"));
    fs::create_dir_all(home.join(".claude").join("projects").join("E--p")).unwrap();
    fs::create_dir_all(home.join(".codex")).unwrap();
    fs::create_dir_all(&app).unwrap();
    (home, app)
}

#[test]
fn first_prompt_uses_slash_command_arguments_and_drops_headings() {
    let transcript = [
        user_line(json!("<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args></command-args>")),
        user_line(json!("<command-name>/goal</command-name>\n<command-message>goal</command-message>\n<command-args># 目标：按重构计划完成结构重构</command-args>")),
        user_line(json!("later prompt")),
    ]
    .concat();
    assert_eq!(
        first_prompt(&transcript).as_deref(),
        Some("目标：按重构计划完成结构重构")
    );
    assert_eq!(
        prompt_title("## 任务：继续适配").as_deref(),
        Some("任务：继续适配")
    );
    // A message that is only a screenshot placeholder moves on to the next prompt.
    let image_only = [
        user_line(json!([{"type": "text", "text": "[Image #1]"}])),
        user_line(json!("下一句")),
    ]
    .concat();
    assert_eq!(first_prompt(&image_only).as_deref(), Some("下一句"));
}

#[test]
fn session_windows_are_matched_by_folder_and_title() {
    use super::window_focus::{app_name, best_window, SessionHints, WindowCandidate};

    let window = |title: &str, app: &str| WindowCandidate {
        title: title.to_string(),
        app: app.to_string(),
    };
    let windows = vec![
        window("fly-island settings regression - Google Chrome", "chrome"),
        window("README.md - code - Visual Studio Code", "code"),
        window(
            "message_window.rs - fly-island - Visual Studio Code",
            "code",
        ),
        window("✳ 插件市场功能", "windowsterminal"),
        window("PS E:\\Projects\\MioPicFlow>", "windowsterminal"),
        window("Codex", "codex"),
    ];
    let find = |folder: Option<&str>, title: Option<&str>, is_codex: bool| {
        best_window(
            &windows,
            &SessionHints {
                folder,
                ancestors: &[],
                title,
                is_codex,
            },
        )
    };

    // The terminal showing the session title beats the editor with the folder.
    assert_eq!(
        find(Some("fly-island"), Some("插件市场功能"), false),
        Some(3)
    );
    // A title cut with an ellipsis still matches.
    assert_eq!(find(None, Some("插件市场…"), false), Some(3));
    // Folder only: the editor naming it as a whole segment, not Chrome.
    assert_eq!(find(Some("fly-island"), Some("别的标题"), false), Some(2));
    // A folder called "code" is not every "Visual Studio Code" window: only the segment.
    assert_eq!(find(Some("code"), None, false), Some(1));
    // A terminal showing the working directory.
    assert_eq!(find(Some("MioPicFlow"), None, false), Some(4));
    // Codex sessions fall back to the Codex app; others do not.
    assert_eq!(find(Some("elsewhere"), None, true), Some(5));
    assert_eq!(find(Some("elsewhere"), None, false), None);
    assert_eq!(find(None, Some("x"), false), None);

    assert_eq!(
        app_name(r"C:\Program Files\Microsoft VS Code\Code.exe"),
        "code"
    );
    assert_eq!(app_name(r"C:\x\WindowsTerminal.exe"), "windowsterminal");
}

#[test]
fn claude_session_tail_gives_state_model_and_latest_reply() {
    use super::sessions::{claude_model_label, parse_claude_tail, TurnState};

    let assistant = |stop: Option<&str>, content: serde_json::Value| {
        line(
            json!({"type": "assistant", "sessionId": "s1", "cwd": "E:\\p", "effort": "medium",
            "message": {"model": "group/auto-claude-opus-5-5", "stop_reason": stop, "content": content}}),
        )
    };
    let text = |text: &str| json!([{"type": "text", "text": text}]);
    let tool = json!([{"type": "tool_use", "name": "Bash"}]);

    let working = [
        line(json!({"type": "ai-title", "aiTitle": "设置界面完善思路"})),
        assistant(Some("tool_use"), text("先看一下  现有代码。")),
        assistant(Some("tool_use"), tool.clone()),
    ]
    .concat();
    let parsed = parse_claude_tail(&working);
    assert_eq!(parsed.state, TurnState::Working);
    assert_eq!(parsed.session_id.as_deref(), Some("s1"));
    assert_eq!(parsed.cwd.as_deref(), Some(r"E:\p"));
    assert_eq!(parsed.title.as_deref(), Some("设置界面完善思路"));
    assert_eq!(parsed.model.as_deref(), Some("Opus 5.5"));
    assert_eq!(parsed.effort.as_deref(), Some("medium"));
    assert_eq!(parsed.last_message.as_deref(), Some("先看一下 现有代码。"));

    let done = [working.clone(), assistant(Some("end_turn"), text("做完了"))].concat();
    assert_eq!(parse_claude_tail(&done).state, TurnState::Done);
    assert_eq!(
        parse_claude_tail(&done).last_message.as_deref(),
        Some("做完了")
    );

    let interrupted = [
        working.clone(),
        user_line(json!([{"type": "text", "text": "[Request interrupted by user]"}])),
    ]
    .concat();
    assert_eq!(parse_claude_tail(&interrupted).state, TurnState::Done);
    let new_prompt = [done.clone(), user_line(json!("再改一下"))].concat();
    assert_eq!(parse_claude_tail(&new_prompt).state, TurnState::Working);

    let failed = [
        working,
        line(json!({"type": "assistant", "isApiErrorMessage": true,
            "message": {"model": "<synthetic>", "content": [{"type": "text", "text": "API Error"}]}})),
    ]
    .concat();
    let parsed = parse_claude_tail(&failed);
    assert_eq!(parsed.state, TurnState::Failed);
    // The synthetic error record does not hide the real model.
    assert_eq!(parsed.model.as_deref(), Some("Opus 5.5"));

    assert_eq!(
        claude_model_label("claude-sonnet-5-5-20261001"),
        "Sonnet 5.5"
    );
    assert_eq!(claude_model_label("claude-haiku-5-5"), "Haiku 5.5");
    assert_eq!(claude_model_label("gpt-6-astra"), "gpt-6-astra");
}

#[test]
fn session_tails_give_the_permission_mode_and_running_subagents() {
    use super::sessions::{parse_claude_tail, parse_codex_tail};

    let line = |value: serde_json::Value| value.to_string();
    let prompt = line(json!({ "type": "user", "permissionMode": "bypassPermissions", "message": { "role": "user", "content": "重构设置页" } }));
    let calls = line(json!({ "type": "assistant", "message": { "model": "claude-opus-5-5", "content": [
        { "type": "tool_use", "id": "a1", "name": "Agent", "input": { "description": "查样式" } },
        { "type": "tool_use", "id": "a2", "name": "Task", "input": { "description": "查文案" } },
        { "type": "tool_use", "id": "b1", "name": "Bash", "input": { "command": "ls" } },
    ] } }));
    let one_answered = line(json!({ "type": "user", "message": { "role": "user", "content": [
        { "type": "tool_result", "tool_use_id": "a1", "content": "done" },
        { "type": "tool_result", "tool_use_id": "b1", "content": "ok" },
    ] } }));
    let parsed = parse_claude_tail(&[prompt.clone(), calls.clone(), one_answered.clone()].join("\n"));
    assert_eq!(parsed.permission_mode, Some("bypass"));
    assert_eq!(parsed.subagents, 1);
    // Subagents of an earlier turn do not count once a new prompt is sent.
    let next = line(json!({ "type": "user", "permissionMode": "default", "message": { "role": "user", "content": "继续" } }));
    let parsed = parse_claude_tail(&[prompt, calls, one_answered, next].join("\n"));
    assert_eq!((parsed.permission_mode, parsed.subagents), (Some("default"), 0));
    // A finished turn has no running subagents.
    let done = line(json!({ "type": "assistant", "message": { "model": "claude-opus-5-5", "stop_reason": "end_turn", "content": [
        { "type": "tool_use", "id": "a3", "name": "Agent", "input": {} },
    ] } }));
    assert_eq!(parse_claude_tail(&done).subagents, 0);
    assert_eq!(parse_claude_tail(&done).permission_mode, None);

    let context = |approval: &str, sandbox: &str| {
        line(json!({ "type": "turn_context", "payload": { "model": "gpt-5", "approval_policy": approval, "sandbox_policy": { "type": sandbox } } }))
    };
    assert_eq!(parse_codex_tail(&context("never", "danger-full-access")).permission_mode, Some("bypass"));
    assert_eq!(parse_codex_tail(&context("never", "workspace-write")).permission_mode, Some("auto"));
    assert_eq!(parse_codex_tail(&context("on-request", "workspace-write")).permission_mode, Some("default"));
}

#[test]
fn codex_session_tail_and_meta() {
    use super::sessions::{codex_user_prompt, parse_codex_meta, parse_codex_tail, TurnState};

    let event = |payload: serde_json::Value| line(json!({"type": "event_msg", "payload": payload}));
    let tail = [
        line(json!({"type": "turn_context", "payload": {"model": "gpt-6-astra", "effort": "high", "cwd": "E:\\Projects\\MioPicFlow"}})),
        event(json!({"type": "user_message", "message": "排查网络"})),
        event(json!({"type": "task_started"})),
        event(json!({"type": "agent_message", "message": "关闭系统代理后恢复了。"})),
    ]
    .concat();
    let parsed = parse_codex_tail(&tail);
    assert_eq!(parsed.state, TurnState::Working);
    assert_eq!(parsed.model.as_deref(), Some("gpt-6-astra"));
    assert_eq!(parsed.effort.as_deref(), Some("high"));
    assert_eq!(parsed.cwd.as_deref(), Some(r"E:\Projects\MioPicFlow"));
    assert_eq!(
        parsed.last_message.as_deref(),
        Some("关闭系统代理后恢复了。")
    );

    let done = [
        tail.clone(),
        event(json!({"type": "task_complete", "last_agent_message": "完成", "error": null})),
    ]
    .concat();
    assert_eq!(parse_codex_tail(&done).state, TurnState::Done);
    assert_eq!(
        parse_codex_tail(&done).last_message.as_deref(),
        Some("完成")
    );
    let failed = [
        tail,
        event(
            json!({"type": "task_complete", "last_agent_message": null, "error": {"message": "x"}}),
        ),
    ]
    .concat();
    assert_eq!(parse_codex_tail(&failed).state, TurnState::Failed);

    let meta =
        json!({"type": "session_meta", "payload": {"id": "01a1", "cwd": "E:\\p"}}).to_string();
    assert_eq!(
        parse_codex_meta(&meta),
        Some(("01a1".to_string(), Some(r"E:\p".to_string())))
    );
    assert_eq!(parse_codex_meta("{\"type\":\"turn_context\"}"), None);
    assert_eq!(
        codex_user_prompt(&event(
            json!({"type": "user_message", "message": "# 恢复发布机环境"})
        ))
        .as_deref(),
        Some("恢复发布机环境")
    );
}

#[test]
fn session_phase_turns_stale_after_the_limit() {
    use super::sessions::{session_phase, TurnState};
    assert_eq!(session_phase(TurnState::Working, 1_000, 600_000), "running");
    assert_eq!(session_phase(TurnState::Working, 600_000, 600_000), "stale");
    assert_eq!(session_phase(TurnState::Done, 1, 600_000), "completed");
    assert_eq!(session_phase(TurnState::Unknown, 1, 600_000), "completed");
    assert_eq!(session_phase(TurnState::Failed, 1, 600_000), "failed");
}

#[test]
fn recent_sessions_are_listed_running_first() {
    use super::session_scan::{list_sessions, ACTIVE_WINDOW_MS};

    let (home, _app) = temp_dirs();
    let project = home.join(".claude").join("projects").join("E--p");
    let assistant = |stop: &str, text: &str| {
        line(
            json!({"type": "assistant", "sessionId": "x", "cwd": "E:\\Projects\\fly-island",
            "message": {"model": "claude-opus-5-5", "stop_reason": stop, "content": [{"type": "text", "text": text}]}}),
        )
    };
    fs::write(
        project.join("done.jsonl"),
        [
            user_line(json!("第一句提问")),
            assistant("end_turn", "好了"),
        ]
        .concat()
        .replace("\"x\"", "\"done\""),
    )
    .unwrap();
    fs::write(
        project.join("busy.jsonl"),
        [
            line(json!({"type": "ai-title", "aiTitle": "正在跑的任务"})),
            assistant("tool_use", "跑测试"),
        ]
        .concat()
        .replace("\"x\"", "\"busy\""),
    )
    .unwrap();
    let old = project.join("old.jsonl");
    fs::write(&old, assistant("end_turn", "很久以前")).unwrap();
    let long_ago = std::time::SystemTime::now()
        - std::time::Duration::from_millis(ACTIVE_WINDOW_MS as u64 + 60_000);
    fs::File::options()
        .write(true)
        .open(&old)
        .unwrap()
        .set_modified(long_ago)
        .unwrap();
    // Subagent transcripts are not sessions of their own.
    fs::create_dir_all(project.join("done").join("subagents")).unwrap();
    fs::write(
        project.join("done").join("subagents").join("a.jsonl"),
        assistant("tool_use", "x"),
    )
    .unwrap();

    let day = home
        .join(".codex")
        .join("sessions")
        .join("2026")
        .join("11")
        .join("04");
    fs::create_dir_all(&day).unwrap();
    fs::write(
        day.join("rollout-1.jsonl"),
        [
            line(json!({"type": "session_meta", "payload": {"id": "c1", "cwd": "E:\\Projects\\MioPicFlow"}})),
            line(json!({"type": "event_msg", "payload": {"type": "user_message", "message": "排查网络"}})),
            line(json!({"type": "event_msg", "payload": {"type": "task_complete", "last_agent_message": "完成", "error": null}})),
        ]
        .concat(),
    )
    .unwrap();
    fs::write(
        home.join(".codex").join("session_index.jsonl"),
        line(json!({"id": "c1", "thread_name": "恢复网络"})),
    )
    .unwrap();

    let sessions = list_sessions(&home, None, &WaitingNotifications::new(), super::session_scan::ACTIVE_WINDOW_MS);
    let ids = sessions
        .iter()
        .map(|s| s.session_id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(ids.first(), Some(&"busy"));
    assert_eq!(ids.len(), 3, "{ids:?}");
    let by_id = |id: &str| sessions.iter().find(|s| s.session_id == id).unwrap();
    assert_eq!(by_id("busy").phase, "running");
    assert_eq!(by_id("busy").title.as_deref(), Some("正在跑的任务"));
    assert_eq!(by_id("done").phase, "completed");
    assert_eq!(by_id("done").title.as_deref(), Some("第一句提问"));
    assert_eq!(by_id("c1").provider, "codex");
    assert_eq!(by_id("c1").title.as_deref(), Some("恢复网络"));
    assert_eq!(by_id("c1").cwd.as_deref(), Some(r"E:\Projects\MioPicFlow"));

    // A second call is answered from the cache and gives the same list.
    assert_eq!(list_sessions(&home, None, &WaitingNotifications::new(), super::session_scan::ACTIVE_WINDOW_MS), sessions);
}

#[test]
fn a_session_keeps_the_folder_it_started_in() {
    use super::session_scan::list_sessions;

    let (home, _app) = temp_dirs();
    let project = home
        .join(".claude")
        .join("projects")
        .join("E--Projects-fly-island");
    fs::create_dir_all(&project).unwrap();
    let record = |cwd: &str, value: serde_json::Value| {
        let mut value = value;
        value["sessionId"] = json!("moved");
        value["cwd"] = json!(cwd);
        line(value)
    };
    fs::write(
        project.join("moved.jsonl"),
        [
            record(r"E:\Projects\fly-island", json!({"type": "user", "message": {"content": "开始"}})),
            record(
                r"E:\Projects\fly-island\src-tauri",
                json!({"type": "assistant", "message": {"model": "claude-opus-5-5", "stop_reason": "tool_use", "content": []}}),
            ),
        ]
        .concat(),
    )
    .unwrap();

    let sessions = list_sessions(&home, None, &WaitingNotifications::new(), super::session_scan::ACTIVE_WINDOW_MS);
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].cwd.as_deref(), Some(r"E:\Projects\fly-island"));
}

#[test]
fn hooks_state_matches_what_the_installers_write() {
    use super::claude_hooks::{claude_code_hook_entries, install_claude_code_hook_events};
    use super::codex_hooks::build_codex_hook_block;
    use super::hooks_state::{
        claude_code_hooks_state, codex_hooks_state, script_outdated, HookInstallState,
    };

    let running = Path::new(r"C:\a b\focusd-agent-running.cmd");
    let status = Path::new(r"C:\a b\focusd-agent-status.ps1");

    // Codex: the block written now is current; an older block (from before, with `capture`)
    // or one pointing elsewhere is outdated.
    let current = format!(
        "model = \"x\"\r\n\r\n{}",
        build_codex_hook_block(running, status)
    );
    assert_eq!(
        codex_hooks_state(Some(&current), running, status),
        HookInstallState::Current
    );
    let old = current.replace(" codex\\\"", " codex capture\\\"");
    assert_ne!(old, current);
    assert_eq!(
        codex_hooks_state(Some(&old), running, status),
        HookInstallState::Outdated
    );
    let elsewhere = Path::new(r"D:\FocuSD\scripts\focusd-agent-running.cmd");
    assert_eq!(
        codex_hooks_state(Some(&current), elsewhere, status),
        HookInstallState::Outdated
    );
    assert_eq!(
        codex_hooks_state(Some("model = \"x\""), running, status),
        HookInstallState::NotInstalled
    );
    assert_eq!(
        codex_hooks_state(None, running, status),
        HookInstallState::NotInstalled
    );

    // Claude Code: every installed entry has to be there; without the Notification hook (as
    // installed before waiting states) it is outdated.
    let settings = |skip: Option<&str>| {
        let mut hooks = serde_json::Map::new();
        let entries = claude_code_hook_entries(running, status).into_iter().filter(|(event_name, _)| Some(*event_name) != skip).collect();
        install_claude_code_hook_events(&mut hooks, entries);
        json!({ "model": "opus", "hooks": hooks }).to_string()
    };
    assert_eq!(
        claude_code_hooks_state(Some(&settings(None)), running, status, None),
        HookInstallState::Current
    );
    assert_eq!(
        claude_code_hooks_state(Some(&settings(Some("Notification"))), running, status, None),
        HookInstallState::Outdated
    );
    assert_eq!(
        claude_code_hooks_state(Some(r#"{"hooks":{"Stop":[]}}"#), running, status, None),
        HookInstallState::NotInstalled
    );
    assert_eq!(
        claude_code_hooks_state(Some("not json"), running, status, None),
        HookInstallState::NotInstalled
    );

    // Scripts: compared ignoring line endings; missing only matters while hooks point at it.
    assert!(!script_outdated(Some("a\r\nb\r\n"), "a\nb\n", true));
    assert!(script_outdated(Some("a\nold\n"), "a\nb\n", true));
    assert!(script_outdated(None, "a", true));
    assert!(!script_outdated(None, "a", false));
}

#[test]
fn only_permission_and_input_notifications_mean_waiting() {
    use super::notifications::{is_waiting, waiting_session_id};

    let notification = |kind: &str| {
        json!({"session_id": "s1", "hook_event_name": "Notification", "notification_type": kind,
            "message": "Claude needs your permission to use Bash"})
        .to_string()
    };
    assert_eq!(
        waiting_session_id(&notification("permission_prompt")).as_deref(),
        Some("s1")
    );
    assert_eq!(
        waiting_session_id(&format!(
            "\u{feff}{}\r\n",
            notification("elicitation_dialog")
        ))
        .as_deref(),
        Some("s1")
    );
    // The idle prompt comes after the turn ended; it is not a wait mid-turn.
    assert_eq!(waiting_session_id(&notification("idle_prompt")), None);
    assert_eq!(
        waiting_session_id("{\"notification_type\":\"permission_prompt\"}"),
        None
    );
    assert_eq!(waiting_session_id("not json"), None);

    let waiting = WaitingNotifications::from([("s1".to_string(), 10_000)]);
    // The transcript last changed before the notification, or just after it: still waiting.
    assert!(is_waiting(&waiting, "s1", 9_000));
    assert!(is_waiting(&waiting, "s1", 11_500));
    // The tool ran after the answer, so the transcript moved on.
    assert!(!is_waiting(&waiting, "s1", 13_000));
    assert!(!is_waiting(&waiting, "other", 9_000));
}

#[test]
fn a_session_asking_for_permission_is_listed_as_waiting() {
    use super::session_scan::list_sessions;

    let (home, _app) = temp_dirs();
    let project = home.join(".claude").join("projects").join("E--p");
    let transcript = project.join("ask.jsonl");
    fs::write(
        &transcript,
        [
            user_line(json!("跑一下测试")),
            line(json!({"type": "assistant", "sessionId": "ask", "cwd": "E:\\p",
                "message": {"model": "claude-opus-5-5", "stop_reason": "tool_use", "content": [{"type": "tool_use", "name": "Bash"}]}})),
        ]
        .concat(),
    )
    .unwrap();
    let changed_at = fs::metadata(&transcript)
        .unwrap()
        .modified()
        .unwrap()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    let listed = |waiting: &WaitingNotifications| list_sessions(&home, None, waiting, super::session_scan::ACTIVE_WINDOW_MS)[0].phase;
    assert_eq!(listed(&WaitingNotifications::new()), "running");
    assert_eq!(
        listed(&WaitingNotifications::from([(
            "ask".to_string(),
            changed_at + 500
        )])),
        "waiting"
    );
    // A notification older than the latest transcript change has been answered.
    assert_eq!(
        listed(&WaitingNotifications::from([(
            "ask".to_string(),
            changed_at - 10_000
        )])),
        "running"
    );
}

#[test]
fn a_session_quit_mid_turn_is_no_longer_waiting() {
    use super::session_records::DIR_NAME;
    use super::session_scan::{list_sessions, ACTIVE_WINDOW_MS};
    use super::snapshot::current_unix_millis;

    let (home, app) = temp_dirs();
    let transcript = home.join(".claude").join("projects").join("E--p").join("quit.jsonl");
    fs::write(
        &transcript,
        [
            user_line(json!("接下来要做什么")),
            line(json!({"type": "assistant", "sessionId": "quit", "cwd": "E:\\p",
                "message": {"model": "claude-opus-5-5", "stop_reason": "tool_use", "content": [{"type": "tool_use", "name": "AskUserQuestion"}]}})),
        ]
        .concat(),
    )
    .unwrap();
    let asked = WaitingNotifications::from([("quit".to_string(), current_unix_millis() + 60_000)]);
    let records = app.join(DIR_NAME);
    fs::create_dir_all(&records).unwrap();
    let phase = |record: &str| {
        fs::write(records.join("quit.json"), record).unwrap();
        list_sessions(&home, Some(&app), &asked, ACTIVE_WINDOW_MS)[0].phase
    };

    // Started, its process not found: nothing says it ended.
    assert_eq!(phase(r#"{"provider":"claudeCode","startedAt":1}"#), "waiting");
    // SessionEnd ran: the user quit while the question was open.
    assert_eq!(
        phase(r#"{"provider":"claudeCode","startedAt":1,"endedAt":2,"endReason":"prompt_input_exit"}"#),
        "completed"
    );
    // The recorded process is gone without a SessionEnd (killed, terminal closed).
    assert_eq!(phase(r#"{"provider":"claudeCode","startedAt":1,"pid":4294967292}"#), "completed");
    // Without the records folder nothing changes.
    assert_eq!(list_sessions(&home, None, &asked, ACTIVE_WINDOW_MS)[0].phase, "waiting");
}

#[test]
fn a_first_prompt_behind_a_huge_screenshot_names_the_session() {
    use super::session_scan::list_sessions;

    let (home, _app) = temp_dirs();
    let project = home.join(".claude").join("projects").join("E--p");
    let screenshot = "A".repeat(700 * 1024);
    fs::write(
        project.join("shot.jsonl"),
        [
            line(json!({"type": "permission-mode", "mode": "default"})),
            line(json!({"type": "user", "sessionId": "shot", "cwd": "E:\\p", "message": {"content": [
                {"type": "text", "text": "[Image #1] 终端上的乱码是什么情况"},
                {"type": "image", "source": {"type": "base64", "data": screenshot}}
            ]}})),
            line(json!({"type": "assistant", "sessionId": "shot", "message": {"model": "claude-opus-5-5", "stop_reason": "end_turn", "content": [{"type": "text", "text": "看看"}]}})),
        ]
        .concat(),
    )
    .unwrap();
    let sessions = list_sessions(&home, None, &WaitingNotifications::new(), super::session_scan::ACTIVE_WINDOW_MS);
    assert_eq!(sessions[0].title.as_deref(), Some("终端上的乱码是什么情况"));
}

#[test]
fn install_deletes_the_prompt_copies_older_versions_saved() {
    use super::markers::remove_legacy_hook_inputs;

    let (_home, app) = temp_dirs();
    for name in [
        "agent-codex-hook-input.json",
        "agent-claudeCode-hook-input.json",
        "agent-claudeCode-notification.json",
    ] {
        fs::write(app.join(name), "{}").unwrap();
    }
    remove_legacy_hook_inputs(&app);
    assert!(!app.join("agent-codex-hook-input.json").exists());
    assert!(!app.join("agent-claudeCode-hook-input.json").exists());
    // The notification file is current and stays.
    assert!(app.join("agent-claudeCode-notification.json").exists());
}

#[test]
fn the_session_process_chain_picks_its_nearest_window() {
    use super::window_focus::{window_of_process_chain, SessionHints, WindowCandidate};

    let window = |title: &str, app: &str| WindowCandidate { title: title.to_string(), app: app.to_string() };
    // Orca's single window (pid 10), two VS Code windows (pid 20) and Explorer (pid 1).
    let candidates = [
        window("Orca", "orca"),
        window("main.rs - other - Visual Studio Code", "code"),
        window("lib.rs - fly-island - Visual Studio Code", "code"),
        window("Program Manager", "explorer"),
    ];
    let owners = [10, 20, 20, 1];
    let hints = SessionHints { folder: Some("fly-island"), ancestors: &[], title: Some("Commit 频率约束"), is_codex: false };

    // claude (100) <- pwsh (90) <- Orca terminal host (11, no window) <- Orca (10).
    assert_eq!(window_of_process_chain(&candidates, &owners, &[100, 90, 11, 10, 1], &hints), Some(0));
    // An editor with several windows: the folder picks one.
    assert_eq!(window_of_process_chain(&candidates, &owners, &[100, 90, 20], &hints), Some(2));
    // The chain ends at Explorer: never focus the desktop.
    assert_eq!(window_of_process_chain(&candidates, &owners, &[100, 1], &hints), None);
    // No running process: nothing from the chain.
    assert_eq!(window_of_process_chain(&candidates, &owners, &[], &hints), None);
}

#[test]
fn a_session_registry_entry_names_its_process() {
    use super::session_process::{session_entry, SessionProcess};

    let entry = r#"{"pid":32816,"sessionId":"23e370fd","procStart":"134383392529449190","name":"fly-island-7e"}"#;
    assert_eq!(
        session_entry(entry),
        Some(("23e370fd".to_string(), SessionProcess { pid: 32816, started: Some(134383392529449190) }))
    );
    assert_eq!(
        session_entry(r#"{"pid":5,"sessionId":"s"}"#),
        Some(("s".to_string(), SessionProcess { pid: 5, started: None }))
    );
    assert_eq!(session_entry(r#"{"pid":-1,"sessionId":"s"}"#), None);
    assert_eq!(session_entry(r#"{"pid":5,"sessionId":""}"#), None);
    assert_eq!(session_entry("not json"), None);
}

#[test]
fn the_ancestor_chain_stops_at_reused_ids_and_cycles() {
    use super::session_process::ancestor_chain;
    use std::collections::HashMap;

    let parents = HashMap::from([(100, 90), (90, 11), (11, 10), (10, 1), (1, 0)]);
    let started = |pid: u32| Some(u64::from(pid));
    assert_eq!(ancestor_chain(100, &parents, started), vec![100, 90, 11, 10, 1]);

    // 90's real parent exited and its id now belongs to a newer process.
    let reused = |pid: u32| Some(if pid == 11 { 5_000 } else { u64::from(pid) });
    assert_eq!(ancestor_chain(100, &parents, reused), vec![100, 90]);

    let cycle = HashMap::from([(1, 2), (2, 1)]);
    assert_eq!(ancestor_chain(1, &cycle, |_| None), vec![1, 2]);
}

#[test]
fn an_agent_terminal_is_only_picked_when_it_is_the_only_one_in_its_folder() {
    use super::orca::only_agent_terminal;

    let list = |terminals: serde_json::Value| json!({ "ok": true, "result": { "terminals": terminals } }).to_string();
    let terminal = |handle: &str, agent: &str, path: &str| json!({ "handle": handle, "agentIdentity": agent, "worktreePath": path, "orphaned": false });
    let one = list(json!([
        terminal("term_aa", "claude", "E:/Projects/fly-island"),
        terminal("term_bb", "codex", "E:/Projects/fly-island"),
        terminal("term_cc", "codex", "E:/Projects/Other"),
    ]));
    assert_eq!(only_agent_terminal(&one, "codex", r"E:\Projects\fly-island\").as_deref(), Some("term_bb"));
    assert_eq!(only_agent_terminal(&one, "codex", r"E:\Projects\Missing"), None);
    let two = list(json!([
        terminal("term_bb", "codex", "E:/Projects/fly-island"),
        terminal("term_dd", "codex", "e:/projects/FLY-ISLAND"),
    ]));
    assert_eq!(only_agent_terminal(&two, "codex", r"E:\Projects\fly-island"), None);
    assert_eq!(only_agent_terminal("not json", "codex", "E:"), None);
}

#[test]
fn orca_terminal_records_name_their_session() {
    use super::orca::{cli_path, is_terminal_handle, record_session_id, terminal_handle_for, AGENT_TERMINALS_DIR_NAME};

    assert!(is_terminal_handle("term_9654c145-f81e-4afa-a41a-0d939d819d24"));
    assert!(!is_terminal_handle("term_"));
    assert!(!is_terminal_handle("term_x & calc"));
    assert!(!is_terminal_handle("9654c145"));
    assert_eq!(record_session_id("\u{feff}{\"session_id\":\"s1\",\"source\":\"resume\"}"), Some("s1".to_string()));
    assert_eq!(record_session_id("{\"session_id\":\"\"}"), None);
    assert_eq!(
        cli_path(Path::new(r"C:\Apps\orca\Orca.exe")),
        PathBuf::from(r"C:\Apps\orca\resources\bin\orca.exe")
    );

    let app_dir = std::env::temp_dir().join(format!("focusd-orca-records-{}", std::process::id()));
    let records = app_dir.join(AGENT_TERMINALS_DIR_NAME);
    fs::create_dir_all(&records).unwrap();
    fs::write(records.join("term_aaaa.json"), r#"{"session_id":"s1"}"#).unwrap();
    fs::write(records.join("term_bbbb.json"), r#"{"session_id":"s2"}"#).unwrap();
    // A file whose name is not a handle is never used, whatever it says.
    fs::write(records.join("bad name.json"), r#"{"session_id":"s3"}"#).unwrap();
    assert_eq!(terminal_handle_for(&app_dir, "s2"), Some("term_bbbb".to_string()));
    assert_eq!(terminal_handle_for(&app_dir, "s3"), None);
    assert_eq!(terminal_handle_for(&app_dir, "missing"), None);
    let _ = fs::remove_dir_all(&app_dir);
}

#[test]
fn session_hosts_are_named_from_their_executable_or_codex_origin() {
    use super::session_host::{codex_host, host_for_exe, host_of_chain};
    use std::collections::HashMap;

    let orca = host_for_exe(r"C:\Users\a\AppData\Local\Programs\orca\Orca.exe");
    assert_eq!((orca.name.as_str(), orca.kind), ("Orca", "terminal"));
    assert_eq!(orca.exe.as_deref(), Some(r"C:\Users\a\AppData\Local\Programs\orca\Orca.exe"));
    let code = host_for_exe(r"C:\Apps\Microsoft VS Code\Code.exe");
    assert_eq!((code.name.as_str(), code.kind), ("VS Code", "editor"));
    let unknown = host_for_exe(r"C:\Tools\MyTerm.exe");
    assert_eq!((unknown.name.as_str(), unknown.kind), ("MyTerm", "app"));

    assert_eq!(codex_host("Codex Desktop").name, "Codex");
    assert_eq!(codex_host("codex_cli_rs").kind, "terminal");
    assert_eq!(codex_host("codex_vscode").name, "VS Code");
    assert!(codex_host("Codex Desktop").exe.is_none());

    // claude (100) <- pwsh (90) <- Orca (10) <- Explorer (1).
    let windows = HashMap::from([
        (10, r"C:\orca\Orca.exe".to_string()),
        (1, r"C:\Windows\explorer.exe".to_string()),
    ]);
    assert_eq!(host_of_chain(&[100, 90, 10, 1], &windows).as_deref(), Some(r"C:\orca\Orca.exe"));
    assert_eq!(host_of_chain(&[100, 90, 1], &windows), None);
}

#[test]
fn codex_rollouts_name_where_they_started() {
    use super::sessions::codex_originator;

    let meta = r#"{"type":"session_meta","payload":{"id":"x","originator":"Codex Desktop"}}"#;
    assert_eq!(codex_originator(meta).as_deref(), Some("Codex Desktop"));
    assert_eq!(codex_originator(r#"{"type":"turn_context","payload":{"originator":"x"}}"#), None);
}

#[test]
fn host_icons_are_only_read_from_existing_executables() {
    use super::host_icon::{icon_data_url, is_icon_source};

    let explorer = std::env::var("WINDIR").map(|dir| format!(r"{dir}\explorer.exe")).unwrap_or_default();
    assert!(is_icon_source(&explorer));
    assert!(!is_icon_source(r"relative\app.exe"));
    assert!(!is_icon_source(concat!(env!("CARGO_MANIFEST_DIR"), r"\Cargo.toml")));
    assert!(icon_data_url(&explorer).is_some_and(|url| url.starts_with("data:image/png;base64,")));
}

#[test]
fn timestamps_parse_to_unix_milliseconds() {
    use super::sessions::parse_timestamp_ms;

    assert_eq!(parse_timestamp_ms("1970-01-01T00:00:00Z"), Some(0));
    assert_eq!(parse_timestamp_ms("2026-11-06T07:24:44.123Z"), Some(1_793_949_884_123));
    assert_eq!(parse_timestamp_ms("2026-11-06T15:24:44.123456+08:00"), Some(1_793_949_884_123));
    assert_eq!(parse_timestamp_ms("2000-02-29T00:00:00.5Z"), Some(951_782_400_500));
    assert_eq!(parse_timestamp_ms("2026-13-01T00:00:00Z"), None);
    assert_eq!(parse_timestamp_ms("yesterday"), None);
}

#[test]
fn the_turn_starts_at_the_newest_typed_prompt() {
    use super::sessions::{parse_claude_tail, parse_codex_tail};

    let claude = [
        line(json!({"type": "user", "timestamp": "2026-11-06T07:00:00Z", "message": {"role": "user", "content": "first"}})),
        line(json!({"type": "user", "timestamp": "2026-11-06T07:10:00Z", "message": {"role": "user", "content": "second"}})),
        line(json!({"type": "assistant", "timestamp": "2026-11-06T07:10:05Z", "message": {"role": "assistant", "content": [{"type": "tool_use", "id": "t", "name": "Bash", "input": {}}]}})),
        // Tool results are user records too, but not a new prompt.
        line(json!({"type": "user", "timestamp": "2026-11-06T07:11:00Z", "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t", "content": "ok"}]}})),
    ]
    .concat();
    assert_eq!(parse_claude_tail(&claude).turn_started_at, Some(1_793_948_400_000 + 600_000));

    let codex = [
        line(json!({"type": "event_msg", "timestamp": "2026-11-06T07:00:00Z", "payload": {"type": "user_message", "message": "go"}})),
        line(json!({"type": "event_msg", "timestamp": "2026-11-06T07:05:00Z", "payload": {"type": "agent_message", "message": "done"}})),
    ]
    .concat();
    assert_eq!(parse_codex_tail(&codex).turn_started_at, Some(1_793_948_400_000));
}

#[test]
fn a_working_turn_shows_its_prompt_and_latest_tool() {
    use super::sessions::{parse_claude_tail, parse_codex_tail};

    let tool = |name: &str, input: serde_json::Value| {
        line(json!({"type": "assistant", "message": {"role": "assistant", "content": [{"type": "text", "text": "Next:"}, {"type": "tool_use", "id": "t", "name": name, "input": input}]}}))
    };
    let result = line(json!({"type": "user", "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t", "content": "ok"}]}}));
    let claude = [
        line(json!({"type": "user", "message": {"role": "user", "content": "first prompt"}})),
        tool("Grep", json!({"pattern": "old turn"})),
        line(json!({"type": "assistant", "message": {"role": "assistant", "stop_reason": "end_turn", "content": [{"type": "text", "text": "done"}]}})),
        line(json!({"type": "user", "message": {"role": "user", "content": "<pasted_content id=\"1\">  release  0.5.3 </pasted_content>"}})),
        tool("Bash", json!({"command": "git status\n  && git log -1"})),
        result.clone(),
        tool("mcp__magpie__Edit", json!({"file_path": "E:\\Projects\\fly-island\\src\\App.tsx"})),
        result,
    ]
    .concat();
    let parsed = parse_claude_tail(&claude);
    assert_eq!(parsed.last_prompt.as_deref(), Some("release 0.5.3"));
    let current = parsed.current_tool.expect("a tool in the working turn");
    assert_eq!((current.name.as_str(), current.detail.as_deref()), ("Edit", Some("App.tsx")));

    // Commands collapse to one line; unknown tools have no detail.
    let bash = parse_claude_tail(&[line(json!({"type": "user", "message": {"role": "user", "content": "go"}})), tool("Bash", json!({"command": "git status\n  && git log -1"}))].concat());
    assert_eq!(bash.current_tool.and_then(|tool| tool.detail).as_deref(), Some("git status && git log -1"));
    let other = parse_claude_tail(&[line(json!({"type": "user", "message": {"role": "user", "content": "go"}})), tool("TodoWrite", json!({"todos": []}))].concat());
    assert_eq!(other.current_tool.map(|tool| (tool.name, tool.detail)), Some(("TodoWrite".to_string(), None)));

    // A finished turn keeps its prompt but has no current tool, nor does a turn before any tool.
    let finished = [claude.clone(), line(json!({"type": "assistant", "message": {"role": "assistant", "stop_reason": "end_turn", "content": [{"type": "text", "text": "all done"}]}}))].concat();
    let parsed = parse_claude_tail(&finished);
    assert_eq!((parsed.last_prompt.as_deref(), parsed.current_tool), (Some("release 0.5.3"), None));
    let fresh = [claude, line(json!({"type": "user", "message": {"role": "user", "content": "next one"}}))].concat();
    let parsed = parse_claude_tail(&fresh);
    assert_eq!((parsed.last_prompt.as_deref(), parsed.current_tool), (Some("next one"), None));

    let codex = [
        line(json!({"type": "event_msg", "payload": {"type": "user_message", "message": "fix the build"}})),
        line(json!({"type": "event_msg", "payload": {"type": "task_started"}})),
        line(json!({"type": "response_item", "payload": {"type": "function_call", "name": "shell", "arguments": "{\"command\":[\"bash\",\"-lc\",\"cargo test\"]}"}})),
    ]
    .concat();
    let parsed = parse_codex_tail(&codex);
    assert_eq!(parsed.last_prompt.as_deref(), Some("fix the build"));
    let current = parsed.current_tool.expect("a Codex tool call");
    assert_eq!((current.name.as_str(), current.detail.as_deref()), ("shell", Some("cargo test")));
    let exec = [codex, line(json!({"type": "response_item", "payload": {"type": "function_call", "name": "exec_command", "arguments": "{\"cmd\":\"pnpm build\"}"}}))].concat();
    assert_eq!(parse_codex_tail(&exec).current_tool.and_then(|tool| tool.detail).as_deref(), Some("pnpm build"));
}

#[test]
fn editor_titles_match_through_their_markers_and_parent_folders() {
    use super::window_focus::{bare_segment, best_window, SessionHints, WindowCandidate};

    assert_eq!(bare_segment(" ● main.rs "), "main.rs");
    assert_eq!(bare_segment("fly-island (workspace)"), "fly-island");
    assert_eq!(bare_segment("visual studio code [管理员]"), "visual studio code");

    let window = |title: &str| WindowCandidate { title: title.to_string(), app: "code".to_string() };
    let windows = [
        window("● lib.rs - other - Visual Studio Code"),
        window("● main.rs - fly-island (Workspace) - Visual Studio Code [Administrator]"),
    ];
    let hints = |folder, ancestors| SessionHints { folder: Some(folder), ancestors, title: None, is_codex: false };
    assert_eq!(best_window(&windows, &hints("fly-island", &[])), Some(1));
    // A session in a worktree below the folder the editor has open.
    let above = ["fly-island-lanes".to_string(), "Projects".to_string()];
    let repo = [window("README.md - fly-island-lanes - Visual Studio Code")];
    assert_eq!(best_window(&repo, &hints("3", &above)), Some(0));
    assert_eq!(best_window(&repo, &hints("3", &[])), None);
}

#[test]
fn session_folders_and_remembered_processes() {
    use super::focus::{folder_names, still_running};
    use super::session_memory::SeenSession;

    assert_eq!(
        folder_names(r"E:\Projects\fly-island-lanes\3\"),
        (Some("3".to_string()), vec!["fly-island-lanes".to_string(), "Projects".to_string()])
    );
    assert_eq!(folder_names("E:/"), (None, vec![]));
    let seen = SeenSession { pid: 6528, started: Some(42), host_exe: None, orca_handle: None, seen_at: 0 };
    // /clear keeps the process: same id, same start time.
    assert!(still_running(&seen, Some(42)));
    // The id now belongs to another process, or nothing runs under it.
    assert!(!still_running(&seen, Some(43)));
    assert!(!still_running(&seen, None));
}

#[test]
fn seen_sessions_are_kept_two_days_and_capped() {
    use super::session_memory::{prune, SeenSession};
    use std::collections::HashMap;

    let seen = |at| SeenSession { pid: 1, started: None, host_exe: None, orca_handle: None, seen_at: at };
    let day = 24 * 60 * 60 * 1000;
    let mut sessions = HashMap::from([("old".to_string(), seen(0)), ("new".to_string(), seen(3 * day))]);
    prune(&mut sessions, 3 * day);
    assert!(sessions.contains_key("new") && !sessions.contains_key("old"));
    let mut many: HashMap<String, SeenSession> = (0..300).map(|i| (i.to_string(), seen(i))).collect();
    prune(&mut many, 300);
    assert_eq!(many.len(), 256);
    assert!(many.contains_key("299") && !many.contains_key("0"));
}

#[test]
fn orca_tabs_are_found_by_the_session_title() {
    use super::orca::agent_terminal_titled;

    let list = json!({ "ok": true, "result": { "terminals": [
        { "handle": "term_aa", "agentIdentity": "claude", "title": "✳ 0.3.1 正式版发布", "orphaned": false },
        { "handle": "term_bb", "agentIdentity": "claude", "title": "插件市场功能改版与签名", "orphaned": false },
        { "handle": "term_cc", "agentIdentity": "claude", "title": "Terminal 1", "orphaned": false },
        { "handle": "term_dd", "agentIdentity": "claude", "title": "Terminal 1", "orphaned": false },
        { "handle": "term_ee", "agentIdentity": "codex", "title": "0.3.1 正式版发布", "orphaned": false },
    ] } })
    .to_string();
    assert_eq!(agent_terminal_titled(&list, "claude", "0.3.1 正式版发布").as_deref(), Some("term_aa"));
    assert_eq!(agent_terminal_titled(&list, "codex", "0.3.1 正式版发布").as_deref(), Some("term_ee"));
    // A title the island cut short matches the start of the tab title.
    assert_eq!(agent_terminal_titled(&list, "claude", "插件市场功能…").as_deref(), Some("term_bb"));
    assert_eq!(agent_terminal_titled(&list, "claude", "插件市场功能"), None);
    // Two tabs with the same title: never guess.
    assert_eq!(agent_terminal_titled(&list, "claude", "Terminal 1"), None);
}

#[test]
fn windows_terminal_tabs_are_picked_by_the_session_title() {
    let tabs: Vec<String> = ["PowerShell", "✳ 设置界面完善思路", "⠐ 插件市场功能改版与签名", "Ubuntu", "Ubuntu"]
        .map(String::from)
        .to_vec();
    assert_eq!(only_tab_titled(&tabs, "设置界面完善思路"), Some(1));
    // Claude Code's working spinner in front of the title is ignored, and a cut title matches the start.
    assert_eq!(only_tab_titled(&tabs, "插件市场功能…"), Some(2));
    assert_eq!(only_tab_titled(&tabs, "插件市场功能"), None);
    // Two tabs with the same title, no match, or a title too short to tell: never guess.
    assert_eq!(only_tab_titled(&tabs, "Ubuntu"), None);
    assert_eq!(only_tab_titled(&tabs, "另一个会话"), None);
    assert_eq!(only_tab_titled(&tabs, "✳"), None);
    assert_eq!(only_tab_titled(&[], "设置界面完善思路"), None);
}

#[test]
fn tab_selection_gives_up_on_a_window_that_does_not_exist() {
    use windows::Win32::Foundation::HWND;

    let mut asked = false;
    let selected = crate::win32::uia_tabs::select_tab(HWND(0x7fff_fff0 as *mut _), |_| {
        asked = true;
        Some(0)
    });
    assert!(!selected && !asked);
    assert!(!crate::win32::uia_tabs::select_tab(HWND::default(), |_| Some(0)));
}

#[test]
fn editor_terminals_are_asked_for_through_the_extension_link() {
    use super::editor_terminal::{editor_of_app, extension_installed, focus_link, show_session_terminal, EditorTerminal};

    assert_eq!(editor_of_app("code"), Some(("vscode", ".vscode")));
    assert_eq!(editor_of_app("cursor"), Some(("cursor", ".cursor")));
    assert_eq!(editor_of_app("windowsterminal"), None);
    assert_eq!(
        focus_link("vscode", &[120, 88], Some("✳ 修复 a&b")),
        "vscode://tixxin.focusd-island/focus?pids=120,88&title=%E2%9C%B3%20%E4%BF%AE%E5%A4%8D%20a%26b"
    );
    assert_eq!(focus_link("cursor", &[], None), "cursor://tixxin.focusd-island/focus?pids=");

    let home = std::env::temp_dir().join(format!("focusd-editor-ext-{}", std::process::id()));
    let extensions = home.join(".vscode").join("extensions");
    fs::create_dir_all(extensions.join("tixxin.focusd-island-tools-1.0.0")).unwrap();
    assert!(!extension_installed(&extensions));
    assert_eq!(show_session_terminal(&home, "code", &[1], None), Some(EditorTerminal::NoExtension));
    assert_eq!(show_session_terminal(&home, "windowsterminal", &[1], None), None);
    fs::create_dir_all(extensions.join("tixxin.focusd-island-0.1.0")).unwrap();
    assert!(extension_installed(&extensions));
    // Nothing to identify the terminal by: no link is opened.
    assert_eq!(show_session_terminal(&home, "code", &[], Some("")), Some(EditorTerminal::Failed));
    // Uninstalled but not yet removed by the editor.
    fs::write(extensions.join(".obsolete"), r#"{"tixxin.focusd-island-0.1.0":true}"#).unwrap();
    assert!(!extension_installed(&extensions));
    assert!(!extension_installed(&home.join("missing")));
    fs::remove_dir_all(&home).unwrap();
}

#[test]
fn focus_attempts_log_their_steps_without_titles() {
    use super::focus_log::Attempt;

    let mut attempt = Attempt::new("claudeCode", Some("c7cd0d64-4607-4487"));
    attempt.note("process=remembered(5)");
    attempt.note("tab=process");
    let line = attempt.line("focused");
    assert!(line.contains("claudeCode c7cd0d64 | process=remembered(5), tab=process | focused in"));
    assert!(line.ends_with(" ms\n"));
}


#[test]
fn session_records_name_a_live_process_and_its_tab() {
    use super::session_records::{is_session_id, parse, read, same_start, DIR_NAME};

    assert!(is_session_id("23e370fd-7e26-4a93-abff-e6aa3b791ac1"));
    assert!(!is_session_id("../x") && !is_session_id(""));
    // WMI start times keep microseconds; the kernel's have 100 ns ticks.
    assert!(same_start(Some(134383392529449190), Some(134383392529449197)));
    assert!(!same_start(Some(134383392529449190), Some(134383392529449290)));
    assert!(same_start(None, Some(1)) && !same_start(Some(1), None));

    let me = std::process::id();
    let started = crate::win32::process_times::start_time(me).expect("own start time");
    let record = parse(&format!(
        "\u{feff}{{\"provider\":\"codex\",\"source\":\"clear\",\"pid\":{me},\"pidStarted\":{started},\"orcaHandle\":\"term_ab-12\",\"wtSession\":null,\"endedAt\":5,\"endReason\":\"clear\"}}"
    ))
    .expect("record");
    // Ended by /clear, but the process carries on under the new session id.
    assert_eq!(record.live_pid(), Some(me));
    assert_eq!(record.orca_handle().as_deref(), Some("term_ab-12"));
    let reused = parse(&format!("{{\"pid\":{me},\"pidStarted\":{}}}", started + 1_000_000)).expect("record");
    assert_eq!(reused.live_pid(), None);
    assert_eq!(parse("{\"orcaHandle\":\"x & calc\"}").and_then(|record| record.orca_handle()), None);

    let app_dir = std::env::temp_dir().join(format!("focusd-records-{}", std::process::id()));
    fs::create_dir_all(app_dir.join(DIR_NAME)).unwrap();
    fs::write(app_dir.join(DIR_NAME).join("s-1.json"), "{\"source\":\"startup\"}").unwrap();
    assert_eq!(read(&app_dir, "s-1").and_then(|record| record.source).as_deref(), Some("startup"));
    assert!(read(&app_dir, "..\\s-1").is_none());
    let _ = fs::remove_dir_all(&app_dir);
}

#[test]
fn permission_requests_mark_a_session_waiting() {
    use super::notifications::waiting_session_id;

    let request = json!({ "session_id": "s1", "hook_event_name": "PermissionRequest", "tool_name": "Bash" }).to_string();
    assert_eq!(waiting_session_id(&request).as_deref(), Some("s1"));
    let needs_input = json!({ "session_id": "s2", "hook_event_name": "Notification", "notification_type": "agent_needs_input" }).to_string();
    assert_eq!(waiting_session_id(&needs_input).as_deref(), Some("s2"));
    // An idle prompt comes after the turn ended; the session is not waiting mid-turn.
    let idle = json!({ "session_id": "s3", "hook_event_name": "Notification", "notification_type": "idle_prompt" }).to_string();
    assert_eq!(waiting_session_id(&idle), None);
}

#[test]
fn usage_comes_from_the_claude_hud_snapshot() {
    use super::usage::{expand_path, parse_snapshot, snapshot_path};
    let parse_timestamp = super::sessions::parse_timestamp_ms;

    let snapshot = json!({
        "updated_at": "2026-11-06T12:31:21.390Z",
        "five_hour": { "used_percentage": 27, "resets_at": "2026-11-06T05:20:00-08:00" },
        "seven_day": { "used_percentage": 38.5, "resets_at": null },
        "model_scoped": [{ "display_name": "Fable", "utilization": 0, "resets_at": "2026-11-11T20:00:00-08:00" }, { "display_name": " " }],
        "balance_label": "Ultra 20x"
    })
    .to_string();
    let usage = parse_snapshot(&snapshot).unwrap();
    assert_eq!(usage.updated_at, parse_timestamp("2026-11-06T12:31:21.390Z"));
    let five = usage.five_hour.as_ref().unwrap();
    assert_eq!((five.used, five.resets_at), (27.0, parse_timestamp("2026-11-06T13:20:00Z")));
    assert_eq!(usage.seven_day.as_ref().map(|w| (w.used, w.resets_at)), Some((38.5, None)));
    assert_eq!(usage.models.iter().map(|w| w.name.as_str()).collect::<Vec<_>>(), ["Fable"]);
    assert_eq!(usage.plan.as_deref(), Some("Ultra 20x"));
    // Out-of-range values are clamped; a snapshot without any window is no usage.
    let over = parse_snapshot(&json!({ "five_hour": { "used_percentage": 140 } }).to_string()).unwrap();
    assert_eq!(over.five_hour.map(|w| w.used), Some(100.0));
    assert_eq!(parse_snapshot(&json!({ "five_hour": { "used_percentage": null } }).to_string()), None);
    assert_eq!(parse_snapshot("not json"), None);

    let (home, _) = temp_dirs();
    assert_eq!(expand_path("~/usage.json", &home), Some(home.join("usage.json")));
    assert_eq!(expand_path("relative/usage.json", &home), None);
    assert_eq!(expand_path("${FOCUSD_NO_SUCH_VAR}/usage.json", &home), None);
    let claude = home.join(".claude");
    assert_eq!(snapshot_path(&claude, &home), None);
    let hud = claude.join("plugins").join("claude-hud");
    fs::create_dir_all(&hud).unwrap();
    fs::write(hud.join("config.json"), json!({ "display": { "externalUsageWritePath": "~/hud-usage.json" } }).to_string()).unwrap();
    assert_eq!(snapshot_path(&claude, &home), Some(home.join("hud-usage.json")));
    // A snapshot the HUD reads takes precedence over one it writes.
    let read_path = home.join("gateway-usage.json");
    fs::write(hud.join("config.json"), json!({ "display": { "externalUsagePath": read_path, "externalUsageWritePath": "~/hud-usage.json" } }).to_string()).unwrap();
    assert_eq!(snapshot_path(&claude, &home), Some(read_path));
}

#[test]
fn direct_usage_replaces_an_older_hud_snapshot_and_keeps_its_error() {
    use super::usage::{merge, parse_snapshot, UsageSource};
    use crate::claude_usage::{ClaudeUsage, UsageError, UsageErrorKind, UsageWindow};
    let parse_timestamp = super::sessions::parse_timestamp_ms;
    let hud_at = parse_timestamp("2026-11-06T12:00:00Z").unwrap();
    let hud = || {
        parse_snapshot(&json!({
            "updated_at": "2026-11-06T12:00:00Z",
            "five_hour": { "used_percentage": 27 },
            "model_scoped": [{ "display_name": "Fable", "utilization": 5 }],
            "balance_label": "Ultra 20x"
        }).to_string())
    };
    let api = |at: i64, error: Option<UsageErrorKind>| ClaudeUsage {
        five_hour: Some(UsageWindow { percent: 63.5, resets_at: Some("2026-11-06T15:00:00.123456+00:00".into()) }),
        seven_day: None,
        updated_at: Some(at as u64),
        error: error.map(|kind| UsageError { kind, message: "m".into() }),
    };

    // Off: claude-hud alone, as before.
    assert_eq!(merge(hud(), None), hud());
    assert_eq!(merge(None, None), None);

    let newer = merge(hud(), Some(api(hud_at + 1, None))).unwrap();
    assert_eq!(newer.source, UsageSource::Api);
    assert_eq!(newer.updated_at, Some(hud_at + 1));
    let five = newer.five_hour.as_ref().unwrap();
    assert_eq!((five.used, five.resets_at), (63.5, parse_timestamp("2026-11-06T15:00:00.123Z")));
    assert!(newer.models.is_empty());
    assert_eq!(newer.plan.as_deref(), Some("Ultra 20x"));

    // An older direct answer leaves the snapshot, but its error still shows.
    let older = merge(hud(), Some(api(hud_at - 1, Some(UsageErrorKind::LoginRequired)))).unwrap();
    assert_eq!(older.source, UsageSource::Hud);
    assert_eq!(older.five_hour.map(|w| w.used), Some(27.0));
    assert_eq!(older.error.map(|e| e.kind), Some(UsageErrorKind::LoginRequired));

    // No snapshot and no answer yet: an empty usage that names the failure.
    let failed = merge(None, Some(ClaudeUsage { error: Some(UsageError { kind: UsageErrorKind::NoProxy, message: "m".into() }), ..ClaudeUsage::default() })).unwrap();
    assert_eq!((failed.five_hour, failed.seven_day, failed.source), (None, None, UsageSource::Hud));
    assert_eq!(failed.error.map(|e| e.kind), Some(UsageErrorKind::NoProxy));

    let shape = serde_json::to_value(merge(None, Some(api(7, Some(UsageErrorKind::NoProxy))))).unwrap();
    assert_eq!(shape["source"], "api");
    assert_eq!(shape["error"], json!({ "kind": "noProxy", "message": "m" }));
}
