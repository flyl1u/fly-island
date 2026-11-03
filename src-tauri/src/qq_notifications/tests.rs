use crate::messenger_activation::is_interactive_window;
use std::{
    thread,
    time::Duration,
};
use windows::{
    core::{w, BOOL, HRESULT},
    Win32::{
        Foundation::{HWND, LPARAM},
        UI::WindowsAndMessaging::{
                GetClassNameW, GetForegroundWindow, GetWindowThreadProcessId,
            },
    },
    UI::Notifications::NotificationSetting,
};
use super::*;
use windows::Win32::UI::WindowsAndMessaging::IsIconic;

#[test]
fn diagnostic_reports_never_include_chat_content() {
    let snapshot = NotificationSnapshot {
        items: vec![QQNotification {
            id: "private-id".into(),
            title: "private-sender".into(),
            body: "private-message".into(),
            created_at: 123,
        }],
        ..Default::default()
    };
    let report = notification_diagnostics(&snapshot);
    assert_eq!(report["itemCount"], 1);
    assert!(!report.to_string().contains("private-"));
    assert!(report.get("items").is_none());
}

#[test]
fn visible_qq_window_is_preferred_but_tray_hidden_main_can_be_reused() {
    let windows = [
        QQWindow {
            handle: HWND::default(),
            process_id: 1,
            visible: false,
            area: 2_000_000,
        },
        QQWindow {
            handle: HWND::default(),
            process_id: 1,
            visible: true,
            area: 800_000,
        },
    ];
    assert_eq!(
        preferred_qq_window(&windows, HWND::default()).unwrap().area,
        800_000
    );
    assert_eq!(
        preferred_qq_window(&windows[..1], HWND::default())
            .unwrap()
            .area,
        2_000_000
    );
}

#[test]
fn foreground_main_is_preferred_over_a_larger_preloaded_window() {
    let windows = [
        QQWindow {
            handle: HWND(1usize as _),
            process_id: 1,
            visible: true,
            area: 2_000_000,
        },
        QQWindow {
            handle: HWND(2usize as _),
            process_id: 1,
            visible: true,
            area: 800_000,
        },
    ];
    assert_eq!(
        preferred_qq_window(&windows, windows[1].handle)
            .unwrap()
            .handle,
        windows[1].handle
    );
}

#[test]
#[ignore = "Invokes QQ's tray double-click handler and verifies the original main process"]
fn window_activation_reuses_the_existing_qq_process() {
    let executable = qq_executable().unwrap();
    let before = existing_qq_windows(&executable).unwrap();
    let original = preferred_qq_window(&before.windows, unsafe { GetForegroundWindow() })
        .expect("QQ main window is required");
    let mut expected_process = 0;
    unsafe {
        GetWindowThreadProcessId(original.handle, Some(&mut expected_process));
    }
    assert_ne!(expected_process, 0);
    for _ in 0..2 {
        let result = activate_existing_qq(&executable);
        assert!(
            result
                .as_ref()
                .err()
                .is_none_or(|error| error.contains("未能切换到前台")),
            "{result:?}"
        );
        let after = existing_qq_windows(&executable).unwrap();
        let window = preferred_qq_window(&after.windows, unsafe { GetForegroundWindow() })
            .expect("The existing main window must be visible");
        let mut process_id = 0;
        unsafe {
            GetWindowThreadProcessId(window.handle, Some(&mut process_id));
        }
        assert_eq!(process_id, expected_process);
        assert!(window.visible);
        assert!(!unsafe { IsIconic(window.handle) }.as_bool());
        assert!(is_interactive_window(window.handle));
        // A background test runner may be denied focus. That must never launch another QQ.
        if let Err(error) = result {
            assert!(error.contains("未能切换到前台"), "{error}");
            assert_ne!(
                unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() },
                window.handle
            );
        }
    }
}

#[test]
#[ignore = "Reads Windows taskbar accessibility metadata; requires a restored QQ main window"]
fn restored_qq_has_a_taskbar_button() {
    use windows::core::Interface;
    use windows::Win32::{
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_MULTITHREADED,
        },
        UI::{
            Accessibility::{
                CUIAutomation8, IUIAutomation, IUIAutomation2, TreeScope_Descendants,
            },
            WindowsAndMessaging::{EnumChildWindows, FindWindowW},
        },
    };
    unsafe extern "system" fn collect_taskbar_children(window: HWND, context: LPARAM) -> BOOL {
        let children = &mut *(context.0 as *mut Vec<HWND>);
        let mut class = [0u16; 256];
        let length = GetClassNameW(window, &mut class) as usize;
        if [
            "MSTaskListWClass",
            "Windows.UI.Composition.DesktopWindowContentBridge",
        ]
        .contains(&String::from_utf16_lossy(&class[..length]).as_str())
        {
            children.push(window);
        }
        true.into()
    }
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED).ok().unwrap();
        let result = (|| -> windows::core::Result<usize> {
            let automation: IUIAutomation =
                CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)?;
            let options = automation.cast::<IUIAutomation2>()?;
            options.SetConnectionTimeout(1_000)?;
            options.SetTransactionTimeout(1_000)?;
            let taskbar_handle = FindWindowW(w!("Shell_TrayWnd"), None)?;
            let mut roots = vec![taskbar_handle];
            let _ = EnumChildWindows(
                Some(taskbar_handle),
                Some(collect_taskbar_children),
                LPARAM((&mut roots as *mut Vec<HWND>) as isize),
            );
            let mut count = 0;
            for root in roots {
                let taskbar = automation.ElementFromHandle(root)?;
                let elements = taskbar
                    .FindAll(TreeScope_Descendants, &automation.CreateTrueCondition()?)?;
                for index in 0..elements.Length()? {
                    let element = elements.GetElement(index)?;
                    let class = element.CurrentClassName()?.to_string();
                    if class.contains("TaskListButton")
                        && element.CurrentName()?.to_string().starts_with("QQ")
                    {
                        count += 1;
                    }
                }
            }
            Ok(count)
        })();
        CoUninitialize();
        assert!(
            result.unwrap() > 0,
            "QQ must have an application button on the primary taskbar"
        );
    }
}

