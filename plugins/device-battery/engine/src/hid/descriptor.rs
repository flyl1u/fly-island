//! Strict, fail-closed HID 1.11 report descriptor sizes, by top-level collection.
//! Lengths include the Windows report ID slot, also for the implicit ID 0.
use super::Sizes;
use std::collections::BTreeMap;

/// Input, output and feature sizes of one top-level collection.
pub(crate) type Collection = [Sizes; 3];
/// Keyed by (usage page, usage).
pub(crate) type Descriptor = BTreeMap<(u16, u16), Collection>;

const MAX_BITS: u64 = 4095 * 8;
/// Local usages are (page, usage); the page is a global that may still be unset.
type Usage = (u32, u32);

#[derive(Clone, Copy, Default)]
struct Globals {
    usage_page: Option<u32>,
    size: Option<u32>,
    id: u32,
    count: Option<u32>,
}

#[derive(Default)]
struct Parser {
    globals: Globals,
    stack: Vec<Globals>,
    collections: Vec<(u16, u16)>,
    usages: Vec<Usage>,
    usage_min: Option<Usage>,
    usage_max: Option<Usage>,
    bits: BTreeMap<(u16, u16), [BTreeMap<u8, u64>; 3]>,
    owners: BTreeMap<(usize, u32), (u16, u16)>,
    numbered: bool,
}

pub(crate) fn parse(raw: &[u8]) -> Result<Descriptor, &'static str> {
    if !(1..=4096).contains(&raw.len()) {
        return Err("descriptor length out of bounds");
    }
    let mut parser = Parser::default();
    let mut offset = 0;
    while offset < raw.len() {
        let prefix = raw[offset];
        offset += 1;
        if prefix == 0xFE {
            return Err("long item");
        }
        let size = [0usize, 1, 2, 4][usize::from(prefix & 3)];
        let data = raw.get(offset..offset + size).ok_or("truncated item")?;
        offset += size;
        let value = data
            .iter()
            .rev()
            .fold(0u32, |value, &byte| (value << 8) | u32::from(byte));
        let tag = prefix >> 4;
        match (prefix >> 2) & 3 {
            0 => parser.main(tag, size, value)?,
            1 => parser.global(tag, size, value)?,
            2 => parser.local(tag, size, value)?,
            _ => return Err("reserved item"),
        }
    }
    parser.finish()
}

