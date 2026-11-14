//! Main island window: Tauri commands, window access, and the submodules for state,
//! stage geometry, liquid glass, cursor passthrough and top-edge attachment.

pub(crate) mod focus;
mod follow;
mod geometry;
mod glass;
pub(crate) mod outside_click;
pub(crate) mod passthrough;
mod state;
pub(crate) mod top_edge;

#[cfg(test)]
mod tests;

use serde::Deserialize;
use std::{
    sync::{atomic::Ordering, PoisonError},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use geometry::{
    monitor_for_island_position, DEFAULT_EXPANDED_ISLAND_HEIGHT, EXPANDED_ISLAND_HEIGHT_RANGE,
    MAX_COLLAPSED_ISLAND_HEIGHT, MAX_COLLAPSED_ISLAND_WIDTH, MAX_CORNER_RADIUS,
    MIN_COLLAPSED_ISLAND_HEIGHT, MIN_COLLAPSED_ISLAND_WIDTH, MIN_CORNER_RADIUS,
    MIN_EXPANDED_ISLAND_HEIGHT, POSITION_ANIMATION_GENERATION,
};
use glass::{apply_glass_material, parse_hex_color};
use crate::win32;
use state::{mutate_window_state, read_window_state, window_state, CornerShape, IslandMode, MonitorFollow};

pub(crate) use geometry::apply_stage_geometry;
pub(crate) use follow::start_monitor_follow_loop;
pub(crate) use passthrough::start_cursor_passthrough_loop;
pub(crate) use state::{record_dragged_position, IslandPosition, IslandWindowState};

pub(crate) const WINDOW_LABEL: &str = "main";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IslandLayout {
    collapsed_scale: f64,
    expanded_scale: f64,
    margin_y: f64,
}

#[tauri::command]
pub fn set_island_layout(app: AppHandle, layout: IslandLayout) -> Result<(), String> {
    let window = main_window(&app)?;
    let state = mutate_window_state(|state| {
        state.collapsed_scale = layout.collapsed_scale.clamp(0.75, 1.4);
        state.expanded_scale = layout.expanded_scale.clamp(0.75, 1.4);
        state.margin_y = layout.margin_y.clamp(0.0, 160.0);
        *state
    });
    apply_stage_geometry(&window, state, false)
}

#[tauri::command]
#[expect(
    clippy::too_many_arguments,
    reason = "each argument is a named field of the set_island_interaction IPC contract"
)]
pub fn set_island_interaction(
    app: AppHandle,
    mode: String,
    collapsed_scale: f64,
    expanded_scale: f64,
    margin_y: Option<f64>,
    expanded_height: Option<f64>,
    collapsed_width: Option<f64>,
    collapsed_height: Option<f64>,
    custom_position: Option<IslandPosition>,
    is_tucked: Option<bool>,
    tuck_style: Option<String>,
    animate_position: Option<bool>,
    glass_enabled: Option<bool>,
    glass_intensity: Option<f64>,
    glass_tint: Option<String>,
    corner_radius: Option<f64>,
    corner_shape: Option<String>,
    monitor_follow: Option<String>,
    position_locked: Option<bool>,
) -> Result<String, String> {
    let window = main_window(&app)?;
    let mode = IslandMode::from_value(&mode)?;
    let previous_state = read_window_state();
    let collapsed_scale = collapsed_scale.clamp(0.75, 1.4);
    let collapsed_height = collapsed_height.filter(|height| height.is_finite())
        .map(|height| height.clamp(MIN_COLLAPSED_ISLAND_HEIGHT, MAX_COLLAPSED_ISLAND_HEIGHT))
        .unwrap_or(previous_state.collapsed_height);
    let position_state = IslandWindowState { collapsed_scale, collapsed_height, ..previous_state };
    let restored_custom_position = previous_state.custom_position.or_else(|| {
        custom_position.filter(|position| {
            monitor_for_island_position(&window, *position, position_state)
                .ok()
                .flatten()
                .is_some()
        })
    });
    let state = mutate_window_state(|state| {
        state.mode = mode;
        state.is_tucked = is_tucked.unwrap_or(false);
        state.tuck_style = state::TuckStyle::from_value(tuck_style.as_deref());
        state.position_locked = position_locked.unwrap_or(false);
        state.collapsed_scale = collapsed_scale;
        state.collapsed_height = collapsed_height;
        state.expanded_scale = expanded_scale.clamp(0.75, 1.4);
        if let Some(margin_y) = margin_y {
            state.margin_y = margin_y.clamp(0.0, 160.0);
        }
        if let Some(expanded_height) = expanded_height {
            state.expanded_height = expanded_height.clamp(
                MIN_EXPANDED_ISLAND_HEIGHT,
                DEFAULT_EXPANDED_ISLAND_HEIGHT + EXPANDED_ISLAND_HEIGHT_RANGE,
            );
        }
        if let Some(collapsed_width) = collapsed_width.filter(|width| width.is_finite()) {
            state.collapsed_width =
                collapsed_width.clamp(MIN_COLLAPSED_ISLAND_WIDTH, MAX_COLLAPSED_ISLAND_WIDTH);
        }
        if state.custom_position.is_none() {
            state.custom_position = restored_custom_position;
        }
        state.glass_enabled = glass_enabled.unwrap_or(false);
        if let Some(glass_intensity) = glass_intensity {
            state.glass_intensity = glass_intensity.clamp(25.0, 100.0);
        }
        if let Some(glass_tint) = glass_tint.as_deref().and_then(parse_hex_color) {
            state.glass_tint = glass_tint;
        }
        if let Some(corner_radius) = corner_radius {
            state.corner_radius = corner_radius.clamp(MIN_CORNER_RADIUS, MAX_CORNER_RADIUS);
        }
        if let Some(corner_shape) = corner_shape.as_deref().and_then(CornerShape::from_value) {
            state.corner_shape = corner_shape;
        }
        if let Some(monitor_follow) = monitor_follow.as_deref().and_then(MonitorFollow::from_value) {
            state.monitor_follow = monitor_follow;
        }
        *state
    });
    apply_stage_geometry(
        &window,
        state,
        animate_position.unwrap_or(true) && previous_state.is_tucked != state.is_tucked,
    )?;
    apply_glass_material(&window, state)
}

