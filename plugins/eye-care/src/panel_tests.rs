//! Panel tests: labels, actions and the frozen duration in both languages.
use super::*;
use crate::{Phase, Reminder, Settings};
use fly_island_plugin_sdk::{json, Value};
use std::time::Instant;

fn assert_working(shared: &Shared, postponed: bool) {
    let data = snapshot(shared);
    let t = |zh, en| shared.settings.text(zh, en);
    assert_eq!(
        data["panel"]["headline"],
        if shared.idle { t("空闲中", "Idle") } else { t("用眼中", "Screen time") }
    );
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
    // A held timer keeps its bar and its digits, both frozen at the full period it restarted from.
    assert_eq!(
        data["panel"]["rows"][0]["countdownTo"].is_null(),
        shared.clock.paused()
    );
    let percent = data["panel"]["rows"][0]["percent"].as_f64().unwrap();
    assert!((0.0..=100.0).contains(&percent));
    if shared.clock.paused() {
        assert_eq!(percent, 100.0, "a held timer restarts at a full period");
    }
    assert_eq!(
        data["panel"]["rows"][0]["durationMs"].is_i64(),
        shared.clock.paused()
    );
    assert_eq!(data["panel"]["rows"][0]["detail"], "");
}

fn assert_resting(shared: &Shared) {
    let data = snapshot(shared);
    let t = |zh, en| shared.settings.text(zh, en);
    assert_eq!(data["panel"]["headline"], t("休息中", "Resting"));
    assert_eq!(
        data["panel"]["rows"][0]["title"],
        t("已休息时长", "Break time elapsed")
    );
    assert_eq!(data["panel"]["attention"], true);
    assert!(data["panel"]["rows"][0]["countUpFrom"].is_i64(), "the break counts up");
    assert!(data["panel"]["rows"][0]["countdownTo"].is_null());
    assert!(data["panel"]["rows"][0]["durationMs"].is_null());
    assert_eq!(data["panel"]["done"], false);
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
    assert!(data["panel"]["rows"][0]["durationMs"].is_i64());
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
fn a_completed_break_stays_on_screen_without_actions() {
    for language in ["zh-CN", "en"] {
        let reminder = Reminder::new(Settings::parse(&json!({"language":language, "mode":"lock"})));
        let mut shared = reminder.shared.lock().unwrap();
        let at = Instant::now();
        let period = shared.settings.period();
        let rest = shared.settings.rest();
        shared.clock.tick(at + period, false, false);
        assert_resting(&shared);
        assert_eq!(shared.clock.percent_remaining(at + period), 100.0);
        let later = at + period + rest;
        shared.clock.tick(later, false, false);
        assert!(shared.clock.rest_done(later));
        let data = snapshot_at(&shared, later);
        let t = |zh, en| shared.settings.text(zh, en);
        assert_eq!(data["panel"]["headline"], t("休息完成", "Break complete"));
        assert_eq!(data["panel"]["done"], true);
        assert_eq!(data["panel"]["actions"], json!([]), "a finished break offers nothing");
        assert_eq!(data["panel"]["islandActions"], json!([]));
        assert_eq!(
            data["panel"]["rows"][0]["title"],
            t("已休息时长", "Break time elapsed")
        );
        assert!(data["panel"]["rows"][0]["countUpFrom"].is_i64(), "the total keeps counting");
        assert_eq!(data["panel"]["rows"][0]["percent"].as_f64(), Some(100.0));
        assert_eq!(data["panel"]["attention"], true, "the window stays until the user returns");
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
    assert!(data["panel"]["rows"][0]["durationMs"].is_null());
}

#[test]
fn notify_mode_works_without_a_break_window_until_the_time_is_up() {
    for language in ["zh-CN", "en"] {
        let reminder = Reminder::new(Settings::parse(&json!({"language":language, "mode":"notify"})));
        let shared = reminder.shared.lock().unwrap();
        let data = snapshot(&shared);
        assert_eq!(data["panel"]["attention"], false, "no dot and no break window while working");
        assert_eq!(data["panel"]["rows"][0]["durationMs"], Value::Null);
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
        let first = snapshot(&shared)["panel"]["rows"][0]["durationMs"]
            .as_i64()
            .unwrap();
        assert!((59_000..=61_000).contains(&first), "the total is the round's screen time: {first}");
        // Time passing changes nothing: the number waits for the answer.
        shared.clock.tick(Instant::now() + period * 3, false, false);
        assert_eq!(
            snapshot(&shared)["panel"]["rows"][0]["durationMs"].as_i64(),
            Some(first)
        );
    }
}

#[test]
fn a_full_screen_window_holds_the_digits_and_the_bar() {
    for language in ["zh-CN", "en"] {
        let reminder = Reminder::new(Settings::parse(&json!({"language":language})));
        let mut shared = reminder.shared.lock().unwrap();
        shared.clock.tick(Instant::now(), false, true);
        shared.fullscreen = true;
        let data = snapshot(&shared);
        let t = |zh, en| shared.settings.text(zh, en);
        assert_eq!(data["panel"]["headline"], t("用眼中", "Screen time"));
        assert!(data["panel"]["rows"][0]["countdownTo"].is_null());
        assert_eq!(data["panel"]["rows"][0]["percent"].as_f64(), Some(100.0));
        assert_eq!(data["panel"]["rows"][0]["detail"], "");
        let frozen = data["panel"]["rows"][0]["durationMs"].as_i64().unwrap();
        assert!(
            (1_199_000..=1_201_000).contains(&frozen),
            "a paused timer keeps its full period: {frozen}"
        );
        shared.clock.tick(Instant::now(), false, true);
        assert_eq!(
            snapshot(&shared)["panel"]["rows"][0]["durationMs"].as_i64(),
            Some(frozen),
            "the number does not move while the window holds the timer"
        );
    }
}

#[test]
fn an_idle_desk_names_itself_and_keeps_the_frozen_countdown() {
    let reminder = Reminder::new(Settings::parse(&json!({})));
    let mut shared = reminder.shared.lock().unwrap();
    shared.clock.tick(Instant::now(), true, false);
    shared.idle = true;
    let data = snapshot(&shared);
    let t = |zh, en| shared.settings.text(zh, en);
    assert_eq!(data["panel"]["headline"], t("空闲中", "Idle"));
    assert_eq!(
        data["panel"]["rows"][0]["title"],
        t("剩余用眼时长", "Screen time remaining")
    );
    assert!(data["panel"]["rows"][0]["durationMs"].is_i64());
    assert!(data["panel"]["rows"][0]["countdownTo"].is_null());
    assert_eq!(data["panel"]["rows"][0]["percent"].as_f64(), Some(100.0));
    assert_eq!(data["panel"]["actions"], json!(["reset_work", "rest_now"]));
}
