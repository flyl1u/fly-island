//! Read list rows exposed by UI Automation and activate an exact row in the foreground window.

use windows::{
    core::Interface,
    Win32::{
        Foundation::{HWND, POINT},
        System::{
            Com::{CoCreateInstance, CLSCTX_INPROC_SERVER},
            Variant::VARIANT,
        },
        UI::Accessibility::{
            CUIAutomation8, IUIAutomation, IUIAutomation2, IUIAutomationElement,
            IUIAutomationElementArray, IUIAutomationScrollItemPattern,
            PropertyConditionFlags_MatchSubstring, TreeScope_Descendants,
            UIA_AutomationIdPropertyId, UIA_ControlTypePropertyId, UIA_ListItemControlTypeId,
            UIA_NamePropertyId, UIA_ScrollItemPatternId, UIA_SelectionItemIsSelectedPropertyId,
        },
    },
};

use super::{com::ComApartment, input, window};

const MAX_ROWS: i32 = 320;

pub(crate) struct ListRow {
    pub(crate) key: String,
    pub(crate) name: String,
    pub(crate) selected: bool,
}

struct ListAutomation {
    client: IUIAutomation,
    _apartment: ComApartment,
}

impl ListAutomation {
    fn new() -> Option<Self> {
        let apartment = ComApartment::multithreaded().ok()?;
        // SAFETY: COM is initialized on this thread, and the owned client is dropped before the apartment.
        let client: IUIAutomation =
            unsafe { CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER) }.ok()?;
        let options: IUIAutomation2 = client.cast().ok()?;
        // SAFETY: both calls set numeric options on the live client.
        unsafe {
            options.SetConnectionTimeout(1_000).ok()?;
            options.SetTransactionTimeout(1_000).ok()?;
        }
        Some(Self {
            client,
            _apartment: apartment,
        })
    }
}

pub(crate) fn named_list_rows(window: HWND, prefix: &str) -> Option<Vec<ListRow>> {
    let automation = ListAutomation::new()?;
    let client = &automation.client;
    // SAFETY: the guard keeps the UIA client and its interfaces on the initialized thread.
    // The HWND is passed by value, and UIA handles invalid or recently closed windows.
    unsafe {
        let root = client.ElementFromHandle(window).ok()?;
        if let Ok(condition) = client.CreatePropertyConditionEx(
            UIA_AutomationIdPropertyId,
            &VARIANT::from(prefix),
            PropertyConditionFlags_MatchSubstring,
        ) {
            let cache = client.CreateCacheRequest().ok()?;
            cache.AddProperty(UIA_AutomationIdPropertyId).ok()?;
            cache.AddProperty(UIA_NamePropertyId).ok()?;
            cache
                .AddProperty(UIA_SelectionItemIsSelectedPropertyId)
                .ok()?;
            if let Ok(elements) = root.FindAllBuildCache(TreeScope_Descendants, &condition, &cache)
            {
                let rows = rows_from(&elements, prefix, true);
                if !rows.is_empty() {
                    return Some(rows);
                }
            }
            // Some Qt providers can answer property queries but return an empty cache.
            if let Ok(elements) = root.FindAll(TreeScope_Descendants, &condition) {
                let rows = rows_from(&elements, prefix, false);
                if !rows.is_empty() {
                    return Some(rows);
                }
            }
        }
        let items = client
            .CreatePropertyCondition(
                UIA_ControlTypePropertyId,
                &VARIANT::from(UIA_ListItemControlTypeId.0),
            )
            .ok()?;
        let elements = root.FindAll(TreeScope_Descendants, &items).ok()?;
        let rows = rows_from(&elements, prefix, false);
        (!rows.is_empty()).then_some(rows)
    }
}

