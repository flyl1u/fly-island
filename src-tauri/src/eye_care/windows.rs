use super::{BreakState, EVENT, WINDOW_PREFIX};
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, PoisonError,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
};

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct Screen {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale: u64,
}

pub(super) struct Runtime {
    pub snapshot: Option<BreakState>,
    pub windows: BTreeMap<String, bool>,
    pub failed: bool,
    layout: Vec<Screen>,
    closing: bool,
    serial: u64,
    attempts: u8,
    retry_at: Instant,
    loading_at: Option<Instant>,
    session: u64,
}

impl Default for Runtime {
    fn default() -> Self {
        Self {
            snapshot: None,
            windows: BTreeMap::new(),
            failed: false,
            layout: Vec::new(),
            closing: false,
            serial: 0,
            attempts: 0,
            retry_at: Instant::now(),
            loading_at: None,
            session: 0,
        }
    }
}

#[derive(Default)]
pub(super) struct BreakWindows {
    pub runtime: Mutex<Runtime>,
    generation: Arc<AtomicU64>,
    pub session: AtomicU64,
    pub pending: super::model::PendingBreak,
}

fn destroy(app: &AppHandle, runtime: &mut Runtime) {
    let windows = std::mem::take(&mut runtime.windows);
    runtime.loading_at = None;
    for label in windows.keys() {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.hide();
            let _ = window.destroy();
        }
    }
}

fn screens(app: &AppHandle) -> Result<Vec<Screen>, String> {
    let mut result: Vec<_> = app
        .available_monitors()
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|monitor| Screen {
            x: monitor.position().x,
            y: monitor.position().y,
            width: monitor.size().width,
            height: monitor.size().height,
            scale: monitor.scale_factor().to_bits(),
        })
        .filter(|screen| screen.width > 0 && screen.height > 0)
        .collect();
    result.sort();
    result.dedup();
    if result.is_empty() || result.len() > 16 {
        return Err("Unsupported display layout".into());
    }
    Ok(result)
}

fn handles(
    app: &AppHandle,
    runtime: &Runtime,
) -> Result<Vec<windows::Win32::Foundation::HWND>, String> {
    runtime
        .windows
        .keys()
        .map(|label| {
            app.get_webview_window(label)
                .ok_or_else(|| "Rest window disappeared".to_owned())?
                .hwnd()
                .map_err(|error| error.to_string())
        })
        .collect()
}

fn create(app: &AppHandle, runtime: &mut Runtime) -> Result<(), String> {
    runtime.serial = runtime.serial.saturating_add(1);
    runtime.loading_at = Some(Instant::now());
    let title = if runtime
        .snapshot
        .as_ref()
        .is_some_and(|snapshot| snapshot.language == "en")
    {
        "fly-island · Eye Care"
    } else {
        "fly-island · 护眼提醒"
    };
    for (index, screen) in runtime.layout.iter().enumerate() {
        let label = format!("{WINDOW_PREFIX}{}-{index}", runtime.serial);
        let window = WebviewWindowBuilder::new(
            app,
            &label,
            WebviewUrl::App("index.html?window=eye-care".into()),
        )
        .title(title)
        .visible(false)
        .focused(false)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .transparent(true)
        .shadow(false)
        .build()
        .map_err(|error| error.to_string())?;
        // Record ownership before any fallible operation so partial creation can be rolled back.
        runtime.windows.insert(label, false);
        window.on_window_event(|event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
            }
        });
        window
            .set_position(PhysicalPosition::new(screen.x, screen.y))
            .map_err(|error| error.to_string())?;
        window
            .set_size(PhysicalSize::new(screen.width, screen.height))
            .map_err(|error| error.to_string())?;
    }
    let windows = handles(app, runtime)?;
    crate::win32::eye_care::protect_all(&windows)
}

fn fail(app: &AppHandle, runtime: &mut Runtime, error: &str) {
    destroy(app, runtime);
    runtime.failed = true;
    runtime.retry_at = Instant::now() + Duration::from_secs(5);
    eprintln!("Eye Care windows: {error}");
}

fn reconcile(app: &AppHandle, runtime: &mut Runtime) {
    if runtime.snapshot.is_none() || runtime.closing {
        destroy(app, runtime);
        runtime.failed = false;
        runtime.layout.clear();
        runtime.attempts = 0;
        return;
    }
    if runtime
        .loading_at
        .is_some_and(|at| at.elapsed() >= Duration::from_secs(8))
    {
        fail(app, runtime, "Rest webviews did not become ready");
    }
    let layout = match screens(app) {
        Ok(layout) => layout,
        Err(error) => {
            if !runtime.failed {
                fail(app, runtime, &error);
            }
            return;
        }
    };
    if layout != runtime.layout {
        destroy(app, runtime);
        runtime.layout = layout;
        runtime.attempts = 0;
        runtime.retry_at = Instant::now();
    }
    if runtime
        .windows
        .keys()
        .any(|label| app.get_webview_window(label).is_none())
    {
        fail(app, runtime, "A rest window was lost");
    }
    if runtime.windows.is_empty() && runtime.attempts < 3 && Instant::now() >= runtime.retry_at {
        runtime.attempts += 1;
        if let Err(error) = create(app, runtime) {
            fail(app, runtime, &error);
        }
    }
    if !runtime.windows.is_empty() && runtime.windows.values().all(|ready| *ready) {
        if let Err(error) = handles(app, runtime)
            .and_then(|windows| crate::win32::eye_care::maintain_order(&windows))
        {
            fail(app, runtime, &error);
        }
    }
}

