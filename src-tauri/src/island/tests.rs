use tauri::PhysicalPosition;

use super::geometry::*;
use super::glass::parse_hex_color;
use super::passthrough::point_in_notch;
use super::state::*;

fn state(mode: IslandMode, scale: f64, expanded_height: f64) -> IslandWindowState {
    IslandWindowState {
        mode,
        collapsed_scale: scale,
        expanded_scale: scale,
        expanded_height,
        ..IslandWindowState::default()
    }
}

#[test]
fn top_docked_taskbar_pushes_island_below_the_work_area() {
    assert_eq!(work_area_top_inset(0, 48), 48);
    assert_eq!(work_area_top_inset(0, 0), 0);
    assert_eq!(work_area_top_inset(-1080, -1080), 0);
    assert_eq!(work_area_top_inset(0, -10), 0);
}

#[test]
fn custom_position_survives_tuck_and_reveal() {
    let mut custom = state(IslandMode::Collapsed, 1.0, DEFAULT_EXPANDED_ISLAND_HEIGHT);
    custom.custom_position = Some(IslandPosition { x: 420, y: 180 });

    assert_eq!(resolve_stage_position(custom, 100, 12, -48), (420, 180));

    custom.is_tucked = true;
    assert_eq!(resolve_stage_position(custom, 100, 12, -48), (420, -48));

    custom.is_tucked = false;
    assert_eq!(resolve_stage_position(custom, 100, 12, -48), (420, 180));
}

#[test]
fn notch_has_flat_top_and_rounded_bottom_at_all_scales() {
    for scale in [0.75, DEFAULT_COLLAPSED_SCALE, 1.0, 1.4, 2.1] {
        for mode in [IslandMode::Collapsed, IslandMode::Expanded] {
            let (width, height) =
                mode.base_size(COLLAPSED_ISLAND_WIDTH, DEFAULT_EXPANDED_ISLAND_HEIGHT);
            let width = width * scale;
            let height = height * scale;
            let radius = mode.corner_radius() * scale;
            let contains = |x, y| point_in_notch(x, y, 80.0, 0.0, width, height, radius, 0.0);

            assert!(contains(80.0, 0.0));
            assert!(contains(80.0 + width, 0.0));
            assert!(contains(80.0 + width / 2.0, height));
            assert!(!contains(80.0, height));
            assert!(!contains(80.0 + width, height));
            assert!(!contains(79.0, 0.0));
            assert!(!contains(80.0 + width / 2.0, height + 1.0));
        }
    }
}

#[test]
fn default_notch_stays_at_top_when_expanding() {
    for mode in [IslandMode::Collapsed, IslandMode::Expanded] {
        let state = state(mode, 1.0, DEFAULT_EXPANDED_ISLAND_HEIGHT);
        assert_eq!(state.margin_y, 0.0);
        assert_eq!(resolve_stage_position(state, 550, 0, -28), (550, 0));
    }
}

#[test]
fn compact_messages_and_mail_reader_keep_the_correct_cursor_boundary() {
    for height in [MIN_EXPANDED_ISLAND_HEIGHT, 244.0, 438.0, 450.0] {
        for scale in [0.75, 1.0, 1.4] {
            let (width, panel_height) =
                IslandMode::Expanded.base_size(COLLAPSED_ISLAND_WIDTH, height);
            let contains = |y| {
                point_in_notch(
                    width * scale / 2.0,
                    y,
                    0.0,
                    0.0,
                    width * scale,
                    panel_height * scale,
                    EXPANDED_RADIUS * scale,
                    0.0,
                )
            };
            assert!(contains(panel_height * scale));
            assert!(!contains(panel_height * scale + 1.0));
            assert_eq!(
                IslandMode::Collapsed
                    .base_size(COLLAPSED_ISLAND_WIDTH, height)
                    .1,
                COLLAPSED_ISLAND_HEIGHT
            );
        }
        let mut positioned = state(IslandMode::Expanded, 1.0, height);
        positioned.custom_position = Some(IslandPosition { x: 420, y: 180 });
        assert_eq!(resolve_stage_position(positioned, 100, 12, -48), (420, 180));
        positioned.is_tucked = true;
        assert_eq!(resolve_stage_position(positioned, 100, 12, -48), (420, -48));
    }
}

#[test]
fn detached_island_rounds_top_corners() {
    for mode in [IslandMode::Collapsed, IslandMode::Expanded] {
        let mut detached = state(mode, 1.0, DEFAULT_EXPANDED_ISLAND_HEIGHT);
        assert_eq!(detached.top_corner_radius(), 0.0);
        detached.custom_position = Some(IslandPosition { x: 420, y: 0 });
        assert!(detached.top_corner_radius() > 0.0);
        let (width, height) =
            mode.base_size(COLLAPSED_ISLAND_WIDTH, DEFAULT_EXPANDED_ISLAND_HEIGHT);
        let contains = |x, y| {
            point_in_notch(
                x,
                y,
                80.0,
                0.0,
                width,
                height,
                mode.corner_radius(),
                detached.top_corner_radius(),
            )
        };
        assert!(!contains(80.0, 0.0));
        assert!(!contains(80.0 + width, 0.0));
        assert!(contains(80.0 + width / 2.0, 0.0));
        assert!(!contains(79.0, 0.0));
        detached.custom_position = None;
        assert_eq!(detached.top_corner_radius(), 0.0);
        detached.margin_y = 12.0;
        assert!(detached.top_corner_radius() > 0.0);
    }
}

#[test]
fn docked_island_does_not_capture_cursor_outside_its_sides() {
    for scale in [0.75, DEFAULT_COLLAPSED_SCALE, 1.0, 1.4, 2.1] {
        let width = COLLAPSED_ISLAND_WIDTH * scale;
        let contains = |x, y| {
            point_in_notch(
                x,
                y,
                80.0,
                0.0,
                width,
                COLLAPSED_ISLAND_HEIGHT * scale,
                COLLAPSED_RADIUS * scale,
                0.0,
            )
        };
        assert!(contains(80.0, 0.0));
        assert!(contains(80.0 + width, 0.0));
        for y in [0.0, 3.0 * scale, 6.0 * scale] {
            assert!(!contains(79.0, y));
            assert!(!contains(81.0 + width, y));
        }
    }
}

#[test]
fn tuck_and_reveal_move_monotonically_between_physical_positions() {
    for (start, target) in [
        (
            PhysicalPosition::new(665, 0),
            PhysicalPosition::new(665, -32),
        ),
        (
            PhysicalPosition::new(-900, -32),
            PhysicalPosition::new(-900, 270),
        ),
    ] {
        assert_eq!(interpolate_stage_position(start, target, 0.0), start);
        assert_eq!(interpolate_stage_position(start, target, 1.0), target);
        let middle = interpolate_stage_position(start, target, 0.3);
        assert_ne!(middle, start);
        assert_ne!(middle, target);
        let mut last = start;
        for frame in 1..=40 {
            let current = interpolate_stage_position(start, target, frame as f64 / 40.0);
            assert_eq!(current.x, start.x);
            if target.y < start.y {
                assert!(current.y <= last.y && current.y >= target.y);
            } else {
                assert!(current.y >= last.y && current.y <= target.y);
            }
            last = current;
        }
    }
}

#[test]
fn hex_tint_parser_rejects_invalid_values() {
    assert_eq!(parse_hex_color("#101013"), Some((16, 16, 19)));
    assert_eq!(parse_hex_color("101013"), None);
    assert_eq!(parse_hex_color("#xyzxyz"), None);
}
