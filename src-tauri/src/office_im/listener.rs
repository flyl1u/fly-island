//! Taskbar flashes of DingTalk, Feishu and WeCom, from the shell hook (the same signal the WeChat
//! reminder uses): a flashing button means an unread message; activating the client clears it.

use std::cell::RefCell;

use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};

use super::client::Client;
use super::desktop::client_of;
use crate::win32::{
    message_window::{self, WindowMessages},
    shell_hook, window,
};

const CLASS_NAME: &str = "Fly IslandOfficeImSource";
const HSHELL_WINDOWACTIVATED: usize = 4;
const HSHELL_RUDEAPPACTIVATED: usize = 0x8004;
const HSHELL_FLASH: usize = 0x8006;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Signal {
    Attention(Client),
    Activated(Client),
}

struct Context {
    message: u32,
    callback: Box<dyn FnMut(Signal)>,
}

thread_local! {
    static CONTEXT: RefCell<Option<Context>> = const { RefCell::new(None) };
}

struct OfficeImWindow;

impl WindowMessages for OfficeImWindow {
    fn handle(_: HWND, message: u32, kind: WPARAM, target: LPARAM) -> Option<LRESULT> {
        CONTEXT.with(|slot| {
            let Ok(mut context) = slot.try_borrow_mut() else { return };
            let Some(context) = context.as_mut() else { return };
            if message != context.message {
                return;
            }
            // Other shell messages may carry pointers instead of window handles.
            if !matches!(kind.0, HSHELL_FLASH | HSHELL_WINDOWACTIVATED | HSHELL_RUDEAPPACTIVATED) {
                return;
            }
            let Some(client) = client_of(window::root_owner(HWND(target.0 as *mut _))) else { return };
            if kind.0 != HSHELL_FLASH {
                (context.callback)(Signal::Activated(client));
            } else if client_of(window::root_owner(window::foreground_window())) != Some(client) {
                (context.callback)(Signal::Attention(client));
            }
        });
        None
    }
}

pub(super) struct Listener {
    window: HWND,
    instance: HINSTANCE,
}

impl Listener {
    pub(super) fn new(callback: impl FnMut(Signal) + 'static) -> Result<Self, String> {
        let message = shell_hook::hook_message().map_err(|error| format!("无法注册办公消息提醒：{error}"))?;
        let instance = message_window::module_instance().map_err(|error| error.to_string())?;
        message_window::register_class::<OfficeImWindow>(instance, CLASS_NAME).map_err(|error| error.to_string())?;
        let window = match message_window::create_tool_popup_window(instance, CLASS_NAME, "") {
            Ok(window) => window,
            Err(error) => {
                let _ = message_window::unregister_class(instance, CLASS_NAME);
                return Err(format!("无法创建办公消息提醒接收器：{error}"));
            }
        };
        CONTEXT.with(|slot| *slot.borrow_mut() = Some(Context { message, callback: Box::new(callback) }));
        // Built before registering the hook so a failure below still cleans up through Drop.
        let listener = Self { window, instance };
        shell_hook::register_window(window).map_err(|error| format!("无法监听任务栏提醒：{error}"))?;
        Ok(listener)
    }

    pub(super) fn poll(&self) {
        message_window::dispatch_pending_messages();
    }
}

impl Drop for Listener {
    fn drop(&mut self) {
        let _ = shell_hook::deregister_window(self.window);
        let _ = message_window::destroy_window(self.window);
        let _ = message_window::unregister_class(self.instance, CLASS_NAME);
        CONTEXT.with(|slot| *slot.borrow_mut() = None);
    }
}
