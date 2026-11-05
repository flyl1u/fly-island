use super::*;

#[test]
fn visible_main_is_preferred_and_login_windows_are_not_restored() {
    let windows = [
        WeChatWindow {
            handle: HWND::default(),
            started_at: 1,
            main_sized: true,
            visible: false,
        },
        WeChatWindow {
            handle: HWND::default(),
            started_at: 2,
            main_sized: false,
            visible: true,
        },
        WeChatWindow {
            handle: HWND::default(),
            started_at: 3,
            main_sized: true,
            visible: true,
        },
    ];
    assert_eq!(preferred_window(&windows).unwrap().started_at, 3);
    assert_eq!(preferred_window(&windows[..2]).unwrap().started_at, 1);
    assert!(preferred_window(&windows[1..2]).is_none());
}

#[test]
#[ignore = "Activates the registered weixin protocol and verifies the original main process"]
fn window_activation_reuses_the_existing_wechat_process() {
    let executable = installed_executable().unwrap();
    let before = existing_wechat_windows(&executable).unwrap();
    let original = preferred_window(&before.found).expect("WeChat main window is required");
    let mut expected_process = 0;
    unsafe {
        GetWindowThreadProcessId(original.handle, Some(&mut expected_process));
    }
    assert_ne!(expected_process, 0);
    for _ in 0..2 {
        assert!(activate_existing_wechat(&executable).unwrap());
        let after = existing_wechat_windows(&executable).unwrap();
        let window =
            preferred_window(&after.found).expect("The existing main window must be visible");
        let mut process_id = 0;
        unsafe {
            GetWindowThreadProcessId(window.handle, Some(&mut process_id));
        }
        assert_eq!(process_id, expected_process);
        assert!(!unsafe { IsIconic(window.handle) }.as_bool());
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
fn opening_wechat_prefers_main_window_over_an_older_login_window() {
    let windows = [
        WeChatWindow {
            handle: HWND::default(),
            started_at: 10,
            main_sized: false,
            visible: true,
        },
        WeChatWindow {
            handle: HWND::default(),
            started_at: 20,
            main_sized: true,
            visible: true,
        },
    ];
    assert_eq!(preferred_window(&windows).unwrap().started_at, 20);
}

#[test]
fn opening_wechat_reuses_the_older_main_window_instead_of_a_new_instance() {
    let windows = [
        WeChatWindow {
            handle: HWND::default(),
            started_at: 20,
            main_sized: true,
            visible: true,
        },
        WeChatWindow {
            handle: HWND::default(),
            started_at: 10,
            main_sized: true,
            visible: true,
        },
    ];
    assert_eq!(preferred_window(&windows).unwrap().started_at, 10);
}

#[test]
#[ignore = "Requires a running WeChat desktop session; reads window metadata only"]
fn finds_existing_wechat_main_window_without_launching() {
    let search = existing_wechat_windows(&installed_executable().unwrap()).unwrap();
    let selected = preferred_window(&search.found).expect("An existing WeChat window is required");
    assert!(
        selected.main_sized,
        "The existing main window must be preferred over a login window"
    );
}
