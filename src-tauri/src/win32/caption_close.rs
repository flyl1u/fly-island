//! Route a click on an identified caption button to the native minimize command.

use std::{
    cell::RefCell,
    sync::{mpsc, Arc, Mutex},
    thread::{self, JoinHandle},
    time::Duration,
};

use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM},
    System::Threading::GetCurrentThreadId,
    UI::{
        HiDpi::{
            SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT,
            DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        },
        WindowsAndMessaging::{
            CallNextHookEx, GetAncestor, PeekMessageW, PostMessageW, PostThreadMessageW,
            SetWindowsHookExW, UnhookWindowsHookEx, WindowFromPoint, GA_ROOT, HC_ACTION, HHOOK,
            MSG, MSLLHOOKSTRUCT, PM_NOREMOVE, SC_MINIMIZE, WH_MOUSE_LL, WM_LBUTTONDOWN,
            WM_LBUTTONUP, WM_NULL, WM_QUIT, WM_SYSCOMMAND,
        },
    },
};

use super::{message_window, process::window_process_id, uia_list, window};

struct PhysicalCoordinates(DPI_AWARENESS_CONTEXT);

impl PhysicalCoordinates {
    fn enter() -> Option<Self> {
        // SAFETY: changes the DPI context of this thread only. Low-level mouse points use
        // per-monitor coordinates, so the window and UIA queries must use that space too.
        let previous =
            unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
        if previous.0.is_null() {
            return None;
        }
        Some(Self(previous))
    }
}

impl Drop for PhysicalCoordinates {
    fn drop(&mut self) {
        // SAFETY: restores the context returned by SetThreadDpiAwarenessContext on this thread.
        let _ = unsafe { SetThreadDpiAwarenessContext(self.0) };
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct WindowId {
    raw: usize,
    process: u32,
}

impl WindowId {
    fn handle(self) -> HWND {
        HWND(self.raw as *mut _)
    }
}

#[derive(Clone, Copy)]
struct CaptionButton {
    window: WindowId,
    frame: RECT,
    rect: RECT,
}

impl CaptionButton {
    fn hit(self, point: POINT) -> bool {
        let window = self.window.handle();
        if window_process_id(window) != self.window.process
            || !window::is_visible(window)
            || window::is_minimized(window)
        {
            return false;
        }
        let Some(_coordinates) = PhysicalCoordinates::enter() else {
            return false;
        };
        let Some(frame) = window::window_rect(window) else {
            return false;
        };
        if !in_button(point, self.frame, frame, self.rect) {
            return false;
        }
        // SAFETY: both calls take only values. The root check excludes other windows covering the button.
        unsafe { GetAncestor(WindowFromPoint(point), GA_ROOT) == window }
    }
}

fn in_button(point: POINT, sampled: RECT, current: RECT, rect: RECT) -> bool {
    if current.right - current.left != sampled.right - sampled.left
        || current.bottom - current.top != sampled.bottom - sampled.top
    {
        return false;
    }
    let x = point.x - (current.left - sampled.left);
    let y = point.y - (current.top - sampled.top);
    (rect.left..rect.right).contains(&x) && (rect.top..rect.bottom).contains(&y)
}

struct Context {
    button: Arc<Mutex<Option<CaptionButton>>>,
    pressed: Option<WindowId>,
    minimized: mpsc::SyncSender<WindowId>,
}

impl Context {
    fn click(&mut self, message: u32, point: POINT) -> bool {
        let button = self.button.try_lock().ok().and_then(|button| *button);
        if message == WM_LBUTTONDOWN {
            self.pressed = button
                .filter(|button| button.hit(point))
                .map(|button| button.window);
            return self.pressed.is_some();
        }
        let Some(pressed) = self.pressed.take() else {
            return false;
        };
        if button.is_some_and(|button| button.window == pressed && button.hit(point)) {
            // SAFETY: the matched HWND belongs to the verified target, and SC_MINIMIZE carries no pointer.
            let sent = unsafe {
                PostMessageW(
                    Some(pressed.handle()),
                    WM_SYSCOMMAND,
                    WPARAM(SC_MINIMIZE as usize),
                    LPARAM(0),
                )
            };
            if sent.is_ok() {
                let _ = self.minimized.try_send(pressed);
            }
        }
        // The matching down event was consumed. Preserve click cancellation when the pointer moved away.
        true
    }
}

thread_local! {
    static CONTEXT: RefCell<Option<Context>> = const { RefCell::new(None) };
}

unsafe extern "system" fn mouse_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let message = wparam.0 as u32;
    if code == HC_ACTION as i32 && matches!(message, WM_LBUTTONDOWN | WM_LBUTTONUP) && lparam.0 != 0
    {
        // SAFETY: for HC_ACTION, Windows passes a live MSLLHOOKSTRUCT for the duration of the callback.
        let point = unsafe { (*(lparam.0 as *const MSLLHOOKSTRUCT)).pt };
        let handled = CONTEXT.with(|context| {
            context.try_borrow_mut().ok().is_some_and(|mut context| {
                context
                    .as_mut()
                    .is_some_and(|context| context.click(message, point))
            })
        });
        if handled {
            return LRESULT(1);
        }
    }
    // SAFETY: these are the original parameters for this hook callback. The hook argument is ignored.
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

struct InstalledHook(HHOOK);

impl Drop for InstalledHook {
    fn drop(&mut self) {
        // SAFETY: this guard owns the hook and is dropped on the installing thread.
        let _ = unsafe { UnhookWindowsHookEx(self.0) };
    }
}

pub(crate) struct CaptionCloseHook {
    button: Arc<Mutex<Option<CaptionButton>>>,
    minimized: mpsc::Receiver<WindowId>,
    worker: Option<JoinHandle<()>>,
    thread_id: u32,
}

impl CaptionCloseHook {
    pub(crate) fn start() -> Option<Self> {
        let button = Arc::new(Mutex::new(None));
        let (send_minimized, minimized) = mpsc::sync_channel(4);
        let (ready, started) = mpsc::sync_channel(1);
        let context = Context {
            button: Arc::clone(&button),
            pressed: None,
            minimized: send_minimized,
        };
        let worker = thread::Builder::new()
            .name("caption-close-hook".into())
            .spawn(move || {
                let Ok(module) = message_window::module_instance() else {
                    return;
                };
                CONTEXT.with(|slot| *slot.borrow_mut() = Some(context));
                // SAFETY: this creates the thread queue before publishing its ID. The callback
                // lives in this module and WH_MOUSE_LL calls back on this same thread.
                let (thread_id, installed) = unsafe {
                    let mut message = MSG::default();
                    let _ = PeekMessageW(&mut message, None, WM_NULL, WM_NULL, PM_NOREMOVE);
                    (
                        GetCurrentThreadId(),
                        SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook), Some(module), 0),
                    )
                };
                if let Ok(hook) = installed {
                    let _hook = InstalledHook(hook);
                    if ready.send(thread_id).is_ok() {
                        message_window::run_message_loop();
                    }
                }
            })
            .ok()?;
        let thread_id = started.recv_timeout(Duration::from_secs(1)).ok()?;
        Some(Self {
            button,
            minimized,
            worker: Some(worker),
            thread_id,
        })
    }

