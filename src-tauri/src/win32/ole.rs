//! Drags files out of the app to Explorer, chat windows and other drop targets.

use std::{iter::once, mem::ManuallyDrop, os::windows::ffi::OsStrExt, path::Path, ptr};

use windows::{
    core::{w, PCWSTR},
    Win32::{
        Foundation::{GlobalFree, HGLOBAL, HWND},
        System::{
            Com::{IDataObject, DVASPECT_CONTENT, FORMATETC, STGMEDIUM, STGMEDIUM_0, TYMED_HGLOBAL},
            DataExchange::RegisterClipboardFormatW,
            Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE},
            Ole::{
                IDropSource, OleInitialize, OleUninitialize, DROPEFFECT, DROPEFFECT_COPY,
                DROPEFFECT_LINK, DROPEFFECT_MOVE,
            },
        },
        UI::Shell::{
            BHID_DataObject, Common::ITEMIDLIST, ILCreateFromPathW, ILFree, IShellItemArray,
            SHCreateShellItemArrayFromIDLists, SHDoDragDrop,
        },
    },
};

/// What the drop target did with the dragged files.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DragOutcome {
    Copied,
    Moved,
    Linked,
    /// Cancelled, refused, or a move the target finished itself (an optimized move).
    None,
}

/// Keeps OLE initialized on the calling thread and uninitializes it when dropped.
struct OleGuard;

impl OleGuard {
    fn new() -> Result<Self, String> {
        // SAFETY: OleInitialize takes no pointers here. A success (including
        // S_FALSE when OLE is already up on this thread) is balanced by exactly
        // one OleUninitialize in Drop, on the same thread because the guard
        // never leaves this module's synchronous call.
        unsafe { OleInitialize(None) }
            .map_err(|error| format!("Failed to initialize OLE: {error}"))?;
        Ok(Self)
    }
}

impl Drop for OleGuard {
    fn drop(&mut self) {
        // SAFETY: pairs the successful OleInitialize in `OleGuard::new`.
        unsafe { OleUninitialize() };
    }
}

/// Owns a shell item ID list and frees it when dropped.
struct ItemIdList(*mut ITEMIDLIST);

impl ItemIdList {
    fn from_path(path: &Path) -> Result<Self, String> {
        let wide: Vec<u16> = shell_path(path).encode_wide().chain(once(0)).collect();
        // SAFETY: `wide` is a NUL-terminated UTF-16 string that outlives the call.
        let list = unsafe { ILCreateFromPathW(PCWSTR(wide.as_ptr())) };
        if list.is_null() {
            return Err(format!("File not found: {}", path.display()));
        }
        Ok(Self(list))
    }
}

impl Drop for ItemIdList {
    fn drop(&mut self) {
        // SAFETY: the pointer came from ILCreateFromPathW, is owned only by this
        // value, and is freed exactly once here.
        unsafe { ILFree(Some(self.0)) };
    }
}

/// The shell does not resolve `\\?\` verbatim paths (what `canonicalize` returns).
fn shell_path(path: &Path) -> std::ffi::OsString {
    let text = path.as_os_str().to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}").into();
    }
    match text.strip_prefix(r"\\?\") {
        Some(rest) => rest.into(),
        None => path.as_os_str().to_owned(),
    }
}