fn rows_from(elements: &IUIAutomationElementArray, prefix: &str, cached: bool) -> Vec<ListRow> {
    // SAFETY: these owned element references are used on the caller's initialized COM thread.
    unsafe {
        (0..elements.Length().unwrap_or_default().min(MAX_ROWS))
            .filter_map(|index| {
                let element = elements.GetElement(index).ok()?;
                let id = if cached {
                    element.CachedAutomationId().ok()?
                } else {
                    element.CurrentAutomationId().ok()?
                };
                let id = id.to_string();
                let key = id
                    .strip_prefix(prefix)
                    .filter(|key| !key.is_empty())?
                    .to_owned();
                let name = if cached {
                    element
                        .CachedName()
                        .ok()
                        .filter(|name| !name.is_empty())
                        .or_else(|| element.CurrentName().ok())?
                } else {
                    element.CurrentName().ok()?
                };
                let selected = if cached {
                    element
                        .GetCachedPropertyValueEx(UIA_SelectionItemIsSelectedPropertyId, true)
                        .ok()
                        .and_then(|value| bool::try_from(&value).ok())
                } else {
                    None
                }
                .or_else(|| {
                    element
                        .GetCurrentPropertyValue(UIA_SelectionItemIsSelectedPropertyId)
                        .ok()
                        .and_then(|value| bool::try_from(&value).ok())
                })
                .unwrap_or(false);
                Some(ListRow {
                    key,
                    name: name.to_string(),
                    selected,
                })
            })
            .collect()
    }
}

/// Clicks an unambiguous row by automation ID. Qt selection alone does not open its conversation.
pub(crate) fn click_list_row(
    window: HWND,
    automation_id: &str,
    still_allowed: impl Fn() -> bool,
) -> bool {
    if window::foreground_window() != window || !still_allowed() {
        return false;
    }
    let Some(automation) = ListAutomation::new() else {
        return false;
    };
    let find = || -> windows::core::Result<Option<POINT>> {
        let client = &automation.client;
        // SAFETY: COM is initialized by ListAutomation and all UIA references remain on this thread.
        // The only raw output pointer is the address of a writable POINT.
        unsafe {
            let root = client.ElementFromHandle(window)?;
            let exact = client.CreatePropertyCondition(
                UIA_AutomationIdPropertyId,
                &VARIANT::from(automation_id),
            )?;
            let matches = root.FindAll(TreeScope_Descendants, &exact)?;
            if matches.Length()? != 1 {
                return Ok(None);
            }
            let row = matches.GetElement(0)?;
            if row.CurrentIsOffscreen()?.as_bool() {
                if window::foreground_window() != window || !still_allowed() {
                    return Ok(None);
                }
                let scroll: IUIAutomationScrollItemPattern =
                    row.GetCurrentPatternAs(UIA_ScrollItemPatternId)?;
                scroll.ScrollIntoView()?;
            }
            let mut point = POINT::default();
            if !row
                .GetClickablePoint(&mut point)
                .is_ok_and(|has_point| has_point.as_bool())
            {
                let bounds = row.CurrentBoundingRectangle()?;
                if bounds.left >= bounds.right
                    || bounds.top >= bounds.bottom
                    || row.CurrentIsOffscreen()?.as_bool()
                {
                    return Ok(None);
                }
                point.x = bounds.left.midpoint(bounds.right);
                point.y = bounds.top.midpoint(bounds.bottom);
            }
            if point_hits_row(client, point, &row) {
                return Ok(Some(point));
            }
            Ok(None)
        }
    };
    find()
        .ok()
        .flatten()
        .is_some_and(|point| still_allowed() && input::click_in_foreground(window, point))
}

fn point_hits_row(client: &IUIAutomation, point: POINT, row: &IUIAutomationElement) -> bool {
    // SAFETY: the client and row are live on the initialized thread, and POINT is passed by value.
    unsafe {
        let (Ok(walker), Ok(mut hit)) = (client.RawViewWalker(), client.ElementFromPoint(point))
        else {
            return false;
        };
        for _ in 0..8 {
            if client
                .CompareElements(&hit, row)
                .is_ok_and(|same| same.as_bool())
            {
                return true;
            }
            let Ok(parent) = walker.GetParentElement(&hit) else {
                return false;
            };
            hit = parent;
        }
        false
    }
}
