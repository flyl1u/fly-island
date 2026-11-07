//! Reads another computer's recent Claude Code and Codex session files over SSH (key login only,
//! `BatchMode`), as excerpts: the first lines (first prompt, starting folder, Codex's session
//! meta) and the last `TAIL_BYTES` (state, model, latest reply), the same parts the local scan
//! reads. Files the island already has unchanged are only named, and a file whose head it has
//! gets only its tail.

use std::{collections::HashMap, io::Write, process::Command, process::Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
use crate::system::CREATE_NO_WINDOW;

/// Matches session_scan's TAIL_BYTES: the parsers expect at most this much of a file's end.
pub(super) const TAIL_BYTES: u64 = 256 * 1024;
/// The first lines sent for a file's head: enough for the first prompt and Codex's meta line.
const HEAD_LINES: u32 = 40;
const HEAD_MAX_BYTES: u64 = 1024 * 1024;

/// Runs on the remote shell (`sh -s`). `__WINDOW__` is minutes, `__KNOWN__` lines of
/// `<size> <mtime> <path>` the island has. Prints, per file, `S <path>` (unchanged) or
/// `F <size> <mtime> <head bytes> <tail bytes> <path>` followed by those bytes, then `E`.
const SCRIPT: &str = r#"W=__WINDOW__
T=__TAIL__
cd "$HOME" || exit 3
KNOWN=$(cat <<'FOCUSD_KNOWN'
__KNOWN__
FOCUSD_KNOWN
)
send() {
  set -- "$1" $(stat -c '%s %Y' "$1" 2>/dev/null)
  [ -n "$3" ] || return 0
  if printf '%s\n' "$KNOWN" | grep -qxF "$2 $3 $1"; then printf 'S %s\n' "$1"; return 0; fi
  if [ "$2" -le "$T" ]; then printf 'F %s %s 0 %s %s\n' "$2" "$3" "$2" "$1"; head -c "$2" "$1"; return 0; fi
  h=0
  if ! printf '%s\n' "$KNOWN" | cut -d' ' -f3- | grep -qxF "$1"; then
    h=$(( $(head -c __HEAD_MAX__ "$1" | head -n __HEAD_LINES__ | wc -c) ))
  fi
  printf 'F %s %s %s %s %s\n' "$2" "$3" "$h" "$T" "$1"
  [ "$h" -gt 0 ] && head -c __HEAD_MAX__ "$1" | head -n __HEAD_LINES__
  tail -c "$T" "$1"
}
{
  find .claude/projects -mindepth 2 -maxdepth 2 -type f -name '*.jsonl' -mmin -"$W" 2>/dev/null
  find .codex/sessions -mindepth 4 -maxdepth 4 -type f -name '*.jsonl' -mmin -"$W" 2>/dev/null
  [ -f .codex/session_index.jsonl ] && echo .codex/session_index.jsonl
} | while IFS= read -r f; do send "$f"; done
echo E
"#;

/// A file as the remote computer last reported it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RemoteFile {
    pub(super) size: u64,
    /// Seconds since 1970.
    pub(super) mtime: i64,
}

/// One file in a reply: unchanged, or new bytes.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Reply {
    Same(String),
    Changed { path: String, file: RemoteFile, head: Vec<u8>, tail: Vec<u8> },
}

/// The script for one fetch: files changed in the last `window_minutes`, minus what `known` has.
pub(super) fn script(window_minutes: i64, known: &HashMap<String, RemoteFile>) -> String {
    let known = known
        .iter()
        .map(|(path, file)| format!("{} {} {path}", file.size, file.mtime))
        .collect::<Vec<_>>()
        .join("\n");
    SCRIPT
        .replace("__WINDOW__", &window_minutes.max(1).to_string())
        .replace("__TAIL__", &TAIL_BYTES.to_string())
        .replace("__HEAD_MAX__", &HEAD_MAX_BYTES.to_string())
        .replace("__HEAD_LINES__", &HEAD_LINES.to_string())
        .replace("__KNOWN__", &known)
}

