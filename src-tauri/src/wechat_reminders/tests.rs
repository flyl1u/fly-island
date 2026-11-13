use super::source::WeChatWindow;
use super::*;

#[test]
fn visible_main_is_preferred_and_login_windows_are_not_restored() {
    let windows = [
        WeChatWindow {
            handle: HWND::default(),
            process: test_process(1),
            main_sized: true,
            visible: false,
        },
        WeChatWindow {
            handle: HWND::default(),
            process: test_process(2),
            main_sized: false,
            visible: true,
        },
        WeChatWindow {
            handle: HWND::default(),
            process: test_process(3),
            main_sized: true,
            visible: true,
        },
    ];
    assert_eq!(preferred_window(&windows).unwrap().process.started_at, 3);
    assert_eq!(
        preferred_window(&windows[..2]).unwrap().process.started_at,
        1
    );
    assert!(preferred_window(&windows[1..2]).is_none());
}

#[test]
#[ignore = "Activates the registered weixin protocol and verifies the original main process"]
fn window_activation_reuses_the_existing_wechat_process() {
    resolve_executable().unwrap();
    let before = existing_wechat_windows().unwrap();
    let original = preferred_window(&before.found).expect("WeChat main window is required");
    let expected_process = win32::process::window_process_id(original.handle);
    assert_ne!(expected_process, 0);
    for _ in 0..2 {
        assert!(restore_wechat(None).unwrap().is_some());
        let after = existing_wechat_windows().unwrap();
        let window =
            preferred_window(&after.found).expect("The existing main window must be visible");
        let process_id = win32::process::window_process_id(window.handle);
        assert_eq!(process_id, expected_process);
        assert!(!win32::window::is_minimized(window.handle));
    }
}

#[test]
fn repeated_flashes_create_one_reminder_and_activation_acknowledges_it() {
    let mut state = ReminderState::default();
    state.set_enabled(true);
    let generation = state.generation;
    assert!(state.apply(generation, ReminderSignal::Attention, 1000));
    assert!(!state.apply(generation, ReminderSignal::Attention, 2000));
    assert_eq!(state.snapshot.last_attention_at, Some(1000));
    assert!(state.apply(generation, ReminderSignal::Activated, 3000));
    assert!(!state.snapshot.pending);
    assert!(state.apply(generation, ReminderSignal::Attention, 4000));
}

#[test]
fn a_later_flash_can_refresh_the_pending_reminder_after_a_quiet_period() {
    let mut state = ReminderState::default();
    state.set_enabled(true);
    let generation = state.generation;
    assert!(state.apply(generation, ReminderSignal::Attention, 1000));
    assert!(!state.apply(generation, ReminderSignal::Attention, 2000));
    assert!(!state.apply(generation, ReminderSignal::Attention, 5000));
    assert!(state.apply(generation, ReminderSignal::Attention, 9000));
    assert_eq!(state.snapshot.last_attention_at, Some(9000));
}

#[test]
fn disabling_clears_pending_state_and_rejects_old_listener_events() {
    let mut state = ReminderState::default();
    state.set_enabled(true);
    let old = state.generation;
    state.apply(old, ReminderSignal::Attention, 1000);
    state.set_enabled(false);
    assert!(!state.snapshot.pending);
    assert!(!state.apply(old, ReminderSignal::Attention, 2000));
    state.set_enabled(true);
    assert!(!state.apply(old, ReminderSignal::Attention, 3000));
    assert!(state.apply(state.generation, ReminderSignal::Attention, 4000));
}

#[test]
fn redraws_and_window_creation_are_not_messages() {
    let mut state = ReminderState::default();
    state.set_enabled(true);
    let generation = state.generation;
    assert!(!state.apply(generation, ReminderSignal::Redraw, 1000));
    assert!(!state.apply(generation, ReminderSignal::WindowCreated, 2000));
    assert!(!state.snapshot.pending);
}

#[test]
fn changing_taskbar_preference_keeps_the_reader_and_survives_disabling_reminders() {
    let mut state = ReminderState::default();
    assert!(!state.snapshot.hide_minimized_taskbar);
    state.set_enabled(true);
    state.set_preview_enabled(true);
    let generation = state.generation;
    assert!(state.set_hide_minimized_taskbar(true));
    assert!(!state.set_hide_minimized_taskbar(true));
    assert_eq!(state.generation, generation);
    state.set_enabled(false);
    state.set_enabled(true);
    assert!(state.snapshot.hide_minimized_taskbar);
}

#[test]
fn previews_keep_the_newest_twenty_and_do_not_replay_after_switching_off() {
    let mut state = ReminderState::default();
    state.set_enabled(true);
    let process = test_process(4);
    assert!(!state.receive_previews(state.generation, process, vec![preview("off")], 1000));
    state.set_preview_enabled(true);
    let generation = state.generation;
    assert!(state.receive_previews(
        generation,
        process,
        vec![preview("first"); MAX_PREVIEWS],
        2000
    ));
    assert!(state.receive_previews(generation, process, vec![preview("latest")], 2000));
    assert_eq!(state.snapshot.messages.len(), MAX_PREVIEWS);
    assert_eq!(state.snapshot.messages[0].chat.body, "latest");
    assert_eq!(state.snapshot.last_attention_at, Some(2001));
    let serialized = serde_json::to_value(&state.snapshot.messages[0]).unwrap();
    assert!(serialized.get("key").is_none() && serialized.get("process").is_none());
    assert!(!state.apply(generation, ReminderSignal::Attention, 2100));
    state.set_preview_enabled(false);
    assert!(state.snapshot.messages.is_empty());
    assert!(!state.receive_previews(generation, process, vec![preview("stale")], 3000));
    assert!(state.apply(state.generation, ReminderSignal::Activated, 3100));
    assert!(state.apply(state.generation, ReminderSignal::Attention, 3200));
    assert!(state.snapshot.pending);
}

fn preview(body: &str) -> ChatPreview {
    ChatPreview {
        key: "test-chat".into(),
        contact: "test".into(),
        body: body.into(),
    }
}

fn test_process(started_at: u64) -> ProcessIdentity {
    ProcessIdentity { pid: 1, started_at }
}

#[test]
fn opening_wechat_prefers_main_window_over_an_older_login_window() {
    let windows = [
        WeChatWindow {
            handle: HWND::default(),
            process: test_process(10),
            main_sized: false,
            visible: true,
        },
        WeChatWindow {
            handle: HWND::default(),
            process: test_process(20),
            main_sized: true,
            visible: true,
        },
    ];
    assert_eq!(preferred_window(&windows).unwrap().process.started_at, 20);
}

#[test]
fn opening_wechat_reuses_the_older_main_window_instead_of_a_new_instance() {
    let windows = [
        WeChatWindow {
            handle: HWND::default(),
            process: test_process(20),
            main_sized: true,
            visible: true,
        },
        WeChatWindow {
            handle: HWND::default(),
            process: test_process(10),
            main_sized: true,
            visible: true,
        },
    ];
    assert_eq!(preferred_window(&windows).unwrap().process.started_at, 10);
}

#[test]
#[ignore = "Requires a running WeChat desktop session; reads window metadata only"]
fn finds_existing_wechat_main_window_without_launching() {
    let search = existing_wechat_windows().unwrap();
    let selected = preferred_window(&search.found).expect("An existing WeChat window is required");
    assert!(
        selected.main_sized,
        "The existing main window must be preferred over a login window"
    );
}
