use tauri::PhysicalPosition;

use super::geometry::*;
use super::glass::parse_hex_color;
use super::passthrough::{point_in_island, point_in_notch};
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
fn window_drag_requires_an_unlocked_collapsed_island() {
    let mut island = IslandWindowState::default();
    assert!(island.can_start_drag());
    island.position_locked = true;
    assert!(!island.can_start_drag());
    island.mode = IslandMode::Expanded;
    assert!(!island.can_start_drag());
    island.position_locked = false;
    assert!(!island.can_start_drag());
    island.mode = IslandMode::Collapsed;
    assert!(island.can_start_drag());
    island.is_tucked = true;
    assert!(!island.can_start_drag());
    island.is_tucked = false;
    island.is_dragging = true;
    assert!(!island.can_start_drag());
}

#[test]
fn top_docked_taskbar_pushes_island_below_the_work_area() {
    let monitor = (0, 0, 1920, 1080);
    assert_eq!(anchor_top_inset(0, top_taskbar_bottom(monitor, &[(0, 0, 1920, 48)])), 48);
    assert_eq!(anchor_top_inset(0, None), 0);
    assert_eq!(anchor_top_inset(-1080, Some(-1080)), 0);
    assert_eq!(anchor_top_inset(0, Some(-10)), 0);
    // A second monitor above the primary one, with its own top taskbar.
    let upper = (0, -1080, 1920, 1080);
    assert_eq!(anchor_top_inset(-1080, top_taskbar_bottom(upper, &[(0, -1080, 1920, -1032)])), 48);
}

