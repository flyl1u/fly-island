//! Runs one plugin process: starts it, answers its JSON-RPC requests over
//! stdio, restarts it after a crash (1 s, 5 s, 30 s; gives up after three quick
//! failures) and stops it. Plugins are expected to exit when stdin closes,
//! which also happens when the island itself exits.

use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    ffi::OsString,
    io::{BufRead, BufReader, ErrorKind, Read, Write},
    os::windows::process::CommandExt,
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex, PoisonError,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::AppHandle;

use super::{manifest::HOST_API_VERSION, permissions::method_permission, rpc};
use crate::{local_api, system::CREATE_NO_WINDOW};

const LOG_LINES: usize = 200;
const RESTART_DELAYS: [Duration; 3] = [Duration::from_secs(1), Duration::from_secs(5), Duration::from_secs(30)];
/// Running this long resets the failure count.
const HEALTHY_UPTIME: Duration = Duration::from_secs(60);
const STOP_GRACE: Duration = Duration::from_secs(2);
const MAX_LINE_BYTES: u64 = 1024 * 1024;
const MAX_IN_FLIGHT: usize = 16;
const POLL: Duration = Duration::from_millis(50);

/// Each supervisor gets a higher number, so a stopping one cannot overwrite the
/// status of the one that replaced it.
static NEXT_GENERATION: AtomicU64 = AtomicU64::new(1);

/// Mirrored by `PluginStatus` in src/features/plugins/api.ts.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeStatus {
    #[default]
    Stopped,
    Starting,
    Running,
    Restarting,
    Crashed,
}

#[derive(Debug, Clone, Default)]
pub(super) struct RuntimeInfo {
    generation: u64,
    pub status: RuntimeStatus,
    pub error: Option<String>,
    pub log: VecDeque<String>,
}

/// Status and recent log lines per plugin id, shared with the settings snapshot.
pub(super) type RuntimeTable = Arc<Mutex<HashMap<String, RuntimeInfo>>>;

pub(super) struct LaunchSpec {
    pub plugin_id: String,
    pub program: OsString,
    pub args: Vec<OsString>,
    pub dir: PathBuf,
    pub data_dir: PathBuf,
    pub granted: Vec<String>,
    pub app_version: String,
}

struct Context {
    generation: u64,
    app: AppHandle,
    spec: LaunchSpec,
    table: RuntimeTable,
    stop: AtomicBool,
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Option<Child>>,
    in_flight: AtomicUsize,
}

pub(super) struct Supervisor {
    context: Arc<Context>,
}

impl Supervisor {
    pub fn start(app: AppHandle, spec: LaunchSpec, table: RuntimeTable) -> Result<Self, String> {
        let context = Arc::new(Context {
            generation: NEXT_GENERATION.fetch_add(1, Ordering::SeqCst),
            app,
            spec,
            table,
            stop: AtomicBool::new(false),
            stdin: Mutex::new(None),
            child: Mutex::new(None),
            in_flight: AtomicUsize::new(0),
        });
        let worker = Arc::clone(&context);
        thread::Builder::new()
            .name(format!("plugin-{}", context.spec.plugin_id))
            .spawn(move || supervise(&worker))
            .map_err(|error| format!("Could not start the plugin thread: {error}"))?;
        Ok(Self { context })
    }

    pub fn notify(&self, method: &str, params: Value) -> Result<(), String> {
        write_line(&self.context, &rpc::notification_line(method, params))
    }

