//! Identify the Qt accessibility flag in an x64 Weixin.dll image.
//!
//! Instruction signature documented by fanyuantaier/wechatauto-replica (tools/wake_uia.py).

pub(super) const CATEGORY: &[u8; 22] = b"qt.accessibility.core\0";
const EXECUTABLE: u32 = 0x2000_0000;
const WRITABLE: u32 = 0x8000_0000;
const CATEGORY_DISTANCE: u32 = 0x2_0000;
const CHECK_SIZE: usize = 18;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct FlagLocation {
    pub(super) flag: u32,
    pub(super) check: u32,
    pub(super) code: [u8; CHECK_SIZE],
    pub(super) category: u32,
}

struct Section<'a> {
    rva: u32,
    size: u32,
    flags: u32,
    bytes: &'a [u8],
}

fn read<const N: usize>(bytes: &[u8], start: usize) -> Option<[u8; N]> {
    bytes.get(start..start.checked_add(N)?)?.try_into().ok()
}

fn sections(image: &[u8]) -> Option<Vec<Section<'_>>> {
    if image.get(..2)? != b"MZ" {
        return None;
    }
    let pe = u32::from_le_bytes(read(image, 0x3c)?) as usize;
    if read::<6>(image, pe)? != *b"PE\0\0\x64\x86" {
        return None;
    }
    let count = u16::from_le_bytes(read(image, pe + 6)?) as usize;
    if !(1..=96).contains(&count) || u16::from_le_bytes(read(image, pe + 24)?) != 0x20b {
        return None;
    }
    let first = pe + 24 + u16::from_le_bytes(read(image, pe + 20)?) as usize;
    (0..count)
        .map(|i| {
            let at = first + i * 40;
            let size = u32::from_le_bytes(read(image, at + 8)?);
            let rva = u32::from_le_bytes(read(image, at + 12)?);
            let length = u32::from_le_bytes(read(image, at + 16)?) as usize;
            let offset = u32::from_le_bytes(read(image, at + 20)?) as usize;
            let flags = u32::from_le_bytes(read(image, at + 36)?);
            rva.checked_add(size)?;
            Some(Section {
                rva,
                size,
                flags,
                bytes: image.get(offset..offset.checked_add(length)?)?,
            })
        })
        .collect()
}

fn rip_target(ip: u32, length: u32, displacement: [u8; 4]) -> Option<u32> {
    (i64::from(ip) + i64::from(length) + i64::from(i32::from_le_bytes(displacement)))
        .try_into()
        .ok()
}

