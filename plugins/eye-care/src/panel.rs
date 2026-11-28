//! Host-rendered island panel; a break counts up, and a held timer or a finished round publishes
//! a fixed duration the host draws as it is, never a moving clock.
use crate::{Phase, Settings, Shared};
use fly_island_plugin_sdk::{json, now, Value};
use std::time::Instant;

pub fn unsupported(settings: &Settings) -> Value {
    json!({"panel": {"headline": settings.text("请更新配套宿主", "Update the companion host"),
        "note": settings.text("此版本需要支持护眼休息窗口的宿主，请同时更新宿主与插件", "This version needs host-rendered Eye Care windows. Update both the host and plugin"),
        "rows": [], "actions": [], "islandActions": [], "attention": false}})
}

pub fn snapshot(shared: &Shared) -> Value {
    snapshot_at(shared, Instant::now())
}

/// The same panel as of `at`; the tests read a future instant without waiting for it.
pub(crate) fn snapshot_at(shared: &Shared, at: Instant) -> Value {
    let settings = &shared.settings;
    let t = |zh, en| settings.text(zh, en);
    let remaining = shared.clock.remaining(at);
    let paused = shared.clock.paused();
    let overdue = shared.clock.phase() == Phase::Overdue;
    let resting = shared.clock.phase() == Phase::Resting;
    let done = shared.clock.rest_done(at);
    let postponed = shared.clock.postponed();
    // A break counts the rest up, so its bar fills as the break runs; everything else shows what
    // is left — a held timer keeps a full bar, and a round whose time is up stays full.
    let percent = if resting {
        100.0 - shared.clock.percent_remaining(at)
    } else {
        shared.clock.percent_remaining(at)
    };
    // A running timer names the span it moves over, so the host can step the bar with the very
    // second its digits show instead of waiting for the next publish.
    let total = if resting {
        Some(shared.settings.rest())
    } else if paused || overdue {
        None
    } else {
        Some(shared.settings.period())
    }
    .map(|value| i64::try_from(value.as_millis()).unwrap_or(i64::MAX));
    let headline = if overdue {
        t("休息时间到", "Break time")
    } else if done {
        t("休息完成", "Break complete")
    } else if resting {
        t("休息中", "Resting")
    } else if shared.idle {
        t("空闲中", "Idle")
    } else {
        t("用眼中", "Screen time")
    };
    let note = if !resting && !overdue && postponed {
        t(
            "已经推迟过一次，不能推迟下次休息",
            "Already postponed once; the next break cannot be postponed",
        )
    } else {
        ""
    };
    let deadline = (!paused && !overdue && !resting)
        .then(|| now().saturating_add(i64::try_from(remaining.as_millis()).unwrap_or(i64::MAX)));
    // A held timer has no deadline to tick, so it publishes the time it has left; a round whose
    // time is up publishes the screen time it reached. Both stay put until the user acts.
    let duration = if overdue {
        Some(shared.clock.accumulated(at))
    } else if paused {
        Some(remaining)
    } else {
        None
    }
    .map(|value| i64::try_from(value.as_millis()).unwrap_or(i64::MAX));
    // The break counts up from the moment it began, so the host ticks it without a publish a second.
    let count_up = resting.then(|| shared.clock.rest_started_ms());
    let mut actions = Vec::new();
    if overdue {
        actions.push("defer_break");
        actions.push("finish_break");
    } else if resting {
        // A completed break has nothing left to offer: the screens wait for the user to return.
        if !done {
            if shared.clock.can_snooze() {
                actions.push("snooze_10");
            }
            if settings.allow_skip {
                actions.push("skip");
            }
        }
    } else {
        actions.push("reset_work");
        actions.push("rest_now");
    }
    // The page offers the phase actions only; postpone and skip belong to the break window.
    let island_actions = if resting { Vec::new() } else { actions.clone() };
    let (title, tone) = if overdue {
        (t("累计用眼时长", "Total screen time"), "warning")
    } else if resting {
        (t("已休息时长", "Break time elapsed"), "warning")
    } else {
        (t("剩余用眼时长", "Screen time remaining"), "normal")
    };
    json!({"panel": {
        "headline": headline, "note": note, "done": done,
        "rows": [{"id":"timer", "title": title, "detail": "", "percent": percent,
            "countdownTo": deadline, "countUpFrom": count_up, "durationMs": duration,
            "totalMs": total, "tone": tone}],
        "actions": actions,
        "islandActions": island_actions,
        "attention": resting || overdue
    }})
}
#[cfg(test)]
#[path = "panel_tests.rs"]
mod tests;
