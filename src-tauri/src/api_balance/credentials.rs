use super::model::Secrets;
use keyring::{Entry, Error};
use serde::{Deserialize, Serialize};

const SERVICE: &str = "com.focusd.island.api-balance";
const CHUNK_BYTES: usize = 2400;
const MAX_CHUNKS: usize = 48;

#[derive(Deserialize, Serialize)]
struct Manifest {
    generation: String,
    count: usize,
}

fn entry(id: &str, suffix: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &format!("{id}-{suffix}"))
        .map_err(|_| "Unable to access Windows credentials".into())
}

fn manifest(id: &str) -> Result<Option<Manifest>, String> {
    match entry(id, "manifest")?.get_password() {
        Ok(value) => {
            let m: Manifest = serde_json::from_str(&value)
                .map_err(|_| "Invalid credential manifest".to_string())?;
            if m.count > MAX_CHUNKS
                || m.generation.len() != 16
                || !m.generation.bytes().all(|c| c.is_ascii_hexdigit())
            {
                return Err("Invalid credential manifest".into());
            }
            Ok(Some(m))
        }
        Err(Error::NoEntry) => Ok(None),
        Err(_) => Err("Unable to read Windows credentials".into()),
    }
}

pub fn read(id: &str) -> Result<Secrets, String> {
    let Some(m) = manifest(id)? else {
        return Ok(Secrets::default());
    };
    let mut bytes = Vec::new();
    for index in 0..m.count {
        let data = entry(id, &format!("{}-{index}", m.generation))?
            .get_secret()
            .map_err(|_| "Credential data is missing or inaccessible".to_string())?;
        if data.len() > CHUNK_BYTES {
            return Err("Invalid credential data".into());
        }
        bytes.extend(data);
    }
    serde_json::from_slice(&bytes).map_err(|_| "Unable to decode Windows credentials".into())
}

fn clear_chunks(id: &str, m: &Manifest) {
    for index in 0..m.count {
        if let Ok(e) = entry(id, &format!("{}-{index}", m.generation)) {
            let _ = e.delete_credential();
        }
    }
}

pub fn save(id: &str, secrets: &Secrets) -> Result<(), String> {
    let bytes =
        serde_json::to_vec(secrets).map_err(|_| "Unable to encode credentials".to_string())?;
    let chunks: Vec<_> = bytes.chunks(CHUNK_BYTES).collect();
    if chunks.len() > MAX_CHUNKS {
        return Err("Credentials and script exceed storage limit".into());
    }
    let old = manifest(id)?;
    let mut random = [0u8; 8];
    getrandom::fill(&mut random)
        .map_err(|_| "Unable to create credential identifier".to_string())?;
    let next = Manifest {
        generation: random.iter().map(|b| format!("{b:02x}")).collect(),
        count: chunks.len(),
    };
    let write = (|| {
        for (index, chunk) in chunks.iter().enumerate() {
            entry(id, &format!("{}-{index}", next.generation))?
                .set_secret(chunk)
                .map_err(|_| "Unable to save Windows credentials".to_string())?;
        }
        let encoded = serde_json::to_string(&next)
            .map_err(|_| "Unable to encode credential manifest".to_string())?;
        entry(id, "manifest")?
            .set_password(&encoded)
            .map_err(|_| "Unable to commit Windows credentials".to_string())
    })();
    if write.is_err() {
        clear_chunks(id, &next);
    } else if let Some(old) = old {
        clear_chunks(id, &old);
    }
    write
}

pub fn delete(id: &str) -> Result<(), String> {
    if let Some(m) = manifest(id)? {
        for index in 0..m.count {
            match entry(id, &format!("{}-{index}", m.generation))?.delete_credential() {
                Ok(()) | Err(Error::NoEntry) => {}
                Err(_) => return Err("Unable to remove account credentials".into()),
            }
        }
        match entry(id, "manifest")?.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => {}
            Err(_) => return Err("Unable to remove credential manifest".into()),
        }
    }
    Ok(())
}

pub fn merge(mut old: Secrets, new: Secrets) -> Result<Secrets, String> {
    if new.clear_code {
        old.code.clear();
    }
    old.clear_code = false;
    for (target, value) in [
        (&mut old.api_key, new.api_key),
        (&mut old.access_token, new.access_token),
        (&mut old.secret_access_key, new.secret_access_key),
        (&mut old.code, new.code),
    ] {
        if !value.is_empty() {
            *target = value;
        }
    }
    if [&old.api_key, &old.access_token, &old.secret_access_key]
        .iter()
        .any(|s| s.len() > 8192)
    {
        return Err("Credential exceeds 8 KiB".into());
    }
    super::script::validate_code(&old.code)?;
    Ok(old)
}
