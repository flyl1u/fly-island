//! Native-side island window state shared by the commands, geometry and cursor passthrough.

use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock, PoisonError};
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

    pub(super) fn corner_radius(self) -> f64 {
        match self {
            Self::Collapsed => COLLAPSED_RADIUS,
            Self::Expanded => EXPANDED_RADIUS,
        }
    }
}

/// Which monitor the island sits on (roadmap C1): the primary one, or the one the pointer or the
/// foreground window is on, moving there when that changes (follow.rs).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum MonitorFollow {
    Primary,
    Cursor,
    Foreground,
}

impl MonitorFollow {
    /// `primary`, `cursor` or `foreground`; anything else is not a choice the settings offer.
    pub(super) fn from_value(value: &str) -> Option<Self> {
        match value {
            "primary" => Some(Self::Primary),
            "cursor" => Some(Self::Cursor),
            "foreground" => Some(Self::Foreground),
            _ => None,
        }
    }
}

/// Exponent of the squircle corner: CSS superellipse(k) draws |x|^(2^k) + |y|^(2^k) = 1.
const SQUIRCLE_EXPONENT: f64 = 3.031_433_133_020_796; // 2^1.6

/// The island's corner shape from the appearance settings, as CSS draws it with `corner-shape`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum CornerShape {
    Round,
    /// Apple's continuous corner, CSS `corner-shape: superellipse(1.6)` (ISLAND_SQUIRCLE in
    /// src/features/appearance/cornerShape.ts): |x|^n + |y|^n = r^n with n = 2^1.6.
    Squircle,
}

impl CornerShape {
    /// `round` or `squircle`; anything else is not a shape the island draws.
    pub(super) fn from_value(value: &str) -> Option<Self> {
        match value {
            "round" => Some(Self::Round),
            "squircle" => Some(Self::Squircle),
            _ => None,
        }
    }

    /// Whether a point `(dx, dy)` from the corner's centre lies inside a corner of `radius`.
    pub(super) fn contains(self, dx: f64, dy: f64, radius: f64) -> bool {
        match self {
            Self::Round => dx * dx + dy * dy <= radius * radius,
            Self::Squircle => {
                dx.abs().powf(SQUIRCLE_EXPONENT) + dy.abs().powf(SQUIRCLE_EXPONENT)
                    <= radius.powf(SQUIRCLE_EXPONENT)
            }
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
    pub(super) collapsed_height: f64,
    pub(super) expanded_height: f64,
    pub(super) custom_position: Option<IslandPosition>,
    pub(super) is_dragging: bool,
    pub(super) position_locked: bool,
    pub(super) top_attached: bool,
    pub(super) glass_enabled: bool,
    pub(super) glass_intensity: f64,
    pub(super) glass_tint: (u8, u8, u8),
    /// Expanded bottom corner radius from the appearance settings. The other corner
    /// radii keep their default ratios to it, matching IslandShell.css.
    pub(super) corner_radius: f64,
    pub(super) corner_shape: CornerShape,
    pub(super) monitor_follow: MonitorFollow,
    /// A physical point on the monitor the island followed the pointer or the foreground window
    /// to; `None` on the primary monitor. A dragged position (`custom_position`) comes first.
    pub(super) followed_monitor: Option<(i32, i32)>,
}

impl IslandWindowState {
    pub(super) fn active_size(self) -> (f64, f64) {
        let (width, height) = match self.mode {
            IslandMode::Collapsed => (self.collapsed_width, self.collapsed_height),
            IslandMode::Expanded => (EXPANDED_ISLAND_WIDTH, self.expanded_height),
        };
        let scale = self.active_scale();
        (width * scale, height * scale)
    }

    pub(super) fn can_start_drag(self) -> bool {
        matches!(self.mode, IslandMode::Collapsed)
            && !self.is_tucked
            && !self.is_dragging
            && !self.position_locked
    }

    /// How much the corner radius setting enlarges or shrinks the default radii.
    fn corner_radius_factor(self) -> f64 {
        self.corner_radius / EXPANDED_RADIUS
    }

    pub(super) fn bottom_corner_radius(self) -> f64 {
        self.mode.corner_radius() * self.corner_radius_factor()
    }

    /// Flat at the top edge; away from it the island floats, rounded evenly all round
    /// (`.island--detached` in IslandShell.css).
    pub(super) fn top_corner_radius(self) -> f64 {
        if self.top_attached {
            0.0
        } else {
            self.bottom_corner_radius()
        }
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
            collapsed_height: COLLAPSED_ISLAND_HEIGHT,
            expanded_height: DEFAULT_EXPANDED_ISLAND_HEIGHT,
            custom_position: None,
            is_dragging: false,
            position_locked: false,
            top_attached: true,
            glass_enabled: false,
            glass_intensity: 72.0,
            glass_tint: (47, 47, 55),
            corner_radius: EXPANDED_RADIUS,
            // The front end's default; it reports the setting with the first interaction sync.
            corner_shape: CornerShape::Squircle,
            monitor_follow: MonitorFollow::Primary,
            followed_monitor: None,
        }
    }
}

pub(super) fn window_state() -> &'static Mutex<IslandWindowState> {
    WINDOW_STATE.get_or_init(|| Mutex::new(IslandWindowState::default()))
}

pub(super) fn mutate_window_state(
    update: impl FnOnce(&mut IslandWindowState) -> IslandWindowState,
) -> IslandWindowState {
    // The state is plain Copy values. A panic in another update leaves at worst a
    // partly applied update, which is better to keep using than to turn into a
    // panic in every later window call.
    let mut state = window_state()
        .lock()
        .unwrap_or_else(PoisonError::into_inner);
    update(&mut state)
}

pub(super) fn read_window_state() -> IslandWindowState {
    *window_state()
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
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
