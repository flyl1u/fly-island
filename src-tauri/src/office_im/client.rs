//! Which desktop client a window belongs to, and which of its windows is the main one.
//! Window rules derived from Renly1994/xiaotang-daozai `src/messenger/desktop.rs` (MIT License,
//! Copyright (c) 2026 小唐的Token and Daozai contributors).

use serde::{Deserialize, Serialize};

const WS_CHILD: u32 = 0x4000_0000;
const WS_CAPTION: u32 = 0x00C0_0000;
const WS_SYSMENU: u32 = 0x0008_0000;
const WS_THICKFRAME: u32 = 0x0004_0000;
const WS_MINIMIZEBOX: u32 = 0x0002_0000;
const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
const WS_EX_NOACTIVATE: u32 = 0x0800_0000;

pub(super) const DINGTALK_FRAME: &str = "StandardFrame_DingTalk";
const FEISHU_TITLES: [&str; 3] = ["飞书", "Feishu", "Lark"];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Client {
    Dingtalk,
    Feishu,
    Wecom,
}

impl Client {
    pub(super) const ALL: [Client; 3] = [Client::Dingtalk, Client::Feishu, Client::Wecom];

    pub(super) fn name(self) -> &'static str {
        match self {
            Client::Dingtalk => "钉钉",
            Client::Feishu => "飞书",
            Client::Wecom => "企业微信",
        }
    }

    fn executable(self) -> &'static str {
        match self {
            Client::Dingtalk => "dingtalk.exe",
            Client::Feishu => "feishu.exe",
            Client::Wecom => "wxwork.exe",
        }
    }

    /// The client whose program is `exe_name` (file name only, any case).
    pub(super) fn from_executable(exe_name: &str) -> Option<Client> {
        let lower = exe_name.to_ascii_lowercase();
        Client::ALL.into_iter().find(|client| client.executable() == lower)
    }
}

/// Whether the class and styles look like the client's main frame rather than a popup, tooltip or
/// hidden helper window (`frame_style` in the reference).
pub(super) fn main_frame(client: Client, class: &str, style: u32, extended: u32) -> bool {
    if style & WS_CHILD != 0 || extended & (WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE) != 0 {
        return false;
    }
    let frame = WS_SYSMENU | WS_MINIMIZEBOX;
    let resizable = WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX;
    let framed = style & frame == frame
        || (class.starts_with("Qt") || class == "Chrome_WidgetWin_1") && style & resizable == resizable;
    match client {
        Client::Wecom => class == "WeWorkWindow",
        Client::Feishu => class == "Chrome_WidgetWin_1" && framed,
        Client::Dingtalk => {
            (class == DINGTALK_FRAME || class.starts_with("Qt") && class.ends_with("QWindowIcon")) && framed
        }
    }
}

pub(super) fn feishu_title(title: &str) -> bool {
    FEISHU_TITLES.iter().any(|name| name.eq_ignore_ascii_case(title.trim()))
}

/// How to bring a main window forward. Feishu closed to the tray must show itself: a Win32
/// `ShowWindow` leaves its webview on the loading skeleton (reference #181), so its own program is
/// started again (single instance) instead. The other clients follow the reference's `Show`.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum WakeRoute {
    Focus,
    Restore,
    Show,
    Relaunch,
}

pub(super) fn wake_route(client: Client, visible: bool, minimized: bool) -> WakeRoute {
    if minimized {
        WakeRoute::Restore
    } else if visible {
        WakeRoute::Focus
    } else if client == Client::Feishu {
        WakeRoute::Relaunch
    } else {
        WakeRoute::Show
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FRAME: u32 = WS_CAPTION | WS_SYSMENU | WS_THICKFRAME | WS_MINIMIZEBOX;
    const WS_POPUP: u32 = 0x8000_0000;

    #[test]
    fn clients_are_told_apart_by_their_program() {
        assert_eq!(Client::from_executable("DingTalk.exe"), Some(Client::Dingtalk));
        assert_eq!(Client::from_executable("Feishu.exe"), Some(Client::Feishu));
        assert_eq!(Client::from_executable("WXWork.exe"), Some(Client::Wecom));
        assert_eq!(Client::from_executable("chrome.exe"), None);
    }

    #[test]
    fn only_main_frames_count() {
        assert!(main_frame(Client::Wecom, "WeWorkWindow", WS_POPUP, 0));
        assert!(main_frame(Client::Feishu, "Chrome_WidgetWin_1", FRAME, 0));
        assert!(main_frame(Client::Dingtalk, "Qt51511QWindowIcon", FRAME, 0));
        assert!(main_frame(Client::Dingtalk, DINGTALK_FRAME, 0x360f_0000, 0x100));
        assert!(!main_frame(Client::Feishu, "Chrome_WidgetWin_1", WS_POPUP, 0));
        assert!(!main_frame(Client::Dingtalk, DINGTALK_FRAME, FRAME, WS_EX_TOOLWINDOW));
        assert!(!main_frame(Client::Dingtalk, DINGTALK_FRAME, FRAME | WS_CHILD, 0));
        assert!(!main_frame(Client::Wecom, "WeWorkWindow", WS_POPUP, WS_EX_TOOLWINDOW));
        assert!(!main_frame(Client::Feishu, DINGTALK_FRAME, FRAME, 0));
    }

    #[test]
    fn feishu_in_the_tray_shows_itself() {
        assert_eq!(wake_route(Client::Feishu, false, false), WakeRoute::Relaunch);
        assert_eq!(wake_route(Client::Feishu, true, true), WakeRoute::Restore);
        assert_eq!(wake_route(Client::Feishu, true, false), WakeRoute::Focus);
        for client in [Client::Dingtalk, Client::Wecom] {
            assert_eq!(wake_route(client, false, false), WakeRoute::Show);
        }
        assert!(feishu_title(" Lark ") && !feishu_title("会议"));
    }
}
