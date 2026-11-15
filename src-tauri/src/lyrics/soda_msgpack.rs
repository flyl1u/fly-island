//! Adapted from Renly1994/xiaotang-daozai src/soda_cache.rs (MIT).
//! Copyright (c) 2026 小唐的Token and Daozai contributors
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
// 汽水使用 MessagePack 的内联 record 扩展；记录表仅在单个值内有效。
struct Decoder<'a> {
    data: &'a [u8],
    pos: usize,
    records: HashMap<i32, Vec<String>>,
    two: HashSet<i32>,
    budget: usize,
}
impl<'a> Decoder<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let end = self.pos.checked_add(n)?;
        let b = self.data.get(self.pos..end)?;
        self.pos = end;
        Some(b)
    }
    fn number(&mut self, n: usize) -> Option<u64> {
        Some(self.take(n)?.iter().fold(0, |v, b| (v << 8) | *b as u64))
    }
    fn string(&mut self, n: usize) -> Option<Value> {
        Some(Value::String(
            std::str::from_utf8(self.take(n)?).ok()?.into(),
        ))
    }
    fn record(&mut self, id: i32, depth: usize) -> Option<Value> {
        let keys = self.records.get(&id)?.clone();
        let mut map = Map::new();
        for key in keys {
            map.insert(key, self.value(depth + 1)?);
        }
        Some(Value::Object(map))
    }
    fn value(&mut self, depth: usize) -> Option<Value> {
        if depth > 64 || self.budget == 0 {
            return None;
        }
        self.budget -= 1;
        let t = self.number(1)? as u8;
        match t {
            0x40..=0x7f if self.records.contains_key(&((t - 0x40) as i32)) => {
                let mut id = (t - 0x40) as i32;
                if self.two.contains(&id) {
                    let high = self.number(1)? as i32;
                    id = if id < 32 {
                        -((high << 5) + id)
                    } else {
                        (high << 5) + id
                    };
                }
                self.record(id, depth)
            }
            0x00..=0x7f => Some(Value::from(t)),
            0xe0..=0xff => Some(Value::from(t as i8)),
            0xc0 => Some(Value::Null),
            0xc2 => Some(Value::Bool(false)),
            0xc3 => Some(Value::Bool(true)),
            0xa0..=0xbf => self.string((t & 31) as usize),
            0xd9..=0xdb => {
                let n = self.number(1 << (t - 0xd9))? as usize;
                self.string(n)
            }
            0xcc..=0xcf => Some(Value::from(self.number(1 << (t - 0xcc))?)),
            0xd0..=0xd3 => {
                let n = 1usize << (t - 0xd0);
                let v = self.number(n)?;
                Some(Value::from(((v << (64 - n * 8)) as i64) >> (64 - n * 8)))
            }
            0xca => {
                let v = f32::from_bits(self.number(4)? as u32);
                serde_json::Number::from_f64(v as f64).map(Value::Number)
            }
            0xcb => {
                let v = f64::from_bits(self.number(8)?);
                serde_json::Number::from_f64(v).map(Value::Number)
            }
            0x90..=0x9f | 0xdc | 0xdd => {
                let n = if t < 0xa0 {
                    (t & 15) as usize
                } else {
                    self.number(if t == 0xdc { 2 } else { 4 })? as usize
                };
                if n > self.budget {
                    return None;
                }
                let mut a = Vec::new();
                for _ in 0..n {
                    a.push(self.value(depth + 1)?);
                }
                Some(Value::Array(a))
            }
            0x80..=0x8f | 0xde | 0xdf => {
                let n = if t < 0x90 {
                    (t & 15) as usize
                } else {
                    self.number(if t == 0xde { 2 } else { 4 })? as usize
                };
                if n > self.budget / 2 {
                    return None;
                }
                let mut map = Map::new();
                for _ in 0..n {
                    let key = self.value(depth + 1)?.as_str()?.to_string();
                    map.insert(key, self.value(depth + 1)?);
                }
                Some(Value::Object(map))
            }
            0xd4 | 0xd5 => {
                let kind = self.number(1)?;
                let first = self.number(1)? as i32;
                if kind == 0 && t == 0xd4 {
                    return Some(Value::Null);
                }
                if kind != 0x72 {
                    return None;
                }
                let first = first & 63;
                let id = if t == 0xd5 {
                    let high = self.number(1)? as i32;
                    self.two.insert(first);
                    if first < 32 {
                        -((high << 5) + first)
                    } else {
                        (high << 5) + first
                    }
                } else {
                    first
                };
                let keys = self
                    .value(depth + 1)?
                    .as_array()?
                    .iter()
                    .map(|v| v.as_str().map(str::to_string))
                    .collect::<Option<Vec<_>>>()?;
                self.records.insert(id, keys);
                self.record(id, depth)
            }
            _ => None,
        }
    }
}
pub(super) fn decode(data: &[u8]) -> Option<Value> {
    let mut d = Decoder {
        data,
        pos: 0,
        records: HashMap::new(),
        two: HashSet::new(),
        budget: 200000,
    };
    let v = d.value(0)?;
    (d.pos == data.len()).then_some(v)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn record_and_invalid_input() {
        let data = b"\xd4r\x40\x91\xa4name\xa4song";
        assert_eq!(decode(data), Some(serde_json::json!({"name":"song"})));
        for end in 0..data.len() {
            assert!(decode(&data[..end]).is_none());
        }
        assert!(super::super::soda_lmdb::entries(&[0; 4096]).is_none());
    }
}
