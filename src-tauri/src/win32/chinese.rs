//! Traditional to simplified Chinese with the conversion built into Windows
//! (`LCMapStringEx` with `LCMAP_SIMPLIFIED_CHINESE`), character by character.

use windows::{
    core::w,
    Win32::{
        Foundation::LPARAM,
        Globalization::{LCMapStringEx, LCMAP_SIMPLIFIED_CHINESE},
    },
};

/// `text` written in simplified characters; `None` when Windows could not convert it.
pub(crate) fn to_simplified(text: &str) -> Option<String> {
    let source: Vec<u16> = text.encode_utf16().collect();
    if source.is_empty() {
        return Some(String::new());
    }
    // SAFETY: the locale name is a static wide string, `source` a valid slice for the call,
    // and with no destination the call only returns the length it needs.
    let needed = unsafe { LCMapStringEx(w!("zh-CN"), LCMAP_SIMPLIFIED_CHINESE, &source, None, None, None, LPARAM(0)) };
    let mut converted = vec![0u16; usize::try_from(needed).ok().filter(|&length| length > 0)?];
    // SAFETY: as above; `converted` is a writable buffer of exactly the length asked for.
    let written =
        unsafe { LCMapStringEx(w!("zh-CN"), LCMAP_SIMPLIFIED_CHINESE, &source, Some(&mut converted), None, None, LPARAM(0)) };
    let written = usize::try_from(written).ok().filter(|&length| length > 0)?;
    String::from_utf16(&converted[..written.min(converted.len())]).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traditional_text_becomes_simplified_and_the_rest_stays() {
        assert_eq!(to_simplified("[00:31.50] 劃一根火柴 將慵倦的夜點亮").as_deref(), Some("[00:31.50] 划一根火柴 将慵倦的夜点亮"));
        assert_eq!(to_simplified("Yesterday 晴天").as_deref(), Some("Yesterday 晴天"));
        assert_eq!(to_simplified("").as_deref(), Some(""));
    }
}
