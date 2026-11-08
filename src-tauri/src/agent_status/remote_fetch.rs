//! Reads another computer's recent Claude Code and Codex session files over SSH (key login only,
//! `BatchMode`), as excerpts: the first lines (first prompt, starting folder, Codex's session
//! meta) and the last `TAIL_BYTES` (state, model, latest reply), the same parts the local scan
//! reads. Files the island already has unchanged are only named, and a file whose head it has
//! gets only its tail. Claude Code's registry of running sessions (`~/.claude/sessions`) comes
//! along as the ids whose process is alive, so a session quit there leaves the list here too.
//!
//! Each host keeps one SSH connection open (`Connection`): the script is sent once and answers a
//! request every few seconds, so no fetch pays for a new login. It connects with a config of the
//! island's own (`island_config`): what `ssh -G` resolves for the host, the user's tunnels left
//! out, and a reverse forward to the approval endpoint added, so a remote session's approvals
//! reach the island's cards (remote_setup.rs). `~/.ssh/config` is never changed. The forward's
//! port there is one sshd picks (`127.0.0.1:0`), so it never collides with someone else's on a
//! shared server; the script keeps it in `APPROVAL_PORT_FILE` for the hooks while it runs.

use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{Arc, Mutex, PoisonError},
    time::Duration,
};

use super::remote_hosts::SshTarget;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
use crate::system::CREATE_NO_WINDOW;

/// Matches session_scan's TAIL_BYTES: the parsers expect at most this much of a file's end.
pub(super) const TAIL_BYTES: u64 = 256 * 1024;
/// The first lines sent for a file's head: enough for the first prompt and Codex's meta line.
const HEAD_LINES: u32 = 40;
const HEAD_MAX_BYTES: u64 = 1024 * 1024;

/// Runs on the remote shell (`sh -s`) for as long as the connection is open. Once it has been
/// read whole it prints `FOCUSD_READY`; only then may requests follow (dash reads a script in
/// blocks and could swallow them). A request is the window in minutes, lines of
/// `<size> <mtime> <path>` the island has, and `FOCUSD_KNOWN`. The reply prints, per file,
/// `S <path>` (unchanged) or `F <size> <mtime> <head bytes> <tail bytes> <path>` followed by those
/// bytes; then, when the registry exists, `R` and `L <session id>` per running session; then `E`.
/// Its errors go nowhere: over days they would fill the stderr pipe and stall the connection.
/// A request's first line may add the forward's port there, the endpoint's port here and the
/// host's approval token: they go into the port file with this node's name, and the file goes
/// when the script ends (the island closed stdin, or the connection dropped), unless another
/// connection has written its own since. Everything it writes is the user's alone (`umask 077`):
/// the port file holds the token, and the hooks read it from there rather than from
/// `~/.claude/settings.json`, which other users of a shared server may be able to read.
const SCRIPT: &str = r#"exec 2>/dev/null
umask 077
T=__TAIL__
cd "$HOME" || exit 3
PF=__PORT_FILE__
NODE=$(uname -n)
MINE=
trap '[ -n "$MINE" ] && [ "$(cat "$PF" 2>/dev/null)" = "$MINE" ] && rm -f "$PF"' EXIT
trap 'exit' HUP INT TERM PIPE
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
fetch() {
{
  find .claude/projects -mindepth 2 -maxdepth 2 -type f -name '*.jsonl' -mmin -"$W" 2>/dev/null
  find .codex/sessions -mindepth 4 -maxdepth 4 -type f -name '*.jsonl' -mmin -"$W" 2>/dev/null
  [ -f .codex/session_index.jsonl ] && echo .codex/session_index.jsonl
  find .focusd-island/agent-notifications -maxdepth 1 -type f -name '*.json' -mmin +1440 -delete 2>/dev/null
  find .focusd-island/agent-notifications -maxdepth 1 -type f -name '*.json' -mmin -"$W" 2>/dev/null
} | while IFS= read -r f; do send "$f"; done
if [ -d .claude/sessions ]; then
  echo R
  mid=$(cat /etc/machine-id 2>/dev/null)
  for f in .claude/sessions/*.json; do
    [ -f "$f" ] || continue
    id=$(sed -n 's/.*"sessionId":"\([^"]*\)".*/\1/p' "$f")
    [ -n "$id" ] || continue
    # A home shared by several machines (login nodes) lists their sessions too; those cannot be
    # checked from here, so they count as running.
    if grep -q '"pidDomain":"linux:' "$f" && ! grep -qF "linux:$mid:" "$f"; then echo "L $id"; continue; fi
    p=$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$f")
    [ -n "$p" ] && kill -0 "$p" 2>/dev/null && echo "L $id"
  done
fi
echo E
}
echo FOCUSD_READY
while read -r W N P K; do
  if [ -n "$K" ]; then
    MINE="$N $P $NODE $K"
    if [ "$(cat "$PF" 2>/dev/null)" != "$MINE" ]; then
      mkdir -p "$(dirname "$PF")" && printf '%s\n' "$MINE" > "$PF.$$" && mv -f "$PF.$$" "$PF"
    fi
  fi
  KNOWN=
  while IFS= read -r line && [ "$line" != FOCUSD_KNOWN ]; do
    KNOWN="$KNOWN$line
