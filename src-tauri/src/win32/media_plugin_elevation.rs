use std::{mem::size_of, path::Path};
use windows::{core::{HSTRING, PCWSTR}, Win32::{Foundation::{ERROR_CANCELLED, WAIT_OBJECT_0}, Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH}, System::Threading::{WaitForSingleObject, GetExitCodeProcess, INFINITE}, UI::{Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_NOCLOSEPROCESS, SEE_MASK_NOASYNC}, WindowsAndMessaging::SW_HIDE}}};
use super::process::ProcessHandle;

pub(crate) fn move_new(source: &Path, target: &Path) -> std::io::Result<()> {
    move_file(source, target, false)
}
pub(crate) fn replace(source: &Path, target: &Path) -> std::io::Result<()> {
    move_file(source, target, true)
}
fn move_file(source: &Path, target: &Path, replace: bool) -> std::io::Result<()> {
    let source = HSTRING::from(source.as_os_str()); let target = HSTRING::from(target.as_os_str());
    // SAFETY: both paths are NUL-terminated and live throughout the call.
    let flags = if replace { MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH } else { MOVEFILE_WRITE_THROUGH };
    // SAFETY: both paths are NUL-terminated and live throughout the call.
    unsafe { MoveFileExW(&source, &target, flags) }
        .map_err(|_| std::io::Error::last_os_error())
}
pub(crate) fn run(args: &[String]) -> Result<(), String> {
    // Paths containing quotes cannot be Win32 file names; reject rather than interpolate them.
    if args.iter().any(|s| s.contains(['"', '\0', '\r', '\n'])) { return Err("Invalid helper argument".into()); }
    let exe = HSTRING::from(std::env::current_exe().map_err(|e| e.to_string())?.as_os_str());
    let verb = HSTRING::from("runas");
    let parameters = HSTRING::from(args.iter().map(|s| format!("\"{s}\"")).collect::<Vec<_>>().join(" "));
    let mut info = SHELLEXECUTEINFOW { cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC, lpVerb: PCWSTR(verb.as_ptr()),
        lpFile: PCWSTR(exe.as_ptr()), lpParameters: PCWSTR(parameters.as_ptr()), nShow: SW_HIDE.0, ..Default::default() };
    // SAFETY: info is initialized with valid strings that outlive this synchronous call.
    if let Err(error) = unsafe { ShellExecuteExW(&mut info) } {
        return Err(if error.code() == windows::core::HRESULT::from_win32(ERROR_CANCELLED.0) { "UserDeclined".into() } else { error.to_string() });
    }
    if info.hProcess.is_invalid() { return Err("Missing helper process handle".into()); }
    let process = ProcessHandle(info.hProcess);
    // SAFETY: process owns a valid live process handle; no borrowed pointers.
    if unsafe { WaitForSingleObject(process.0, INFINITE) } != WAIT_OBJECT_0 { return Err("Could not wait for helper".into()); }
    let mut code = 1;
    // SAFETY: process handle and writable exit code are valid.
    unsafe { GetExitCodeProcess(process.0, &mut code) }.map_err(|e| e.to_string())?;
    if code == 0 { Ok(()) } else { Err(format!("Plugin helper exited with {code}")) }
}
