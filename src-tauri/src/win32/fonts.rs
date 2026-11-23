//! Installed font families and their localized display names from DirectWrite.

use std::collections::BTreeMap;
use windows::{
    core::{w, Error, Result, BOOL, PCWSTR},
    Win32::{
        Foundation::E_FAIL,
        Graphics::DirectWrite::{
            DWriteCreateFactory, IDWriteFactory, IDWriteLocalizedStrings,
            DWRITE_FACTORY_TYPE_SHARED,
        },
    },
};

/// The first name is a stable family name for CSS and persisted settings. The second is the
/// label for this UI locale. A family without an English name uses the first available name.
pub(crate) fn installed_families(chinese: bool) -> Result<Vec<(String, String)>> {
    // SAFETY: this is the documented factory type and the generic specifies the returned interface.
    let factory: IDWriteFactory = unsafe { DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED)? };
    let mut collection = None;
    // SAFETY: collection is a writable out-parameter. The owned interface releases on drop.
    unsafe { factory.GetSystemFontCollection(&mut collection, true)? };
    let collection =
        collection.ok_or_else(|| Error::new(E_FAIL, "Missing system font collection"))?;
    let mut families = BTreeMap::new();
    // SAFETY: collection is a live system font collection.
    let count = unsafe { collection.GetFontFamilyCount() };
    for index in 0..count {
        // SAFETY: index comes from this collection's count, and both interfaces are owned.
        let Ok(names) = (unsafe {
            collection
                .GetFontFamily(index)
                .and_then(|font| font.GetFamilyNames())
        }) else {
            continue;
        };
        let english = locale_index(&names, w!("en-us")).unwrap_or(0);
        let Some(family) = name(&names, english).filter(|name| !name.is_empty()) else {
            continue;
        };
        let label = chinese
            .then(|| locale_index(&names, w!("zh-cn")))
            .flatten()
            .and_then(|index| name(&names, index))
            .filter(|name| !name.is_empty());
        families.entry(family.to_lowercase()).or_insert_with(|| {
            let label = label.unwrap_or_else(|| family.clone());
            (family, label)
        });
    }
    Ok(families.into_values().collect())
}

fn locale_index(names: &IDWriteLocalizedStrings, language: PCWSTR) -> Option<u32> {
    let mut index = 0;
    let mut exists = BOOL::default();
    // SAFETY: language is a static, NUL-terminated locale name and both outputs are writable.
    unsafe { names.FindLocaleName(language, &mut index, &mut exists) }.ok()?;
    exists.as_bool().then_some(index)
}

fn name(names: &IDWriteLocalizedStrings, index: u32) -> Option<String> {
    // SAFETY: the index is either a locale match or the first entry; failures are handled.
    let length = unsafe { names.GetStringLength(index) }.ok()? as usize;
    let mut buffer = vec![0; length + 1];
    // SAFETY: the buffer has room for all reported UTF-16 units plus the terminator.
    unsafe { names.GetString(index, &mut buffer) }.ok()?;
    String::from_utf16(&buffer[..length]).ok()
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "requires the installed Windows fonts of an interactive user"]
    fn reads_installed_families_with_stable_names_across_locales() {
        let english = super::installed_families(false).unwrap();
        let chinese = super::installed_families(true).unwrap();
        assert!(english
            .iter()
            .any(|(name, _)| name.eq_ignore_ascii_case("Segoe UI")));
        assert_eq!(english.len(), chinese.len());
        assert!(english
            .iter()
            .zip(chinese)
            .all(|((name, _), (other, label))| *name == other && !label.is_empty()));
    }
}
