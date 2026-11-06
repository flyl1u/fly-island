//! The optional reply status marker (roadmap B9). A finished Claude Code turn
//! alone does not say whether Claude is waiting for an answer or is done. When
//! the user switches this on in Settings → AI Agent, a short instruction block
//! goes into the user's global `CLAUDE.md` asking Claude to end every reply with
//! one marker line; the session scan reads that line from the transcript
//! (sessions.rs), leaves it out of the shown reply, and reports it as
//! `replyMarker`. Off by default: the block is the user's global instruction, so
//! the island only writes it on request and removes only its own block.

use std::{
    env, fs,
    path::{Path, PathBuf},
};

use serde::Serialize;

/// What the last line of a reply says the session is waiting for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ReplyMarker {
    /// Claude asked something or needs a decision before it can go on.
    YourTurn,
    /// Claude waits for a background task it started and will go on by itself.
    Background,
    /// The work is finished.
    Done,
}

impl ReplyMarker {
    /// The name sent to the window (`AgentSessionSummary.replyMarker`).
    pub(super) fn name(self) -> &'static str {
        match self {
            Self::YourTurn => "yourTurn",
            Self::Background => "background",
            Self::Done => "done",
        }
    }

    fn from_symbol(symbol: &str) -> Option<Self> {
        // A trailing variation selector is how some fonts ask for the text form.
        match symbol.trim_end_matches('\u{FE0E}').trim_end_matches('\u{FE0F}') {
            "↩" => Some(Self::YourTurn),
            "⋯" => Some(Self::Background),
            "✓" => Some(Self::Done),
            _ => None,
        }
    }
}

/// The marker on the reply's last non-empty line, and the reply without that line.
/// A reply whose last line is anything else comes back unchanged.
pub(super) fn split_reply(text: &str) -> (Option<ReplyMarker>, &str) {
    let trimmed = text.trim_end();
    let (rest, last) = match trimmed.rfind('\n') {
        Some(index) => (&trimmed[..index], &trimmed[index + 1..]),
        None => ("", trimmed),
    };
    match ReplyMarker::from_symbol(last.trim()) {
        Some(marker) => (Some(marker), rest.trim_end()),
        None => (None, text),
    }
}

/// Opens the block; the version lets a newer island replace an older wording.
const BLOCK_START: &str = "<!-- focusd-island: reply marker v1 -->";
const BLOCK_START_PREFIX: &str = "<!-- focusd-island: reply marker";
const BLOCK_END: &str = "<!-- /focusd-island: reply marker -->";

/// The instruction, in the island's own words.
const BLOCK_BODY: &str = "\
## Reply status marker (added by FocuSD Island)

End every reply with one extra line that holds only one of these characters, so FocuSD Island can show what this session is waiting for:

- `↩` you asked the user a question, or need their decision or input, before you can go on
- `⋯` you are waiting for a background task you started yourself (a background command, a subagent) and will continue on your own
- `✓` the work is finished and nothing is needed from the user

Write the character alone on the last line, without backticks, and nothing after it. To stop, switch off \"Reply status marker\" in FocuSD Island's Settings → AI Agent, which removes this block.";

fn block() -> String {
    format!("{BLOCK_START}\n{BLOCK_BODY}\n{BLOCK_END}")
}

/// Where the island's block is in `text`: from its start line to the end of its end line.
fn find_block(text: &str) -> Option<(usize, usize)> {
    let start = text.find(BLOCK_START_PREFIX)?;
    let end = text[start..].find(BLOCK_END)? + start + BLOCK_END.len();
    Some((start, end))
}

/// Mirrored by ReplyMarkerState in src/features/agent-status/api.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplyMarkerState {
    /// The island's block is in the file.
    pub(super) installed: bool,
    /// The block is an older wording; switching off and on again, or on again, replaces it.
    pub(super) outdated: bool,
    /// The `CLAUDE.md` it lives in.
    pub(super) path: String,
}

pub(super) fn state_of(text: &str, path: &Path) -> ReplyMarkerState {
    let found = find_block(text);
    ReplyMarkerState {
        installed: found.is_some(),
        // Compared with LF endings: a CRLF file holds the block with CRLF.
        outdated: found.is_some_and(|(start, end)| text[start..end].replace("\r\n", "\n") != block()),
        path: path.display().to_string(),
    }
}

/// `text` with the island's block, current wording, replacing an older one in place
/// or added at the end after a blank line. Line endings follow the file's.
pub(super) fn with_block(text: &str) -> String {
    let crlf = text.contains("\r\n");
    let block = if crlf { block().replace('\n', "\r\n") } else { block() };
    let newline = if crlf { "\r\n" } else { "\n" };
    if let Some((start, end)) = find_block(text) {
        return format!("{}{block}{}", &text[..start], &text[end..]);
    }
    let body = text.trim_end();
    if body.is_empty() {
        format!("{block}{newline}")
    } else {
        format!("{body}{newline}{newline}{block}{newline}")
    }
}

