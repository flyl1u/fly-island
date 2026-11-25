//! Stage window size and placement: which monitor, where on it, and the tuck animation.

use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{self, SyncSender},
        Mutex, OnceLock, PoisonError,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{LogicalSize, Monitor, PhysicalPosition, Position, Size, WebviewWindow};

use super::state::{read_window_state, IslandPosition, IslandWindowState, MonitorFollow, TuckStyle};
use crate::win32::{self, taskbar_edge::TaskbarRect};

// 720 (widest collapsed island) × 1.4 (largest collapsed scale) + room for the shoulders and shadow.
// Keep in step with COLLAPSED_WIDTH (settingsLimits.ts), STAGE_WIDTH (noticeLayout.ts) and the
// main window's width in tauri.conf.json; 4 more than a multiple of 8 keeps the island's edges on
// whole device pixels.
pub(super) const STAGE_WINDOW_WIDTH: f64 = 1100.0;
pub(super) const STAGE_WINDOW_HEIGHT: f64 = 460.0;
pub(super) const DEFAULT_MARGIN_Y: f64 = 0.0;
pub(super) const DEFAULT_COLLAPSED_SCALE: f64 = 0.89;
pub(super) const DEFAULT_EXPANDED_SCALE: f64 = 0.91;
pub(super) const MIN_COLLAPSED_ISLAND_WIDTH: f64 = 160.0;
pub(super) const MAX_COLLAPSED_ISLAND_WIDTH: f64 = 720.0;
pub(super) const COLLAPSED_ISLAND_WIDTH: f64 = 340.0;
pub(super) const COLLAPSED_ISLAND_HEIGHT: f64 = 38.0;
pub(super) const MIN_COLLAPSED_ISLAND_HEIGHT: f64 = 26.0;
pub(super) const MAX_COLLAPSED_ISLAND_HEIGHT: f64 = 60.0;
pub(super) const COLLAPSED_RADIUS: f64 = 12.0;
pub(super) const EXPANDED_ISLAND_WIDTH: f64 = 560.0;
pub(super) const DEFAULT_EXPANDED_ISLAND_HEIGHT: f64 = 306.0;
pub(super) const MIN_EXPANDED_ISLAND_HEIGHT: f64 = 220.0;
// Up to 800px. Five Agent sessions at 120% text with several usage lines pass 656px, the old
// limit; the native hit test then ended above the panel's real bottom, so its lowest rows let
// clicks through and the cursor reaching them counted as leaving the island. The panel height
// setting stops at 546.
pub(super) const EXPANDED_ISLAND_HEIGHT_RANGE: f64 = 494.0;
pub(super) const EXPANDED_RADIUS: f64 = 30.0;
// Range accepted for the expanded bottom radius; the island sends DEFAULT_ISLAND_CORNER_RADIUS
// (src/features/appearance/settingsLimits.ts).
pub(super) const MIN_CORNER_RADIUS: f64 = 8.0;
pub(super) const MAX_CORNER_RADIUS: f64 = 96.0;
// Range accepted for the collapsed bar's own radius (COLLAPSED_CORNER_RADIUS in settingsLimits.ts).
pub(super) const MIN_COLLAPSED_CORNER_RADIUS: f64 = 0.0;
pub(super) const MAX_COLLAPSED_CORNER_RADIUS: f64 = 40.0;
pub(super) const STAGE_WINDOW_PADDING_Y: f64 = 24.0;
/// The strip of the island left on screen by the "edge" tuck: 10px by default, set in
/// Settings → General (tuckEdgeHeight, src/features/appearance/settingsLimits.ts TUCK_EDGE_HEIGHT).
pub(super) const TUCKED_VISIBLE_EDGE_HEIGHT: f64 = 10.0;
pub(super) const MIN_TUCKED_EDGE_HEIGHT: f64 = 3.0;
pub(super) const MAX_TUCKED_EDGE_HEIGHT: f64 = 20.0;
pub(super) const POSITION_ANIMATION_DURATION: Duration = Duration::from_millis(320);

pub(super) static POSITION_ANIMATION_GENERATION: AtomicU64 = AtomicU64::new(0);
/// The slide in progress: its generation and where it ends.
static RUNNING_SLIDE: Mutex<Option<(u64, (i32, i32))>> = Mutex::new(None);