    pub(crate) fn refresh_button(&self, window: HWND, process: u32, class: &str, names: &[&str]) {
        let Some(_coordinates) = PhysicalCoordinates::enter() else {
            return;
        };
        let Some(frame) = window::window_rect(window) else {
            return;
        };
        let target = WindowId {
            raw: window.0 as usize,
            process,
        };
        if self.button.lock().is_ok_and(|button| {
            button.is_some_and(|button| button.window == target && button.frame == frame)
        }) {
            return;
        }
        // Query the provider off the input hook's thread. A slow UIA read cannot stall the mouse.
        let button = uia_list::caption_button_rect(window, class, names)
            .filter(|_| window::window_rect(window) == Some(frame))
            .filter(|_| message_window::post_message(window, WM_NULL).is_ok())
            .map(|rect| CaptionButton {
                window: target,
                frame,
                rect,
            });
        if let Ok(mut current) = self.button.lock() {
            *current = button;
        }
    }

    pub(crate) fn clear_button(&self) {
        if let Ok(mut current) = self.button.lock() {
            *current = None;
        }
    }

    pub(crate) fn take_minimize_request(&self) -> Option<(HWND, u32)> {
        let window = self.minimized.try_iter().last()?;
        Some((window.handle(), window.process))
    }
}

impl Drop for CaptionCloseHook {
    fn drop(&mut self) {
        // SAFETY: this is the ID of our message-loop thread and WM_QUIT takes no pointers.
        if unsafe { PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0)) }.is_ok() {
            if let Some(worker) = self.worker.take() {
                let _ = worker.join();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn follows_window_moves_and_rejects_clicks_outside_the_confirmed_button() {
        let frame = RECT {
            left: 10,
            top: 20,
            right: 510,
            bottom: 320,
        };
        let button = RECT {
            left: 462,
            top: 20,
            right: 502,
            bottom: 50,
        };
        let moved = RECT {
            left: 30,
            top: 30,
            right: 530,
            bottom: 330,
        };
        assert!(in_button(POINT { x: 490, y: 32 }, frame, moved, button));
        assert!(!in_button(POINT { x: 460, y: 32 }, frame, moved, button));
        assert!(!in_button(POINT { x: 490, y: 60 }, frame, moved, button));
        let resized = RECT {
            right: 535,
            ..moved
        };
        assert!(!in_button(POINT { x: 495, y: 32 }, frame, resized, button));
    }
}
