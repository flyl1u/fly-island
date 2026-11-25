use std::{io::{BufRead, BufReader, Read, Write}, path::{Path, PathBuf}, process::{Command, Stdio}, sync::{Arc, atomic::{AtomicBool, Ordering}, mpsc}, thread, time::{Duration, Instant}};
use serde_json::{json, Value};
use super::{manifest::Manifest, protocol::{parse_publish, Contributions, MAX_LINE}};

pub type Publish = Arc<dyn Fn(Contributions, &str) + Send + Sync>;
type Reply = mpsc::SyncSender<Result<Value, String>>;
pub struct Request { method: String, params: Value, reply: Reply }

pub struct Worker {
    stop: Arc<AtomicBool>,
    sender: mpsc::SyncSender<Request>,
    join: Option<thread::JoinHandle<()>>,
}

impl Worker {
    pub fn stop(&self) { self.stop.store(true, Ordering::Release); }

    pub fn start(directory: PathBuf, manifest: Manifest, settings: Value, log: PathBuf, publish: Publish) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let (sender, receiver) = mpsc::sync_channel(16);
        let signal = stop.clone();
        let join = thread::spawn(move || supervise(&directory, &manifest, &settings, &log, signal, receiver, publish));
        Self { stop, sender, join: Some(join) }
    }

    pub fn request(&self, method: &str, params: Value) -> Result<mpsc::Receiver<Result<Value, String>>, String> {
        let (reply, receiver) = mpsc::sync_channel(1);
        self.sender.try_send(Request { method: method.into(), params, reply }).map_err(|_| "Plugin is busy or stopped".to_owned())?;
        Ok(receiver)
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        self.stop();
        if let Some(join) = self.join.take() { let _ = join.join(); }
    }
}

pub fn restart_delay(attempt: u32) -> Option<Duration> {
    (attempt < 6).then(|| Duration::from_secs(1 << attempt))
}

fn supervise(directory: &Path, manifest: &Manifest, settings: &Value, log: &Path, stop: Arc<AtomicBool>, receiver: mpsc::Receiver<Request>, publish: Publish) {
    let mut attempt = 0;
    while !stop.load(Ordering::Acquire) {
        publish(Contributions::default(), "starting");
        if let Err(error) = run(directory, manifest, settings, log, &stop, &receiver, &publish) {
            let secrets: Vec<String> = manifest.settings.iter().filter(|s| s.kind == "secret")
                .filter_map(|s| settings[&s.key].as_str().map(str::to_owned)).collect();
            log_stderr(format!("plugin worker: {error}\n").as_bytes(), log, &secrets);
            if attempt == 0 || restart_delay(attempt).is_none() {
                log_catalog(&log.with_file_name("catalog.log"), &manifest.id, "plugin_start_failed", &error, &secrets);
            }
        }
        if stop.load(Ordering::Acquire) { break; }
        let Some(delay) = restart_delay(attempt) else {
            publish(Contributions::default(), "failed");
            return;
        };
        publish(Contributions::default(), "restarting");
        attempt = attempt.saturating_add(1);
        let until = Instant::now() + delay;
        while Instant::now() < until && !stop.load(Ordering::Acquire) { thread::sleep(Duration::from_millis(50)); }
    }
    publish(Contributions::default(), if stop.load(Ordering::Acquire) { "stopped" } else { "failed" });
}

fn plugin_command(directory: &Path, relative: &str) -> Result<Command, String> {
    let base = directory.canonicalize().map_err(|e| e.to_string())?;
    let executable = base.join(relative).canonicalize().map_err(|e| e.to_string())?;
    if !executable.starts_with(&base) { return Err("Executable escapes plugin directory".into()); }
    let mut command = Command::new(executable);
    command.current_dir(&base);
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    Ok(command)
}

pub(super) fn disconnect_minimax(directory: &Path) -> Result<(), String> {
    let mut child = plugin_command(directory, "minimax.exe")?.arg("--disconnect-approvals")
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .spawn().map_err(|error| error.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(25)),
            _ => break,
        }
    }
    let _ = child.kill();
    let _ = child.wait();
    Err("Could not disconnect MiniMax Code approval hooks".into())
}

