//! 企业微信 / 钉钉 / 飞书 办公通讯提醒插件。
//! Portions derived from Renly1994/xiaotang-daozai (MIT License).

use fly_island_plugin_sdk::{empty, json, notification, now, publish, run, Value};
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use windows::{
    core::{w, BOOL, PWSTR},
    Win32::{
        Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
        System::{
            LibraryLoader::GetModuleHandleW,
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
        UI::WindowsAndMessaging::*,
    },
};

const FLASH: usize = 0x8006;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Client {
    WeWork,
    Feishu,
    DingTalk,
}

impl Client {
    pub const ALL: [Client; 3] = [Client::WeWork, Client::Feishu, Client::DingTalk];

    pub fn key(self) -> &'static str {
        match self {
            Client::WeWork => "wework",
            Client::Feishu => "feishu",
            Client::DingTalk => "dingtalk",
        }
    }

    pub fn app_name(self) -> &'static str {
        match self {
            Client::WeWork => "企业微信",
            Client::Feishu => "飞书",
            Client::DingTalk => "钉钉",
        }
    }

    pub fn action_id(self) -> &'static str {
        match self {
            Client::WeWork => "open_wework",
            Client::Feishu => "open_feishu",
            Client::DingTalk => "open_dingtalk",
        }
    }

    pub fn from_action(action: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|c| c.action_id() == action)
    }

    pub fn enabled(self, settings: &Value) -> bool {
        settings[self.key()].as_bool().unwrap_or(true)
    }
}

pub fn identify_client(class: &str, exe_name: &str) -> Option<Client> {
    let lower_exe = exe_name.to_ascii_lowercase();
    if class == "WeWorkWindow" || lower_exe == "wxwork.exe" || lower_exe == "wework.exe" {
        Some(Client::WeWork)
    } else if class == "Chrome_WidgetWin_1" && lower_exe == "feishu.exe" {
        Some(Client::Feishu)
    } else if (class == "StandardFrame_DingTalk"
        || (class.starts_with("Qt") && class.ends_with("QWindowIcon")))
        && lower_exe == "dingtalk.exe"
    {
        Some(Client::DingTalk)
    } else {
        None
    }
}

unsafe fn window_class(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    let len = GetClassNameW(hwnd, &mut buffer);
    if len > 0 {
        String::from_utf16_lossy(&buffer[..len as usize])
    } else {
        String::new()
    }
}

unsafe fn window_title(hwnd: HWND) -> String {
    let mut buffer = [0u16; 512];
    let len = GetWindowTextW(hwnd, &mut buffer);
    if len > 0 {
        String::from_utf16_lossy(&buffer[..len as usize]).trim().to_owned()
    } else {
        String::new()
    }
}

unsafe fn process_exe(pid: u32) -> Option<String> {
    let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
        return None;
    };
    let mut buffer = [0u16; 1024];
    let mut size = buffer.len() as u32;
    let res = QueryFullProcessImageNameW(process, PROCESS_NAME_FORMAT(0), PWSTR(buffer.as_mut_ptr()), &mut size);
    let _ = windows::Win32::Foundation::CloseHandle(process);
    if res.is_ok() && size > 0 {
        let full = String::from_utf16_lossy(&buffer[..size as usize]);
        Path::new(&full).file_name().and_then(|f| f.to_str()).map(str::to_owned)
    } else {
        None
    }
}

#[derive(Default)]
struct State {
    last_flash: HashMap<Client, Instant>,
    windows: HashMap<Client, isize>,
    notifications: HashMap<Client, Value>,
    settings: Value,
}

static STATE: std::sync::OnceLock<Arc<Mutex<State>>> = std::sync::OnceLock::new();

