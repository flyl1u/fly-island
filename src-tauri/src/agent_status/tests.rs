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

    let sessions = list_sessions(&home, &WaitingNotifications::new());
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
    assert_eq!(list_sessions(&home, &WaitingNotifications::new()), sessions);
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

    let sessions = list_sessions(&home, &WaitingNotifications::new());
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].cwd.as_deref(), Some(r"E:\Projects\fly-island"));
}

#[test]
fn hooks_state_matches_what_the_installers_write() {
    use super::claude_hooks::{claude_code_hook_entries, install_claude_code_hook_event};
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
        for (event_name, entry) in claude_code_hook_entries(running, status) {
            if Some(event_name) != skip {
                install_claude_code_hook_event(&mut hooks, event_name, entry);
            }
        }
        json!({ "model": "opus", "hooks": hooks }).to_string()
    };
    assert_eq!(
        claude_code_hooks_state(Some(&settings(None)), running, status),
        HookInstallState::Current
    );
    assert_eq!(
        claude_code_hooks_state(Some(&settings(Some("Notification"))), running, status),
        HookInstallState::Outdated
    );
    assert_eq!(
        claude_code_hooks_state(Some(r#"{"hooks":{"Stop":[]}}"#), running, status),
        HookInstallState::NotInstalled
    );
    assert_eq!(
        claude_code_hooks_state(Some("not json"), running, status),
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

    let listed = |waiting: &WaitingNotifications| list_sessions(&home, waiting)[0].phase;
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
    let sessions = list_sessions(&home, &WaitingNotifications::new());
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
    let hints = SessionHints { folder: Some("fly-island"), title: Some("Commit 频率约束"), is_codex: false };

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
    use super::session_process::{session_process_from_entry, SessionProcess};

    let entry = r#"{"pid":32816,"sessionId":"23e370fd","procStart":"134383392529449190","name":"fly-island-7e"}"#;
    assert_eq!(
        session_process_from_entry(entry, "23e370fd"),
        Some(SessionProcess { pid: 32816, started: Some(134383392529449190) })
    );
    assert_eq!(session_process_from_entry(entry, "other"), None);
    assert_eq!(
        session_process_from_entry(r#"{"pid":5,"sessionId":"s"}"#, "s"),
        Some(SessionProcess { pid: 5, started: None })
    );
    assert_eq!(session_process_from_entry(r#"{"pid":-1,"sessionId":"s"}"#, "s"), None);
    assert_eq!(session_process_from_entry("not json", "s"), None);
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