fn notify(app: &AppHandle, snapshot: &Option<BreakState>, error_changed: bool) {
    let _ = app.emit(EVENT, snapshot);
    if error_changed {
        let _ = app.emit(crate::plugin_host::EVENT, ());
    }
}

pub(super) fn update(app: &AppHandle, session: u64, snapshot: Option<BreakState>) {
    let Some(state) = app.try_state::<BreakWindows>() else {
        return;
    };
    let mut runtime = state.runtime.lock().unwrap_or_else(PoisonError::into_inner);
    if runtime.closing {
        return;
    }
    if runtime.session != session {
        state.generation.fetch_add(1, Ordering::AcqRel);
        destroy(app, &mut runtime);
        runtime.snapshot = None;
        runtime.session = session;
    }
    let was_active = runtime.snapshot.is_some();
    let before_error = runtime.failed;
    runtime.snapshot = snapshot;
    if !was_active && runtime.snapshot.is_some() {
        runtime.attempts = 0;
        runtime.retry_at = Instant::now();
    }
    reconcile(app, &mut runtime);
    let start_watcher = !was_active && runtime.snapshot.is_some();
    if runtime.snapshot.is_none() {
        state.generation.fetch_add(1, Ordering::AcqRel);
    }
    let snapshot = runtime.snapshot.clone();
    let error_changed = before_error != runtime.failed;
    drop(runtime);
    notify(app, &snapshot, error_changed);
    if start_watcher {
        let generation = state
            .generation
            .fetch_add(1, Ordering::AcqRel)
            .wrapping_add(1);
        watch(app.clone(), Arc::clone(&state.generation), generation);
    }
}

/// Only runs during a break. At most one queued UI tick survives a busy webview/main thread.
fn watch(app: AppHandle, generation: Arc<AtomicU64>, expected: u64) {
    thread::spawn(move || {
        let pending = Arc::new(AtomicBool::new(false));
        while generation.load(Ordering::Acquire) == expected {
            thread::sleep(Duration::from_secs(1));
            if generation.load(Ordering::Acquire) != expected {
                break;
            }
            if pending.swap(true, Ordering::AcqRel) {
                continue;
            }
            let (target, token, pending) =
                (app.clone(), Arc::clone(&generation), Arc::clone(&pending));
            if app
                .run_on_main_thread(move || {
                    if token.load(Ordering::Acquire) == expected {
                        refresh(&target);
                    }
                    pending.store(false, Ordering::Release);
                })
                .is_err()
            {
                break;
            }
        }
    });
}

fn refresh(app: &AppHandle) {
    let Some(state) = app.try_state::<BreakWindows>() else {
        return;
    };
    let mut runtime = state.runtime.lock().unwrap_or_else(PoisonError::into_inner);
    let before = runtime.failed;
    reconcile(app, &mut runtime);
    let changed = before != runtime.failed;
    let snapshot = runtime.snapshot.clone();
    drop(runtime);
    if changed {
        notify(app, &snapshot, true);
    }
}

pub(super) fn ready(app: &AppHandle, label: &str) {
    let Some(state) = app.try_state::<BreakWindows>() else {
        return;
    };
    let mut runtime = state.runtime.lock().unwrap_or_else(PoisonError::into_inner);
    if runtime.snapshot.is_none() || runtime.closing {
        return;
    }
    let Some(ready) = runtime.windows.get_mut(label) else {
        return;
    };
    *ready = true;
    if runtime.windows.values().all(|ready| *ready) {
        let before_error = runtime.failed;
        match handles(app, &runtime).and_then(|windows| crate::win32::eye_care::reveal(&windows)) {
            Ok(()) => {
                runtime.failed = false;
                runtime.loading_at = None;
            }
            Err(error) => fail(app, &mut runtime, &error),
        }
        let snapshot = runtime.snapshot.clone();
        let changed = before_error != runtime.failed;
        drop(runtime);
        if changed {
            notify(app, &snapshot, true);
        }
    }
}

pub(super) fn shutdown(app: &AppHandle) {
    let Some(state) = app.try_state::<BreakWindows>() else {
        return;
    };
    state.generation.fetch_add(1, Ordering::AcqRel);
    let mut runtime = state.runtime.lock().unwrap_or_else(PoisonError::into_inner);
    runtime.closing = true;
    runtime.snapshot = None;
    destroy(app, &mut runtime);
}