#[test]
fn only_windows_taskbars_push_the_island_down() {
    let monitor = (0, 0, 1920, 1080);
    // A third-party app bar (MyDockFinder) never shows up among the taskbars, however
    // much of the work area it takes, so the island stays at the top.
    assert_eq!(anchor_top_inset(0, top_taskbar_bottom(monitor, &[])), 0);
    // Taskbars on the bottom or a side, or on another monitor, do not count.
    let others = [(0, 1032, 1920, 1080), (0, 0, 48, 1080), (1920, 0, 3840, 48), (-1920, 0, 0, 48)];
    assert_eq!(top_taskbar_bottom(monitor, &others), None);
    assert_eq!(top_taskbar_bottom((1920, 0, 1920, 1080), &others), Some(48));
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
            let (width, height) = state(mode, scale, DEFAULT_EXPANDED_ISLAND_HEIGHT).active_size();
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
            let (width, panel_height) = state(IslandMode::Expanded, scale, height).active_size();
            let contains = |y| {
                point_in_notch(
                    width / 2.0,
                    y,
                    0.0,
                    0.0,
                    width,
                    panel_height,
                    EXPANDED_RADIUS * scale,
                    0.0,
                    CornerShape::Round,
                )
            };
            assert!(contains(panel_height));
            assert!(!contains(panel_height + 1.0));
            assert_eq!(
                state(IslandMode::Collapsed, scale, height).active_size().1,
                COLLAPSED_ISLAND_HEIGHT * scale,
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
        let (width, height) = detached.active_size();
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
fn custom_notch_dimensions_apply_to_hit_test_and_tuck_at_each_dpi() {
    let mut island = IslandWindowState {
        collapsed_width: 240.0,
        collapsed_height: 60.0,
        ..state(IslandMode::Collapsed, 1.25, DEFAULT_EXPANDED_ISLAND_HEIGHT)
    };
    let (width, height) = island.active_size();
    assert_eq!((width, height), (300.0, 75.0));
    for dpi in [1.0, 1.25, 1.5, 2.0] {
        let visible = height * dpi + f64::from(tucked_top_offset(island, dpi));
        assert!((visible - 10.0 * dpi).abs() <= 0.5);
        let hit = |x, y| point_in_notch(
            x, y, 0.0, 0.0, width * dpi, height * dpi,
            island.bottom_corner_radius() * island.active_scale() * dpi, 0.0, island.corner_shape,
        );
        assert!(hit(width * dpi / 2.0, height * dpi - 1.0));
        assert!(!hit(width * dpi / 2.0, height * dpi + 1.0));
        assert!(!hit(width * dpi + 1.0, 1.0));
    }
    island.mode = IslandMode::Expanded;
    assert_eq!(island.active_size(), (560.0 * 1.25, DEFAULT_EXPANDED_ISLAND_HEIGHT * 1.25));
}

#[test]
fn tucked_styles_keep_their_visible_height_and_only_capture_their_hot_zone() {
    assert_eq!(TuckStyle::from_value(None), TuckStyle::Edge);
    assert_eq!(TuckStyle::from_value(Some("invalid")), TuckStyle::Edge);
    for (name, style, zone_width, zone_height) in [
        ("edge", TuckStyle::Edge, 340.0, 10.0),
        ("line", TuckStyle::Line, 140.0, 14.0),
        ("hidden", TuckStyle::Hidden, 160.0, 6.0),
    ] {
        assert_eq!(TuckStyle::from_value(Some(name)), style);
        for dpi in [1.0, 1.25, 1.5] {
            for scale in [0.75, 1.0, 1.4] {
                for height in [32.0, 38.0, 60.0] {
                    let island = IslandWindowState {
                        is_tucked: true, tuck_style: style, collapsed_height: height,
                        ..state(IslandMode::Collapsed, scale, DEFAULT_EXPANDED_ISLAND_HEIGHT)
                    };
                    let offset = tucked_top_offset(island, dpi);
                    let visible = if style == TuckStyle::Edge { 10.0 } else { zone_height * scale };
                    assert_eq!(offset, if style == TuckStyle::Edge { -((height * scale - visible) * dpi).round() as i32 } else { 0 });
                    let center = STAGE_WINDOW_WIDTH * dpi / 2.0;
                    let top = -f64::from(offset);
                    let hit = |x, y| point_in_island(island, dpi, x, y);
                    assert!(hit(center, top + visible * dpi / 2.0));
                    assert!(!hit(center + zone_width * scale * dpi / 2.0 + 1.0, top + 1.0));
                    assert!(!hit(center, top + visible * dpi + 1.0));
                    if style != TuckStyle::Edge {
                        assert!(hit(center, top));
                        assert!(!hit(center, top - 1.0));
                        assert!(!hit(center + 100.0 * scale * dpi, top + 1.0));
                    }
                    // Styles never narrow the ordinary collapsed or expanded island.
                    for mode in [IslandMode::Collapsed, IslandMode::Expanded] {
                        let out = IslandWindowState { mode, is_tucked: false, ..island };
                        assert!(point_in_island(out, dpi, center + 100.0 * scale * dpi, 2.0));
                    }
                }
            }
        }
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
    assert!((collapsed.bottom_corner_radius() - COLLAPSED_RADIUS * 20.0 / 30.0).abs() < 1e-9);
    assert_eq!(expanded.top_corner_radius(), 20.0);
    assert!((collapsed.top_corner_radius() - COLLAPSED_RADIUS * 20.0 / 30.0).abs() < 1e-9);
}

#[test]
fn squircle_corners_take_the_area_css_draws_beyond_a_circle() {
    // A 100 x 60 island at the top edge with 30px bottom corners. The point sits on the
    // bottom-left corner's diagonal, 1.08 r from the corner's centre: past the circle (r),
    // inside the squircle, which meets the diagonal at 2^(1/2 - 1/n) r, about 1.125 r for
    // n = 2^1.6.
    let r = 30.0;
    let along_axis = 1.08 * r * std::f64::consts::FRAC_1_SQRT_2;
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

#[test]
fn morphing_tucks_anchor_to_each_work_area_and_restore_floating_positions() {
    for style in [TuckStyle::Line, TuckStyle::Hidden] {
        for top in [-1080, 0, 48] {
            let mut island = IslandWindowState { tuck_style: style, ..IslandWindowState::default() };
            let normal = resolve_stage_position(island, -900, top, top);
            island.is_tucked = true;
            assert_eq!(tucked_top_offset(island, 1.5), 0);
            assert_eq!(resolve_stage_position(island, -900, top, top), normal);
            island.custom_position = Some(IslandPosition { x: -500, y: top + 180 });
            assert_eq!(resolve_stage_position(island, -900, top, top), (-500, top));
            island.is_tucked = false;
            for mode in [IslandMode::Collapsed, IslandMode::Expanded] {
                island.mode = mode;
                assert_eq!(resolve_stage_position(island, -900, top, top), (-500, top + 180));
            }
        }
    }
}
