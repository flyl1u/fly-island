//! Host-rendered island panel; paused timers use static text, never a moving deadline.
use crate::{Phase, Settings, Shared};
use fly_island_plugin_sdk::{json, now, Value};
use std::time::Instant;

pub fn unsupported(settings: &Settings) -> Value {
    json!({"panel": {"headline": settings.text("请更新配套宿主", "Update the companion host"),
        "note": settings.text("此版本需要支持护眼休息窗口的宿主，请同时更新宿主与插件", "This version needs host-rendered Eye Care windows. Update both the host and plugin"),
        "rows": [], "actions": [], "attention": false}})
}

pub fn snapshot(shared: &Shared) -> Value {
    let settings = &shared.settings;
    let t = |zh, en| settings.text(zh, en);
    let remaining = shared.clock.remaining(Instant::now());
    let seconds = remaining.as_secs() + u64::from(remaining.subsec_nanos() != 0);
    let paused = shared.clock.paused();
    let resting = shared.clock.phase() == Phase::Resting;
    let postponed = shared.clock.postponed();
    let headline = if resting {
        t("护眼休息中", "Rest your eyes")
    } else if shared.idle {
        t("空闲中，已重置并暂停", "Away · timer reset and paused")
    } else if shared.fullscreen {
        t("全屏运行，已暂停计时", "Full screen · timer paused")
    } else if postponed {
        t(
            "已推迟，下次不能再推迟",
            "Postponed · no further postponement",
        )
    } else {
        t("距离下次护眼休息", "Next eye break")
    };
    let note = if resting {
        t(
            "请远眺或闭眼；休息结束自动解锁",
            "Look into the distance or close your eyes; unlocks automatically",
        )
    } else if shared.idle {
        t(
            "恢复操作后开始完整用眼周期",
            "A full screen-time interval starts when you return",
        )
    } else if shared.fullscreen {
        t(
            "退出全屏后从剩余时间继续",
            "Resumes from the remaining time after full screen",
        )
    } else {
        t(
            "空闲重置计时，全屏暂停计时",
            "Resets when away; pauses during full screen",
        )
    };
    let detail = if paused {
        format!(
            "{} {:02}:{:02}",
            t("剩余", "Remaining"),
            seconds / 60,
            seconds % 60
        )
    } else if settings.english {
        format!(
            "{} min screen time · {} min break",
            settings.period_minutes, settings.rest_minutes
        )
    } else {
        format!(
            "用眼 {} 分钟 · 休息 {} 分钟",
            settings.period_minutes, settings.rest_minutes
        )
    };
    let deadline = (!paused)
        .then(|| now().saturating_add(i64::try_from(remaining.as_millis()).unwrap_or(i64::MAX)));
    let mut actions = Vec::new();
    if resting {
        if shared.clock.can_snooze() {
            actions.push("snooze_10");
        }
        if settings.allow_skip {
            actions.push("skip");
        }
    } else {
        actions.push("rest_now");
    }
    json!({"panel": {
        "headline": headline, "note": note,
        "rows": [{"id":"timer", "title": if resting {t("休息结束", "Break ends")} else {t("下次护眼提醒", "Next eye break")},
            "detail": detail, "percent": null, "countdownTo": deadline,
            "tone": if resting {"warning"} else {"normal"}}],
        "actions": actions,
        "attention": resting
    }})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Reminder, Settings};
    #[test]
    fn paused_panel_has_no_counting_deadline_and_supports_both_languages() {
        for language in ["zh-CN", "en"] {
            let reminder = Reminder::new(Settings::parse(&json!({"language":language})));
            let mut shared = reminder.shared.lock().unwrap();
            shared.clock.tick(Instant::now(), false, true);
            shared.fullscreen = true;
            let data = snapshot(&shared);
            assert!(data["panel"]["rows"][0]["countdownTo"].is_null());
            assert!(data["panel"]["headline"]
                .as_str()
                .unwrap()
                .contains(if language == "en" { "paused" } else { "暂停" }));
        }
    }
}
