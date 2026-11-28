//! Host-rendered island panel; paused timers use static text, never a moving deadline.
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
    let resting = shared.clock.phase() == Phase::Resting;
    let postponed = shared.clock.postponed();
    // The bar drains with the phase; a paused timer has no bar, only its frozen time.
    let percent = (!paused).then(|| shared.clock.percent_remaining(at));
    let headline = if resting {
        t("休息中", "Resting")
    } else {
        t("用眼中", "Screen time")
    };
    let note = if !resting && postponed {
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
        actions.push("reset_work");
        actions.push("rest_now");
    }
    // The page offers the phase action only; postpone and skip belong to the break window.
    let island_actions = if resting { Vec::new() } else { actions.clone() };
    json!({"panel": {
        "headline": headline, "note": note,
        "rows": [{"id":"timer", "title": if resting {t("剩余休息时长", "Break time remaining")} else {t("剩余用眼时长", "Screen time remaining")},
            "detail": detail, "percent": percent, "countdownTo": deadline,
            "tone": if resting {"warning"} else {"normal"}}],
        "actions": actions,
        "islandActions": island_actions,
        "attention": resting
    }})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Reminder, Settings};
    fn assert_phase(shared: &Shared, resting: bool, postponed: bool) {
        let data = snapshot(shared);
        let t = |zh, en| shared.settings.text(zh, en);
        assert_eq!(
            data["panel"]["headline"],
            if resting {
                t("休息中", "Resting")
            } else {
                t("用眼中", "Screen time")
            }
        );
        assert_eq!(
            data["panel"]["rows"][0]["title"],
            if resting {
                t("剩余休息时长", "Break time remaining")
            } else {
                t("剩余用眼时长", "Screen time remaining")
            }
        );
        assert_eq!(
            data["panel"]["note"],
            if !resting && postponed {
                t(
                    "已经推迟过一次，不能推迟下次休息",
                    "Already postponed once; the next break cannot be postponed",
                )
            } else {
                ""
            }
        );
        assert_eq!(data["panel"]["attention"], resting);
        assert_eq!(
            data["panel"]["rows"][0]["countdownTo"].is_null(),
            shared.clock.paused()
        );
        // The bar drains with the phase; a paused timer drops it and keeps the frozen time.
        let percent = data["panel"]["rows"][0]["percent"].as_f64();
        assert_eq!(percent.is_some(), !shared.clock.paused());
        if let Some(percent) = percent {
            assert!((0.0..=100.0).contains(&percent));
        }
        if !shared.clock.paused() {
            assert_eq!(data["panel"]["rows"][0]["detail"], "");
        }
    }

    #[test]
    fn labels_follow_break_and_postponement_transitions_in_both_languages() {
        for language in ["zh-CN", "en"] {
            let reminder = Reminder::new(Settings::parse(&json!({"language":language})));
            let mut shared = reminder.shared.lock().unwrap();
            let at = Instant::now();
            assert_phase(&shared, false, false);
            shared.clock.rest_now(at);
            assert_phase(&shared, true, false);
            assert!(shared.clock.snooze(at, 10));
            assert_phase(&shared, false, true);
            for (idle, fullscreen) in [(true, false), (false, true), (false, false)] {
                shared.clock.tick(at, idle, fullscreen);
                shared.idle = idle;
                shared.fullscreen = fullscreen;
                assert_phase(&shared, false, true);
            }
            shared.clock.rest_now(at);
            assert_phase(&shared, true, true);
            assert!(!shared.clock.snooze(at, 10));
            assert!(shared.clock.skip_rest(at, true));
            assert_phase(&shared, false, false);
        }
    }

    #[test]
    fn the_working_phase_offers_resetting_before_taking_a_break() {
        let reminder = Reminder::new(Settings::parse(&json!({})));
        let shared = reminder.shared.lock().unwrap();
        let data = snapshot(&shared);
        assert_eq!(data["panel"]["actions"], json!(["reset_work", "rest_now"]));
        assert_eq!(data["panel"]["islandActions"], json!(["reset_work", "rest_now"]));
    }

    #[test]
    fn paused_panel_has_no_counting_deadline_and_supports_both_languages() {
        for language in ["zh-CN", "en"] {
            let reminder = Reminder::new(Settings::parse(&json!({"language":language})));
            let mut shared = reminder.shared.lock().unwrap();
            shared.clock.tick(Instant::now(), false, true);
            shared.fullscreen = true;
            let data = snapshot(&shared);
            assert!(data["panel"]["rows"][0]["countdownTo"].is_null());
            assert!(data["panel"]["rows"][0]["percent"].is_null());
            assert_eq!(
                data["panel"]["headline"],
                if language == "en" {
                    "Screen time"
                } else {
                    "用眼中"
                }
            );
            assert_eq!(data["panel"]["note"], "");
            assert!(data["panel"]["rows"][0]["detail"]
                .as_str()
                .unwrap()
                .contains(':'));
        }
    }
}
