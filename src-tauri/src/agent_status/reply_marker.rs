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
const BLOCK_START: &str = "<!-- focusd-island: reply marker v2 -->";
pub(super) const BLOCK_START_PREFIX: &str = "<!-- focusd-island: reply marker";
const BLOCK_END: &str = "<!-- /focusd-island: reply marker -->";

/// The instruction, in the island's own words.
const BLOCK_BODY: &str = "\
## Reply status marker (added by FocuSD Island)

End every reply with one extra line that holds only one of these characters, so FocuSD Island can show what this session is waiting for:

- `↩` you asked the user a question, or need their decision or input, before you can go on
- `⋯` you are waiting for a background task you started yourself (a background command, a subagent) and will continue on your own
- `✓` the work is finished and nothing is needed from the user

Write the character alone on the last line, without backticks, and nothing after it. To stop, switch off \"Reply status marker\" in FocuSD Island's Settings → AI Agent, which deletes this file.";

pub(super) fn block() -> String {
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
    /// The island's rules file is there, or an older island's block is in `CLAUDE.md`.
    pub(super) installed: bool,
    /// An older wording, or the block still in `CLAUDE.md`; switching on again replaces it.
    pub(super) outdated: bool,
    /// The rules file it lives in.
    pub(super) path: String,
    /// What switching it on writes there, shown before the user does.
    pub(super) content: String,
    /// What switching it on or off did on each chosen SSH remote computer; empty when only read.
    pub(super) remotes: Vec<super::remote_setup::RemoteResult>,
}

/// The state from the rules file's text and `CLAUDE.md`'s, where islands before v2 put the block.
pub(super) fn state_of(rules: &str, claude_md: &str, path: &Path) -> ReplyMarkerState {
    let found = find_block(rules);
    let legacy = find_block(claude_md).is_some();
    ReplyMarkerState {
        installed: found.is_some() || legacy,
        // Compared with LF endings: a CRLF file holds the block with CRLF.
        outdated: legacy || found.is_some_and(|(start, end)| rules[start..end].replace("\r\n", "\n") != block()),
        path: path.display().to_string(),
        content: block(),
        remotes: Vec::new(),
    }
}

/// The whole rules file the island writes.
pub(super) fn rules_file() -> String {
    format!("{}\n", block())
}

/// Whether `text` is the island's rules file, so switching off may delete it.
pub(super) fn is_rules_file(text: &str) -> bool {
    text.contains(BLOCK_START_PREFIX)
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

/// Under the Claude config folder. Claude Code reads every `rules/*.md` there into each session,
/// as it reads `CLAUDE.md`, so the island never edits the user's own instructions.
pub(super) const RULES_FILE: &str = "rules/focusd-island-reply-marker.md";

/// The Claude config folder: `CLAUDE_CONFIG_DIR` when set, else `~/.claude`.
fn claude_dir() -> Result<PathBuf, String> {
    env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .filter(|dir| dir.is_absolute())
        .map(Ok)
        .unwrap_or_else(|| crate::system::windows_home_dir().map(|home| home.join(".claude")))
}

/// The file's text; empty when it does not exist yet.
fn read_text(path: &Path) -> Result<String, String> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(format!("Failed to read {}: {error}", path.display())),
    }
}

/// Whether the rules file is there.
#[tauri::command]
pub async fn get_reply_marker_state() -> Result<ReplyMarkerState, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = claude_dir()?;
        let path = dir.join(RULES_FILE);
        Ok(state_of(&read_text(&path)?, &read_text(&dir.join("CLAUDE.md"))?, &path))
    })
    .await
    .map_err(|error| format!("Failed to join the CLAUDE.md task: {error}"))?
}

/// Writes the rules file, or deletes it (only when it is the island's). Either way an older
/// island's block comes out of `CLAUDE.md`, and nothing else there changes.
#[tauri::command]
pub async fn set_reply_marker(app: tauri::AppHandle, enabled: bool) -> Result<ReplyMarkerState, String> {
    use tauri::Manager;
    let app_dir = app.path().app_data_dir().ok();
    tauri::async_runtime::spawn_blocking(move || {
        let dir = claude_dir()?;
        let path = dir.join(RULES_FILE);
        let rules = read_text(&path)?;
        if enabled && rules != rules_file() {
            super::write_text_file(&path, &rules_file())?;
        }
        if !enabled && is_rules_file(&rules) {
            fs::remove_file(&path).map_err(|error| format!("Failed to delete {}: {error}", path.display()))?;
        }
        let claude_md_path = dir.join("CLAUDE.md");
        let claude_md = read_text(&claude_md_path)?;
        let cleaned = without_block(&claude_md);
        if cleaned != claude_md {
            super::write_text_file(&claude_md_path, &cleaned)?;
        }
        let mut state = state_of(&read_text(&path)?, &cleaned, &path);
        if let Some(app_dir) = app_dir {
            state.remotes = super::remote_setup::set_reply_marker(&app_dir, enabled);
        }
        Ok(state)
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
    fn the_rules_file_holds_the_block_and_an_old_block_comes_out_of_claude_md_cleanly() {
        let path = Path::new("C:/Users/me/.claude/rules/focusd-island-reply-marker.md");
        let user = "# Global rules\r\n\r\n- reply in Chinese\r\n";
        let state = state_of(&rules_file(), user, path);
        assert!(state.installed && !state.outdated);
        assert_eq!(state.content, block());
        assert!(is_rules_file(&rules_file()) && !is_rules_file(user));
        assert!(!state_of("", user, path).installed);

        // An island before v2 put the block into CLAUDE.md: it counts as on, and needs moving.
        let legacy = format!("{user}\r\n<!-- focusd-island: reply marker v1 -->\r\nold words\r\n{BLOCK_END}\r\n\r\n## After\r\n");
        let state = state_of("", &legacy, path);
        assert!(state.installed && state.outdated);
        assert_eq!(without_block(&legacy), format!("{user}\r\n## After\r\n"));
        assert_eq!(without_block(user), user);
        assert!(state_of("<!-- focusd-island: reply marker v1 -->\nx\n<!-- /focusd-island: reply marker -->\n", "", path).outdated);
    }
}
