//! When plugin processes run (API version 2, `activationEvents`).
//!
//! Eager plugins (`onStartup`, every version 1 plugin, and version 2 plugins
//! without the field) run while the island runs. The others start when one of
//! their activation events happens: the message that woke them is queued until
//! `initialize` went out (at most READY_TIMEOUT), and they are stopped again
//! after IDLE_AFTER with nothing to do. Every TICK this also samples each
//! plugin's memory and CPU, ends plugins over the memory limit, and wakes
//! `onSchedule` and `onStartupFinished` plugins.

use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, Instant},
};

use super::{
    activation::{Activation, ActivationEvent},
    events::event_permission,
    grants::sync_processes,
    host, lock,
    runtime::{IdleState, Resources},
    sensitive, views,
};
use crate::agent_status;

const READY_TIMEOUT: Duration = Duration::from_secs(10);
pub(super) const IDLE_AFTER: Duration = Duration::from_secs(60);
const TICK: Duration = Duration::from_secs(5);
const STARTUP_FINISHED_AFTER: Duration = Duration::from_secs(10);
pub(super) const MEMORY_LIMIT_BYTES: u64 = 512 * 1024 * 1024;
const HIGH_CPU_PERCENT: f32 = 25.0;
/// A minute of TICKs above HIGH_CPU_PERCENT.
const HIGH_CPU_SAMPLES: u32 = 12;

struct CpuSample {
    at: Instant,
    ticks: u64,
    high: u32,
}

#[derive(Default)]
struct State {
    /// Plugins allowed to run now, and when they run.
    runnable: HashMap<String, Activation>,
    /// On-demand plugins started, with the event that started them.
    active: HashMap<String, String>,
    /// When each `onSchedule` plugin last ran.
    scheduled: HashMap<String, Instant>,
    cpu: HashMap<String, CpuSample>,
}

fn state() -> &'static Mutex<State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(Mutex::default)
}

/// Set by sync_processes: the plugins that may run. Forgets on-demand plugins
/// that may no longer run.
pub(super) fn set_runnable(runnable: HashMap<String, Activation>) {
    let mut state = lock(state());
    state.active.retain(|id, _| runnable.get(id).is_some_and(|activation| !activation.is_eager()));
    state.scheduled.retain(|id, _| runnable.contains_key(id));
    for id in runnable.keys() {
        state.scheduled.entry(id.clone()).or_insert_with(Instant::now);
    }
    state.runnable = runnable;
}

/// Why the plugin's process should run now (`initialize.activationEvent`), or
/// None while an on-demand plugin waits for an activation event.
pub(super) fn should_run(id: &str, activation: &Activation) -> Option<String> {
    if activation.is_eager() {
        return Some(ActivationEvent::Startup.label());
    }
    lock(state()).active.get(id).cloned()
}

pub(super) fn is_runnable(id: &str) -> bool {
    lock(state()).runnable.contains_key(id)
}

/// Plugins that may run, running or not (for shortcuts and menus, which start them).
pub(super) fn runnable_ids() -> Vec<String> {
    lock(state()).runnable.keys().cloned().collect()
}

/// Starts an on-demand plugin because of `reason` (an activation event label).
fn activate(id: &str, reason: String) -> Result<(), String> {
    {
        let mut state = lock(state());
        if !state.runnable.contains_key(id) {
            return Err("The plugin is not running.".into());
        }
        state.active.entry(id.to_string()).or_insert(reason);
    }
    sync_processes()
}

/// Sends the plugin `method` with `params`, starting it first if it starts on
/// demand. A plugin that is starting gets the message once `initialize` went out.
pub(super) fn deliver(id: &str, reason: String, method: &str, params: Value) -> Result<(), String> {
    let host = host()?;
    let running = {
        let supervisors = lock(&host.supervisors);
        match supervisors.get(id) {
            Some(supervisor) if supervisor.is_ready() => return supervisor.notify(method, params),
            Some(_) => true,
            None => false,
        }
    };
    if !running && !is_runnable(id) {
        return Err("The plugin is not running.".into());
    }
    let (id, method) = (id.to_string(), method.to_string());
    // Starting a process can take a moment; callers include Tauri commands.
    thread::Builder::new()
        .name("plugin-activate".into())
        .spawn(move || {
            if !running {
                if let Err(error) = activate(&id, reason) {
                    eprintln!("could not start plugin {id}: {error}");
                    return;
                }
            }
            notify_when_ready(&id, &method, params);
        })
        .map(|_| ())
        .map_err(|error| format!("Could not start the plugin: {error}"))
}