#[test]
fn registration_repair_only_handles_missing_sender_records() {
    assert!(should_repair_registration(&Err(
        windows::core::Error::from_hresult(HRESULT(0x80070490u32 as i32),)
    )));
    assert!(!should_repair_registration(&Err(
        windows::core::Error::from_hresult(HRESULT(0x80070005u32 as i32),)
    )));
    for setting in [
        NotificationSetting::Enabled,
        NotificationSetting::DisabledForApplication,
        NotificationSetting::DisabledForUser,
        NotificationSetting::DisabledByGroupPolicy,
        NotificationSetting::DisabledByManifest,
    ] {
        assert!(!should_repair_registration(&Ok(setting)));
    }
}

#[test]
fn blocked_notification_channels_report_the_actionable_cause() {
    assert!(registration_error(Ok(NotificationSetting::Enabled)).is_none());
    assert!(
        registration_error(Ok(NotificationSetting::DisabledForApplication))
            .unwrap()
            .contains("QQ 的 Windows 通知已关闭")
    );
    assert!(registration_error(Ok(NotificationSetting::DisabledForUser))
        .unwrap()
        .contains("Windows 系统通知已关闭"));
    assert!(
        registration_error(Ok(NotificationSetting::DisabledByGroupPolicy))
            .unwrap()
            .contains("管理员")
    );
}

fn notice(id: u32, body: &str) -> QQNotification {
    QQNotification {
        id: id.to_string(),
        title: "QQ".into(),
        body: body.into(),
        created_at: id as i64,
    }
}
#[test]
fn startup_notifications_do_not_replay_and_new_messages_are_deduplicated() {
    let mut buffer = NotificationBuffer::default();
    assert_eq!(buffer.sync(vec![notice(1, "existing")]), None);
    assert!(buffer.items.is_empty());
    let current = vec![notice(1, "existing"), notice(2, "new")];
    assert_eq!(buffer.sync(current.clone()), Some("2".into()));
    assert_eq!(buffer.sync(current), None);
    assert_eq!(buffer.items, vec![notice(2, "new")]);
}
#[test]
fn updated_notifications_replace_content_without_increasing_count() {
    let mut buffer = NotificationBuffer::default();
    buffer.sync(vec![]);
    buffer.sync(vec![notice(1, "first")]);
    assert_eq!(buffer.sync(vec![notice(1, "updated")]), Some("1".into()));
    assert_eq!(buffer.items, vec![notice(1, "updated")]);
}
#[test]
fn clearing_history_does_not_redisplay_unchanged_system_notifications() {
    let mut buffer = NotificationBuffer::default();
    buffer.sync(vec![]);
    let current = vec![notice(1, "new")];
    buffer.sync(current.clone());
    buffer.items.clear();
    assert_eq!(buffer.sync(current), None);
    assert!(buffer.items.is_empty());
}
#[test]
fn notification_history_is_bounded_and_keeps_latest_first() {
    let mut buffer = NotificationBuffer::default();
    buffer.sync(vec![]);
    buffer.sync((1..=25).map(|id| notice(id, "new")).collect());
    assert_eq!(buffer.items.len(), MAX_ITEMS);
    assert_eq!(buffer.items.first().unwrap().id, "25");
    assert_eq!(buffer.items.last().unwrap().id, "6");
}

#[test]
#[ignore = "Requires a real QQ system notification on this Windows account"]
fn reads_a_real_qq_system_notification() {
    let deadline = std::time::Instant::now() + Duration::from_secs(60);
    loop {
        let (status, items) =
            read_notifications().expect("Windows notifications must be readable");
        assert_eq!(status, NotificationStatus::Listening);
        if !items.is_empty() {
            assert!(items
                .iter()
                .all(|item| item.id.starts_with("QQ:") && !item.title.is_empty()));
            return;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "Receive a real QQ notification during this test"
        );
        thread::sleep(Duration::from_secs(1));
    }
}