#[tauri::command]
pub fn start_island_drag(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    let current_state = read_window_state();

    if !current_state.can_start_drag() {
        return Ok(());
    }

    drag_island(window, current_state)
}

fn drag_island(window: WebviewWindow, current_state: IslandWindowState) -> Result<(), String> {
    if current_state.is_tucked || current_state.is_dragging {
        return Ok(());
    }

    let position = window.outer_position().map_err(|error| error.to_string())?;
    POSITION_ANIMATION_GENERATION.fetch_add(1, Ordering::SeqCst);
    mutate_window_state(|state| {
        state.custom_position = Some(IslandPosition {
            x: position.x,
            y: position.y,
        });
        state.is_dragging = true;
        *state
    });
    top_edge::set_attached(&window, false);

    if let Err(error) = window.start_dragging() {
        mutate_window_state(|state| {
            state.is_dragging = false;
            state.custom_position = current_state.custom_position;
            *state
        });
        return Err(error.to_string());
    }

    thread::spawn(move || {
        while win32::input::is_left_button_down() {
            thread::sleep(Duration::from_millis(8));
        }
        thread::sleep(Duration::from_millis(8));

        let final_position = window.outer_position().ok().map(|position| {
            top_edge::snap_to_top(
                &window,
                IslandPosition {
                    x: position.x,
                    y: position.y,
                },
            )
        });
        let did_finish_drag = {
            let mut state = window_state().lock().unwrap_or_else(PoisonError::into_inner);
            if !state.is_dragging {
                false
            } else {
                state.is_dragging = false;
                if let Some(position) = final_position {
                    state.custom_position = Some(position);
                }
                true
            }
        };

        if did_finish_drag {
            if let Some(position) = final_position {
                let _ = window.emit("island-position-changed", position);
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn reset_island_position(app: AppHandle) -> Result<(), String> {
    let window = main_window(&app)?;
    let state = mutate_window_state(|state| {
        state.custom_position = None;
        state.is_dragging = false;
        *state
    });

    apply_stage_geometry(&window, state, false)
}

#[tauri::command]
pub fn minimize_island(app: AppHandle) -> Result<(), String> {
    hide_island(&app);
    Ok(())
}

#[tauri::command]
pub fn show_ready_island(app: AppHandle) -> Result<(), String> {
    show_island(&app)
}

pub(crate) fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(WINDOW_LABEL)
        .ok_or_else(|| "Main island window was not found.".to_string())
}

pub(crate) fn show_island(app: &AppHandle) -> Result<(), String> {
    let window = main_window(app)?;
    apply_stage_geometry(&window, read_window_state(), false)?;
    window.show().map_err(|error| error.to_string())?;
    crate::system::window_focus::focus_window(&window)?;
    if let Ok(hwnd) = window.hwnd() {
        win32::taskbar_edge::raise_topmost(hwnd);
    }
    Ok(())
}

pub(crate) fn hide_island(app: &AppHandle) {
    POSITION_ANIMATION_GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Ok(window) = main_window(app) {
        let _ = window.hide();
    }
}

#[tauri::command]
pub fn get_island_top_attachment() -> bool {
    top_edge::is_attached()
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::island::set_island_layout,
            crate::island::set_island_interaction,
            crate::island::start_island_drag,
            crate::island::reset_island_position,
            crate::island::get_island_top_attachment,
            crate::island::show_ready_island,
            crate::island::minimize_island,
            crate::island::focus::take_island_hover_focus,
            crate::island::focus::release_island_hover_focus,
            crate::island::outside_click::set_island_outside_click_watch,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