fn get_state() -> &'static Arc<Mutex<State>> {
    STATE.get_or_init(|| Arc::new(Mutex::new(State::default())))
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    let state_arc = get_state();
    if msg == WM_NCDESTROY {
        let _ = DeregisterShellHookWindow(hwnd);
        return DefWindowProcW(hwnd, msg, wparam, lparam);
    }

    if matches!(wparam.0, FLASH | 4 | 0x8004) {
        let target = HWND(lparam.0 as *mut _);
        if IsWindow(Some(target)).as_bool() {
            let class = window_class(target);
            let mut pid = 0u32;
            GetWindowThreadProcessId(target, Some(&mut pid));
            let exe = process_exe(pid).unwrap_or_default();
            if let Some(client) = identify_client(&class, &exe) {
                let fg = GetForegroundWindow();
                let is_fg = fg == target || GetAncestor(target, GA_ROOTOWNER) == fg;
                let now_inst = Instant::now();

                let mut st = state_arc.lock().unwrap();
                if !client.enabled(&st.settings) {
                    return DefWindowProcW(hwnd, msg, wparam, lparam);
                }

                if is_fg || wparam.0 == 4 || wparam.0 == 0x8004 {
                    // Window activated or already in foreground: clear notification
                    if st.notifications.remove(&client).is_some() {
                        let active: Vec<Value> = st.notifications.values().cloned().collect();
                        drop(st);
                        let _ = publish(json!({
                            "quota": [],
                            "sessions": [],
                            "notifications": active,
                        }));
                    }
                } else if wparam.0 == FLASH {
                    // Check burst suppression (3s)
                    let suppress = st
                        .last_flash
                        .get(&client)
                        .is_some_and(|last| now_inst.duration_since(*last) < Duration::from_secs(3));
                    if !suppress {
                        st.last_flash.insert(client, now_inst);
                        st.windows.insert(client, target.0 as isize);
                        let title = window_title(target);
                        let body = if title.is_empty() || title == client.app_name() {
                            "收到新消息"
                        } else {
                            &title
                        };
                        let notif = notification(
                            &format!("{}-{}", client.key(), now()),
                            &format!("office-im-{}", client.key()),
                            client.app_name(),
                            client.key(),
                            client.app_name(),
                            body,
                            Some(client.action_id()),
                        );
                        st.notifications.insert(client, notif);
                        let active: Vec<Value> = st.notifications.values().cloned().collect();
                        drop(st);
                        let _ = publish(json!({
                            "quota": [],
                            "sessions": [],
                            "notifications": active,
                        }));
                    }
                }
            }
        }
    }

    DefWindowProcW(hwnd, msg, wparam, lparam)
}

fn start_listener() -> Result<HWND, String> {
    unsafe {
        let class_name = w!("FlyIslandOfficeIMListener");
        let hinstance = GetModuleHandleW(None).map(|m| HINSTANCE(m.0)).unwrap_or_default();
        let wnd_class = WNDCLASSW {
            lpfnWndProc: Some(window_proc),
            hInstance: hinstance,
            lpszClassName: class_name,
            ..Default::default()
        };
        let _ = RegisterClassW(&wnd_class);
        let hwnd = CreateWindowExW(
            WS_EX_TOOLWINDOW,
            class_name,
            w!("FlyIslandOfficeIM"),
            WS_POPUP,
            0,
            0,
            0,
            0,
            None,
            None,
            Some(hinstance),
            None,
        )
        .map_err(|e| format!("无法创建监听窗口：{e}"))?;

        let shellhook_msg = RegisterWindowMessageW(w!("SHELLHOOK"));
        let taskbar_created_msg = RegisterWindowMessageW(w!("TaskbarCreated"));
        for msg in [shellhook_msg, taskbar_created_msg] {
            if msg != 0 {
                let _ = ChangeWindowMessageFilterEx(hwnd, msg, MSGFLT_ALLOW, None);
            }
        }
        RegisterShellHookWindow(hwnd)
            .ok()
            .map_err(|e| format!("RegisterShellHookWindow 失败：{e}"))?;
        Ok(hwnd)
    }
}

