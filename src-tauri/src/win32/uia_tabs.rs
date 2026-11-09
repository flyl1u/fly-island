//! Tabs of another app's window through UI Automation: read their titles and select one. Windows
//! Terminal has no API to switch to a tab by session (microsoft/terminal#19783), but its tab strip
//! exposes each tab as a TabItem element named after the tab title.

use windows::{
    core::Interface,
    Win32::{
        Foundation::HWND,
        System::{
            Com::{CoCreateInstance, CLSCTX_INPROC_SERVER},
            Variant::VARIANT,
        },
        UI::Accessibility::{
            CUIAutomation8, IUIAutomation, IUIAutomation2, IUIAutomationSelectionItemPattern,
            TreeScope_Descendants, UIA_ControlTypePropertyId, UIA_SelectionItemPatternId,
            UIA_TabItemControlTypeId,
        },
    },
};

use super::com::ComApartment;

/// How long one UI Automation call may wait for the other app before giving up.
const TIMEOUT_MS: u32 = 1000;

/// Reads the titles of the tabs in `window` and selects the one `choose` picks from them. False
/// when the window has no tabs, `choose` picks none, or any call fails or times out.
pub(crate) fn select_tab(window: HWND, choose: impl FnOnce(&[String]) -> Option<usize>) -> bool {
    if window.is_invalid() {
        return false;
    }
    // A thread already in a single-threaded apartment can still use UI Automation.
    let _com = ComApartment::multithreaded().ok();
    select(window, choose).unwrap_or(false)
}

fn select(window: HWND, choose: impl FnOnce(&[String]) -> Option<usize>) -> windows::core::Result<bool> {
    // SAFETY: COM is initialized on this thread (above) for the whole call; every interface here
    // is an owned, reference-counted value used only within it, and the HWND is passed by value
    // (UI Automation fails for windows that do not exist).
    unsafe {
        let automation: IUIAutomation = CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER)?;
        if let Ok(options) = automation.cast::<IUIAutomation2>() {
            let _ = options.SetConnectionTimeout(TIMEOUT_MS);
            let _ = options.SetTransactionTimeout(TIMEOUT_MS);
        }
        let root = automation.ElementFromHandle(window)?;
        let is_tab = VARIANT::from(UIA_TabItemControlTypeId.0);
        let condition = automation.CreatePropertyCondition(UIA_ControlTypePropertyId, &is_tab)?;
        let found = root.FindAll(TreeScope_Descendants, &condition)?;
        let mut tabs = Vec::new();
        let mut titles = Vec::new();
        for index in 0..found.Length()? {
            let tab = found.GetElement(index)?;
            titles.push(tab.CurrentName().map(|name| name.to_string()).unwrap_or_default());
            tabs.push(tab);
        }
        let Some(tab) = choose(&titles).and_then(|index| tabs.get(index)) else {
            return Ok(false);
        };
        let pattern: IUIAutomationSelectionItemPattern = tab.GetCurrentPatternAs(UIA_SelectionItemPatternId)?;
        pattern.Select()?;
        Ok(true)
    }
}
