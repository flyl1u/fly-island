//! Safe wrappers around Win32 / COM calls. New `unsafe` code lives only in this
//! module; callers elsewhere use the safe functions it exposes.

pub(crate) mod audio;
pub(crate) mod clipboard;
pub(crate) mod com;
pub(crate) mod hotkey;
pub(crate) mod input;
pub(crate) mod job;
pub(crate) mod known_folder;
pub(crate) mod message_window;
pub(crate) mod notification_state;
pub(crate) mod ole;
pub(crate) mod process;
pub(crate) mod process_times;
pub(crate) mod registry;
pub(crate) mod shell_hook;
pub(crate) mod url_protocol;
pub(crate) mod webview_page;
pub(crate) mod window;
