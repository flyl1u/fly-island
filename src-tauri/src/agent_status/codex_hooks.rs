//! Managed hook block in the Codex `config.toml`.

use std::{fs, path::Path};

use super::{
    claude_hooks::APPROVAL_HOOK_TIMEOUT_SECONDS, write_text_file, AGENT_APPROVAL_SCRIPT_FILE_NAME,
    AGENT_RUNNING_NOTIFICATION_ARG, AGENT_SESSION_SCRIPT_FILE_NAME, FOCUSD_AGENT_HOOK_SIGNATURE,
};

pub(super) const FOCUSD_AGENT_HOOK_BLOCK_BEGIN: &str = "# BEGIN FocuSD Agent Status Hooks";
pub(super) const FOCUSD_AGENT_HOOK_BLOCK_END: &str = "# END FocuSD Agent Status Hooks";

pub(super) fn install_codex_status_hooks(
    config_path: &Path,
    running_script_path: &Path,
    status_script_path: &Path,
) -> Result<(), String> {
    let content = fs::read_to_string(config_path).unwrap_or_default();
    let content = remove_managed_codex_hook_block(&content);
    let block = build_codex_hook_block(running_script_path, status_script_path);
    let mut next_content = content.trim_end().to_string();
    if !next_content.is_empty() {
        next_content.push_str("\n\n");
    }
    next_content.push_str(&block);

    write_text_file(config_path, &next_content)
}

pub(super) fn build_codex_hook_block(
    running_script_path: &Path,
    status_script_path: &Path,
) -> String {
    let submit_command = agent_running_command(running_script_path, "codex");
    let stop_command = agent_status_command(status_script_path, "codex", "completed");
    // Codex hooks cannot run in the background yet, so the start record delays the first turn by
    // about a second, once per session.
    let session_script_path = status_script_path.with_file_name(AGENT_SESSION_SCRIPT_FILE_NAME);
    let session_start_command = agent_status_command(&session_script_path, "codex", "start");
    let session_end_command = agent_status_command(&session_script_path, "codex", "end");
    // Makes no decision, so Codex goes on to its normal approval prompt.
    let permission_command = agent_running_command_with(running_script_path, "codex", AGENT_RUNNING_NOTIFICATION_ARG);
    // Holds the request for the island's card (roadmap B6 2.2): Codex has no HTTP hooks, so a
    // script forwards it. It reads the endpoint's address itself and answers nothing (back to the
    // terminal prompt) while the island is closed or approving there is off.
    let approval_script_path = status_script_path.with_file_name(AGENT_APPROVAL_SCRIPT_FILE_NAME);
    let approval_command = agent_status_command(&approval_script_path, "codex", "permission");

    format!(
        r#"{begin}

[[hooks.UserPromptSubmit]]
[[hooks.UserPromptSubmit.hooks]]
type = "command"
command = {submit_command}
command_windows = {submit_command}
timeout = 1
statusMessage = "Updating FocuSD agent status"

[[hooks.Stop]]
[[hooks.Stop.hooks]]
type = "command"
command = {stop_command}
command_windows = {stop_command}
timeout = 5
statusMessage = "Updating FocuSD agent status"

[[hooks.SessionStart]]
[[hooks.SessionStart.hooks]]
type = "command"
command = {session_start_command}
command_windows = {session_start_command}
timeout = 15

[[hooks.SessionEnd]]
[[hooks.SessionEnd.hooks]]
type = "command"
command = {session_end_command}
command_windows = {session_end_command}
timeout = 5

[[hooks.PermissionRequest]]
[[hooks.PermissionRequest.hooks]]
type = "command"
command = {permission_command}
command_windows = {permission_command}
timeout = 2

[[hooks.PermissionRequest.hooks]]
type = "command"
command = {approval_command}
command_windows = {approval_command}
timeout = {approval_timeout}

{end}"#,
        begin = FOCUSD_AGENT_HOOK_BLOCK_BEGIN,
        end = FOCUSD_AGENT_HOOK_BLOCK_END,
        submit_command = toml_basic_string(&submit_command),
        stop_command = toml_basic_string(&stop_command),
        session_start_command = toml_basic_string(&session_start_command),
        session_end_command = toml_basic_string(&session_end_command),
        permission_command = toml_basic_string(&permission_command),
        approval_command = toml_basic_string(&approval_command),
        approval_timeout = APPROVAL_HOOK_TIMEOUT_SECONDS,
    )
}

