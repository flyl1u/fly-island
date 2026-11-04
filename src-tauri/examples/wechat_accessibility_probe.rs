use serde_json::json;
use std::{
    collections::{BTreeMap, VecDeque},
    process::ExitCode,
    time::{Duration, Instant},
};
use windows::{
    core::{Interface, PWSTR},
    Win32::{
        Foundation::{CloseHandle, HWND, RECT},
        System::{
            Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                COINIT_MULTITHREADED,
            },
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
        UI::{
            Accessibility::{
                CUIAutomation8, IUIAutomation, IUIAutomation2, UIA_ListItemControlTypeId,
                UIA_TextControlTypeId,
            },
            WindowsAndMessaging::{
                GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
            },
        },
    },
};

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            println!("{}", json!({"result": "error", "error": error}));
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let handle = match args.as_slice() {
        [flag, value] if flag == "--window-handle" => value
            .parse::<usize>()
            .ok()
            .filter(|value| *value != 0)
            .ok_or("--window-handle must be a nonzero window handle")?,
        _ => return Err("Usage: wechat_accessibility_probe --window-handle HANDLE".into()),
    };
    let window = HWND(handle as *mut _);
    verify_wechat_window(window)?;
    // SAFETY: CoInitializeEx takes no pointers here; a success is paired with the
    // CoUninitialize below on this thread.
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
        .ok()
        .map_err(|error| error.to_string())?;
    let result = inspect(window);
    // SAFETY: pairs the successful CoInitializeEx above, on the same thread.
    unsafe { CoUninitialize() };
    result
}

fn verify_wechat_window(window: HWND) -> Result<(), String> {
    let mut process_id = 0;
    // SAFETY: GetWindowThreadProcessId accepts any HWND and writes into a valid local.
    unsafe { GetWindowThreadProcessId(window, Some(&mut process_id)) };
    // SAFETY: OpenProcess takes no pointers; the handle is closed below.
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) }
        .map_err(|error| error.to_string())?;
    let mut path = [0u16; 32768];
    let mut length = path.len() as u32;
    // SAFETY: process is a live handle with limited query access; path is a
    // writable buffer of length units and length is a valid in/out pointer.
    let result = unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(path.as_mut_ptr()),
            &mut length,
        )
    };
    // SAFETY: closes the handle opened above exactly once.
    unsafe {
        let _ = CloseHandle(process);
    }
    result.map_err(|error| error.to_string())?;
    let path = String::from_utf16_lossy(&path[..length as usize]).to_ascii_lowercase();
    if !path.ends_with("\\weixin.exe") && !path.ends_with("\\wechat.exe") {
        return Err("Only a WeChat/Weixin window may be inspected.".into());
    }
    Ok(())
}

fn inspect(window: HWND) -> Result<(), String> {
    // SAFETY: COM is initialized on this thread by run() for the whole call; the
    // automation interfaces are owned values used only within it.
    unsafe {
        let automation: IUIAutomation =
            CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| error.to_string())?;
        if let Ok(options) = automation.cast::<IUIAutomation2>() {
            let _ = options.SetConnectionTimeout(1000);
            let _ = options.SetTransactionTimeout(1000);
        }
        let root = automation
            .ElementFromHandle(window)
            .map_err(|error| error.to_string())?;
        let root_class = root
            .CurrentClassName()
            .map(|value| value.to_string())
            .unwrap_or_default();
        let walker = automation
            .ControlViewWalker()
            .map_err(|error| error.to_string())?;
        let mut queue = VecDeque::from([(root, 0usize)]);
        let mut classes = BTreeMap::<String, usize>::new();
        let mut controls = BTreeMap::<i32, usize>::new();
        let mut named_list_items = 0usize;
        let mut named_text_controls = 0usize;
        let mut inspected = 0usize;
        let mut bounded = false;
        let started = Instant::now();
        while let Some((element, depth)) = queue.pop_front() {
            if inspected >= 512 || started.elapsed() > Duration::from_secs(10) {
                bounded = true;
                break;
            }
            inspected += 1;
            let kind = element.CurrentControlType().unwrap_or_default();
            *controls.entry(kind.0).or_default() += 1;
            if let Ok(class) = element.CurrentClassName() {
                *classes.entry(class.to_string()).or_default() += 1;
            }
            // Count exposed text without printing, saving, or hashing message contents.
            let named = element.CurrentName().is_ok_and(|name| !name.is_empty());
            if named && kind == UIA_ListItemControlTypeId {
                named_list_items += 1;
            }
            if named && kind == UIA_TextControlTypeId {
                named_text_controls += 1;
            }
            if depth >= 8 {
                bounded = true;
                continue;
            }
            let mut next = walker.GetFirstChildElement(&element);
            while let Ok(child) = next {
                if inspected + queue.len() >= 512 || started.elapsed() > Duration::from_secs(10) {
                    bounded = true;
                    break;
                }
                next = walker.GetNextSiblingElement(&child);
                queue.push_back((child, depth + 1));
            }
        }
        let mut rect = RECT::default();
        let _ = GetWindowRect(window, &mut rect);
        println!(
            "{}",
            json!({"result": "inspection_completed", "rootClass": root_class, "windowVisible": IsWindowVisible(window).as_bool(), "windowMinimized": IsIconic(window).as_bool(), "width": rect.right - rect.left, "height": rect.bottom - rect.top, "inspectedControls": inspected, "namedListItems": named_list_items, "namedTextControls": named_text_controls, "classes": classes, "controlTypes": controls, "bounded": bounded, "elapsedMs": started.elapsed().as_millis()})
        );
        Ok(())
    }
}
