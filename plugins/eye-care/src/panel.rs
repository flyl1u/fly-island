//! Host-rendered island panel; a held timer and a finished round publish a fixed duration the
//! host draws as it is, never a moving clock.
use crate::{Phase, Settings, Shared};
use fly_island_plugin_sdk::{json, now, Value};
use std::time::Instant;

pub fn unsupported(settings: &Settings) -> Value {
    json!({"panel": {"headline": settings.text("请更新配套宿主", "Update the companion host"),
        "note": settings.text("此版本需要支持护眼休息窗口的宿主，请同时更新宿主与插件", "This version needs host-rendered Eye Care windows. Update both the host and plugin"),
        "rows": [], "actions": [], "islandActions": [], "attention": false}})
}

pub fn snapshot(shared: &Shared) -> Value {
    let settings = &shared.settings;
    let t = |zh, en| settings.text(zh, en);
    let at = Instant::now();
    let remaining = shared.clock.remaining(at);
    let paused = shared.clock.paused();
    let overdue = shared.clock.phase() == Phase::Overdue;
    let resting = shared.clock.phase() == Phase::Resting;
    let postponed = shared.clock.postponed();
    // The bar stays on screen while the timer is held: an idle desk or a full-screen window
    // freezes the round at a full period, and a round whose time is up stays full.
    let percent = shared.clock.percent_remaining(at);
    let headline = if overdue {
        t("休息时间到", "Break time")
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
    let deadline = (!paused && !overdue)
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
    let mut actions = Vec::new();
    if overdue {
        actions.push("defer_break");
        actions.push("finish_break");
    } else if resting {
        if shared.clock.can_snooze() {
            actions.push("snooze_10");
        }
        if settings.allow_skip {
            actions.push("skip");
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
        (t("剩余休息时长", "Break time remaining"), "warning")
    } else {
        (t("剩余用眼时长", "Screen time remaining"), "normal")
    };
    json!({"panel": {
        "headline": headline, "note": note,
        "rows": [{"id":"timer", "title": title,
            "detail": "", "percent": percent, "countdownTo": deadline, "durationMs": duration,
            "tone": tone}],
        "actions": actions,
        "islandActions": island_actions,
        "attention": resting || overdue
    }})
}
#[cfg(test)]
#[path = "panel_tests.rs"]
mod tests;
