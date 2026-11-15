//! Read list rows exposed by UI Automation and activate an exact row in the foreground window.

use windows::{
    core::Interface,
    Win32::{
        Foundation::{HWND, POINT, RECT},
        System::{
            Com::{CoCreateInstance, CLSCTX_INPROC_SERVER},
            Variant::VARIANT,
        },
        UI::Accessibility::{
            CUIAutomation8, IUIAutomation, IUIAutomation2, IUIAutomationElement,
            IUIAutomationElementArray, IUIAutomationScrollItemPattern,
            PropertyConditionFlags_MatchSubstring, TreeScope_Descendants,
            UIA_AutomationIdPropertyId, UIA_ButtonControlTypeId, UIA_ClassNamePropertyId,
            UIA_ControlTypePropertyId, UIA_ListItemControlTypeId, UIA_NamePropertyId,
            UIA_ScrollItemPatternId, UIA_SelectionItemIsSelectedPropertyId,
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

struct Automation {
    client: IUIAutomation,
    _apartment: ComApartment,
}

impl Automation {
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
    let automation = Automation::new()?;
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
/// A row that is already selected counts as open and is left alone: WeChat closes the open
/// conversation when its selected row is clicked again.
pub(crate) fn click_list_row(
    window: HWND,
    automation_id: &str,
    still_allowed: impl Fn() -> bool,
) -> Result<(), String> {
    if window::foreground_window() != window || !still_allowed() {
        return Err("foreground or preview permission changed".into());
    }
    let automation = Automation::new().ok_or("UI Automation initialization failed")?;
    enum Target {
        Selected,
        Click(POINT),
        Wait(&'static str),
    }
    let find = || -> windows::core::Result<Target> {
        let client = &automation.client;
        // SAFETY: COM is initialized by Automation and all UIA references remain on this thread.
        // The only raw output pointer is the address of a writable POINT.
        unsafe {
            let root = client.ElementFromHandle(window)?;
            let exact = client.CreatePropertyCondition(
                UIA_AutomationIdPropertyId,
                &VARIANT::from(automation_id),
            )?;
            let matches = root.FindAll(TreeScope_Descendants, &exact)?;
            match matches.Length()? {
                0 => return Ok(Target::Wait("row not found")),
                1 => {},
                _ => return Ok(Target::Wait("more than one matching row")),
            }
            let row = matches.GetElement(0)?;
            if row.CurrentIsOffscreen()?.as_bool() {
                if window::foreground_window() != window || !still_allowed() {
                    return Ok(Target::Wait("foreground or preview permission changed before scrolling"));
                }
                let scroll: IUIAutomationScrollItemPattern =
                    row.GetCurrentPatternAs(UIA_ScrollItemPatternId)?;
                scroll.ScrollIntoView()?;
                // Qt lays out the scrolled list asynchronously. Require two stable samples;
                // the caller retries the lookup if this element moves or becomes stale.
                std::thread::sleep(std::time::Duration::from_millis(60));
                let before = row.CurrentBoundingRectangle()?;
                std::thread::sleep(std::time::Duration::from_millis(60));
                if before != row.CurrentBoundingRectangle()? {
                    return Ok(Target::Wait("row layout is still moving after scrolling"));
                }
            }
            if row.CurrentIsOffscreen()?.as_bool() {
                return Ok(Target::Wait("row remains offscreen"));
            }
            // Clicking a selected row toggles the conversation closed in WeChat.
            if row.GetCurrentPropertyValue(UIA_SelectionItemIsSelectedPropertyId)
                .ok().and_then(|value| bool::try_from(&value).ok()).unwrap_or(false)
            {
                return Ok(Target::Selected);
            }
            let bounds = row.CurrentBoundingRectangle()?;
            if bounds.left >= bounds.right || bounds.top >= bounds.bottom {
                return Ok(Target::Wait("row has empty bounds"));
            }
            let mut points = row_click_points(bounds);
            let mut clickable = POINT::default();
            if row.GetClickablePoint(&mut clickable).is_ok_and(|found| found.as_bool())
                && clickable.x >= bounds.left && clickable.x < bounds.right
                && clickable.y >= bounds.top && clickable.y < bounds.bottom
            {
                points.insert(0, clickable);
            }
            let mut reason = "point does not hit the target UIA row";
            for point in points {
                // A topmost island can cover the preferred point. Try other points inside
                // this exact row, retaining both the native window and UIA ancestry checks.
                if let Some(blocked) = input::click_block_reason(window, point) {
                    reason = blocked;
                } else if point_hits_row(client, point, &row) {
                    return Ok(Target::Click(point));
                }
            }
            Ok(Target::Wait(reason))
        }
    };
    match find().map_err(|error| format!("UI Automation lookup failed: {error}"))? {
        Target::Selected if still_allowed() => Ok(()),
        Target::Click(point) if still_allowed() => {
            if input::click_in_foreground(window, point) { Ok(()) }
            else { Err(input::click_block_reason(window, point).unwrap_or("mouse input failed or cursor moved").into()) }
        },
        Target::Wait(reason) => Err(reason.into()),
        _ => Err("preview permission changed before activation".into()),
    }
}

fn row_click_points(bounds: RECT) -> Vec<POINT> {
    [50, 15, 85].into_iter().flat_map(|y| {
        [50, 15, 85].into_iter().map(move |x| POINT {
            x: bounds.left + (bounds.right - bounds.left - 1) * x / 100,
            y: bounds.top + (bounds.bottom - bounds.top - 1) * y / 100,
        })
    }).collect()
}

/// Locate a unique, named button in the upper-right corner of a window's caption.
pub(crate) fn caption_button_rect(window: HWND, class: &str, names: &[&str]) -> Option<RECT> {
    let automation = Automation::new()?;
    let client = &automation.client;
    // SAFETY: Automation keeps COM initialized while the client and elements are used here.
    unsafe {
        let root = client.ElementFromHandle(window).ok()?;
        let frame = root.CurrentBoundingRectangle().ok()?;
        let button = client
            .CreatePropertyCondition(
                UIA_ControlTypePropertyId,
                &VARIANT::from(UIA_ButtonControlTypeId.0),
            )
            .ok()?;
        let class = client
            .CreatePropertyCondition(UIA_ClassNamePropertyId, &VARIANT::from(class))
            .ok()?;
        let condition = client.CreateAndCondition(&button, &class).ok()?;
        let elements = root.FindAll(TreeScope_Descendants, &condition).ok()?;
        let mut candidates = (0..elements.Length().ok()?.min(MAX_ROWS)).filter_map(|index| {
            let element = elements.GetElement(index).ok()?;
            let name = element.CurrentName().ok()?.to_string();
            if !names.contains(&name.as_str()) || element.CurrentIsOffscreen().ok()?.as_bool() {
                return None;
            }
            let rect = element.CurrentBoundingRectangle().ok()?;
            is_caption_rect(frame, rect).then_some(rect)
        });
        let rect = candidates.next()?;
        candidates.next().is_none().then_some(rect)
    }
}

fn is_caption_rect(frame: RECT, rect: RECT) -> bool {
    let width = rect.right - rect.left;
    let height = rect.bottom - rect.top;
    // Qt and the UIA window proxy can round scaled coordinates to different pixels.
    width > 0
        && height > 0
        && (-2..width).contains(&(frame.right - rect.right))
        && (-2..height).contains(&(rect.top - frame.top))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alternate_click_points_stay_inside_even_a_single_pixel_row() {
        for bounds in [RECT { left: 10, top: 20, right: 110, bottom: 80 },
            RECT { left: -5, top: -2, right: -4, bottom: -1 }] {
            let points = row_click_points(bounds);
            assert_eq!(points.len(), 9);
            assert!(points.iter().all(|point| point.x >= bounds.left && point.x < bounds.right
                && point.y >= bounds.top && point.y < bounds.bottom));
        }
    }

    #[test]
    fn caption_bounds_allow_fractional_dpi_rounding() {
        let frame = RECT {
            left: 238,
            top: 199,
            right: 2117,
            bottom: 1499,
        };
        let close = RECT {
            left: 2052,
            top: 199,
            right: 2118,
            bottom: 247,
        };
        assert!(is_caption_rect(frame, close));
        assert!(!is_caption_rect(
            frame,
            RECT {
                top: 400,
                bottom: 448,
                ..close
            }
        ));
        assert!(!is_caption_rect(
            frame,
            RECT {
                left: 1952,
                right: 2018,
                ..close
            }
        ));
    }
}
