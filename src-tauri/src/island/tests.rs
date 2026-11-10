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
            let contains = |x, y| point_in_notch(x, y, 80.0, 0.0, width, height, radius, 0.0, CornerShape::Round);

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
                    CornerShape::Round,
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
        detached.top_attached = false;
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
                CornerShape::Round,
            )
        };
        assert!(!contains(80.0, 0.0));
        assert!(!contains(80.0 + width, 0.0));
        assert!(contains(80.0 + width / 2.0, 0.0));
        assert!(!contains(79.0, 0.0));
        detached.top_attached = true;
        assert_eq!(detached.top_corner_radius(), 0.0);
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
                CornerShape::Round,
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

#[test]
fn corner_radius_setting_scales_every_hit_test_radius() {
    let mut expanded = state(IslandMode::Expanded, 1.0, DEFAULT_EXPANDED_ISLAND_HEIGHT);
    let mut collapsed = state(IslandMode::Collapsed, 1.0, DEFAULT_EXPANDED_ISLAND_HEIGHT);
    expanded.top_attached = false;
    collapsed.top_attached = false;
    assert_eq!(expanded.bottom_corner_radius(), EXPANDED_RADIUS);
    assert_eq!(collapsed.bottom_corner_radius(), COLLAPSED_RADIUS);
    // Floating, the top corners match the bottom ones.
    assert_eq!(expanded.top_corner_radius(), EXPANDED_RADIUS);
    assert_eq!(collapsed.top_corner_radius(), COLLAPSED_RADIUS);

    expanded.corner_radius = 20.0;
    collapsed.corner_radius = 20.0;
    assert_eq!(expanded.bottom_corner_radius(), 20.0);
    assert!((collapsed.bottom_corner_radius() - 22.0 * 20.0 / 30.0).abs() < 1e-9);
    assert_eq!(expanded.top_corner_radius(), 20.0);
    assert!((collapsed.top_corner_radius() - 22.0 * 20.0 / 30.0).abs() < 1e-9);
}

#[test]
fn squircle_corners_take_the_area_css_draws_beyond_a_circle() {
    // A 100 x 60 island at the top edge with 30px bottom corners. The point sits on the
    // bottom-left corner's diagonal, 1.04 r from the corner's centre: past the circle (r),
    // inside the squircle, which meets the diagonal at 2^(1/2 - 1/n) r, about 1.067 r for
    // n = 2^1.3.
    let r = 30.0;
    let along_axis = 1.04 * r * std::f64::consts::FRAC_1_SQRT_2;
    let (x, y) = (r - along_axis, 60.0 - r + along_axis);
    let contains = |shape| point_in_notch(x, y, 0.0, 0.0, 100.0, 60.0, r, 0.0, shape);
    assert!(!contains(CornerShape::Round));
    assert!(contains(CornerShape::Squircle));
    // The very corner stays outside both.
    for shape in [CornerShape::Round, CornerShape::Squircle] {
        assert!(!point_in_notch(0.5, 59.5, 0.0, 0.0, 100.0, 60.0, r, 0.0, shape));
        assert!(point_in_notch(50.0, 59.5, 0.0, 0.0, 100.0, 60.0, r, 0.0, shape));
    }
    assert_eq!(CornerShape::from_value("squircle"), Some(CornerShape::Squircle));
    assert_eq!(CornerShape::from_value("round"), Some(CornerShape::Round));
    assert_eq!(CornerShape::from_value("bevel"), None);
}

#[test]
fn an_update_heading_where_the_slide_ends_lets_it_finish() {
    let running = Some((7, (900, 12)));
    // Opening the panel mid-slide: same place, no animation of its own.
    assert!(continues_slide(running, 7, (900, 12), false));
    // Anything else takes over: another place, an animated tuck, or a slide another
    // update (a drag, a reset) already stopped.
    assert!(!continues_slide(running, 7, (900, -24), false));
    assert!(!continues_slide(running, 7, (900, 12), true));
    assert!(!continues_slide(running, 8, (900, 12), false));
    assert!(!continues_slide(None, 7, (900, 12), false));
}

#[test]
fn the_island_follows_only_when_asked_and_only_while_collapsed() {
    use super::follow::may_move;
    use super::geometry::contains;
    assert_eq!(MonitorFollow::from_value("cursor"), Some(MonitorFollow::Cursor));
    assert_eq!(MonitorFollow::from_value("foreground"), Some(MonitorFollow::Foreground));
    assert_eq!(MonitorFollow::from_value("primary"), Some(MonitorFollow::Primary));
    assert_eq!(MonitorFollow::from_value("all"), None);
    assert_eq!(IslandWindowState::default().monitor_follow, MonitorFollow::Primary);

    // A second monitor left of the primary one, with negative coordinates.
    let left = (-1920, 0, 1920, 1080);
    assert!(contains(left, (-1, 0)) && contains(left, (-1920, 1079)));
    assert!(!contains(left, (0, 0)) && !contains(left, (-100, 1080)));

    let mut collapsed = state(IslandMode::Collapsed, 1.0, DEFAULT_EXPANDED_ISLAND_HEIGHT);
    assert!(may_move(collapsed));
    collapsed.is_tucked = true;
    assert!(may_move(collapsed), "a tucked island follows too");
    collapsed.is_dragging = true;
    assert!(!may_move(collapsed));
    assert!(!may_move(state(IslandMode::Expanded, 1.0, DEFAULT_EXPANDED_ISLAND_HEIGHT)), "an open panel stays under the pointer");
}
