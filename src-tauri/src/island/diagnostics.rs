use std::{sync::Mutex, thread, time::Duration};

use tauri::{Monitor, WebviewWindow};

use crate::app_log::{event, Category};

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
struct Screen {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    dpi: u32,
    primary: bool,
}

impl Screen {
    fn read(monitor: &Monitor, primary: bool) -> Self {
        Self {
            x: monitor.position().x,
            y: monitor.position().y,
            width: monitor.size().width,
            height: monitor.size().height,
            dpi: (monitor.scale_factor() * 1_000.0).round() as u32,
            primary,
        }
    }

    fn bounds(&self) -> String {
        format!("{},{}:{}x{}", self.x, self.y, self.width, self.height)
    }
}

#[derive(PartialEq, Eq)]
struct Geometry {
    target: (i32, i32),
    screen: Screen,
    stage_height: u32,
    island_size: (u32, u32),
    inset: i32,
    animate: bool,
}

static LAST_GEOMETRY: Mutex<Option<Geometry>> = Mutex::new(None);

pub(super) fn stage(
    monitor: &Monitor,
    target: (i32, i32),
    stage_height: f64,
    island_size: (f64, f64),
    inset: i32,
    animate: bool,
    reason: &'static str,
) {
    let sample = Geometry {
        target,
        screen: Screen::read(monitor, false),
        stage_height: stage_height.round() as u32,
        island_size: (island_size.0.round() as u32, island_size.1.round() as u32),
        inset,
        animate,
    };
    if let Ok(mut last) = LAST_GEOMETRY.try_lock() {
        if last.as_ref() == Some(&sample) {
            return;
        }
        event(
            Category::Window,
            "apply_stage_geometry",
            &[
                ("reason", reason),
                ("monitor", &sample.screen.bounds()),
                ("scale", &format!("{:.3}", monitor.scale_factor())),
                ("target", &format!("{},{}", target.0, target.1)),
                ("stage_height", &sample.stage_height.to_string()),
                (
                    "island_size",
                    &format!("{}x{}", sample.island_size.0, sample.island_size.1),
                ),
                ("top_inset", &inset.to_string()),
                ("animate", &animate.to_string()),
            ],
        );
        *last = Some(sample);
    }
}

pub(super) fn stage_failure(reason: &'static str, error: String) -> String {
    event(Category::Window, "stage_failed", &[("reason", reason)]);
    error
}

pub(super) fn track_topology(window: WebviewWindow) {
    let _ = thread::Builder::new()
        .name("island-monitor-diagnostics".into())
        .spawn(move || {
            let mut previous: Option<Vec<Screen>> = None;
            loop {
                let Ok(monitors) = window.available_monitors() else {
                    break;
                };
                let primary = window.primary_monitor().ok().flatten();
                let mut current: Vec<_> = monitors
                    .iter()
                    .map(|monitor| {
                        Screen::read(
                            monitor,
                            primary
                                .as_ref()
                                .is_some_and(|item| item.position() == monitor.position()),
                        )
                    })
                    .collect();
                current.sort_unstable();
                if let Some(old) = previous.as_ref().filter(|old| **old != current) {
                    event(
                        Category::Window,
                        "topology",
                        &[
                            ("reason", "monitor_change"),
                            ("previous_count", &old.len().to_string()),
                            ("count", &current.len().to_string()),
                        ],
                    );
                    for screen in current.iter().take(32) {
                        event(
                            Category::Window,
                            "monitor",
                            &[
                                ("reason", "topology_snapshot"),
                                ("bounds", &screen.bounds()),
                                ("scale", &format!("{:.3}", f64::from(screen.dpi) / 1_000.0)),
                                ("primary", &screen.primary.to_string()),
                            ],
                        );
                    }
                }
                previous = Some(current);
                thread::sleep(Duration::from_secs(2));
            }
        });
}
