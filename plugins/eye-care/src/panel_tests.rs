//! Panel tests: labels, actions and the frozen total in both languages.
use super::*;
use crate::{Phase, Reminder, Settings};
use fly_island_plugin_sdk::{json, Value};
use std::time::Instant;

fn assert_working(shared: &Shared, postponed: bool) {
    let data = snapshot(shared);
    let t = |zh, en| shared.settings.text(zh, en);
    assert_eq!(data["panel"]["headline"], t("用眼中", "Screen time"));
    assert_eq!(
        data["panel"]["rows"][0]["title"],
        t("剩余用眼时长", "Screen time remaining")
    );
    assert_eq!(
        data["panel"]["note"],
        if postponed {
            t(
                "已经推迟过一次，不能推迟下次休息",
                "Already postponed once; the next break cannot be postponed",
            )
        } else {
            ""
        }
    );
    assert_eq!(data["panel"]["attention"], false);
    assert!(data["panel"]["rows"][0]["totalMs"].is_null());
    assert_eq!(
        data["panel"]["rows"][0]["countdownTo"].is_null(),
        shared.clock.paused()
    );
    // The bar drains with the phase; a paused timer drops it and keeps the frozen time.
    let percent = data["panel"]["rows"][0]["percent"].as_f64();
    assert_eq!(percent.is_some(), !shared.clock.paused());
    if let Some(percent) = percent {
        assert!((0.0..=100.0).contains(&percent));
        assert_eq!(data["panel"]["rows"][0]["detail"], "");
    }
}

fn assert_resting(shared: &Shared) {
    let data = snapshot(shared);
    let t = |zh, en| shared.settings.text(zh, en);
    assert_eq!(data["panel"]["headline"], t("休息中", "Resting"));
    assert_eq!(
        data["panel"]["rows"][0]["title"],
        t("剩余休息时长", "Break time remaining")
    );
    assert_eq!(data["panel"]["attention"], true);
    assert!(data["panel"]["rows"][0]["countdownTo"].is_i64());
    assert!(data["panel"]["rows"][0]["totalMs"].is_null());
    assert_eq!(
        data["panel"]["islandActions"],
        json!([]),
        "the break window owns its actions"
    );
}

fn assert_overdue(shared: &Shared) {
    let data = snapshot(shared);
    let t = |zh, en| shared.settings.text(zh, en);
    assert_eq!(data["panel"]["headline"], t("休息时间到", "Break time"));
    assert_eq!(
        data["panel"]["rows"][0]["title"],
        t("累计用眼时长", "Total screen time")
    );
    assert_eq!(data["panel"]["rows"][0]["tone"], "warning");
    assert!(
        data["panel"]["rows"][0]["countdownTo"].is_null(),
        "the total does not count on"
    );
    assert!(data["panel"]["rows"][0]["totalMs"].is_i64());
    assert_eq!(data["panel"]["rows"][0]["percent"].as_f64(), Some(100.0));
    assert_eq!(data["panel"]["note"], "", "nothing is written under the headline");
    assert_eq!(data["panel"]["actions"], json!(["defer_break", "finish_break"]));
    assert_eq!(
        data["panel"]["islandActions"],
        json!(["defer_break", "finish_break"])
    );
    assert_eq!(data["panel"]["attention"], true);
}

#[test]
fn labels_follow_break_and_postponement_transitions_in_both_languages() {
    for language in ["zh-CN", "en"] {
        let reminder = Reminder::new(Settings::parse(&json!({"language":language})));
        let mut shared = reminder.shared.lock().unwrap();
        let at = Instant::now();
        let period = shared.settings.period();
        assert_working(&shared, false);
        // Lock mode: the round runs out by itself and the break window takes over.
        shared.clock.tick(at + period, false, false);
        assert_resting(&shared);
        assert!(shared.clock.snooze(at + period, 10));
        assert_working(&shared, true);
        for (idle, fullscreen) in [(true, false), (false, true), (false, false)] {
            shared.clock.tick(at + period, idle, fullscreen);
            shared.idle = idle;
            shared.fullscreen = fullscreen;
            assert_working(&shared, true);
        }
        // A break asked for by hand still covers the screens in lock mode, with no postponement left.
        assert!(shared.clock.rest_now(at + period));
        assert_resting(&shared);
        assert!(!shared.clock.snooze(at + period, 10));
        assert!(shared.clock.skip_rest(at + period, true));
        assert_working(&shared, false);
    }
}

#[test]
fn the_working_phase_offers_resetting_before_taking_a_break() {
    let reminder = Reminder::new(Settings::parse(&json!({})));
    let shared = reminder.shared.lock().unwrap();
    let data = snapshot(&shared);
    assert_eq!(data["panel"]["actions"], json!(["reset_work", "rest_now"]));
    assert_eq!(
        data["panel"]["islandActions"],
        json!(["reset_work", "rest_now"])
    );
    assert_eq!(data["panel"]["attention"], false);
    assert!(data["panel"]["rows"][0]["totalMs"].is_null());
}

#[test]
fn notify_mode_works_without_a_break_window_until_the_time_is_up() {
    for language in ["zh-CN", "en"] {
        let reminder = Reminder::new(Settings::parse(&json!({"language":language, "mode":"notify"})));
        let shared = reminder.shared.lock().unwrap();
        let data = snapshot(&shared);
        assert_eq!(data["panel"]["attention"], false, "no dot and no break window while working");
        assert_eq!(data["panel"]["rows"][0]["totalMs"], Value::Null);
        assert!(data["panel"]["rows"][0]["countdownTo"].is_i64());
        assert_eq!(data["panel"]["actions"], json!(["reset_work", "rest_now"]));
    }
}

#[test]
fn an_overdue_round_shows_the_frozen_total_and_offers_the_two_answers() {
    for language in ["zh-CN", "en"] {
        let reminder = Reminder::new(Settings::parse(&json!({"language":language, "mode":"notify", "period":"1"})));
        let mut shared = reminder.shared.lock().unwrap();
        let period = shared.settings.period();
        shared.clock.tick(Instant::now() + period, false, false);
        assert_eq!(shared.clock.phase(), Phase::Overdue);
        assert_overdue(&shared);
        let first = snapshot(&shared)["panel"]["rows"][0]["totalMs"]
            .as_i64()
            .unwrap();
        assert!((59_000..=61_000).contains(&first), "the total is the round's screen time: {first}");
        // Time passing changes nothing: the number waits for the answer.
        shared.clock.tick(Instant::now() + period * 3, false, false);
        assert_eq!(
            snapshot(&shared)["panel"]["rows"][0]["totalMs"].as_i64(),
            Some(first)
        );
    }
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
