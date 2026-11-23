use super::*;

#[test]
fn defaults_and_cleared_keys_register_nothing() {
    let (registered, errors) = register_shortcuts(&MediaShortcuts::default(), |_, _, _| panic!("empty keys must not register"));
    assert_eq!(registered, [false; 3]);
    assert!(errors.is_empty());
}

#[test]
fn music_keys_reject_windows_approval_and_duplicate_combinations() {
    let shortcuts = MediaShortcuts { play_pause: "Alt+Tab".into(), previous: "Alt+Control+T".into(), next: "Ctrl+Alt+M".into() };
    let (registered, errors) = register_shortcuts(&shortcuts, |_, _, _| Ok(()));
    assert_eq!(registered, [false, false, true]);
    assert!(errors["playPause"].contains("Windows"));
    assert!(errors["previous"].contains("approvals"));
    let shortcuts = MediaShortcuts { play_pause: "Ctrl+Alt+M".into(), previous: "alt+ctrl+m".into(), next: "".into() };
    let (registered, errors) = register_shortcuts(&shortcuts, |_, _, _| Ok(()));
    assert_eq!(registered, [true, false, false]);
    assert!(errors["previous"].contains("Another music"));
}

#[test]
fn one_failed_registration_does_not_disable_the_other_actions() {
    let shortcuts = MediaShortcuts { play_pause: "Ctrl+Alt+P".into(), previous: "Ctrl+Alt+B".into(), next: "Ctrl+Alt+F".into() };
    let mut ids = Vec::new();
    let (registered, errors) = register_shortcuts(&shortcuts, |id, _, _| {
        ids.push(id);
        if id == FIRST_ID + 1 { Err("Already registered by another app".into()) } else { Ok(()) }
    });
    assert_eq!(ids, [FIRST_ID, FIRST_ID + 1, FIRST_ID + 2]);
    assert_eq!(registered, [true, false, true]);
    assert_eq!(errors.len(), 1);
    assert!(errors["previous"].contains("another app"));
}