pub(super) fn remove_managed_codex_hook_block(content: &str) -> String {
    let mut remaining = content;
    let mut next_content = String::new();

    while let Some(start) = remaining.find(FOCUSD_AGENT_HOOK_BLOCK_BEGIN) {
        next_content.push_str(&remaining[..start]);
        let after_begin = &remaining[start..];
        let Some(end) = after_begin.find(FOCUSD_AGENT_HOOK_BLOCK_END) else {
            remaining = "";
            break;
        };

        remaining = &after_begin[end + FOCUSD_AGENT_HOOK_BLOCK_END.len()..];
        if let Some(stripped) = remaining.strip_prefix("\r\n") {
            remaining = stripped;
        } else if let Some(stripped) = remaining.strip_prefix('\n') {
            remaining = stripped;
        }
    }

    next_content.push_str(remaining);
    remove_legacy_codex_focusd_hooks(&next_content)
}

pub(super) fn remove_legacy_codex_focusd_hooks(content: &str) -> String {
    let lines = content.lines().collect::<Vec<_>>();
    let mut next_lines: Vec<&str> = Vec::new();
    let mut index = 0;

    while index < lines.len() {
        let trimmed = lines[index].trim();
        if let Some(hook_path) = codex_hook_event_path(trimmed) {
            let start = index;
            index += 1;

            while index < lines.len() && !lines[index].trim().starts_with('[') {
                index += 1;
            }

            let metadata_end = index;
            let mut kept_child_ranges = Vec::new();
            let mut removed_managed_child = false;

            while index < lines.len() {
                let candidate = lines[index].trim();
                if !is_codex_nested_hook_header_for(candidate, &hook_path) {
                    break;
                }

                let child_start = index;
                index += 1;
                while index < lines.len() && !lines[index].trim().starts_with('[') {
                    index += 1;
                }

                let child_block = lines[child_start..index].join("\n");
                if child_block.contains(FOCUSD_AGENT_HOOK_SIGNATURE) {
                    removed_managed_child = true;
                } else {
                    kept_child_ranges.push(child_start..index);
                }
            }

            if !removed_managed_child {
                next_lines.extend_from_slice(&lines[start..index]);
                continue;
            }

            if kept_child_ranges.is_empty() {
                continue;
            }

            next_lines.extend_from_slice(&lines[start..metadata_end]);
            for range in kept_child_ranges {
                next_lines.extend_from_slice(&lines[range]);
            }
            continue;
        }

        next_lines.push(lines[index]);
        index += 1;
    }

    next_lines.join("\n")
}

pub(super) fn codex_hook_event_path(header: &str) -> Option<String> {
    if !header.starts_with("[[hooks.") || !header.ends_with("]]") {
        return None;
    }

    let hook_path = header.strip_prefix("[[")?.strip_suffix("]]")?;
    if hook_path.ends_with(".hooks") {
        return None;
    }

    Some(hook_path.to_string())
}

pub(super) fn is_codex_nested_hook_header_for(header: &str, hook_path: &str) -> bool {
    header == format!("[[{hook_path}.hooks]]")
}

pub(super) fn agent_running_command(script_path: &Path, provider: &str) -> String {
    format!(
        "cmd.exe /d /s /c \"\"{}\" {}\"",
        script_path.to_string_lossy(),
        provider
    )
}

/// `agent_running_command` with a second argument, such as `notification`.
pub(super) fn agent_running_command_with(script_path: &Path, provider: &str, arg: &str) -> String {
    format!(
        "cmd.exe /d /s /c \"\"{}\" {} {}\"",
        script_path.to_string_lossy(),
        provider,
        arg
    )
}

pub(super) fn agent_status_command(script_path: &Path, provider: &str, phase: &str) -> String {
    format!(
        "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"{}\" {} {}",
        script_path.to_string_lossy(),
        provider,
        phase
    )
}

pub(super) fn toml_basic_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_submit_hook_only_marks_running() {
        let block = build_codex_hook_block(
            Path::new(r"C:\a b\focusd-agent-running.cmd"),
            Path::new(r"C:\a b\focusd-agent-status.ps1"),
        );

        assert!(block.contains(
            r#"command = "cmd.exe /d /s /c \"\"C:\\a b\\focusd-agent-running.cmd\" codex\"""#
        ));
        assert!(!block.contains("capture"));
        assert!(block.contains(
            r#"command = "cmd.exe /d /s /c \"\"C:\\a b\\focusd-agent-running.cmd\" codex notification\"""#
        ));
        assert!(block.contains("[[hooks.SessionStart]]") && block.contains("[[hooks.PermissionRequest]]"));
        assert!(block.contains(r#"focusd-agent-session.ps1\" codex start"#));
        assert_eq!(
            agent_running_command(Path::new(r"C:\s.cmd"), "codex"),
            r#"cmd.exe /d /s /c ""C:\s.cmd" codex""#
        );
    }
}
