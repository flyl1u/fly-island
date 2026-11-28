//! Versioned Credential Manager chunks. Readers also hold the account lock, so an index
//! switch is the commit point and old chunks can only be collected after that switch.
use serde::{Deserialize, Serialize};

const INDEX: &str = "index";
const CHUNK_BYTES: usize = 2400;
const MAX_CHUNKS: usize = 12;
const ERROR: &str = "relay:storage";

#[derive(Deserialize, Serialize)]
struct Index {
    chunks: usize,
    #[serde(default)]
    generation: String,
}

pub(super) trait Credentials {
    fn read(&self, name: &str) -> Result<Option<Vec<u8>>, String>;
    fn write(&self, name: &str, bytes: &[u8]) -> Result<(), String>;
    fn delete(&self, name: &str);
}

fn chunk(index: &Index, number: usize) -> String {
    if index.generation.is_empty() { format!("chunk-{number}") }
    else { format!("chunk-{}-{number}", index.generation) }
}

fn index(storage: &impl Credentials) -> Result<Option<Index>, String> {
    let Some(bytes) = storage.read(INDEX)? else { return Ok(None) };
    let index: Index = serde_json::from_slice(&bytes).map_err(|_| ERROR.to_string())?;
    if !(1..=MAX_CHUNKS).contains(&index.chunks) { return Err(ERROR.to_string()) }
    Ok(Some(index))
}

pub(super) fn load(storage: &impl Credentials) -> Result<Option<Vec<u8>>, String> {
    let Some(index) = index(storage)? else { return Ok(None) };
    let mut bytes = Vec::new();
    for number in 0..index.chunks {
        bytes.extend(storage.read(&chunk(&index, number))?.ok_or(ERROR)?);
    }
    Ok(Some(bytes))
}

pub(super) fn store(storage: &impl Credentials, bytes: &[u8], generation: String) -> Result<(), String> {
    let parts: Vec<_> = bytes.chunks(CHUNK_BYTES).collect();
    if parts.is_empty() || parts.len() > MAX_CHUNKS { return Err(ERROR.to_string()) }
    let previous = index(storage)?;
    let next = Index { chunks: parts.len(), generation };
    for (number, bytes) in parts.iter().enumerate() {
        if let Err(error) = storage.write(&chunk(&next, number), bytes) {
            for number in 0..next.chunks { storage.delete(&chunk(&next, number)); }
            return Err(error);
        }
    }
    let encoded = serde_json::to_vec(&next).map_err(|_| ERROR.to_string())?;
    if let Err(error) = storage.write(INDEX, &encoded) {
        for number in 0..next.chunks { storage.delete(&chunk(&next, number)); }
        return Err(error);
    }
    if let Some(previous) = previous {
        for number in 0..previous.chunks { storage.delete(&chunk(&previous, number)); }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, collections::BTreeMap};
    #[derive(Default)]
    struct Memory { entries: RefCell<BTreeMap<String, Vec<u8>>>, fail: RefCell<Option<String>> }
    impl Credentials for Memory {
        fn read(&self, name: &str) -> Result<Option<Vec<u8>>, String> { Ok(self.entries.borrow().get(name).cloned()) }
        fn write(&self, name: &str, bytes: &[u8]) -> Result<(), String> {
            if self.fail.borrow().as_deref() == Some(name) { return Err(ERROR.into()) }
            self.entries.borrow_mut().insert(name.into(), bytes.into()); Ok(())
        }
        fn delete(&self, name: &str) { self.entries.borrow_mut().remove(name); }
    }
    #[test]
    fn failed_chunk_or_index_write_preserves_the_complete_previous_snapshot() {
        for failed in ["chunk-next-1", "index"] {
            let storage = Memory::default();
            let original = vec![b'a'; 3000];
            store(&storage, &original, "old".into()).unwrap();
            *storage.fail.borrow_mut() = Some(failed.into());
            assert!(store(&storage, &vec![b'b'; 6000], "next".into()).is_err());
            assert_eq!(load(&storage).unwrap(), Some(original));
            assert!(!storage.entries.borrow().keys().any(|key| key.starts_with("chunk-next-")));
        }
    }
    #[test]
    fn legacy_chunks_migrate_and_shrinking_collects_only_the_old_generation() {
        let storage = Memory::default();
        storage.write("index", br#"{"chunks":2}"#).unwrap();
        storage.write("chunk-0", b"first").unwrap(); storage.write("chunk-1", b"second").unwrap();
        assert_eq!(load(&storage).unwrap(), Some(b"firstsecond".to_vec()));
        store(&storage, b"replacement", "new".into()).unwrap();
        assert_eq!(load(&storage).unwrap(), Some(b"replacement".to_vec()));
        assert!(storage.read("chunk-0").unwrap().is_none());
        assert!(storage.read("chunk-1").unwrap().is_none());
    }
}
