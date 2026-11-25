//! The hover corridor of a tucked island that slides out under the cursor (B2-5).
//!
//! The tucked island sits at the screen's top edge, but its untucked place can be a dragged
//! position further down. Hovering the line slid the window down to that place, the cursor was
//! then over neither, the island retracted, the line was under the cursor again, and so on
//! forever. While a hover-caused peek lasts, the band between the line and the island (as wide
//! as the two together) counts as on the island for hover purposes only: clicks still fall
//! through it. It ends at the first real entry into the island, on leaving the band, or when
//! the island tucks again. Pure geometry plus a small tracker; the cursor loop drives it.

use super::{
    geometry::{tucked_top_offset, STAGE_WINDOW_WIDTH},
    state::IslandWindowState,
};

/// Physical screen rectangle `[left, right) x [top, bottom)`; may have negative coordinates on
/// a monitor left of or above the primary one.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Rect {
    pub(super) left: f64,
    pub(super) top: f64,
    pub(super) right: f64,
    pub(super) bottom: f64,
}

impl Rect {
    pub(super) fn contains(self, x: f64, y: f64) -> bool {
        x >= self.left && x < self.right && y >= self.top && y < self.bottom
    }
}

/// Gap smaller than this (physical px) is no gap: an island at the top has no corridor.
const MIN_GAP: f64 = 2.0;

/// The part of the tucked island the cursor can rest on, given the window's physical position.
pub(super) fn tucked_hot_rect(state: IslandWindowState, window_left: f64, window_top: f64, physical_scale: f64) -> Rect {
    let window_width = STAGE_WINDOW_WIDTH * physical_scale;
    if let Some((width, height)) = state.tuck_style.hot_zone_size() {
        let scale = state.collapsed_scale * physical_scale;
        let left = window_left + (window_width - width * scale) / 2.0;
        let top = window_top - f64::from(tucked_top_offset(state, physical_scale));
        return Rect { left, top, right: left + width * scale, bottom: top + height * scale };
    }
    // Edge: the bottom strip of the collapsed island.
    let (width, height) = state.active_size();
    let (width, height) = (width * physical_scale, height * physical_scale);
    let left = window_left + (window_width - width) / 2.0;
    let bottom = window_top + height;
    Rect { left, top: bottom - state.tuck_edge_height * physical_scale, right: left + width, bottom }
}

/// The island's own box at the window's physical position.
pub(super) fn island_rect(state: IslandWindowState, window_left: f64, window_top: f64, physical_scale: f64) -> Rect {
    let window_width = STAGE_WINDOW_WIDTH * physical_scale;
    let (width, height) = state.active_size();
    let (width, height) = (width * physical_scale, height * physical_scale);
    let left = window_left + (window_width - width) / 2.0;
    Rect { left, top: window_top, right: left + width, bottom: window_top + height }
}

/// The band from the top of the tucked line down to the island, as wide as both; `None` when
/// the island sits where the line is.
pub(super) fn corridor_rect(hot: Rect, island: Rect) -> Option<Rect> {
    if island.top - hot.top < MIN_GAP {
        return None;
    }
    Some(Rect {
        left: hot.left.min(island.left),
        top: hot.top,
        right: hot.right.max(island.right),
        bottom: island.top + MIN_GAP,
    })
}

/// Follows one hover-caused peek across the cursor loop's iterations.
#[derive(Default)]
pub(super) struct PeekCorridor {
    /// The cursor rested on the tucked island's hot zone; this is where it was.
    armed: Option<Rect>,
    active: Option<Rect>,
}

/// What the corridor decided this iteration; the loop logs the changes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum CorridorChange {
    None,
    Started,
    /// First real entry into the island: from here the normal hit test applies.
    EndedEntered,
    EndedLeft,
    EndedTucked,
}

impl PeekCorridor {
    /// Whether the cursor counts as on the island because of the corridor, and what changed.
    /// `in_shape` is the ordinary hit test result; `window` is the window's physical left/top.
    pub(super) fn observe(
        &mut self,
        state: IslandWindowState,
        window: (f64, f64),
        physical_scale: f64,
        cursor: (f64, f64),
        in_shape: bool,
    ) -> (bool, CorridorChange) {
        if state.is_tucked {
            let hot = tucked_hot_rect(state, window.0, window.1, physical_scale);
            self.armed = (in_shape && hot.contains(cursor.0, cursor.1)).then_some(hot);
            let change = if self.active.take().is_some() { CorridorChange::EndedTucked } else { CorridorChange::None };
            return (false, change);
        }
        let mut change = CorridorChange::None;
        if let Some(hot) = self.armed.take() {
            // The island has slid out under the cursor that was on the line.
            let island = island_rect(state, window.0, window.1, physical_scale);
            self.active = corridor_rect(hot, island);
            if self.active.is_some() {
                change = CorridorChange::Started;
            }
        }
        let Some(corridor) = self.active else {
            return (false, change);
        };
        if in_shape {
            self.active = None;
            return (false, CorridorChange::EndedEntered);
        }
        if corridor.contains(cursor.0, cursor.1) {
            return (true, change);
        }
        self.active = None;
        (false, CorridorChange::EndedLeft)
    }
}

impl CorridorChange {
    pub(super) fn reason(self) -> Option<&'static str> {
        match self {
            Self::None => None,
            Self::Started => Some("corridor_start"),
            Self::EndedEntered => Some("corridor_end_entered_island"),
            Self::EndedLeft => Some("corridor_end_left"),
            Self::EndedTucked => Some("corridor_end_tucked"),
        }
    }
}
