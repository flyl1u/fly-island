#[path = "../src/wechat_reminders/source.rs"]
mod wechat_reminder_source;

// source.rs uses crate::win32::{message_window, process, registry, shell_hook, window}.
// The probe needs only part of message_window and window, so their other
// functions are unused here.
mod win32 {
    #[path = "../../src/win32/message_window.rs"]
    #[allow(dead_code)]
    pub(crate) mod message_window;
    #[path = "../../src/win32/process.rs"]
    pub(crate) mod process;
    #[path = "../../src/win32/registry.rs"]
    pub(crate) mod registry;
    #[path = "../../src/win32/shell_hook.rs"]
    pub(crate) mod shell_hook;
    #[path = "../../src/win32/window.rs"]
    #[allow(dead_code)]
    pub(crate) mod window;
}

use serde_json::json;
use std::{
    cell::RefCell,
    env,
    path::PathBuf,
    process::ExitCode,
    rc::Rc,
    thread,
    time::{Duration, Instant},
};
use wechat_reminder_source::{installed_executable, ReminderListener, ReminderSignal};

fn main() -> ExitCode {
    match run() {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::from(2),
        Err(error) => {
            println!("{}", json!({"result": "error", "error": error}));
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<bool, String> {
    let mut seconds = 60;
    let mut executable = None;
    let mut args = env::args().skip(1);
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--watch-seconds" => {
                seconds = args
                    .next()
                    .and_then(|value| value.parse::<u64>().ok())
                    .filter(|value| *value <= 300)
                    .ok_or("--watch-seconds must be between 0 and 300")?;
            }
            "--exe" => executable = Some(PathBuf::from(args.next().ok_or("--exe needs a path")?)),
            _ => {
                return Err(
                    "Usage: wechat_reminder_probe [--watch-seconds 0..300] [--exe PATH]".into(),
                )
            }
        }
    }
    let executable = executable.map_or_else(installed_executable, Ok)?;
    if !executable.is_absolute()
        || !executable.is_file()
        || !executable.file_name().is_some_and(|name| {
            ["Weixin.exe", "WeChat.exe"]
                .iter()
                .any(|expected| name.to_string_lossy().eq_ignore_ascii_case(expected))
        })
    {
        return Err("Expected an existing, absolute Weixin.exe or WeChat.exe path".into());
    }
    let counts = Rc::new(RefCell::new([0u64; 4]));
    let callback_counts = counts.clone();
    let listener = ReminderListener::new(executable, move |signal| {
        let index = match signal {
            ReminderSignal::Attention => 0,
            ReminderSignal::Activated => 1,
            ReminderSignal::Redraw => 2,
            ReminderSignal::WindowCreated => 3,
        };
        callback_counts.borrow_mut()[index] += 1;
    })?;
    println!(
        "{}",
        json!({"phase": "listening", "watchSeconds": seconds,
        "source": "windowsShellAttention", "chatTextAvailable": false,
        "controlsWeChat": false, "modifiesSettings": false})
    );
    let deadline = Instant::now() + Duration::from_secs(seconds);
    while Instant::now() < deadline {
        listener.poll();
        thread::sleep(
            Duration::from_millis(30).min(deadline.saturating_duration_since(Instant::now())),
        );
    }
    let counts = counts.borrow();
    let stats = listener.stats();
    println!(
        "{}",
        json!({
            "result": if counts[0] > 0 { "wechat_attention_observed" } else { "not_verified" },
            "shellEvents": stats.shell_events, "weChatFlashEvents": counts[0],
            "weChatActivatedEvents": counts[1], "weChatRedrawEvents": counts[2],
            "weChatWindowCreatedEvents": counts[3], "processMetadataErrors": stats.metadata_errors,
            "chatTextAvailable": false,
        })
    );
    Ok(counts[0] > 0)
}
