//! Optional Eye Care windows. The plugin owns the clock; the host owns every webview and style.
mod model;
mod windows;

pub(crate) use model::BreakState;
pub(crate) use model::{from_publish, supports_host_windows};
use std::sync::{atomic::Ordering, PoisonError};
use tauri::{AppHandle, Manager, WebviewWindow};

pub(crate) const EVENT: &str = "eye-care-break-changed";
pub(crate) const WINDOW_PREFIX: &str = "eye-care-rest-";

pub(crate) fn init(app: &AppHandle) {
    app.manage(windows::BreakWindows::default());
}

pub(crate) fn begin_session(app: &AppHandle) -> Option<u64> {
    let state = app.try_state::<windows::BreakWindows>()?;
    let session = state.session.fetch_add(1, Ordering::AcqRel).wrapping_add(1);
    publish(app, session, None);
    Some(session)
}

pub(crate) fn end_session(app: &AppHandle) {
    let _ = begin_session(app);
}

pub(crate) fn publish(app: &AppHandle, session: u64, snapshot: Option<BreakState>) {
    let Some(state) = app.try_state::<windows::BreakWindows>() else {
        return;
    };
    if state.session.load(Ordering::Acquire) != session || !state.pending.queue(session, snapshot) {
        return;
    }
    let target = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        if let Some(state) = target.try_state::<windows::BreakWindows>() {
            if let Some((session, snapshot)) = state.pending.take() {
                if state.session.load(Ordering::Acquire) == session {
                    windows::update(&target, session, snapshot);
                }
            }
        }
    }) {
        let _ = state.pending.take();
        eprintln!("Could not schedule Eye Care windows: {error}");
    }
}

pub(crate) fn shutdown(app: &AppHandle) {
    windows::shutdown(app);
}

pub(crate) fn failure_notice(app: &AppHandle) -> Option<(&'static str, &'static str)> {
    let state = app.try_state::<windows::BreakWindows>()?;
    let state = state.runtime.lock().unwrap_or_else(PoisonError::into_inner);
    if !state.failed {
        return None;
    }
    let english = state.snapshot.as_ref()?.language == "en";
    Some(if english {
        (
            "Break windows unavailable",
            "Could not cover every display. Check WebView2 or skip this break if allowed.",
        )
    } else {
        (
            "休息窗口不可用",
            "未能覆盖全部显示器，请检查 WebView2；允许跳过时可先跳过本轮休息。",
        )
    })
}

#[tauri::command]
pub async fn get_eye_care_break(app: AppHandle, window: WebviewWindow) -> Option<BreakState> {
    let state = app.try_state::<windows::BreakWindows>()?;
    let state = state.runtime.lock().unwrap_or_else(PoisonError::into_inner);
    state
        .windows
        .contains_key(window.label())
        .then(|| state.snapshot.clone())
        .flatten()
}

#[tauri::command]
pub async fn show_eye_care_break_window(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<(), String> {
    let label = window.label().to_owned();
    if !label.starts_with(WINDOW_PREFIX) {
        return Err("Not an Eye Care window".into());
    }
    let target = app.clone();
    app.run_on_main_thread(move || windows::ready(&target, &label))
        .map_err(|error| error.to_string())
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::eye_care::get_eye_care_break,
            crate::eye_care::show_eye_care_break_window,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
