//! Native desktop access stays behind safe functions in this plugin.
pub mod fullscreen;
pub mod idle;

pub fn initialize_dpi() {
    use windows::Win32::UI::HiDpi::{
        SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };
    // SAFETY: called before this process creates windows; an existing DPI policy is retained.
    let _ = unsafe { SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
}