/// Remember the actual resting position, rather than an old drag coordinate: Windows can
/// reposition the stage on a DPI/work-area change without an island drag being in progress.
pub(super) fn remember_position_before_tuck(
    window: &WebviewWindow,
    state: IslandWindowState,
    next_is_tucked: bool,
) -> Result<Option<IslandPosition>, String> {
    if state.custom_position.is_none() || state.is_tucked || !next_is_tucked || state.is_dragging {
        return Ok(state.custom_position);
    }
    let running = *RUNNING_SLIDE.lock().unwrap_or_else(PoisonError::into_inner);
    let generation = POSITION_ANIMATION_GENERATION.load(Ordering::SeqCst);
    let observed = window.outer_position().map_err(|error| error.to_string())?;
    Ok(position_before_tuck(state, observed, running, generation))
}

pub(super) fn position_before_tuck(
    state: IslandWindowState,
    observed: PhysicalPosition<i32>,
    running: Option<(u64, (i32, i32))>,
    generation: u64,
) -> Option<IslandPosition> {
    state.custom_position?;
    // Re-tucking during a reveal must keep its normal destination, not an intermediate frame.
    let (x, y) = running.filter(|(owner, _)| *owner == generation)
        .map_or((observed.x, observed.y), |(_, target)| target);
    Some(IslandPosition { x, y })
}

/// Whether an update that does not animate should leave the running slide alone:
/// it ends where the update would put the window anyway. Jumping there instead cut
/// the slide-out short when the panel opened from a tucked island mid-slide.
pub(super) fn continues_slide(running: Option<(u64, (i32, i32))>, current_generation: u64, target: (i32, i32), animate: bool) -> bool {
    !animate && running == Some((current_generation, target))
}
/// Whether the stage is sliding between tucked and untucked positions right now. The cursor
/// loop (passthrough.rs) does not report the cursor as having left while it is true: the
/// window moves out from under a still cursor, which looked like a leave and bounced the
/// island (peek, retract, peek again). Based on a contributor patch.
pub(super) fn is_position_animating() -> bool {
    let current = POSITION_ANIMATION_GENERATION.load(Ordering::SeqCst);
    let running = *RUNNING_SLIDE.lock().unwrap_or_else(PoisonError::into_inner);
    slide_in_progress(running, current)
}

/// A slide owned by an older generation was superseded and no longer moves the window.
pub(super) fn slide_in_progress(running: Option<(u64, (i32, i32))>, current_generation: u64) -> bool {
    running.is_some_and(|(owner, _)| owner == current_generation)
}

/// Monitors Windows reports with no area or a broken scale while the topology is switching.
fn is_valid_monitor(monitor: &Monitor) -> bool {
    let size = monitor.size();
    let scale = monitor.scale_factor();
    size.width > 0 && size.height > 0 && scale.is_finite() && scale > 0.0
}

// A shorter stage waits for the island's 560ms height transition (.island in
// src/windows/island/IslandShell.css) to finish; shrinking at once would cut off the
// bottom of the island while it is still animating down from a taller page.
const STAGE_SHRINK_DELAY: Duration = Duration::from_millis(600);
static STAGE_SHRINK_GENERATION: AtomicU64 = AtomicU64::new(0);