/// `text` without the island's block and the blank lines it added; anything else stays.
pub(super) fn without_block(text: &str) -> String {
    let Some((start, end)) = find_block(text) else {
        return text.to_string();
    };
    let before = text[..start].trim_end();
    let after = text[end..].trim_start_matches(['\r', '\n']);
    let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
    match (before.is_empty(), after.is_empty()) {
        (true, _) => after.to_string(),
        (false, true) => format!("{before}{newline}"),
        (false, false) => format!("{before}{newline}{newline}{after}"),
    }
}

/// The user's global `CLAUDE.md`: in `CLAUDE_CONFIG_DIR` when set, else `~/.claude`.
fn claude_md_path() -> Result<PathBuf, String> {
    let dir = env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .filter(|dir| dir.is_absolute())
        .map(Ok)
        .unwrap_or_else(|| crate::system::windows_home_dir().map(|home| home.join(".claude")))?;
    Ok(dir.join("CLAUDE.md"))
}

/// The file's text; empty when it does not exist yet.
fn read_claude_md(path: &Path) -> Result<String, String> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(format!("Failed to read {}: {error}", path.display())),
    }
}

/// Whether the block is in the user's `CLAUDE.md`.
#[tauri::command]
pub async fn get_reply_marker_state() -> Result<ReplyMarkerState, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let path = claude_md_path()?;
        Ok(state_of(&read_claude_md(&path)?, &path))
    })
    .await
    .map_err(|error| format!("Failed to join the CLAUDE.md task: {error}"))?
}

/// Adds (or updates) the block, or removes it. A file that would only have held the
/// block is not created when switching off.
#[tauri::command]
pub async fn set_reply_marker(enabled: bool) -> Result<ReplyMarkerState, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = claude_md_path()?;
        let text = read_claude_md(&path)?;
        let next = if enabled { with_block(&text) } else { without_block(&text) };
        if next != text {
            super::write_text_file(&path, &next)?;
        }
        Ok(state_of(&next, &path))
    })
    .await
    .map_err(|error| format!("Failed to join the CLAUDE.md task: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_last_line_alone_is_the_marker() {
        assert_eq!(split_reply("Which one?\n\n↩"), (Some(ReplyMarker::YourTurn), "Which one?"));
        assert_eq!(split_reply("Started the build.\r\n⋯\r\n"), (Some(ReplyMarker::Background), "Started the build."));
        assert_eq!(split_reply("Done.\n  ✓\u{FE0E} "), (Some(ReplyMarker::Done), "Done."));
        assert_eq!(split_reply("✓"), (Some(ReplyMarker::Done), ""));
        // Anything else on the line, or a marker earlier on, is ordinary text.
        assert_eq!(split_reply("Tests ✓"), (None, "Tests ✓"));
        assert_eq!(split_reply("↩\nmore text"), (None, "↩\nmore text"));
        assert_eq!(split_reply("`↩`"), (None, "`↩`"));
    }

    #[test]
    fn the_block_goes_in_once_is_updated_in_place_and_comes_out_cleanly() {
        let path = Path::new("C:/Users/me/.claude/CLAUDE.md");
        let user = "# Global rules\r\n\r\n- reply in Chinese\r\n";
        let on = with_block(user);
        assert!(on.starts_with("# Global rules\r\n\r\n- reply in Chinese\r\n\r\n<!-- focusd-island"));
        assert!(!on.replace("\r\n", "").contains('\n'), "a CRLF file keeps CRLF");
        assert_eq!(with_block(&on), on);
        assert_eq!(state_of(&on, path), ReplyMarkerState { installed: true, outdated: false, path: path.display().to_string() });
        assert_eq!(without_block(&on), user);

        let old = format!("{user}\r\n<!-- focusd-island: reply marker v0 -->\r\nold words\r\n{BLOCK_END}\r\n\r\n## After\r\n");
        assert!(state_of(&old, path).outdated);
        let updated = with_block(&old);
        assert!(!updated.contains("old words") && updated.ends_with("## After\r\n"));
        assert_eq!(without_block(&updated), format!("{user}\r\n## After\r\n"));

        assert_eq!(with_block(""), format!("{}\n", block()));
        assert_eq!(without_block(&with_block("")), "");
        assert_eq!(without_block(user), user);
        assert!(!state_of(user, path).installed);
    }
}