/// Runs the script on `alias` (a Host from ~/.ssh/config) and returns its output.
pub(super) fn run_ssh(alias: &str, script: &str) -> Result<Vec<u8>, String> {
    let mut command = Command::new("ssh");
    command
        .args([
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=10",
            "-o", "ServerAliveInterval=5",
            "-o", "ServerAliveCountMax=3",
            // The user's tunnels (RemoteForward and the like) must not be opened again, or fail.
            "-o", "ClearAllForwardings=yes",
            "-T",
            "--",
            alias,
            "sh -s",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let mut child = command.spawn().map_err(|error| format!("Failed to start ssh: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(script.as_bytes())
            .map_err(|error| format!("Failed to send the script to ssh: {error}"))?;
    }
    let output = child.wait_with_output().map_err(|error| format!("ssh failed: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let reason = stderr.lines().rev().find(|line| !line.trim().is_empty()).unwrap_or("").trim();
        return Err(match output.status.code() {
            Some(code) => format!("ssh exited with {code}: {reason}"),
            None => format!("ssh was stopped: {reason}"),
        });
    }
    Ok(output.stdout)
}

/// Splits the script's output into files; an error when it stops before the closing `E`.
pub(super) fn parse_reply(bytes: &[u8]) -> Result<Vec<Reply>, String> {
    let mut replies = Vec::new();
    let mut rest = bytes;
    loop {
        let newline = rest.iter().position(|&byte| byte == b'\n').ok_or("The reply ended early")?;
        let line = String::from_utf8_lossy(&rest[..newline]).into_owned();
        rest = &rest[newline + 1..];
        if line == "E" {
            return Ok(replies);
        }
        if let Some(path) = line.strip_prefix("S ") {
            replies.push(Reply::Same(path.to_string()));
            continue;
        }
        let fields = line.strip_prefix("F ").ok_or_else(|| format!("Unexpected line in the reply: {line}"))?;
        let mut parts = fields.splitn(5, ' ');
        let mut number = || parts.next().and_then(|part| part.parse::<u64>().ok()).ok_or("Malformed file line");
        let (size, mtime, head_len, tail_len) = (number()?, number()?, number()?, number()?);
        let path = parts.next().filter(|path| !path.is_empty()).ok_or("File line without a path")?;
        let head_len = usize::try_from(head_len).map_err(|_| "File too large")?;
        let tail_len = usize::try_from(tail_len).map_err(|_| "File too large")?;
        if rest.len() < head_len + tail_len {
            return Err("The reply ended inside a file".into());
        }
        let head = rest[..head_len].to_vec();
        let tail = rest[head_len..head_len + tail_len].to_vec();
        rest = &rest[head_len + tail_len..];
        let mtime = i64::try_from(mtime).map_err(|_| "Bad modification time")?;
        replies.push(Reply::Changed { path: path.to_string(), file: RemoteFile { size, mtime }, head, tail });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_same_and_changed_files_up_to_the_end_marker() {
        let mut bytes = b"S .claude/projects/p/a.jsonl\nF 5 1700000000 0 5 .claude/projects/p/b c.jsonl\nhello".to_vec();
        bytes.extend_from_slice(b"F 900000 1700000001 3 4 .codex/sessions/2026/11/06/r.jsonl\nh\n\ntail");
        bytes.extend_from_slice(b"E\n");
        let replies = parse_reply(&bytes).unwrap();
        assert_eq!(replies[0], Reply::Same(".claude/projects/p/a.jsonl".into()));
        assert_eq!(
            replies[1],
            Reply::Changed {
                path: ".claude/projects/p/b c.jsonl".into(),
                file: RemoteFile { size: 5, mtime: 1_700_000_000 },
                head: Vec::new(),
                tail: b"hello".to_vec(),
            }
        );
        let Reply::Changed { head, tail, .. } = &replies[2] else { panic!("changed") };
        assert_eq!((head.as_slice(), tail.as_slice()), (&b"h\n\n"[..], &b"tail"[..]));
    }

    #[test]
    fn a_cut_off_reply_is_an_error() {
        assert!(parse_reply(b"S a\n").is_err());
        assert!(parse_reply(b"F 10 1 0 10 a\nshort").is_err());
        assert!(parse_reply(b"X\nE\n").is_err());
    }

    #[test]
    fn the_script_lists_known_files_and_the_window() {
        let known = HashMap::from([(".claude/projects/p/a.jsonl".to_string(), RemoteFile { size: 7, mtime: 9 })]);
        let script = script(120, &known);
        assert!(script.starts_with("W=120\nT=262144\n"));
        assert!(script.contains("\n7 9 .claude/projects/p/a.jsonl\nFOCUSD_KNOWN\n"));
        assert!(!script.contains("__"));
    }
}