pub(crate) fn apply_stage_geometry(
    window: &WebviewWindow,
    state: IslandWindowState,
    animate_position: bool,
) -> Result<(), String> {
    // Keep room for the closing animation at every supported panel scale.
    let stage_height = STAGE_WINDOW_HEIGHT
        .max((state.expanded_height * state.expanded_scale).ceil() + STAGE_WINDOW_PADDING_Y);

    let stage_size = LogicalSize::new(STAGE_WINDOW_WIDTH, stage_height);

    let current_monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .filter(is_valid_monitor);
    let current_monitor_bounds = current_monitor
        .as_ref()
        .map(|monitor| (*monitor.position(), *monitor.size()));
    let primary_monitor = window
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .filter(is_valid_monitor);
    let custom_monitor = state
        .custom_position
        .and_then(|position| monitor_for_island_position(window, position, state).ok().flatten());
    let has_custom_monitor = custom_monitor.is_some();
    // The monitor the island followed the pointer or the foreground window to (follow.rs).
    let followed_monitor = match state.monitor_follow {
        MonitorFollow::Primary => None,
        _ => state.followed_monitor.and_then(|point| monitor_at(window, point).ok().flatten()),
    };
    let reason = if has_custom_monitor { "custom_position" }
        else if followed_monitor.is_some() {
            match state.monitor_follow { MonitorFollow::Cursor => "follow_cursor", MonitorFollow::Foreground => "follow_foreground", MonitorFollow::Primary => "primary" }
        } else if primary_monitor.is_some() { "primary" } else { "current_fallback" };
    let Some(monitor) = custom_monitor
        .or(followed_monitor)
        .or_else(|| primary_monitor.or(current_monitor))
    else {
        // The topology is briefly empty while a display is plugged or unplugged: leave the
        // window alone until Windows finishes switching, instead of reporting an error.
        crate::app_log::event(crate::app_log::Category::Window, "stage_skipped", &[("reason", "monitor_unavailable")]);
        return Ok(());
    };

    let scale = monitor.scale_factor();
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let same_monitor = current_monitor_bounds
        .is_some_and(|(position, size)| position == *monitor_position && size == *monitor_size);
    let physical_width = (STAGE_WINDOW_WIDTH * scale).round() as i32;
    let top_inset = monitor_top_inset(&monitor);
    let centered_x = monitor_position.x + (monitor_size.width as i32 - physical_width) / 2;
    let (normal_y, tucked_y) = stage_top_positions(state, monitor_position.y, top_inset, scale);
    let mut positioned_state = state;
    if !has_custom_monitor {
        positioned_state.custom_position = None;
    }
    let (x, y) = resolve_stage_position(positioned_state, centered_x, normal_y, tucked_y);
    super::top_edge::sync_from_stage(window, positioned_state, monitor_position.y + top_inset);
    // At the very top the island overlaps app bars such as docks, which may have raised
    // themselves into the topmost band after it; take the front again. Not over a full-screen
    // game (game mode tucking the island resizes it): reordering the topmost band there is
    // what the game must not see (#73).
    let is_visible = window.is_visible().unwrap_or(false);
    if let Some(hwnd) = window.hwnd().ok().filter(|_| is_visible && !super::state::game_quiet()) {
        win32::taskbar_edge::raise_topmost(hwnd);
    }

    let running = *RUNNING_SLIDE.lock().unwrap_or_else(PoisonError::into_inner);
    if continues_slide(running, POSITION_ANIMATION_GENERATION.load(Ordering::SeqCst), (x, y), animate_position) {
        return resize_stage(window, stage_size).map_err(|error| super::diagnostics::stage_failure("resize_failed", error));
    }
    let generation = POSITION_ANIMATION_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let target = PhysicalPosition::new(x, y);
    let start = window.outer_position().map_err(|error| super::diagnostics::stage_failure("position_unavailable", error.to_string()))?;
    super::diagnostics::stage(&monitor, (x, y), stage_height, state.active_size(), top_inset, animate_position && start != target, reason);
    if start == target {
        *RUNNING_SLIDE.lock().unwrap_or_else(PoisonError::into_inner) = None;
        return resize_stage(window, stage_size).map_err(|error| super::diagnostics::stage_failure("resize_failed", error));
    }
    // Move first, then resize, when the window does not slide within one monitor: resizing
    // under the old monitor's DPI before the move made WebView2 reset its surface twice.
    // A hidden window is not animated either: nothing is seen, and the loop would only spin.
    if !animate_position || !is_visible || !same_monitor {
        *RUNNING_SLIDE.lock().unwrap_or_else(PoisonError::into_inner) = None;
        window
            .set_position(Position::Physical(target))
            .map_err(|error| super::diagnostics::stage_failure("set_position_failed", error.to_string()))?;
        return resize_stage(window, stage_size).map_err(|error| super::diagnostics::stage_failure("resize_failed", error));
    }

    resize_stage(window, stage_size).map_err(|error| super::diagnostics::stage_failure("resize_failed", error))?;
    *RUNNING_SLIDE.lock().unwrap_or_else(PoisonError::into_inner) = Some((generation, (x, y)));
    let window = window.clone();
    thread::spawn(move || {
        let started_at = Instant::now();
        loop {
            if POSITION_ANIMATION_GENERATION.load(Ordering::SeqCst) != generation
                || !window.is_visible().unwrap_or(false)
            {
                break;
            }
            let progress = (started_at.elapsed().as_secs_f64()
                / POSITION_ANIMATION_DURATION.as_secs_f64())
            .min(1.0);
            let position = interpolate_stage_position(start, target, progress);
            if let Err(error) = window.set_position(Position::Physical(position)) {
                crate::app_log::event(crate::app_log::Category::Window, "stage_failed", &[("reason", "animate_position_failed")]);
                eprintln!("Failed to animate island position: {error}");
                break;
            }
            if progress >= 1.0 {
                break;
            }
            thread::sleep(Duration::from_millis(8));
        }
        let mut running = RUNNING_SLIDE.lock().unwrap_or_else(PoisonError::into_inner);
        if running.is_some_and(|(owner, _)| owner == generation) {
            *running = None;
        }
    });
    Ok(())
}