impl Parser {
    fn global(&mut self, tag: u8, size: usize, value: u32) -> Result<(), &'static str> {
        match tag {
            10 | 11 if size != 0 => return Err("invalid global item"),
            10 => self.stack.push(self.globals),
            11 => self.globals = self.stack.pop().ok_or("unbalanced global stack")?,
            0..=9 => {
                if size == 0 || (tag == 0 && value > 0xFFFF) {
                    return Err("invalid global item");
                }
                if tag == 8 && (size != 1 || value == 0) {
                    return Err("invalid report ID");
                }
                match tag {
                    0 => self.globals.usage_page = Some(value),
                    7 => self.globals.size = Some(value),
                    8 => {
                        self.numbered = true;
                        self.globals.id = value;
                    }
                    9 => self.globals.count = Some(value),
                    _ => {}
                }
            }
            _ => return Err("reserved item"),
        }
        Ok(())
    }

    fn local(&mut self, tag: u8, size: usize, value: u32) -> Result<(), &'static str> {
        if tag > 2 {
            return Err("unsupported local item");
        }
        let usage = if size == 4 {
            (value >> 16, value & 0xFFFF)
        } else {
            match self.globals.usage_page {
                Some(page) if size > 0 => (page, value),
                _ => return Err("invalid usage"),
            }
        };
        match tag {
            0 => self.usages.push(usage),
            1 if self.usage_min.is_none() => self.usage_min = Some(usage),
            2 if self.usage_max.is_none() => self.usage_max = Some(usage),
            _ => return Err("invalid usage"),
        }
        Ok(())
    }

    fn main(&mut self, tag: u8, size: usize, value: u32) -> Result<(), &'static str> {
        let ranged = self.usage_min.is_some() || self.usage_max.is_some();
        if ranged {
            let valid = matches!((self.usage_min, self.usage_max),
                (Some(low), Some(high)) if low.0 == high.0 && low.1 <= high.1);
            if !valid {
                return Err("invalid usage");
            }
        }
        match tag {
            10 => self.open(size, value, ranged)?,
            12 => {
                if size != 0 {
                    return Err("invalid main item");
                }
                self.collections.pop().ok_or("unbalanced collection")?;
            }
            8 | 9 | 11 => self.field(tag, size, value)?,
            _ => return Err("unknown main item"),
        }
        // Every main item consumes the local state.
        self.usages.clear();
        self.usage_min = None;
        self.usage_max = None;
        Ok(())
    }

    fn open(&mut self, size: usize, value: u32, ranged: bool) -> Result<(), &'static str> {
        if size != 1 || (7..0x80).contains(&value) {
            return Err("invalid main item");
        }
        let key = match self.collections.first() {
            Some(&top) => top,
            None => {
                let [(page, usage)] = self.usages[..] else {
                    return Err("ambiguous collection usage");
                };
                if ranged {
                    return Err("ambiguous collection usage");
                }
                let key = (
                    u16::try_from(page).map_err(|_| "invalid usage")?,
                    u16::try_from(usage).map_err(|_| "invalid usage")?,
                );
                if self.bits.contains_key(&key) {
                    return Err("duplicate top-level collection");
                }
                self.bits.insert(key, Default::default());
                key
            }
        };
        self.collections.push(key);
        Ok(())
    }

    fn field(&mut self, tag: u8, size: usize, value: u32) -> Result<(), &'static str> {
        if size == 0 || value & !0x1FF != 0 || (tag == 8 && value & 0x80 != 0) {
            return Err("invalid main item");
        }
        let &key = self.collections.first().ok_or("unbalanced collection")?;
        let (Some(width), Some(count)) = (self.globals.size, self.globals.count) else {
            return Err("missing report size/count");
        };
        let bits = u64::from(width) * u64::from(count);
        if bits == 0 || bits > MAX_BITS {
            return Err("report size out of bounds");
        }
        let direction = match tag {
            8 => 0,
            9 => 1,
            _ => 2,
        };
        let id = self.globals.id;
        if *self.owners.entry((direction, id)).or_insert(key) != key {
            return Err("report shared across collections");
        }
        let fields = self.bits.get_mut(&key).ok_or("unbalanced collection")?;
        let total = fields[direction].entry(id as u8).or_insert(0);
        *total += bits;
        if *total > MAX_BITS {
            return Err("report size out of bounds");
        }
        Ok(())
    }

    fn finish(self) -> Result<Descriptor, &'static str> {
        if !self.collections.is_empty() {
            return Err("unbalanced collection");
        }
        if !self.stack.is_empty() {
            return Err("unbalanced global stack");
        }
        if !self.usages.is_empty() || self.usage_min.is_some() || self.usage_max.is_some() {
            return Err("invalid usage");
        }
        if self.owners.keys().any(|&(_, id)| id == 0) && self.numbered {
            return Err("mixed report IDs");
        }
        if self.owners.is_empty() {
            return Err("no reports");
        }
        let mut result = Descriptor::new();
        for (key, directions) in self.bits {
            let mut collection = Collection::default();
            for (target, fields) in collection.iter_mut().zip(directions) {
                for (id, bits) in fields {
                    if bits % 8 != 0 {
                        return Err("non-byte-aligned report");
                    }
                    target.insert(id, (bits / 8) as usize + 1);
                }
            }
            result.insert(key, collection);
        }
        Ok(result)
    }
}

#[cfg(test)]
pub(crate) mod tests;