/// Starts a modal drag of `paths` from `window` and returns once it ends. Must run
/// on the window's (STA) UI thread while the left button is held.
///
/// The target may copy, move or link. Copy is the preferred effect, so Explorer
/// copies by default and only moves when the user holds Shift, as it does for its
/// own drags. Allowing copy alone makes Explorer refuse the drop.
pub(crate) fn drag_files(window: HWND, paths: &[impl AsRef<Path>]) -> Result<DragOutcome, String> {
    if paths.is_empty() {
        return Ok(DragOutcome::None);
    }
    let _ole = OleGuard::new()?;
    let lists = paths
        .iter()
        .map(|path| ItemIdList::from_path(path.as_ref()))
        .collect::<Result<Vec<_>, _>>()?;
    let pointers: Vec<*const ITEMIDLIST> = lists.iter().map(|list| list.0.cast_const()).collect();

    // SAFETY: every pointer in `pointers` is a live ID list owned by `lists`,
    // which outlives the call; the array copies what it needs.
    let items: IShellItemArray = unsafe { SHCreateShellItemArrayFromIDLists(&pointers) }
        .map_err(|error| format!("Failed to prepare the dragged files: {error}"))?;
    // SAFETY: BHID_DataObject is a valid static GUID and no bind context is needed.
    let data: IDataObject = unsafe { items.BindToHandler(None, &BHID_DataObject) }
        .map_err(|error| format!("Failed to prepare the dragged files: {error}"))?;
    set_preferred_effect(&data, DROPEFFECT_COPY)?;

    let allowed = DROPEFFECT_COPY | DROPEFFECT_MOVE | DROPEFFECT_LINK;
    // SAFETY: `data` is a live data object, the shell supplies its own drop source
    // and drag image, and `window` is the caller's live window on this thread.
    let effect = unsafe { SHDoDragDrop(Some(window), &data, None::<&IDropSource>, allowed) }
        .map_err(|error| format!("Failed to drag the files: {error}"))?;
    Ok(outcome(effect))
}

fn outcome(effect: DROPEFFECT) -> DragOutcome {
    // DROPEFFECT values must be masked, never compared for equality.
    if effect.0 & DROPEFFECT_MOVE.0 != 0 {
        DragOutcome::Moved
    } else if effect.0 & DROPEFFECT_COPY.0 != 0 {
        DragOutcome::Copied
    } else if effect.0 & DROPEFFECT_LINK.0 != 0 {
        DragOutcome::Linked
    } else {
        DragOutcome::None
    }
}

/// Stores the "Preferred DropEffect" shell format on `data`.
fn set_preferred_effect(data: &IDataObject, effect: DROPEFFECT) -> Result<(), String> {
    // SAFETY: the name is a static NUL-terminated wide string.
    let format = unsafe { RegisterClipboardFormatW(w!("Preferred DropEffect")) };
    if format == 0 {
        return Err("Failed to register the drop effect format".to_string());
    }
    // SAFETY: allocates a movable block large enough for one u32; ownership is
    // handed to the data object below or freed on failure.
    let memory: HGLOBAL = unsafe { GlobalAlloc(GMEM_MOVEABLE, size_of::<u32>()) }
        .map_err(|error| format!("Failed to allocate the drop effect: {error}"))?;
    // SAFETY: `memory` is a live movable block of at least four bytes; the lock
    // returns a pointer valid until the matching GlobalUnlock.
    unsafe {
        let pointer = GlobalLock(memory).cast::<u32>();
        if pointer.is_null() {
            let _ = GlobalFree(Some(memory));
            return Err("Failed to write the drop effect".to_string());
        }
        pointer.write_unaligned(effect.0);
        // GlobalUnlock reports an "error" with code 0 when the lock count hits zero.
        let _ = GlobalUnlock(memory);
    }

    let format_etc = FORMATETC {
        cfFormat: format as u16,
        ptd: ptr::null_mut(),
        dwAspect: DVASPECT_CONTENT.0,
        lindex: -1,
        tymed: TYMED_HGLOBAL.0 as u32,
    };
    let medium = STGMEDIUM {
        tymed: TYMED_HGLOBAL.0 as u32,
        u: STGMEDIUM_0 { hGlobal: memory },
        pUnkForRelease: ManuallyDrop::new(None),
    };
    // SAFETY: both structs are valid for the call. With fRelease set, a
    // successful SetData takes ownership of `memory`; on failure it stays ours.
    if let Err(error) = unsafe { data.SetData(&format_etc, &medium, true) } {
        // SAFETY: SetData failed, so `memory` is still owned here and freed once.
        let _ = unsafe { GlobalFree(Some(memory)) };
        return Err(format!("Failed to set the drop effect: {error}"));
    }
    Ok(())
}
