//! Read list rows exported by a window's UI Automation provider.

use windows::{
    core::Interface,
    Win32::{
        Foundation::HWND,
        System::{
            Com::{CoCreateInstance, CLSCTX_INPROC_SERVER},
            Variant::VARIANT,
        },
        UI::Accessibility::{
            CUIAutomation8, IUIAutomation, IUIAutomation2, TreeScope_Children,
            TreeScope_Descendants, UIA_AutomationIdPropertyId, UIA_ControlTypePropertyId,
            UIA_ListControlTypeId, UIA_ListItemControlTypeId, UIA_NamePropertyId,
        },
    },
};

use super::com::ComApartment;

pub(crate) fn named_list_rows(window: HWND, id_prefix: &str) -> Option<Vec<(String, String)>> {
    let _com = ComApartment::multithreaded().ok()?;
    // SAFETY: COM is initialized on this thread and the interfaces stay here. The HWND is
    // passed by value and ElementFromHandle can fail if its owner closed it.
    unsafe {
        let automation: IUIAutomation =
            CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER).ok()?;
        let options: IUIAutomation2 = automation.cast().ok()?;
        options.SetConnectionTimeout(750).ok()?;
        options.SetTransactionTimeout(750).ok()?;
        let root = automation.ElementFromHandle(window).ok()?;
        let of_type = |kind| {
            automation.CreatePropertyCondition(UIA_ControlTypePropertyId, &VARIANT::from(kind))
        };
        let lists = root
            .FindAll(
                TreeScope_Descendants,
                &of_type(UIA_ListControlTypeId.0).ok()?,
            )
            .ok()?;
        let items = of_type(UIA_ListItemControlTypeId.0).ok()?;
        let cache = automation.CreateCacheRequest().ok()?;
        cache.AddProperty(UIA_AutomationIdPropertyId).ok()?;
        cache.AddProperty(UIA_NamePropertyId).ok()?;
        for index in 0..lists.Length().ok()?.min(32) {
            let list = lists.GetElement(index).ok()?;
            let rows = list
                .FindAllBuildCache(TreeScope_Children, &items, &cache)
                .ok()?;
            let matching: Vec<_> = (0..rows.Length().ok()?.min(256))
                .filter_map(|index| {
                    let row = rows.GetElement(index).ok()?;
                    let id = row.CachedAutomationId().ok()?.to_string();
                    let key = id
                        .strip_prefix(id_prefix)
                        .filter(|key| !key.is_empty())?
                        .to_owned();
                    Some((key, row.CachedName().ok()?.to_string()))
                })
                .collect();
            if !matching.is_empty() {
                return Some(matching);
            }
        }
        None
    }
}
