use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

use serde_json::json;

use super::markers::{CLAUDE_CODE_HOOK_INPUT_FILE_NAME, CODEX_HOOK_INPUT_FILE_NAME};
use super::title::*;
use super::title_cache::TitleCache;

fn line(value: serde_json::Value) -> String {
    format!("{value}\n")
}

fn user_line(content: serde_json::Value) -> String {
    line(json!({"type": "user", "message": {"role": "user", "content": content}}))
}

#[test]
fn hook_input_reads_complete_json() {
    let input = parse_hook_input(
        "\u{feff}{\"session_id\":\"s1\",\"transcript_path\":\"C:\\\\t.jsonl\",\"cwd\":\"E:\\\\p\",\"prompt\":\"标题 😀\"}\r\n",
    );
    assert_eq!(input.session_id.as_deref(), Some("s1"));
    assert_eq!(input.transcript_path.as_deref(), Some(r"C:\t.jsonl"));
    assert_eq!(input.cwd.as_deref(), Some(r"E:\p"));
    assert_eq!(input.prompt.as_deref(), Some("标题 😀"));
}

#[test]
fn hook_input_survives_a_cut_off_prompt() {
    // Claude Code's field order: the prompt comes last. (`json!` would sort the keys.)
    let full = format!(
        r#"{{"session_id":"s1","cwd":"E:\\p","prompt":"修复\"bug\" {}"}}"#,
        "长".repeat(50)
    );
    // Cut inside the prompt, right after an escape backslash.
    let cut = &full[..full.find("bug").unwrap() + 4];
    let input = parse_hook_input(cut);
    assert_eq!(input.session_id.as_deref(), Some("s1"));
    assert_eq!(input.cwd.as_deref(), Some(r"E:\p"));
    assert_eq!(input.prompt.as_deref(), Some("修复\"bug"));

    let without_session = parse_hook_input(r#"{"prompt":"x","session_id":"cut-off"#);
    assert_eq!(without_session.session_id, None);
    assert_eq!(without_session.prompt.as_deref(), Some("x"));
}

#[test]
fn newest_ai_title_wins() {
    let transcript = [
        user_line(json!("first")),
        line(json!({"type": "ai-title", "aiTitle": "旧标题"})),
        line(json!({"type": "assistant", "message": {"content": "mentions \"ai-title\""}})),
        line(json!({"type": "ai-title", "aiTitle": "  新标题\n "})),
        "{broken json \"ai-title\"\n".to_string(),
    ]
    .concat();
    assert_eq!(latest_ai_title(&transcript).as_deref(), Some("新标题"));
    assert_eq!(latest_ai_title(&user_line(json!("no title"))), None);
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
    assert_eq!(
        first_user_prompt(&transcript).as_deref(),
        Some("展开后的最小化")
    );
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

#[test]
fn only_paths_inside_the_root_are_read() {
    let root = Path::new(r"C:\Users\me\.claude\projects");
    assert!(is_path_inside(
        Path::new(r"C:\Users\me\.claude\projects\E--p\s.jsonl"),
        root
    ));
    assert!(is_path_inside(
        Path::new(r"c:\users\ME\.Claude\Projects\E--p\s.jsonl"),
        root
    ));
    assert!(!is_path_inside(
        Path::new(r"C:\Users\me\.claude\projects\..\settings.json"),
        root
    ));
    assert!(!is_path_inside(
        Path::new(r"C:\Users\me\.claude\projects-evil\s.jsonl"),
        root
    ));
    assert!(!is_path_inside(Path::new(r"projects\s.jsonl"), root));
    assert!(!is_path_inside(root, root));
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
fn claude_code_title_falls_back_from_ai_title_to_folder() {
    let (home, app) = temp_dirs();
    let mut cache = TitleCache::new();
    assert_eq!(cache.claude_code_title(&app, &home), None);

    let transcript = home
        .join(".claude")
        .join("projects")
        .join("E--p")
        .join("s.jsonl");
    let input_path = app.join(CLAUDE_CODE_HOOK_INPUT_FILE_NAME);
    let write_input = |transcript: &Path| {
        let input = json!({"session_id": "s", "transcript_path": transcript, "cwd": "E:\\Projects\\fly-island", "prompt": "最新的提问"});
        fs::write(&input_path, input.to_string()).unwrap();
    };

    write_input(&transcript);
    assert_eq!(
        cache.claude_code_title(&app, &home).as_deref(),
        Some("最新的提问")
    );

    fs::write(&transcript, user_line(json!("第一句提问"))).unwrap();
    assert_eq!(
        cache.claude_code_title(&app, &home).as_deref(),
        Some("第一句提问")
    );

    let mut content = fs::read_to_string(&transcript).unwrap();
    content.push_str(&line(
        json!({"type": "ai-title", "aiTitle": "设置界面完善思路"}),
    ));
    fs::write(&transcript, content).unwrap();
    assert_eq!(
        cache.claude_code_title(&app, &home).as_deref(),
        Some("设置界面完善思路")
    );

    // A transcript outside ~/.claude/projects is never read.
    let outside = home.join("outside.jsonl");
    fs::write(
        &outside,
        line(json!({"type": "ai-title", "aiTitle": "不该读到"})),
    )
    .unwrap();
    write_input(&outside);
    assert_eq!(
        cache.claude_code_title(&app, &home).as_deref(),
        Some("最新的提问")
    );

    fs::write(&input_path, "not json").unwrap();
    assert_eq!(cache.claude_code_title(&app, &home), None);

    fs::remove_file(&input_path).unwrap();
    assert_eq!(cache.claude_code_title(&app, &home), None);
}

#[test]
fn codex_title_uses_index_then_first_prompt_then_folder() {
    let (home, app) = temp_dirs();
    let mut cache = TitleCache::new();
    let input_path = app.join(CODEX_HOOK_INPUT_FILE_NAME);
    let write_input = |session: &str, prompt: &str| {
        let input =
            json!({"session_id": session, "cwd": "E:\\Projects\\fly-island", "prompt": prompt});
        fs::write(&input_path, input.to_string()).unwrap();
    };

    write_input("t1", "第一句");
    assert_eq!(cache.codex_title(&app, &home).as_deref(), Some("第一句"));
    write_input("t1", "第二句提问");
    assert_eq!(cache.codex_title(&app, &home).as_deref(), Some("第一句"));

    let index = home.join(".codex").join("session_index.jsonl");
    fs::write(
        &index,
        line(json!({"id": "t1", "thread_name": "恢复发布机环境"})),
    )
    .unwrap();
    assert_eq!(
        cache.codex_title(&app, &home).as_deref(),
        Some("恢复发布机环境")
    );

    fs::write(
        &input_path,
        json!({"session_id": "t2", "cwd": "E:\\Projects\\fly-island"}).to_string(),
    )
    .unwrap();
    assert_eq!(
        cache.codex_title(&app, &home).as_deref(),
        Some("fly-island")
    );
}
