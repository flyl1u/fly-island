//! Stage window size and placement: which monitor, where on it, and the tuck animation.

use std::{
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::{Duration, Instant},
};
use tauri::{LogicalSize, Monitor, PhysicalPosition, Position, Size, WebviewWindow};

use super::state::{IslandPosition, IslandWindowState};

pub(super) const STAGE_WINDOW_WIDTH: f64 = 820.0;
pub(super) const STAGE_WINDOW_HEIGHT: f64 = 460.0;
pub(super) const DEFAULT_MARGIN_Y: f64 = 0.0;
pub(super) const DEFAULT_COLLAPSED_SCALE: f64 = 0.89;
pub(super) const DEFAULT_EXPANDED_SCALE: f64 = 0.91;
pub(super) const MIN_COLLAPSED_ISLAND_WIDTH: f64 = 280.0;
pub(super) const COLLAPSED_ISLAND_WIDTH: f64 = 340.0;
pub(super) const COLLAPSED_ISLAND_HEIGHT: f64 = 38.0;
pub(super) const COLLAPSED_RADIUS: f64 = 22.0;
pub(super) const EXPANDED_ISLAND_WIDTH: f64 = 560.0;
pub(super) const DEFAULT_EXPANDED_ISLAND_HEIGHT: f64 = 306.0;
pub(super) const MIN_EXPANDED_ISLAND_HEIGHT: f64 = 220.0;
// Up to 656px: six clipboard rows (MAX_CLIPBOARD_VISIBLE_ROWS in
// src/features/appearance/settings.ts); the panel height setting stops at 546.
pub(super) const EXPANDED_ISLAND_HEIGHT_RANGE: f64 = 350.0;
pub(super) const EXPANDED_RADIUS: f64 = 30.0;
// Range of the expanded bottom radius setting; matches MIN / MAX_ISLAND_CORNER_RADIUS in
// src/features/appearance/settings.ts.
pub(super) const MIN_CORNER_RADIUS: f64 = 16.0;
pub(super) const MAX_CORNER_RADIUS: f64 = 40.0;
pub(super) const STAGE_WINDOW_PADDING_Y: f64 = 24.0;
pub(super) const TUCKED_VISIBLE_EDGE_HEIGHT: f64 = 10.0;
pub(super) const POSITION_ANIMATION_DURATION: Duration = Duration::from_millis(320);

pub(super) static POSITION_ANIMATION_GENERATION: AtomicU64 = AtomicU64::new(0);
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
    let generation = POSITION_ANIMATION_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    // Keep room for the closing animation at every supported panel scale.
    let stage_height = STAGE_WINDOW_HEIGHT
        .max((state.expanded_height * state.expanded_scale).ceil() + STAGE_WINDOW_PADDING_Y);

    resize_stage(window, LogicalSize::new(STAGE_WINDOW_WIDTH, stage_height))?;

    let current_monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?;
    let primary_monitor = window
        .primary_monitor()
        .map_err(|error| error.to_string())?;
    let custom_monitor = state
        .custom_position
        .and_then(|position| monitor_for_island_position(window, position).ok().flatten());
    let has_custom_monitor = custom_monitor.is_some();
    let monitor = custom_monitor
        .or_else(|| primary_monitor.or(current_monitor))
        .ok_or_else(|| "No monitor is available for island positioning.".to_string())?;

    let scale = monitor.scale_factor();
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let physical_width = (STAGE_WINDOW_WIDTH * scale).round() as i32;
    let physical_top_offset = (state.margin_y * scale).round() as i32;
    let tucked_top_offset =
        -((COLLAPSED_ISLAND_HEIGHT * state.collapsed_scale - TUCKED_VISIBLE_EDGE_HEIGHT).max(0.0)
            * scale)
            .round() as i32;
    let top_inset = work_area_top_inset(monitor_position.y, monitor.work_area().position.y);
    let centered_x = monitor_position.x + ((monitor_size.width as i32 - physical_width) / 2);
    let normal_y = monitor_position.y + top_inset + physical_top_offset;
    let tucked_y = monitor_position.y + top_inset + tucked_top_offset;
    let mut positioned_state = state;
    if !has_custom_monitor {
        positioned_state.custom_position = None;
    }
    let (x, y) = resolve_stage_position(positioned_state, centered_x, normal_y, tucked_y);
    super::top_edge::sync_from_stage(window, positioned_state, monitor_position.y + top_inset);

    let target = PhysicalPosition::new(x, y);
    let start = window.outer_position().map_err(|error| error.to_string())?;
    if start == target {
        return Ok(());
    }
    if !animate_position {
        return window
            .set_position(Position::Physical(target))
            .map_err(|error| error.to_string());
    }

    let window = window.clone();
    thread::spawn(move || {
        let started_at = Instant::now();
        loop {
            if POSITION_ANIMATION_GENERATION.load(Ordering::SeqCst) != generation {
                break;
            }
            let progress = (started_at.elapsed().as_secs_f64()
                / POSITION_ANIMATION_DURATION.as_secs_f64())
            .min(1.0);
            let position = interpolate_stage_position(start, target, progress);
            if let Err(error) = window.set_position(Position::Physical(position)) {
                eprintln!("Failed to animate island position: {error}");
                break;
            }
            if progress >= 1.0 {
                break;
            }
            thread::sleep(Duration::from_millis(8));
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
    if target.height >= current.height {
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

pub(super) fn monitor_for_island_position(
    window: &WebviewWindow,
    position: IslandPosition,
) -> Result<Option<Monitor>, String> {
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;

    Ok(monitors.into_iter().find(|monitor| {
        let scale = monitor.scale_factor();
        let island_center_x = position.x as f64 + STAGE_WINDOW_WIDTH * scale / 2.0;
        let island_center_y = position.y as f64 + COLLAPSED_ISLAND_HEIGHT * scale / 2.0;
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();

        island_center_x >= monitor_position.x as f64
            && island_center_x < (monitor_position.x + monitor_size.width as i32) as f64
            && island_center_y >= monitor_position.y as f64
            && island_center_y < (monitor_position.y + monitor_size.height as i32) as f64
    }))
}

// A top-docked taskbar shrinks the monitor work area instead of the monitor itself,
// so the island has to be anchored below it or the taskbar covers the island.
pub(super) fn work_area_top_inset(monitor_top: i32, work_area_top: i32) -> i32 {
    (work_area_top - monitor_top).max(0)
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