"
  done
  fetch
done
"#;
/// Ends a request's list of known files.
const END_OF_KNOWN: &str = "FOCUSD_KNOWN";
const READY: &[u8] = b"FOCUSD_READY";
/// Under the remote home, readable only by its owner: `<forward port there> <endpoint port here>
/// <node name> <approval token>` while a connection with the forward is open.
pub(super) const APPROVAL_PORT_FILE: &str = ".focusd-island/approval-port";

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
    /// The host keeps Claude Code's registry; the `Running` replies after it are all it lists.
    Registry,
    Running(String),
}

fn session_script() -> String {
    SCRIPT
        .replace("__TAIL__", &TAIL_BYTES.to_string())
        .replace("__HEAD_MAX__", &HEAD_MAX_BYTES.to_string())
        .replace("__HEAD_LINES__", &HEAD_LINES.to_string())
        .replace("__PORT_FILE__", APPROVAL_PORT_FILE)
}

/// One request: files changed in the last `window_minutes`, minus what `known` has, and the
/// forward's port there with the endpoint's here and the host's token when there is one. A path
/// with a line break would end the list early; session files never have one.
pub(super) fn request(window_minutes: i64, known: &HashMap<String, RemoteFile>, forward: Option<(u16, &Forward)>) -> String {
    let mut request = match forward {
        Some((there, forward)) => format!("{} {there} {} {}\n", window_minutes.max(1), forward.port, forward.token),
        None => format!("{}\n", window_minutes.max(1)),
    };
    for (path, file) in known.iter().filter(|(path, _)| !path.contains('\n')) {
        request.push_str(&format!("{} {} {path}\n", file.size, file.mtime));
    }
    request + END_OF_KNOWN + "\n"
}

/// What ssh says on stderr while a connection is open; the last lines are kept.
const STDERR_KEPT_BYTES: usize = 4096;
/// What ssh prints when the server would not open the reverse forward (the port taken there).
const FORWARD_FAILED: &str = "remote port forwarding failed";

/// The port sshd picked for the reverse forward: ssh says
/// `Allocated port 43495 for remote forward to 127.0.0.1:47830`.
fn allocated_port(said: &str) -> Option<u16> {
    said.lines()
        .rev()
        .filter(|line| line.contains("for remote forward"))
        .find_map(|line| line.split_once("Allocated port ")?.1.split(' ').next()?.parse().ok())
}

/// The approval endpoint a connection's reverse forward leads to, and the token that host's hooks
/// carry (agent_approval `remote_hook_token`, hex).
pub(super) struct Forward {
    pub(super) port: u16,
    pub(super) token: String,
}

