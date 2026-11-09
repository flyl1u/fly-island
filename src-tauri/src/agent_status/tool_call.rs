//! The tool a session called last, as the Agent page shows it: the tool's name and a short
//! summary of what it was given (a command, a file name, a pattern). Pure parsing of the
//! undocumented Claude Code and Codex records; anything unexpected gives no tool or no detail.

use serde::Serialize;
use serde_json::Value;

use super::title::shorten;

/// The detail fits one line next to the tool name.
const DETAIL_MAX_CHARS: usize = 80;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    /// "Bash", "Edit"; an MCP tool by its own name ("browser_click"), without the server prefix.
    pub(super) name: String,
    /// The command, file name, pattern or the like, when the tool has an obvious one.
    pub(super) detail: Option<String>,
}

/// The newest `tool_use` block in the content of a Claude Code assistant message.
pub(super) fn claude_tool_call(content: &Value) -> Option<ToolCall> {
    let block = content
        .as_array()?
        .iter()
        .rev()
        .find(|block| block["type"] == "tool_use")?;
    let name = tool_name(block["name"].as_str()?)?;
    let input = &block["input"];
    let text = |key: &str| input[key].as_str().map(str::to_string);
    let detail = match name.as_str() {
        "Bash" | "PowerShell" => text("command"),
        "Read" | "Edit" | "Write" | "MultiEdit" => text("file_path").map(|path| file_name(&path)),
        "NotebookEdit" => text("notebook_path").map(|path| file_name(&path)),
        "Grep" | "Glob" => text("pattern"),
        "WebFetch" | "browser_navigate" => text("url"),
        "WebSearch" => text("query"),
        "Agent" | "Task" => text("description"),
        "Skill" => text("skill"),
        "SendMessage" => text("to"),
        _ => None,
    };
    Some(ToolCall { name, detail: detail.and_then(|text| shorten(&text, DETAIL_MAX_CHARS)) })
}

/// A tool call in the payload of a Codex `response_item` record.
pub(super) fn codex_tool_call(payload: &Value) -> Option<ToolCall> {
    let (name, detail) = match payload["type"].as_str()? {
        "function_call" => {
            let arguments = payload["arguments"]
                .as_str()
                .and_then(|arguments| serde_json::from_str::<Value>(arguments).ok())
                .unwrap_or(Value::Null);
            let detail = command_text(&arguments["command"])
                .or_else(|| command_text(&arguments["cmd"]))
                .or_else(|| arguments["path"].as_str().map(file_name));
            (tool_name(payload["name"].as_str()?)?, detail)
        }
        "local_shell_call" => ("shell".to_string(), command_text(&payload["action"]["command"])),
        "custom_tool_call" => (tool_name(payload["name"].as_str()?)?, None),
        _ => return None,
    };
    Some(ToolCall { name, detail: detail.and_then(|text| shorten(&text, DETAIL_MAX_CHARS)) })
}

/// The last part of an MCP tool name (`mcp__server__tool`), or the name as it is.
fn tool_name(raw: &str) -> Option<String> {
    let name = raw.rsplit("__").next().unwrap_or(raw).trim();
    (!name.is_empty()).then(|| name.to_string())
}

/// A command given as a string, or as an argument list where `["bash", "-lc", "…"]` and the
/// like show only the script.
fn command_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Array(parts) => {
            let parts: Vec<&str> = parts.iter().filter_map(Value::as_str).collect();
            match parts.as_slice() {
                [_, flag, script] if matches!(*flag, "-c" | "-lc" | "-Command" | "/c") => Some((*script).to_string()),
                [] => None,
                _ => Some(parts.join(" ")),
            }
        }
        _ => None,
    }
}

fn file_name(path: &str) -> String {
    path.trim_end_matches(['\\', '/'])
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(path)
        .to_string()
}