fn activate_window(client: Client) -> Result<(), String> {
    let state_arc = get_state();
    let hwnd_opt = {
        let mut st = state_arc.lock().unwrap();
        st.notifications.remove(&client);
        st.windows.get(&client).copied()
    };
    if let Some(h_val) = hwnd_opt {
        let hwnd = HWND(h_val as *mut _);
        unsafe {
            if IsWindow(Some(hwnd)).as_bool() {
                if IsIconic(hwnd).as_bool() {
                    let _ = ShowWindowAsync(hwnd, SW_RESTORE);
                } else if !IsWindowVisible(hwnd).as_bool() {
                    let _ = ShowWindowAsync(hwnd, SW_SHOW);
                }
                let _ = SetForegroundWindow(hwnd);
                return Ok(());
            }
        }
    }
    // Fallback: search for top level window of this client
    unsafe {
        struct Search {
            client: Client,
            found: Option<HWND>,
        }
        unsafe extern "system" fn visit(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let search = &mut *(lparam.0 as *mut Search);
            if IsWindow(Some(hwnd)).as_bool() {
                let class = window_class(hwnd);
                let mut pid = 0u32;
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
                let exe = process_exe(pid).unwrap_or_default();
                if identify_client(&class, &exe) == Some(search.client) {
                    search.found = Some(hwnd);
                    return false.into();
                }
            }
            true.into()
        }
        let mut search = Search { client, found: None };
        let _ = EnumWindows(Some(visit), LPARAM((&mut search as *mut Search) as isize));
        if let Some(target) = search.found {
            if IsIconic(target).as_bool() {
                let _ = ShowWindowAsync(target, SW_RESTORE);
            } else if !IsWindowVisible(target).as_bool() {
                let _ = ShowWindowAsync(target, SW_SHOW);
            }
            let _ = SetForegroundWindow(target);
            return Ok(());
        }
    }
    Err(format!("未找到{}窗口", client.app_name()))
}

fn main() {
    let state_arc = get_state();

    // Start background Windows message pump thread
    std::thread::spawn(|| {
        let hwnd = match start_listener() {
            Ok(h) => h,
            Err(e) => {
                eprintln!("Office IM listener start error: {e}");
                return;
            }
        };
        unsafe {
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let _ = DestroyWindow(hwnd);
        }
    });

    if run(
        Duration::from_secs(30),
        move |settings| {
            let mut st = state_arc.lock().unwrap();
            st.settings = settings.clone();
            let notifications: Vec<Value> = st.notifications.values().cloned().collect();
            if notifications.is_empty() {
                Ok(empty())
            } else {
                Ok(json!({
                    "quota": [],
                    "sessions": [],
                    "notifications": notifications,
                }))
            }
        },
        move |action_id, _| {
            if let Some(client) = Client::from_action(action_id) {
                activate_window(client)?;
                let st = get_state().lock().unwrap();
                let active: Vec<Value> = st.notifications.values().cloned().collect();
                drop(st);
                let _ = publish(json!({
                    "quota": [],
                    "sessions": [],
                    "notifications": active,
                }));
                Ok(json!({"success": true}))
            } else {
                Err(format!("未知操作：{action_id}"))
            }
        },
    )
    .is_err()
    {
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identify_clients() {
        assert_eq!(
            identify_client("WeWorkWindow", "WXWork.exe"),
            Some(Client::WeWork)
        );
        assert_eq!(
            identify_client("RandomClass", "wework.exe"),
            Some(Client::WeWork)
        );
        assert_eq!(
            identify_client("Chrome_WidgetWin_1", "Feishu.exe"),
            Some(Client::Feishu)
        );
        assert_eq!(
            identify_client("Chrome_WidgetWin_1", "chrome.exe"),
            None
        );
        assert_eq!(
            identify_client("StandardFrame_DingTalk", "DingTalk.exe"),
            Some(Client::DingTalk)
        );
        assert_eq!(
            identify_client("Qt5152QWindowIcon", "DingTalk.exe"),
            Some(Client::DingTalk)
        );
        assert_eq!(
            identify_client("StandardFrame_DingTalk", "other.exe"),
            None
        );
    }

    #[test]
    fn test_client_properties() {
        assert_eq!(Client::WeWork.key(), "wework");
        assert_eq!(Client::Feishu.key(), "feishu");
        assert_eq!(Client::DingTalk.key(), "dingtalk");
        assert_eq!(Client::from_action("open_wework"), Some(Client::WeWork));
        assert_eq!(Client::from_action("open_feishu"), Some(Client::Feishu));
        assert_eq!(Client::from_action("open_dingtalk"), Some(Client::DingTalk));
        assert_eq!(Client::from_action("unknown"), None);
    }
}