//! Finding a client's windows and bringing its main window forward.

use std::{path::Path, process::Stdio, thread, time::Duration, time::Instant};

use windows::Win32::Foundation::HWND;

use super::client::{feishu_title, main_frame, wake_route, Client, WakeRoute, DINGTALK_FRAME};
use crate::win32::{process, window};

/// The client a top-level window's process runs, from its program's file name.
pub(super) fn client_of(target: HWND) -> Option<Client> {
    let pid = process::window_process_id(target);
    if pid == 0 {
        return None;
    }
    let path = process::image_path(pid)?;
    Client::from_executable(Path::new(&path).file_name()?.to_str()?)
}

struct Candidate {
    handle: HWND,
    pid: u32,
    class: String,
    title: String,
}

fn candidates(client: Client) -> Vec<Candidate> {
    let mut found = Vec::new();
    let _ = window::for_each_top_level_window(|handle| {
        if window::has_owner(handle) || client_of(handle) != Some(client) {
            return;
        }
        let class = window::class_name(handle);
        let (style, extended) = window::styles(handle);
        if main_frame(client, &class, style, extended) {
            found.push(Candidate {
                handle,
                pid: process::window_process_id(handle),
                class,
                title: window::window_text(handle, 256),
            });
        }
    });
    found
}

/// The client's main window: DingTalk's new frame before its old Qt windows (hidden Qt dialogs
/// share the process), Feishu's window titled with the app's name, then visible before hidden.
fn main_window(client: Client) -> Option<(HWND, u32)> {
    let mut found = candidates(client);
    match client {
        Client::Dingtalk if found.iter().any(|c| c.class == DINGTALK_FRAME) => {
            found.retain(|c| c.class == DINGTALK_FRAME)
        }
        Client::Feishu if found.iter().any(|c| feishu_title(&c.title)) => found.retain(|c| feishu_title(&c.title)),
        _ => {}
    }
    found.sort_by_key(|c| (!window::is_visible(c.handle), window::is_minimized(c.handle)));
    found.first().map(|c| (c.handle, c.pid))
}

/// Brings the client's main window to the front, the way its own taskbar button would.
pub(super) fn open(client: Client) -> Result<(), String> {
    let name = client.name();
    let Some((handle, pid)) = main_window(client) else {
        return Err(format!("没有找到正在运行的{name}，请先打开{name}。"));
    };
    match wake_route(client, window::is_visible(handle), window::is_minimized(handle)) {
        WakeRoute::Focus => {}
        WakeRoute::Restore | WakeRoute::Show => window::show_async(handle),
        WakeRoute::Relaunch => return relaunch(client, handle, pid),
    }
    if window::force_foreground(handle) {
        Ok(())
    } else {
        Err(format!("已找到{name}窗口，但未能切换到前台，请点击任务栏或托盘中的{name}。"))
    }
}

/// Starts the window's own program again (single instance: the running client shows its window)
/// and waits up to 3 s for it to appear.
fn relaunch(client: Client, handle: HWND, pid: u32) -> Result<(), String> {
    let name = client.name();
    let path = process::image_path(pid).ok_or_else(|| format!("无法读取{name}的程序路径。"))?;
    if Path::new(&path).file_name().and_then(|f| f.to_str()).and_then(Client::from_executable) != Some(client) {
        return Err(format!("{name}的程序路径不正确。"));
    }
    let mut command = std::process::Command::new(&path);
    if let Some(directory) = Path::new(&path).parent() {
        command.current_dir(directory);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("无法打开{name}：{error}"))?;
    let until = Instant::now() + Duration::from_secs(3);
    while Instant::now() < until {
        if window::is_visible(handle) {
            let _ = window::force_foreground(handle);
            return Ok(());
        }
        thread::sleep(Duration::from_millis(50));
    }
    Err(format!("{name}没有显示主窗口，请从系统托盘打开{name}。"))
}