pub(super) fn locate(image: &[u8]) -> Option<FlagLocation> {
    let sections = sections(image)?;
    let category = sections
        .iter()
        .filter(|s| s.flags & (EXECUTABLE | WRITABLE) == 0)
        .find_map(|s| {
            let index = s
                .bytes
                .windows(CATEGORY.len())
                .position(|window| window == CATEGORY)?;
            s.rva.checked_add(index as u32)
        })?;
    let mut references = Vec::new();
    let mut checks = Vec::new();
    for section in sections.iter().filter(|s| s.flags & EXECUTABLE != 0) {
        let code = &section.bytes[..section.bytes.len().min(section.size as usize)];
        for (offset, &byte) in code.iter().enumerate() {
            if !(0x48..=0x4f).contains(&byte) {
                continue;
            }
            let ip = section.rva + offset as u32;
            if let Some(lea) = read::<7>(code, offset) {
                if lea[1] == 0x8d
                    && lea[2] & 0xc7 == 5
                    && rip_target(ip, 7, [lea[3], lea[4], lea[5], lea[6]]) == Some(category)
                {
                    references.push(ip);
                }
            }
            let Some(check) = read::<CHECK_SIZE>(code, offset) else {
                continue;
            };
            // test rcx,rcx; jz; cmp byte ptr [rip+disp32],0; jz
            if check[..5] != [0x48, 0x85, 0xc9, 0x0f, 0x84]
                || check[9..11] != [0x80, 0x3d]
                || check[15..] != [0x00, 0x0f, 0x84]
            {
                continue;
            }
            let Some(flag) = rip_target(ip, 16, [check[11], check[12], check[13], check[14]])
            else {
                continue;
            };
            let is_data = sections.iter().any(|s| {
                s.flags & (WRITABLE | EXECUTABLE) == WRITABLE
                    && flag >= s.rva
                    && flag - s.rva < s.size
            });
            if is_data {
                checks.push(FlagLocation {
                    flag,
                    check: ip,
                    code: check,
                    category,
                });
            }
        }
    }
    let mut nearby = checks.into_iter().filter(|check| {
        references
            .iter()
            .any(|ip| ip.abs_diff(check.check) <= CATEGORY_DISTANCE)
    });
    let selected = nearby.next()?;
    // Multiple checks of the same flag are fine; a second plausible flag is ambiguous.
    nearby
        .all(|other| other.flag == selected.flag)
        .then_some(selected)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn image(targets: &[u32]) -> Vec<u8> {
        let mut bytes = vec![0; 0x800];
        bytes[..2].copy_from_slice(b"MZ");
        bytes[0x3c..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        bytes[0x80..0x88].copy_from_slice(b"PE\0\0\x64\x86\x03\0");
        bytes[0x94..0x96].copy_from_slice(&0xf0u16.to_le_bytes());
        bytes[0x98..0x9a].copy_from_slice(&0x20bu16.to_le_bytes());
        for (i, (rva, raw, flags)) in [
            (0x1000u32, 0x200u32, EXECUTABLE),
            (0x2000, 0x400, 0),
            (0x3000, 0x600, WRITABLE),
        ]
        .into_iter()
        .enumerate()
        {
            let at = 0x188 + i * 40;
            for (index, value) in [0x200u32, rva, 0x200, raw].into_iter().enumerate() {
                let start = at + 8 + index * 4;
                bytes[start..start + 4].copy_from_slice(&value.to_le_bytes());
            }
            bytes[at + 36..at + 40].copy_from_slice(&flags.to_le_bytes());
        }
        bytes[0x400..0x400 + CATEGORY.len()].copy_from_slice(CATEGORY);
        bytes[0x200..0x207].copy_from_slice(&[0x48, 0x8d, 0x0d, 0xf9, 0x0f, 0, 0]);
        for (index, target) in targets.iter().enumerate() {
            let offset = 16 + index * 24;
            let code = &mut bytes[0x200 + offset..0x200 + offset + CHECK_SIZE];
            code[..5].copy_from_slice(&[0x48, 0x85, 0xc9, 0x0f, 0x84]);
            code[9..11].copy_from_slice(&[0x80, 0x3d]);
            code[11..15].copy_from_slice(&(target - (0x1000 + offset as u32 + 16)).to_le_bytes());
            code[15..].copy_from_slice(&[0, 0x0f, 0x84]);
        }
        bytes
    }

    #[test]
    fn requires_a_unique_writable_target_with_a_qt_reference() {
        assert_eq!(locate(&image(&[0x3010, 0x3010])).unwrap().flag, 0x3010);
        assert!(locate(&image(&[0x3010, 0x3011])).is_none());
        assert!(locate(&image(&[0x2030])).is_none());
        let mut no_reference = image(&[0x3010]);
        no_reference[0x200] = 0;
        assert!(locate(&no_reference).is_none());
        assert!(locate(b"MZ").is_none());
    }

    #[test]
    #[ignore = "Requires the path of a locally installed Weixin.dll, only reads the file"]
    fn locates_the_flag_in_the_installed_dll() {
        let path = std::env::var_os("FOCUSD_TEST_WEIXIN_DLL").expect("path to the installed DLL");
        let dll = std::fs::read(path).unwrap();
        assert!(locate(&dll).is_some());
    }
}