    /// Asks the plugin to exit (a `shutdown` notification, then stdin closes)
    /// and kills it after a short grace period. Does not wait for the
    /// supervising thread, which ends by itself.
    pub fn stop(self) {
        let context = self.context;
        context.stop.store(true, Ordering::SeqCst);
        let _ = write_line(&context, &rpc::notification_line("shutdown", json!({})));
        lock(&context.stdin).take();
        let deadline = Instant::now() + STOP_GRACE;
        loop {
            {
                let mut child = lock(&context.child);
                let Some(process) = child.as_mut() else { break };
                match process.try_wait() {
                    Ok(Some(_)) => break,
                    _ if Instant::now() >= deadline => {
                        let _ = process.kill();
                        break;
                    }
                    _ => {}
                }
            }
            thread::sleep(POLL);
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn supervise(context: &Arc<Context>) {
    let mut failures = 0;
    loop {
        if context.stop.load(Ordering::SeqCst) {
            break;
        }
        set_status(context, RuntimeStatus::Starting, None);
        let mut child = match spawn(&context.spec) {
            Ok(child) => child,
            Err(error) => {
                log_line(context, &error);
                set_status(context, RuntimeStatus::Crashed, Some(error));
                return;
            }
        };
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        *lock(&context.stdin) = child.stdin.take();
        *lock(&context.child) = Some(child);
        if context.stop.load(Ordering::SeqCst) {
            // `stop` ran while the process was starting and found no child to end.
            if let Some(process) = lock(&context.child).as_mut() {
                let _ = process.kill();
            }
            lock(&context.stdin).take();
        }
        let started = Instant::now();
        set_status(context, RuntimeStatus::Running, None);
        log_line(context, "started");
        let _ = write_line(context, &rpc::notification_line("initialize", initialize_params(&context.spec)));

        if let Some(stderr) = stderr {
            let reader = Arc::clone(context);
            let _ = thread::Builder::new().name("plugin-stderr".into()).spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    log_line(&reader, &line);
                }
            });
        }
        if let Some(stdout) = stdout {
            read_messages(context, stdout);
        }
        let exit = wait_for_exit(context);
        lock(&context.stdin).take();
        if context.stop.load(Ordering::SeqCst) {
            break;
        }
        log_line(context, &format!("stopped ({exit})"));
        if started.elapsed() >= HEALTHY_UPTIME {
            failures = 0;
        }
        let Some(delay) = RESTART_DELAYS.get(failures).copied() else {
            let message = format!("The plugin stopped {} times in a row ({exit}).", failures + 1);
            set_status(context, RuntimeStatus::Crashed, Some(message));
            return;
        };
        failures += 1;
        set_status(context, RuntimeStatus::Restarting, Some(format!("The plugin stopped ({exit}).")));
        if sleep_unless_stopped(&context.stop, delay) {
            break;
        }
    }
    set_status(context, RuntimeStatus::Stopped, None);
}

fn spawn(spec: &LaunchSpec) -> Result<Child, String> {
    std::fs::create_dir_all(&spec.data_dir)
        .map_err(|error| format!("Could not create {}: {error}", spec.data_dir.display()))?;
    Command::new(&spec.program)
        .args(&spec.args)
        .current_dir(&spec.dir)
        .env("FOCUSD_PLUGIN_ID", &spec.plugin_id)
        .env("FOCUSD_PLUGIN_DATA_DIR", &spec.data_dir)
        .env("FOCUSD_PLUGIN_API_VERSION", HOST_API_VERSION.to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| {
            if error.kind() == ErrorKind::NotFound && spec.program == "node" {
                "This plugin needs Node.js: install it so that `node` is on PATH.".to_string()
            } else {
                format!("Could not start {}: {error}", spec.program.to_string_lossy())
            }
        })
}

fn initialize_params(spec: &LaunchSpec) -> Value {
    json!({
        "apiVersion": HOST_API_VERSION,
        "appVersion": spec.app_version,
        "pluginId": spec.plugin_id,
        "dataDir": spec.data_dir.display().to_string(),
        "permissions": spec.granted,
    })
}

fn read_messages(context: &Arc<Context>, stdout: ChildStdout) {
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    loop {
        line.clear();
        match reader.by_ref().take(MAX_LINE_BYTES).read_line(&mut line) {
            Ok(0) => break,
            Ok(_) if !line.ends_with('\n') && line.len() as u64 >= MAX_LINE_BYTES => {
                log_line(context, "A message longer than 1 MB was dropped; stopping the plugin.");
                break;
            }
            Ok(_) => handle_line(context, line.trim()),
            Err(error) if error.kind() == ErrorKind::InvalidData => {
                log_line(context, "A message that is not UTF-8 was dropped.");
            }
            Err(_) => break,
        }
    }
}