fn run(directory: &Path, manifest: &Manifest, settings: &Value, log: &Path, stop: &AtomicBool, requests: &mpsc::Receiver<Request>, publish: &Publish) -> Result<(), String> {
    let mut child = plugin_command(directory, &manifest.runtime.command)?
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let _job = match crate::win32::process_job::ProcessJob::attach(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("Cannot isolate plugin process tree: {error}"));
        }
    };
    let result = (|| {
        let mut input = child.stdin.take().ok_or("Plugin stdin unavailable")?;
        let (writer, messages) = mpsc::sync_channel::<String>(16);
        thread::spawn(move || {
            for message in messages {
                if writeln!(input, "{message}").and_then(|_| input.flush()).is_err() { break; }
            }
        });
        let output = child.stdout.take().ok_or("Plugin stdout unavailable")?;
        let errors = child.stderr.take().ok_or("Plugin stderr unavailable")?;
        let log = log.to_owned();
        let secrets: Vec<String> = manifest.settings.iter().filter(|s| s.kind == "secret").filter_map(|s| settings[&s.key].as_str().filter(|v| !v.is_empty()).map(str::to_owned)).collect();
        thread::spawn(move || log_stderr(errors, &log, &secrets));
        let (sender, lines) = mpsc::sync_channel(16);
        thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                let mut line = Vec::new();
                let read = reader.by_ref().take((MAX_LINE + 1) as u64).read_until(b'\n', &mut line);
                if !matches!(read, Ok(n) if n > 0) || line.len() > MAX_LINE { break; }
                let Ok(line) = String::from_utf8(line) else { break; };
                if sender.send(line).is_err() { break; }
            }
        });
        writer.try_send(json!({"jsonrpc":"2.0","id":0,"method":"initialize","params":{"apiVersion":1,"settings":settings}}).to_string()).map_err(|e| e.to_string())?;
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut ready = false;
        let mut next_id = 1u64;
        let mut pending: std::collections::HashMap<u64, (Instant, Reply)> = Default::default();
        while !stop.load(Ordering::Acquire) {
            if child.try_wait().map_err(|e| e.to_string())?.is_some() { return Err("Plugin exited".into()); }
            if !ready && Instant::now() > deadline { return Err("Plugin initialize timeout".into()); }
            if ready {
                if let Ok(request) = requests.try_recv() {
                    writer.try_send(json!({"jsonrpc":"2.0","id":next_id,"method":request.method,"params":request.params}).to_string()).map_err(|e| e.to_string())?;
                    pending.insert(next_id, (Instant::now(), request.reply));
                    next_id += 1;
                }
            }
            match lines.recv_timeout(Duration::from_millis(50)) {
                Ok(line) => {
                    let contribution = parse_publish(&line, manifest)?;
                    let v: Value = serde_json::from_str(&line).map_err(|_| "Invalid RPC".to_owned())?;
                    if let Some(id) = v["id"].as_u64() {
                        if id == 0 && !ready {
                            if v["result"]["apiVersion"] != 1 { return Err("Plugin handshake failed".into()); }
                            ready = true;
                            publish(Contributions::default(), "running");
                        } else if let Some((_, reply)) = pending.remove(&id) {
                            let value = v.get("result").cloned().ok_or_else(|| "Plugin action failed".to_owned());
                            let _ = reply.send(value);
                        }
                    } else if let Some(c) = contribution {
                        if !ready { return Err("Plugin published before initialize".into()); }
                        publish(c, "running");
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => return Err("Plugin output closed".into()),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            pending.retain(|_, (started, reply)| {
                if started.elapsed() < Duration::from_secs(15) { true } else { let _ = reply.send(Err("Plugin action timeout".into())); false }
            });
        }
        // SDK plugins can release their own resources before the job terminates stragglers.
        let _ = writer.try_send(json!({"jsonrpc":"2.0","method":"shutdown","params":{}}).to_string());
        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline {
            if child.try_wait().map_err(|e| e.to_string())?.is_some() { break; }
            thread::sleep(Duration::from_millis(10));
        }
        Ok(())
    })();
    let _ = child.kill();
    let _ = child.wait();
    result
}

fn redact(mut line: String, secrets: &[String]) -> String {
    for secret in secrets {
        for part in secret.lines().filter(|part| !part.is_empty()) { line = line.replace(part, "[redacted]"); }
    }
    line
}

pub(super) fn log_catalog(path: &Path, scope: &str, code: &str, detail: &str, secrets: &[String]) {
    let sanitized = redact(detail.to_owned(), secrets).replace(['\r', '\n'], " ");
    let line = format!("plugin {scope}: {code}: {sanitized}\n");
    eprint!("{line}");
    log_stderr(line.as_bytes(), path, &[]);
}

pub(super) fn log_stderr(output: impl Read, path: &Path, secrets: &[String]) {
    let mut reader = BufReader::new(output);
    let mut oversized = false;
    loop {
        let mut bytes = Vec::new();
        if !matches!(reader.by_ref().take(8192).read_until(b'\n', &mut bytes), Ok(n) if n > 0) { break; }
        // Never persist fragments: a credential may straddle the chunk boundary.
        let complete = bytes.last() == Some(&b'\n');
        if oversized || !complete {
            oversized = !complete;
            continue;
        }
        let line = redact(String::from_utf8_lossy(&bytes).into_owned(), secrets);
        if std::fs::metadata(path).is_ok_and(|m| m.len() > 1024 * 1024) { let _ = std::fs::remove_file(path); }
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) { let _ = file.write_all(line.as_bytes()); }
    }
}