/// Waits (at most READY_TIMEOUT) until the plugin's process got `initialize`, then sends the message.
fn notify_when_ready(id: &str, method: &str, params: Value) {
    let deadline = Instant::now() + READY_TIMEOUT;
    loop {
        let Ok(host) = host() else { return };
        {
            let supervisors = lock(&host.supervisors);
            match supervisors.get(id) {
                Some(supervisor) if supervisor.is_ready() => {
                    let _ = supervisor.notify(method, params);
                    return;
                }
                None => return,
                Some(_) => {}
            }
        }
        if Instant::now() >= deadline {
            eprintln!("plugin {id} did not start in time; {method} was not delivered");
            return;
        }
        thread::sleep(Duration::from_millis(50));
    }
}

/// An event happened: on-demand plugins that start on it and are not running
/// are started and get it (running plugins get events they subscribed to).
pub(super) fn wake_for_event(name: &'static str, payload: &Value) {
    let Ok(host) = host() else { return };
    let waiting: Vec<String> = {
        let running = lock(&host.supervisors);
        lock(state())
            .runnable
            .iter()
            .filter(|(id, activation)| !activation.is_eager() && activation.on_event(name) && !running.contains_key(*id))
            .map(|(id, _)| id.clone())
            .collect()
    };
    for id in waiting {
        let payload = payload.clone();
        let app = host.app.clone();
        let _ = thread::Builder::new().name("plugin-event-wake".into()).spawn(move || {
            // A sensitive event still needs the user's yes before the plugin hears about it.
            if let Some((_, Some(permission))) = event_permission(name) {
                if sensitive::is_sensitive(permission) && !sensitive::check(&app, &id, permission) {
                    return;
                }
            }
            let reason = ActivationEvent::Event(name).label();
            if let Err(error) = deliver(&id, reason, "event", json!({ "name": name, "payload": payload })) {
                eprintln!("could not wake plugin {id} for {name}: {error}");
            }
        });
    }
}

/// Starts the ticker that stops idle plugins, wakes scheduled ones and samples resources.
pub(super) fn start() {
    let started = Instant::now();
    let _ = thread::Builder::new().name("plugin-lifecycle".into()).spawn(move || {
        let mut startup_finished = false;
        loop {
            thread::sleep(TICK);
            if !startup_finished && started.elapsed() >= STARTUP_FINISHED_AFTER {
                startup_finished = true;
                wake_where(|activation| activation.on_startup_finished(), |_| ActivationEvent::StartupFinished.label(), false);
            }
            tick();
        }
    });
}

/// Whether an on-demand plugin has nothing to do and can be stopped.
pub(super) fn is_idle(idle: &IdleState, activation: &Activation, view_visible: bool) -> bool {
    idle.ready
        && !idle.busy
        && !idle.keep_alive
        && !view_visible
        && idle.idle_for >= IDLE_AFTER
        // An event it listens for that would not wake it keeps it running.
        && idle.subscriptions.iter().all(|name| activation.on_event(name))
}

/// CPU use since the last sample, as a share of the whole machine.
pub(super) fn cpu_percent(ticks: u64, previous_ticks: u64, elapsed: Duration, cores: usize) -> f32 {
    let available = elapsed.as_nanos() as f64 / 100.0 * cores.max(1) as f64;
    if available <= 0.0 {
        return 0.0;
    }
    (ticks.saturating_sub(previous_ticks) as f64 / available * 100.0).clamp(0.0, 100.0) as f32
}