fn handle_line(context: &Arc<Context>, line: &str) {
    if line.is_empty() {
        return;
    }
    match rpc::parse_line(line) {
        rpc::Incoming::Request { id, method, params } => {
            if context.in_flight.fetch_add(1, Ordering::SeqCst) >= MAX_IN_FLIGHT {
                context.in_flight.fetch_sub(1, Ordering::SeqCst);
                let busy = rpc::error_line(&id, rpc::HOST_ERROR, "Too many requests at once.", Some(json!({ "status": 429 })));
                let _ = write_line(context, &busy);
                return;
            }
            let worker = Arc::clone(context);
            let spawned = thread::Builder::new().name("plugin-request".into()).spawn(move || {
                let answer = answer_request(&worker, &id, &method, params);
                worker.in_flight.fetch_sub(1, Ordering::SeqCst);
                let _ = write_line(&worker, &answer);
            });
            if spawned.is_err() {
                context.in_flight.fetch_sub(1, Ordering::SeqCst);
            }
        }
        rpc::Incoming::Notification { method, params } => {
            if method == "log" {
                let message = params.get("message").and_then(Value::as_str).unwrap_or_default();
                log_line(context, message);
            }
        }
        rpc::Incoming::Response => {}
        rpc::Incoming::Invalid { id, code, message } => {
            log_line(context, &message);
            if !id.is_null() {
                let _ = write_line(context, &rpc::error_line(&id, code, &message, None));
            }
        }
    }
}

fn answer_request(context: &Context, id: &Value, method: &str, params: Value) -> String {
    if method == "host.info" {
        return rpc::result_line(id, initialize_params(&context.spec));
    }
    let Some((name, permission)) = method_permission(method) else {
        return rpc::error_line(id, rpc::METHOD_NOT_FOUND, &format!("Unknown method \"{method}\"."), None);
    };
    if !context.spec.granted.iter().any(|granted| granted == permission) {
        let message = format!("The plugin was not given the \"{permission}\" permission.");
        return rpc::error_line(id, rpc::PERMISSION_DENIED, &message, None);
    }
    match local_api::call_island(&context.app, name, params) {
        Ok(result) => rpc::result_line(id, result),
        Err((status, message)) => rpc::error_line(id, rpc::HOST_ERROR, &message, Some(json!({ "status": status }))),
    }
}

fn write_line(context: &Context, line: &str) -> Result<(), String> {
    let mut stdin = lock(&context.stdin);
    let pipe = stdin.as_mut().ok_or_else(|| "The plugin is not running.".to_string())?;
    pipe.write_all(line.as_bytes())
        .and_then(|()| pipe.write_all(b"\n"))
        .and_then(|()| pipe.flush())
        .map_err(|error| format!("Could not write to the plugin: {error}"))
}

/// Waits until the process has exited (after stdout closed). Returns how it ended.
fn wait_for_exit(context: &Context) -> String {
    loop {
        {
            let mut child = lock(&context.child);
            let Some(process) = child.as_mut() else {
                return "stopped".into();
            };
            match process.try_wait() {
                Ok(Some(status)) => {
                    child.take();
                    return status
                        .code()
                        .map_or_else(|| "terminated".into(), |code| format!("exit code {code}"));
                }
                Ok(None) => {}
                Err(error) => {
                    child.take();
                    return error.to_string();
                }
            }
        }
        thread::sleep(POLL);
    }
}

/// True when `stop` was set while sleeping.
fn sleep_unless_stopped(stop: &AtomicBool, delay: Duration) -> bool {
    let deadline = Instant::now() + delay;
    while Instant::now() < deadline {
        if stop.load(Ordering::SeqCst) {
            return true;
        }
        thread::sleep(POLL);
    }
    stop.load(Ordering::SeqCst)
}

/// The plugin's entry, unless a newer supervisor owns it.
fn current_entry<'a>(context: &Context, table: &'a mut HashMap<String, RuntimeInfo>) -> Option<&'a mut RuntimeInfo> {
    let info = table.entry(context.spec.plugin_id.clone()).or_default();
    if info.generation > context.generation {
        return None;
    }
    info.generation = context.generation;
    Some(info)
}

fn set_status(context: &Context, status: RuntimeStatus, error: Option<String>) {
    let mut table = lock(&context.table);
    let Some(info) = current_entry(context, &mut table) else { return };
    info.status = status;
    info.error = error;
}

fn log_line(context: &Context, line: &str) {
    let mut table = lock(&context.table);
    let Some(info) = current_entry(context, &mut table) else { return };
    let line: String = line.chars().take(500).collect();
    info.log.push_back(line);
    while info.log.len() > LOG_LINES {
        info.log.pop_front();
    }
}