/// Grows the stage at once, so a taller page has room from the first frame, and
/// shrinks it only after the height transition; a newer resize cancels a pending one.
fn resize_stage(window: &WebviewWindow, stage_size: LogicalSize<f64>) -> Result<(), String> {
    let generation = STAGE_SHRINK_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let current = window.inner_size().map_err(|error| error.to_string())?;
    let target = stage_size.to_physical::<u32>(scale_factor);
    if current == target {
        return Ok(());
    }
    // A width change (another monitor's DPI) is applied at once; only a pure height shrink waits.
    if target.height >= current.height || target.width != current.width {
        return window
            .set_size(Size::Logical(stage_size))
            .map_err(|error| error.to_string());
    }

    let window = window.clone();
    thread::spawn(move || {
        thread::sleep(STAGE_SHRINK_DELAY);
        if STAGE_SHRINK_GENERATION.load(Ordering::SeqCst) == generation {
            if let Err(error) = window.set_size(Size::Logical(stage_size)) {
                eprintln!("Failed to shrink island stage: {error}");
            }
        }
    });
    Ok(())
}

pub(super) fn interpolate_stage_position(
    start: PhysicalPosition<i32>,
    target: PhysicalPosition<i32>,
    progress: f64,
) -> PhysicalPosition<i32> {
    let eased = 1.0 - (1.0 - progress.clamp(0.0, 1.0)).powi(3);
    PhysicalPosition::new(
        (start.x as f64 + (target.x as f64 - start.x as f64) * eased).round() as i32,
        (start.y as f64 + (target.y as f64 - start.y as f64) * eased).round() as i32,
    )
}

pub(super) fn tucked_top_offset(state: IslandWindowState, dpi: f64) -> i32 {
    // Line morphs at the stage's top, so an attached stage never moves for it. Edge and hidden
    // slide the window up until their strip is left on screen (hidden: its 6px hot zone; the
    // user preferred that slide to a fade in place, 2026-11-13).
    if state.tuck_style == TuckStyle::Line {
        return 0;
    }
    let height = state.collapsed_height * state.collapsed_scale;
    let visible_height = state.tuck_style.hot_zone_size()
        .map_or(state.tuck_edge_height, |(_, height)| height * state.collapsed_scale);
    -((height - visible_height).max(0.0) * dpi).round() as i32
}

pub(super) fn monitor_for_island_position(
    window: &WebviewWindow,
    position: IslandPosition,
    state: IslandWindowState,
) -> Result<Option<Monitor>, String> {
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;

    Ok(monitors.into_iter().filter(is_valid_monitor).find(|monitor| {
        let scale = monitor.scale_factor();
        let island_center_x = position.x as f64 + STAGE_WINDOW_WIDTH * scale / 2.0;
        let island_center_y = position.y as f64 + state.collapsed_height * state.collapsed_scale * scale / 2.0;
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();

        island_center_x >= monitor_position.x as f64
            && island_center_x < (monitor_position.x + monitor_size.width as i32) as f64
            && island_center_y >= monitor_position.y as f64
            && island_center_y < (monitor_position.y + monitor_size.height as i32) as f64
    }))
}

/// The monitor holding the physical point `(x, y)`.
pub(super) fn monitor_at(window: &WebviewWindow, (x, y): (i32, i32)) -> Result<Option<Monitor>, String> {
    let monitors = window.available_monitors().map_err(|error| error.to_string())?;
    Ok(monitors.into_iter().filter(is_valid_monitor).find(|monitor| {
        let (position, size) = (monitor.position(), monitor.size());
        contains((position.x, position.y, size.width as i32, size.height as i32), (x, y))
    }))
}

/// Whether the rectangle `(left, top, width, height)` holds the point.
pub(super) fn contains((left, top, width, height): (i32, i32, i32, i32), (x, y): (i32, i32)) -> bool {
    x >= left && x < left + width && y >= top && y < top + height
}

const TASKBAR_REFRESH: Duration = Duration::from_secs(3);
static TASKBAR_REQUEST: OnceLock<SyncSender<()>> = OnceLock::new();
static TOP_TASKBARS: Mutex<TaskbarSnapshot> = Mutex::new(TaskbarSnapshot {
    rects: Vec::new(),
    checked_at: None,
    refreshing: false,
});

struct TaskbarSnapshot {
    rects: Vec<TaskbarRect>,
    checked_at: Option<Instant>,
    refreshing: bool,
}