fn tick() {
    let Ok(host) = host() else { return };
    let cores = thread::available_parallelism().map(usize::from).unwrap_or(1);
    let now = Instant::now();
    let mut idle: Vec<String> = Vec::new();
    {
        let supervisors = lock(&host.supervisors);
        let mut state = lock(state());
        for (id, supervisor) in supervisors.iter() {
            if let Some(usage) = supervisor.usage() {
                let sample = state.cpu.entry(id.clone()).or_insert(CpuSample { at: now, ticks: usage.cpu_ticks, high: 0 });
                let percent = cpu_percent(usage.cpu_ticks, sample.ticks, now.duration_since(sample.at), cores);
                sample.high = if percent > HIGH_CPU_PERCENT { sample.high + 1 } else { 0 };
                sample.at = now;
                sample.ticks = usage.cpu_ticks;
                let resources = Resources { memory_bytes: usage.memory_bytes, cpu_percent: (percent * 10.0).round() / 10.0, high_cpu: sample.high >= HIGH_CPU_SAMPLES };
                if let Some(info) = lock(&host.runtimes).get_mut(id) {
                    info.resources = Some(resources);
                }
                if usage.memory_bytes > MEMORY_LIMIT_BYTES {
                    supervisor.fail(format!(
                        "The plugin used {} MB of memory, more than the {} MB allowed, and was stopped.",
                        usage.memory_bytes / (1024 * 1024),
                        MEMORY_LIMIT_BYTES / (1024 * 1024)
                    ));
                    continue;
                }
            }
            let Some(activation) = state.runnable.get(id) else { continue };
            if !activation.is_eager() && is_idle(&supervisor.idle_state(), activation, views::any_visible(id)) {
                idle.push(id.clone());
            }
        }
        // Scheduled plugins that are running now start their wait again.
        let running: Vec<String> = supervisors.keys().cloned().collect();
        for id in running {
            if let Some(last) = state.scheduled.get_mut(&id) {
                *last = now;
            }
        }
    }
    for id in idle {
        stop_idle(&id);
    }
    wake_where(
        |activation| activation.schedule_minutes().is_some(),
        |activation| ActivationEvent::Schedule(activation.schedule_minutes().unwrap_or_default()).label(),
        true,
    );
}

/// Starts on-demand plugins that are not running and match `wanted`; with
/// `on_schedule` only those whose `onSchedule` interval has passed.
fn wake_where(wanted: impl Fn(&Activation) -> bool, reason: impl Fn(&Activation) -> String, on_schedule: bool) {
    let Ok(host) = host() else { return };
    let now = Instant::now();
    let due: Vec<(String, String)> = {
        let running = lock(&host.supervisors);
        let mut state = lock(state());
        let mut due = Vec::new();
        let candidates: Vec<(String, Activation)> = state
            .runnable
            .iter()
            .filter(|(id, activation)| !activation.is_eager() && wanted(activation) && !running.contains_key(*id))
            .map(|(id, activation)| (id.clone(), activation.clone()))
            .collect();
        for (id, activation) in candidates {
            let last = state.scheduled.entry(id.clone()).or_insert(now);
            if on_schedule {
                let minutes = activation.schedule_minutes().unwrap_or_default();
                if now.duration_since(*last) < Duration::from_secs(u64::from(minutes) * 60) {
                    continue;
                }
            }
            *last = now;
            due.push((id, reason(&activation)));
        }
        due
    };
    for (id, reason) in due {
        if let Err(error) = activate(&id, reason) {
            eprintln!("could not start plugin {id}: {error}");
        }
    }
}

/// Stops an on-demand plugin with nothing to do; its next activation event starts it again.
fn stop_idle(id: &str) {
    let Ok(host) = host() else { return };
    lock(state()).active.remove(id);
    lock(state()).cpu.remove(id);
    let Some(supervisor) = lock(&host.supervisors).remove(id) else { return };
    let id = id.to_string();
    let _ = thread::Builder::new().name("plugin-idle-stop".into()).spawn(move || {
        supervisor.stop_idle();
        agent_status::clear_external_owner(&id);
    });
}
