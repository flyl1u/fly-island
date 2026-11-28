//! Host-rendered island panel; paused timers and finished totals use static text, never a moving clock.
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
    let seconds = remaining.as_secs() + u64::from(remaining.subsec_nanos() != 0);
    let paused = shared.clock.paused();
    let overdue = shared.clock.phase() == Phase::Overdue;
    let resting = shared.clock.phase() == Phase::Resting;
    let postponed = shared.clock.postponed();
    // The bar drains with the phase; a paused timer has no bar, only its frozen time. A round
    // whose time is up keeps its bar full.
    let percent = (!paused).then(|| shared.clock.percent_remaining(at));
    let headline = if overdue {
        t("休息时间到", "Break time")
    } else if resting {
        t("休息中", "Resting")
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
    let detail = if paused {
        format!("{:02}:{:02}", seconds / 60, seconds % 60)
    } else {
        String::new()
    };
    let deadline = (!paused && !overdue)
        .then(|| now().saturating_add(i64::try_from(remaining.as_millis()).unwrap_or(i64::MAX)));
    // An overdue round shows the screen time it reached and holds it there: the number must not
    // move while the user decides, so the host draws a total instead of a running clock.
    let total = overdue.then(|| {
        i64::try_from(shared.clock.accumulated(at).as_millis()).unwrap_or(i64::MAX)
    });
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
            "detail": detail, "percent": percent, "countdownTo": deadline, "totalMs": total,
            "tone": tone}],
        "actions": actions,
        "islandActions": island_actions,
        "attention": resting || overdue
    }})
}
#[cfg(test)]
#[path = "panel_tests.rs"]
mod tests;