/// A standing connection to one host running the fetch script, one request at a time. Dropping
/// it ends ssh; should the island itself die, its closed stdin ends the remote loop.
pub(super) struct Connection {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    /// Read all along, so a talkative ssh never fills the pipe and stalls.
    stderr: Arc<Mutex<String>>,
    /// The endpoint port the island config forwards to, and the port sshd picked for it there
    /// once ssh has said so.
    forward_to: Option<Forward>,
    forward: Option<u16>,
}

impl Connection {
    /// Connects with `config` (`island_config`, forwarding to `forward_to`), or with the user's
    /// own ssh config and every forward cleared when there is none.
    pub(super) fn open(target: &SshTarget, config: Option<&Path>, forward_to: Option<Forward>) -> Result<Self, String> {
        let mut child = ssh_command(target, config).spawn().map_err(|error| format!("Failed to start ssh: {error}"))?;
        let (Some(stdin), Some(stdout), Some(stderr)) = (child.stdin.take(), child.stdout.take(), child.stderr.take()) else {
            let _ = child.kill();
            return Err("Failed to start ssh".into());
        };
        let said = Arc::new(Mutex::new(String::new()));
        let keep = Arc::clone(&said);
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let mut said = keep.lock().unwrap_or_else(PoisonError::into_inner);
                said.push_str(&line);
                said.push('\n');
                if said.len() > STDERR_KEPT_BYTES {
                    let cut = said.len() - STDERR_KEPT_BYTES;
                    let cut = (cut..said.len()).find(|&index| said.is_char_boundary(index)).unwrap_or(0);
                    said.drain(..cut);
                }
            }
        });
        let forward_to = forward_to.filter(|_| config.is_some());
        let mut connection = Self { child, stdin, stdout: BufReader::new(stdout), stderr: said, forward_to, forward: None };
        if connection.stdin.write_all(session_script().as_bytes()).and_then(|()| connection.stdin.flush()).is_err() {
            return Err(connection.failure("Failed to send the script to ssh".into()));
        }
        // Whatever a login prints first (a chatty startup file) is skipped.
        loop {
            let mut line = Vec::new();
            match connection.stdout.read_until(b'\n', &mut line) {
                Ok(0) | Err(_) => return Err(connection.failure("The connection closed".into())),
                Ok(_) if line.trim_ascii_end() == READY => return Ok(connection),
                Ok(_) => {}
            }
        }
    }

    pub(super) fn fetch(&mut self, window_minutes: i64, known: &HashMap<String, RemoteFile>) -> Result<Vec<Reply>, String> {
        if self.forward.is_none() && self.forward_to.is_some() {
            self.forward = allocated_port(&self.stderr.lock().unwrap_or_else(PoisonError::into_inner));
        }
        let request = request(window_minutes, known, self.forward.zip(self.forward_to.as_ref()));
        if self.stdin.write_all(request.as_bytes()).and_then(|()| self.stdin.flush()).is_err() {
            return Err(self.failure("The connection closed".into()));
        }
        read_reply(&mut self.stdout).map_err(|error| self.failure(error))
    }

    /// Why approvals cannot come through this connection: the server refused the forward.
    pub(super) fn forward_error(&self) -> Option<String> {
        let said = self.stderr.lock().unwrap_or_else(PoisonError::into_inner);
        said.lines().find(|line| line.contains(FORWARD_FAILED)).map(|line| line.trim().to_string())
    }

    /// Why the connection broke: how ssh ended and the last thing it said, when it has ended or
    /// ends within two seconds; else `error`, and ssh is stopped.
    fn failure(&mut self, error: String) -> String {
        for _ in 0..20 {
            if let Ok(Some(status)) = self.child.try_wait() {
                // The drain thread reads the last words soon after ssh ends.
                std::thread::sleep(Duration::from_millis(100));
                let said = self.stderr.lock().unwrap_or_else(PoisonError::into_inner).clone();
                return exit_reason(status.code(), &said);
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = self.child.kill();
        error
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn exit_reason(code: Option<i32>, stderr: &str) -> String {
    let reason = stderr.lines().rev().find(|line| !line.trim().is_empty()).unwrap_or("").trim();
    match code {
        Some(code) => format!("ssh exited with {code}: {reason}"),
        None => format!("ssh was stopped: {reason}"),
    }
}

/// `sh -s` on `target` (a Host from ~/.ssh/config, or a computer added in the island), all pipes
/// open; with `config`, through the island's own config (`island_config`).
fn ssh_command(target: &SshTarget, config: Option<&Path>) -> Command {
    let mut command = Command::new("ssh");
    if let Some(config) = config {
        command.arg("-F").arg(config);
    }
    command.args([
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=10",
        "-o", "ServerAliveInterval=5",
        "-o", "ServerAliveCountMax=3",
        "-T",
    ]);
    if config.is_none() {
        // The user's tunnels (RemoteForward and the like) must not be opened again, or fail.
        command.args(["-o", "ClearAllForwardings=yes"]);
    }
    if let (Some(port), None) = (target.port, config) {
        command.arg("-p").arg(port.to_string());
    }
    command
        .args(["--", target.destination.as_str(), "sh -s"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

/// What `ssh -G` resolves that the island's config leaves out: the user's tunnels, whatever
/// would run more than the script, and what would hand the server more than it needs.
const LEFT_OUT: [&str; 21] = [
    "localforward", "remoteforward", "dynamicforward", "clearallforwardings", "exitonforwardfailure",
    "remotecommand", "requesttty", "sessiontype", "stdinnull", "forkafterauthentication",
    "controlmaster", "controlpath", "controlpersist", "localcommand", "permitlocalcommand",
    "forwardagent", "forwardx11", "forwardx11trusted", "tunnel", "proxyjump", "loglevel",
];

/// The island's ssh config for one host from what `ssh -G` printed for it (`resolved`): every
/// option but `LEFT_OUT`, a ProxyJump turned into the ProxyCommand it means (under `-F` the jump
/// would read this file too), and the reverse forward to `forward_port` when given, from a port
/// sshd picks there (`LogLevel INFO` so ssh says which). A refused forward leaves the connection
/// up (`ExitOnForwardFailure no`): the sessions still come.
// shortcut: values are written back as `ssh -G` prints them, so a path with a space in it (a key
// file under such a folder) breaks; quote such values if one turns up.
pub(super) fn island_config(resolved: &str, forward_port: Option<u16>) -> String {
    let mut config = String::from("# Written by fly-island from `ssh -G` each time it connects; changes here are lost.\nHost *\n");
    for line in resolved.lines().map(str::trim).filter(|line| !line.is_empty()) {
        let (key, value) = line.split_once(' ').unwrap_or((line, ""));
        let key = key.to_ascii_lowercase();
        if key == "proxyjump" && value != "none" {
            let mut hops: Vec<&str> = value.split(',').collect();
            let last = hops.pop().unwrap_or_default();
            let last = if last.contains(':') { format!("ssh://{last}") } else { last.to_string() };
            let jumps = if hops.is_empty() { String::new() } else { format!(" -J {}", hops.join(",")) };
            config.push_str(&format!("  proxycommand ssh -o ClearAllForwardings=yes{jumps} -W %h:%p {last}\n"));
        }
        if !LEFT_OUT.contains(&key.as_str()) {
            config.push_str(&format!("  {key} {value}\n"));
        }
    }
    if let Some(port) = forward_port {
        config.push_str(&format!("  remoteforward 127.0.0.1:0 127.0.0.1:{port}\n  exitonforwardfailure no\n  loglevel info\n"));
    }
    config
}

/// Writes the island's config for `host` to `<app data>/ssh/<host>.conf` and returns its path.
pub(super) fn write_island_config(app_dir: &Path, host: &str, target: &SshTarget, forward_port: Option<u16>) -> Result<PathBuf, String> {
    let mut command = Command::new("ssh");
    command.arg("-G");
    if let Some(port) = target.port {
        command.arg("-p").arg(port.to_string());
    }
    command.args(["--", target.destination.as_str()]).stdin(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command.output().map_err(|error| format!("Failed to start ssh: {error}"))?;
    if !output.status.success() {
        return Err(exit_reason(output.status.code(), &String::from_utf8_lossy(&output.stderr)));
    }
    let path = app_dir.join("ssh").join(format!("{host}.conf"));
    std::fs::create_dir_all(path.parent().unwrap_or(app_dir)).map_err(|error| error.to_string())?;
    std::fs::write(&path, island_config(&String::from_utf8_lossy(&output.stdout), forward_port))
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))?;
    Ok(path)
}

/// Runs `script` once on `target` and returns its output.
pub(super) fn run_ssh(target: &SshTarget, script: &str) -> Result<Vec<u8>, String> {
    let mut child = ssh_command(target, None).spawn().map_err(|error| format!("Failed to start ssh: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(script.as_bytes())
            .map_err(|error| format!("Failed to send the script to ssh: {error}"))?;
    }
    let output = child.wait_with_output().map_err(|error| format!("ssh failed: {error}"))?;
    if !output.status.success() {
        return Err(exit_reason(output.status.code(), &String::from_utf8_lossy(&output.stderr)));
    }
    Ok(output.stdout)
}

/// Reads one reply, up to its closing `E`; an error when it stops before.
pub(super) fn read_reply(reader: &mut impl BufRead) -> Result<Vec<Reply>, String> {
    let mut replies = Vec::new();
    loop {
        let mut line = Vec::new();
        reader.read_until(b'\n', &mut line).map_err(|error| error.to_string())?;
        if line.pop() != Some(b'\n') {
            return Err("The reply ended early".into());
        }
        let line = String::from_utf8_lossy(&line).into_owned();
        if line == "E" {
            return Ok(replies);
        }
        if let Some(path) = line.strip_prefix("S ") {
            replies.push(Reply::Same(path.to_string()));
            continue;
        }
        if line == "R" {
            replies.push(Reply::Registry);
            continue;
        }
        if let Some(id) = line.strip_prefix("L ") {
            replies.push(Reply::Running(id.to_string()));
            continue;
        }
        let fields = line.strip_prefix("F ").ok_or_else(|| format!("Unexpected line in the reply: {line}"))?;
        let mut parts = fields.splitn(5, ' ');
        let mut number = || parts.next().and_then(|part| part.parse::<u64>().ok()).ok_or("Malformed file line");
        let (size, mtime, head_len, tail_len) = (number()?, number()?, number()?, number()?);
        let path = parts.next().filter(|path| !path.is_empty()).ok_or("File line without a path")?;
        // The script never sends more; the check keeps a bad reply from asking for any memory.
        if head_len > HEAD_MAX_BYTES || tail_len > TAIL_BYTES {
            return Err("File excerpt too large".into());
        }
        let mut head = vec![0; usize::try_from(head_len).map_err(|_| "File too large")?];
        let mut tail = vec![0; usize::try_from(tail_len).map_err(|_| "File too large")?];
        reader
            .read_exact(&mut head)
            .and_then(|()| reader.read_exact(&mut tail))
            .map_err(|_| "The reply ended inside a file")?;
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
        bytes.extend_from_slice(b"R\nL 35065fcf-59fe\nE\n");
        let replies = read_reply(&mut bytes.as_slice()).unwrap();
        assert_eq!(replies[3..], [Reply::Registry, Reply::Running("35065fcf-59fe".into())]);
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
        assert!(read_reply(&mut &b"S a\n"[..]).is_err());
        assert!(read_reply(&mut &b"F 10 1 0 10 a\nshort"[..]).is_err());
        assert!(read_reply(&mut &b"X\nE\n"[..]).is_err());
        assert!(read_reply(&mut &b"F 1 1 0 99999999999 a\nE\n"[..]).is_err());
        // Replies in a row on one connection: each read stops at its own end.
        let mut stream = &b"S a\nE\nS b\nE\n"[..];
        assert_eq!(read_reply(&mut stream).unwrap(), [Reply::Same("a".into())]);
        assert_eq!(read_reply(&mut stream).unwrap(), [Reply::Same("b".into())]);
    }

    /// Against a real host: `FOCUSD_SSH_TEST_HOST=zcm6 cargo test --lib standing -- --ignored`.
    #[test]
    #[ignore]
    fn a_standing_connection_answers_request_after_request() {
        let Ok(host) = std::env::var("FOCUSD_SSH_TEST_HOST") else { return };
        let target = SshTarget { destination: host, port: None };
        let started = std::time::Instant::now();
        let app_dir = std::env::temp_dir().join(format!("focusd-ssh-config-{}", std::process::id()));
        // Forwarding a port nothing listens on here: Claude Code there would get "refused".
        let config = write_island_config(&app_dir, "test", &target, Some(47_839)).unwrap();
        let forward = Forward { port: 47_839, token: "ab12".into() };
        let mut connection = Connection::open(&target, Some(&config), Some(forward)).unwrap();
        let first = connection.fetch(24 * 60, &HashMap::new()).unwrap();
        let opened = started.elapsed();
        let known: HashMap<String, RemoteFile> = first
            .iter()
            .filter_map(|reply| match reply {
                Reply::Changed { path, file, .. } => Some((path.clone(), file.clone())),
                _ => None,
            })
            .collect();
        let started = std::time::Instant::now();
        let second = connection.fetch(24 * 60, &known).unwrap();
        let changed = second.iter().filter(|reply| matches!(reply, Reply::Changed { .. })).count();
        println!("files {}, open+first {opened:?}, second {:?}, changed again {changed}, forward {:?}", known.len(), started.elapsed(), connection.forward_error());
        assert!(changed <= 2, "only files written meanwhile come again");
    }

    #[test]
    fn the_island_config_keeps_the_host_but_not_its_tunnels_and_adds_the_approval_forward() {
        let resolved = "user scg6928\nhostname ln2\nport 22\nproxycommand ssh -o ClearAllForwardings=yes -W %h:%p zcm6-gateway\nremoteforward 127.0.0.1:37897 127.0.0.1:7897\nlocalforward 8000 127.0.0.1:8000\nexitonforwardfailure yes\nrequesttty auto\nproxyjump none\nidentityfile ~/.ssh/id_ed25519\n";
        let config = island_config(resolved, Some(47830));
        assert!(config.contains("Host *\n  user scg6928\n  hostname ln2\n  port 22\n  proxycommand ssh -o ClearAllForwardings=yes -W %h:%p zcm6-gateway\n"));
        assert!(config.contains("  identityfile ~/.ssh/id_ed25519\n"));
        assert!(!config.contains("37897") && !config.contains("8000") && !config.contains("requesttty") && !config.contains("proxyjump"));
        assert!(config.ends_with("  remoteforward 127.0.0.1:0 127.0.0.1:47830\n  exitonforwardfailure no\n  loglevel info\n"));
        assert!(!island_config(resolved, None).contains("remoteforward"));
        let jumped = island_config("hostname b\nproxyjump gw1,me@gw2:2222\n", None);
        assert!(jumped.contains("  proxycommand ssh -o ClearAllForwardings=yes -J gw1 -W %h:%p ssh://me@gw2:2222\n"));
    }

    #[test]
    fn a_request_lists_the_window_and_known_files() {
        let known = HashMap::from([(".claude/projects/p/a.jsonl".to_string(), RemoteFile { size: 7, mtime: 9 })]);
        assert_eq!(request(120, &known, None), "120\n7 9 .claude/projects/p/a.jsonl\nFOCUSD_KNOWN\n");
        let forward = Forward { port: 47_830, token: "ab12".into() };
        assert_eq!(request(0, &HashMap::new(), Some((43_495, &forward))), "1 43495 47830 ab12\nFOCUSD_KNOWN\n");
        let said = "Warning: Permanently added 'ln2'\nAllocated port 43495 for remote forward to 127.0.0.1:47830\n";
        assert_eq!(allocated_port(said), Some(43_495));
        assert_eq!(allocated_port("Allocated port x for remote forward\n"), None);
        assert!(!session_script().contains("__"));
    }
}
