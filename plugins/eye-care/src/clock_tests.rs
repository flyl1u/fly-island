use super::{Clock, Phase};
use std::time::{Duration, Instant};

fn at(base: Instant, seconds: u64) -> Instant {
    base + Duration::from_secs(seconds)
}

#[test]
fn work_turns_into_a_timed_rest_and_back() {
    let base = Instant::now();
    let mut clock = Clock::new(base, Duration::from_secs(60), Duration::from_secs(20));
    clock.tick(at(base, 59), false, false);
    assert_eq!(clock.phase(), Phase::Working);
    clock.tick(at(base, 60), false, false);
    assert_eq!(clock.phase(), Phase::Resting);
    assert_eq!(clock.remaining(at(base, 70)), Duration::from_secs(10));
    clock.tick(at(base, 80), false, false);
    assert_eq!(clock.phase(), Phase::Working);
}

#[test]
fn idle_resets_to_a_full_interval() {
    let base = Instant::now();
    let mut clock = Clock::new(base, Duration::from_secs(60), Duration::from_secs(20));
    clock.tick(at(base, 50), false, false);
    clock.tick(at(base, 51), true, false);
    assert_eq!(clock.remaining(at(base, 51)), Duration::from_secs(60));
    clock.tick(at(base, 110), false, false);
    assert_eq!(clock.phase(), Phase::Working);
    clock.tick(at(base, 170), false, false);
    assert_eq!(clock.phase(), Phase::Resting);
}

#[test]
fn fullscreen_freezes_then_resumes_the_same_remaining_time() {
    let base = Instant::now();
    let mut clock = Clock::new(base, Duration::from_secs(60), Duration::from_secs(20));
    clock.tick(at(base, 40), false, false);
    clock.tick(at(base, 41), false, true);
    assert_eq!(clock.remaining(at(base, 41)), Duration::from_secs(19));
    clock.tick(at(base, 500), false, true);
    assert_eq!(clock.remaining(at(base, 500)), Duration::from_secs(19));
    assert_eq!(clock.phase(), Phase::Working);
    clock.tick(at(base, 501), false, false);
    clock.tick(at(base, 519), false, false);
    assert_eq!(clock.phase(), Phase::Working);
    clock.tick(at(base, 520), false, false);
    assert_eq!(clock.phase(), Phase::Resting);
}

#[test]
fn a_break_can_only_be_postponed_once_per_cycle() {
    let base = Instant::now();
    let mut clock = Clock::new(base, Duration::from_secs(60), Duration::from_secs(20));
    assert!(!clock.snooze(base, 10));
    clock.tick(at(base, 60), false, false);
    assert!(clock.snooze(at(base, 61), 10));
    assert_eq!(clock.remaining(at(base, 61)), Duration::from_secs(600));
    clock.tick(at(base, 661), false, false);
    assert_eq!(clock.phase(), Phase::Resting);
    assert!(!clock.can_snooze());
    assert!(!clock.snooze(at(base, 662), 10));
    clock.tick(at(base, 682), false, false);
    clock.tick(at(base, 742), false, false);
    assert!(clock.can_snooze(), "a completed rest opens the next cycle");
}

#[test]
fn emergency_unlock_skips_rest_and_starts_a_fresh_cycle() {
    let base = Instant::now();
    let mut clock = Clock::new(base, Duration::from_secs(60), Duration::from_secs(20));
    clock.tick(at(base, 60), false, false);
    assert!(!clock.skip_rest(at(base, 65), false));
    assert_eq!(clock.phase(), Phase::Resting);
    assert!(clock.skip_rest(at(base, 65), true));
    assert_eq!(clock.phase(), Phase::Working);
    assert_eq!(clock.remaining(at(base, 65)), Duration::from_secs(60));
    assert!(!clock.can_snooze());
}

#[test]
fn all_postponements_are_exact_and_invalid_choices_do_not_consume_one() {
    for minutes in [10, 15, 20, 25, 30] {
        let base = Instant::now();
        let mut clock = Clock::new(base, Duration::from_secs(60), Duration::from_secs(20));
        clock.rest_now(base);
        for invalid in [0, 9, 11, 31, u64::MAX] {
            assert!(!clock.snooze(base, invalid));
        }
        assert!(clock.snooze(base, minutes));
        assert_eq!(clock.remaining(base), Duration::from_secs(minutes * 60));
        clock.tick(at(base, minutes * 60), false, false);
        assert_eq!(clock.phase(), Phase::Resting);
        assert!(!clock.can_snooze());
    }
}

#[test]
fn idle_freezes_between_polls_and_takes_precedence_over_fullscreen() {
    let base = Instant::now();
    let mut clock = Clock::new(base, Duration::from_secs(60), Duration::from_secs(20));
    clock.tick(at(base, 30), false, true);
    clock.tick(at(base, 500), true, true);
    assert_eq!(clock.remaining(at(base, 900)), Duration::from_secs(60));
    clock.tick(at(base, 901), false, true);
    assert_eq!(clock.remaining(at(base, 999)), Duration::from_secs(60));
    clock.tick(at(base, 1000), false, false);
    assert_eq!(clock.remaining(at(base, 1010)), Duration::from_secs(50));
}

#[test]
fn idle_fullscreen_and_manual_break_never_restore_a_used_postponement() {
    let base = Instant::now();
    let mut clock = Clock::new(base, Duration::from_secs(60), Duration::from_secs(20));
    clock.rest_now(base);
    assert!(clock.snooze(base, 10));
    clock.tick(at(base, 10), false, true);
    clock.tick(at(base, 100), true, true);
    clock.tick(at(base, 200), false, false);
    clock.rest_now(at(base, 201));
    assert!(!clock.can_snooze());
    assert!(!clock.snooze(at(base, 201), 30));
    clock.tick(at(base, 221), true, true);
    clock.tick(at(base, 222), true, true);
    assert_eq!(clock.remaining(at(base, 300)), Duration::from_secs(60));
}

#[test]
fn rest_keeps_running_during_idle_and_fullscreen_and_expired_clicks_cannot_postpone() {
    let base = Instant::now();
    let mut clock = Clock::new(base, Duration::from_secs(60), Duration::from_secs(20));
    clock.rest_now(base);
    clock.rest_now(at(base, 5));
    clock.tick(at(base, 10), true, true);
    assert_eq!(clock.remaining(at(base, 10)), Duration::from_secs(10));
    assert!(!clock.snooze(at(base, 20), 10));
    clock.tick(at(base, 20), true, true);
    assert_eq!(clock.phase(), Phase::Working);
    assert!(!clock.skip_rest(at(base, 21), true));
}
