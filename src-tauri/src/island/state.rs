//! Native-side island window state shared by the commands, geometry and cursor passthrough.

use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use tauri::PhysicalPosition;

use super::geometry::{
    COLLAPSED_ISLAND_HEIGHT, COLLAPSED_ISLAND_WIDTH, COLLAPSED_RADIUS, DEFAULT_COLLAPSED_SCALE,
    DEFAULT_EXPANDED_ISLAND_HEIGHT, DEFAULT_EXPANDED_SCALE, DEFAULT_MARGIN_Y,
    EXPANDED_ISLAND_WIDTH, EXPANDED_RADIUS,
};

pub(super) static WINDOW_STATE: OnceLock<Mutex<IslandWindowState>> = OnceLock::new();

#[derive(Clone, Copy)]
pub(crate) enum IslandMode {
    Collapsed,
    Expanded,
}

impl IslandMode {
    pub(super) fn from_value(value: &str) -> Result<Self, String> {
        match value {
            "collapsed" => Ok(Self::Collapsed),
            "expanded" => Ok(Self::Expanded),
            _ => Err(format!("Unsupported island mode: {value}")),
        }
    }

    pub(super) fn base_size(self, collapsed_width: f64, expanded_height: f64) -> (f64, f64) {
        match self {
            Self::Collapsed => (collapsed_width, COLLAPSED_ISLAND_HEIGHT),
            Self::Expanded => (EXPANDED_ISLAND_WIDTH, expanded_height),
        }
    }

    pub(super) fn corner_radius(self) -> f64 {
        match self {
            Self::Collapsed => COLLAPSED_RADIUS,
            Self::Expanded => EXPANDED_RADIUS,
        }
    }
}

#[derive(Clone, Copy)]
pub(crate) struct IslandWindowState {
    pub(super) mode: IslandMode,
    pub(super) is_tucked: bool,
    pub(super) collapsed_scale: f64,
    pub(super) expanded_scale: f64,
    pub(super) margin_y: f64,
    pub(super) collapsed_width: f64,
    pub(super) expanded_height: f64,
    pub(super) custom_position: Option<IslandPosition>,
    pub(super) is_dragging: bool,
    pub(super) top_attached: bool,
    pub(super) glass_enabled: bool,
    pub(super) glass_intensity: f64,
    pub(super) glass_tint: (u8, u8, u8),
    /// Expanded bottom corner radius from the appearance settings. The other corner
    /// radii keep their default ratios to it, matching IslandShell.css.
    pub(super) corner_radius: f64,
}

impl IslandWindowState {
    /// How much the corner radius setting enlarges or shrinks the default radii.
    fn corner_radius_factor(self) -> f64 {
        self.corner_radius / EXPANDED_RADIUS
    }

    pub(super) fn bottom_corner_radius(self) -> f64 {
        self.mode.corner_radius() * self.corner_radius_factor()
    }

    pub(super) fn top_corner_radius(self) -> f64 {
        let radius = match (self.top_attached, self.mode) {
            (true, _) => 0.0,
            (false, IslandMode::Collapsed) => 14.0,
            (false, IslandMode::Expanded) => 22.0,
        };
        radius * self.corner_radius_factor()
    }

    pub(super) fn active_scale(self) -> f64 {
        match self.mode {
            IslandMode::Collapsed => self.collapsed_scale,
            IslandMode::Expanded => self.expanded_scale,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub struct IslandPosition {
    pub(super) x: i32,
    pub(super) y: i32,
}

impl Default for IslandWindowState {
    fn default() -> Self {
        Self {
            mode: IslandMode::Collapsed,
            is_tucked: false,
            collapsed_scale: DEFAULT_COLLAPSED_SCALE,
            expanded_scale: DEFAULT_EXPANDED_SCALE,
            margin_y: DEFAULT_MARGIN_Y,
            collapsed_width: COLLAPSED_ISLAND_WIDTH,
            expanded_height: DEFAULT_EXPANDED_ISLAND_HEIGHT,
            custom_position: None,
            is_dragging: false,
            top_attached: true,
            glass_enabled: false,
            glass_intensity: 72.0,
            glass_tint: (47, 47, 55),
            corner_radius: EXPANDED_RADIUS,
        }
    }
}

pub(super) fn window_state() -> &'static Mutex<IslandWindowState> {
    WINDOW_STATE.get_or_init(|| Mutex::new(IslandWindowState::default()))
}

pub(super) fn mutate_window_state(
    update: impl FnOnce(&mut IslandWindowState) -> IslandWindowState,
) -> IslandWindowState {
    let mut state = window_state().lock().expect("window state poisoned");
    update(&mut state)
}

pub(super) fn read_window_state() -> IslandWindowState {
    *window_state().lock().expect("window state poisoned")
}

pub(crate) fn record_dragged_position(position: PhysicalPosition<i32>) {
    mutate_window_state(|state| {
        if state.is_dragging && !state.is_tucked {
            state.custom_position = Some(IslandPosition {
                x: position.x,
                y: position.y,
            });
        }
        *state
    });
}