/// Explorer may take seconds to answer appbar messages during sign-in. Let the island render
/// and accept input while this worker waits, then correct placement when the snapshot changes.
pub(crate) fn start_taskbar_tracking(window: WebviewWindow) {
    let (request, pending) = mpsc::sync_channel(1);
    let started = thread::Builder::new()
        .name("island-taskbar".into())
        .spawn(move || {
            while pending.recv().is_ok() {
                let mut rects = win32::taskbar_edge::top_taskbar_candidates();
                rects.sort_unstable();
                let changed = {
                    let mut current = TOP_TASKBARS.lock().unwrap_or_else(PoisonError::into_inner);
                    current.checked_at = Some(Instant::now());
                    current.refreshing = false;
                    let changed = current.rects != rects;
                    current.rects = rects;
                    changed
                };
                if !changed {
                    continue;
                }
                let stage = window.clone();
                if window.run_on_main_thread(move || {
                    let state = read_window_state();
                    if !state.is_dragging {
                        if let Err(error) = apply_stage_geometry(&stage, state, false) {
                            eprintln!("Failed to place the island after the taskbar changed: {error}");
                        }
                    }
                }).is_err() {
                    break;
                }
            }
        });
    match started {
        Ok(_) => { let _ = TASKBAR_REQUEST.set(request); }
        Err(error) => eprintln!("Failed to start island taskbar tracking: {error}"),
    }
}

/// Physical distance from the monitor top to where the island anchors: below a
/// top-docked Windows taskbar, and flush with the top otherwise. Third-party app bars
/// (MyDockFinder and other docks or menu bars) shrink the work area just the same, but
/// the island stays at the top and sits above them instead.
pub(super) fn monitor_top_inset(monitor: &Monitor) -> i32 {
    let (position, size) = (monitor.position(), monitor.size());
    let work_top = monitor.work_area().position.y;
    // A bottom or side taskbar cannot affect this position and needs no shell query.
    if work_top <= position.y {
        return 0;
    }
    let bounds = (position.x, position.y, size.width as i32, size.height as i32);
    let mut snapshot = TOP_TASKBARS.lock().unwrap_or_else(PoisonError::into_inner);
    if !snapshot.refreshing && snapshot.checked_at.is_none_or(|time| time.elapsed() >= TASKBAR_REFRESH) {
        snapshot.refreshing = TASKBAR_REQUEST.get().is_some_and(|request| request.try_send(()).is_ok());
    }
    reserved_top_inset(bounds, work_top, &snapshot.rects)
}

/// The current work area prevents a stale snapshot from reserving space after the taskbar
/// leaves the top. A third-party app bar alone never moves the island.
pub(super) fn reserved_top_inset(bounds: (i32, i32, i32, i32), work_top: i32, taskbars: &[TaskbarRect]) -> i32 {
    let top = bounds.1;
    let reserved = (work_top - top).max(0);
    anchor_top_inset(top, top_taskbar_bottom(bounds, taskbars)).min(reserved)
}

/// Bottom edge of the taskbar docked to the top of the monitor `(left, top, width, height)`,
/// out of `taskbars` given as `(left, top, right, bottom)`: a horizontal bar that starts
/// at or above the monitor top, ends in its upper half and is centred on it.
pub(super) fn top_taskbar_bottom(
    (left, top, width, height): (i32, i32, i32, i32),
    taskbars: &[TaskbarRect],
) -> Option<i32> {
    taskbars
        .iter()
        .filter(|&&(bar_left, bar_top, bar_right, bar_bottom)| {
            let center_x = bar_left + (bar_right - bar_left) / 2;
            bar_right - bar_left > bar_bottom - bar_top
                && bar_top <= top
                && bar_bottom > top
                && bar_bottom < top + height / 2
                && center_x >= left
                && center_x < left + width
        })
        .map(|&(_, _, _, bar_bottom)| bar_bottom)
        .max()
}

pub(super) fn anchor_top_inset(monitor_top: i32, taskbar_bottom: Option<i32>) -> i32 {
    taskbar_bottom.map_or(0, |bottom| (bottom - monitor_top).max(0))
}

/// Monitor/taskbar coordinates are physical; only the logical margin and tuck offset need DPI.
pub(super) fn stage_top_positions(state: IslandWindowState, monitor_top: i32, top_inset: i32, dpi: f64) -> (i32, i32) {
    let top = monitor_top + top_inset;
    (top + (state.margin_y * dpi).round() as i32, top + tucked_top_offset(state, dpi))
}

pub(super) fn resolve_stage_position(
    state: IslandWindowState,
    centered_x: i32,
    normal_y: i32,
    tucked_y: i32,
) -> (i32, i32) {
    match (state.custom_position, state.is_tucked) {
        (Some(position), true) => (position.x, tucked_y),
        (Some(position), false) => (position.x, position.y),
        (None, true) => (centered_x, tucked_y),
        (None, false) => (centered_x, normal_y),
    }
}
