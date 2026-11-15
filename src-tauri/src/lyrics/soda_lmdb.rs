//! Adapted from Renly1994/xiaotang-daozai src/soda_cache.rs (MIT).
//! Copyright (c) 2026 小唐的Token and Daozai contributors
use std::collections::HashSet;
pub(super) fn le(data: &[u8], offset: usize, n: usize) -> Option<usize> {
    Some(
        data.get(offset..offset.checked_add(n)?)?
            .iter()
            .enumerate()
            .fold(0, |v, (i, b)| v | ((*b as usize) << (8 * i))),
    )
}

/// 仅遍历当前已提交快照的主数据库，忽略空闲页及旧事务内容。
pub(super) fn entries(data: &[u8]) -> Option<Vec<&[u8]>> {
    if le(data, 24, 4)? != 0xbeefc0de || le(data, 28, 4)? != 2 {
        return None;
    }
    let size = le(data, 48, 4)?;
    if !size.is_power_of_two() || !(512..=65536).contains(&size) {
        return None;
    }
    if le(data, size + 24, 4)? != 0xbeefc0de || le(data, size + 28, 4)? != 2 {
        return None;
    }
    let meta = if le(data, 152, 8)? > le(data, size + 152, 8)? {
        0
    } else {
        size
    };
    let mut pending = vec![le(data, meta + 136, 8)?];
    let mut visited = HashSet::new();
    let mut result = Vec::new();
    while let Some(page) = pending.pop() {
        if !visited.insert(page) || visited.len() > 4096 {
            return None;
        }
        let base = page.checked_mul(size)?;
        let bytes = data.get(base..base.checked_add(size)?)?;
        if le(bytes, 0, 8)? != page {
            return None;
        }
        let flags = le(bytes, 18, 2)?;
        if flags != 1 && flags != 2 {
            return None;
        }
        let lower = le(bytes, 20, 2)?;
        if lower % 2 != 0 || lower > size - 24 {
            return None;
        }
        for i in 0..lower / 2 {
            let node = 24 + le(bytes, 24 + i * 2, 2)?;
            let len = le(bytes, node, 4)?;
            let flags_node = le(bytes, node + 4, 2)?;
            let key = le(bytes, node + 6, 2)?;
            if flags == 1 {
                pending.push(len | (flags_node << 32));
                continue;
            }
            if flags_node & 6 != 0 {
                continue;
            }
            let start = node.checked_add(8 + key)?;
            let value = if flags_node == 1 {
                let page = le(bytes, start, 8)?;
                let start = page.checked_mul(size)?;
                if le(data, start, 8)? != page || le(data, start + 18, 2)? != 4 {
                    return None;
                }
                let count = le(data, start + 20, 4)?;
                if len > count.checked_mul(size)?.checked_sub(24)? {
                    return None;
                }
                data.get(start + 24..(start + 24).checked_add(len)?)?
            } else if flags_node == 0 {
                bytes.get(start..start.checked_add(len)?)?
            } else {
                return None;
            };
            if len > 2 * 1024 * 1024 {
                return None;
            }
            result.push(value);
        }
    }
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snapshot_follows_branch_and_overflow_and_rejects_corruption() {
        let mut db = vec![0u8; 4096 * 6];
        fn put(db: &mut [u8], p: usize, v: usize, n: usize) {
            for i in 0..n {
                db[p + i] = (v >> (8 * i)) as u8;
            }
        }
        for meta in [0, 4096] {
            put(&mut db, meta + 24, 0xbeefc0de, 4);
            put(&mut db, meta + 28, 2, 4);
            put(&mut db, meta + 48, 4096, 4);
        }
        put(&mut db, 136, 2, 8);
        put(&mut db, 152, 2, 8);
        put(&mut db, 4096 + 136, 5, 8);
        put(&mut db, 4096 + 152, 1, 8);
        for (page, kind) in [(2, 1), (3, 2), (4, 4)] {
            put(&mut db, page * 4096, page, 8);
            put(&mut db, page * 4096 + 18, kind, 2);
        }
        for page in [2, 3] {
            put(&mut db, page * 4096 + 20, 2, 2);
            put(&mut db, page * 4096 + 24, 100, 2);
        }
        put(&mut db, 2 * 4096 + 124, 3, 4);
        let node = 3 * 4096 + 124;
        let payload = b"\xd4r\x40\x91\xa4name\xa4song";
        put(&mut db, node, payload.len(), 4);
        put(&mut db, node + 4, 1, 2);
        put(&mut db, node + 8, 4, 8);
        put(&mut db, 4 * 4096 + 20, 1, 4);
        db[4 * 4096 + 24..4 * 4096 + 24 + payload.len()].copy_from_slice(payload);
        assert_eq!(entries(&db).unwrap(), vec![payload.as_slice()]);
        assert!(entries(&db[..4 * 4096]).is_none());
        put(&mut db, node, 8192, 4);
        assert!(entries(&db).is_none());
        put(&mut db, node, payload.len(), 4);
        put(&mut db, 2 * 4096 + 124, 2, 4);
        assert!(entries(&db).is_none());
    }
}
