//! Spritesheet headers: the image type and pixel size, read from the first bytes only,
//! so a sheet with the wrong shape or a huge canvas is refused before anything decodes it.

/// Bytes `image_header` needs: PNG's IHDR and every WebP first chunk fit in 30.
pub(super) const HEADER_BYTES: usize = 30;
/// Twice petdex's 1536 px; caps the decoded size of a sheet at about 3072 × 4576.
pub(super) const MAX_SHEET_WIDTH: u32 = 3072;
const COLUMNS: f64 = 8.0;
const CELL_WIDTH: f64 = 192.0;
const CELL_HEIGHT: f64 = 208.0;
/// petdex's 8×9 grid, or its v2 8×11 grid (mirrors petSheetRows in center-pattern/patterns.ts).
const ROW_COUNTS: [u32; 2] = [9, 11];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct ImageHeader {
    pub mime: &'static str,
    pub width: u32,
    pub height: u32,
}

/// WebP (VP8X, VP8L or lossy VP8) or PNG; anything else, whatever its extension, is `None`.
pub(super) fn image_header(bytes: &[u8]) -> Option<ImageHeader> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") && bytes.get(12..16)? == b"IHDR" {
        let width = u32::from_be_bytes(bytes.get(16..20)?.try_into().ok()?);
        let height = u32::from_be_bytes(bytes.get(20..24)?.try_into().ok()?);
        return Some(ImageHeader {
            mime: "image/png",
            width,
            height,
        });
    }
    if bytes.get(..4)? != b"RIFF" || bytes.get(8..12)? != b"WEBP" {
        return None;
    }
    let le24 = |at: usize| -> Option<u32> {
        let b = bytes.get(at..at + 3)?;
        Some(u32::from(b[0]) | u32::from(b[1]) << 8 | u32::from(b[2]) << 16)
    };
    let le16 = |at: usize| -> Option<u32> {
        let b = bytes.get(at..at + 2)?;
        Some(u32::from(b[0]) | u32::from(b[1]) << 8)
    };
    let (width, height) = match bytes.get(12..16)? {
        b"VP8X" => (le24(24)? + 1, le24(27)? + 1),
        b"VP8L" if *bytes.get(20)? == 0x2f => {
            let bits = u32::from_le_bytes(bytes.get(21..25)?.try_into().ok()?);
            ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
        }
        b"VP8 " if bytes.get(23..26)? == [0x9d, 0x01, 0x2a] => {
            (le16(26)? & 0x3fff, le16(28)? & 0x3fff)
        }
        _ => return None,
    };
    Some(ImageHeader {
        mime: "image/webp",
        width,
        height,
    })
}

/// Rows of 192:208 cells in an 8-column sheet of this size, if it is a petdex grid
/// (any clean scale) no wider than `MAX_SHEET_WIDTH`.
pub(super) fn sheet_rows(width: u32, height: u32) -> Option<u32> {
    if width == 0 || width > MAX_SHEET_WIDTH {
        return None;
    }
    let rows = f64::from(height) * COLUMNS * CELL_WIDTH / (f64::from(width) * CELL_HEIGHT);
    ROW_COUNTS
        .into_iter()
        .find(|count| (rows - f64::from(*count)).abs() < 0.02)
}
