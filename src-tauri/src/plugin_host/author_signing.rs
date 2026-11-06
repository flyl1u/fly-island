//! Author signatures of market packages (docs/architecture/plugin-author-signing.md).
//! The index lists, for a plugin whose author signs, the author's keys and the
//! signature of "focusd-plugin-package/1\n<id>\n<version>\n<sha256>"; signed by
//! `fly-island-plugin pack --sign` (packages/fly-island-plugin/src/sign.mjs).
//!
//! The island remembers the key that signed the installed version
//! (`PluginGrant::author_keys`). Updates signed by that key, or a first signed
//! version, may install by themselves; an update with another key or none
//! waits for the user to confirm it, so a stolen repository (or index key)
//! cannot quietly replace an installed plugin. Only signed updates install by
//! themselves at all.
//!
//! Changing keys (phase 2): a listed key may carry `endorsedBy`, the old key's
//! signature of "focusd-plugin-key/1\n<id>\n<new keyId>\n<new publicKey>"
//! (`fly-island-plugin keys rotate`). A key endorsed by the remembered key, or
//! through a chain of such endorsements, counts as the remembered key.

use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const DOMAIN: &str = "focusd-plugin-package/1";
const KEY_DOMAIN: &str = "focusd-plugin-key/1";

/// An author's public key as the index lists it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorKey {
    pub(super) key_id: String,
    pub(super) public_key: String,
    /// The previous key's signature vouching for this one (a key change).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) endorsed_by: Option<AuthorSignature>,
}

/// The `<zip>.sig` the author published (or an endorsement), carried in the index.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorSignature {
    pub(super) key_id: String,
    pub(super) signature: String,
}

pub(super) fn signed_text(id: &str, version: &str, sha256: &str) -> String {
    format!("{DOMAIN}\n{id}\n{version}\n{}", sha256.to_ascii_lowercase())
}

/// What the old key signs to vouch for `key` of plugin `id`.
pub(super) fn endorsement_text(id: &str, key: &AuthorKey) -> String {
    format!("{KEY_DOMAIN}\n{id}\n{}\n{}", key.key_id, key.public_key)
}

/// The first 16 hex digits of the raw key's SHA-256.
fn key_id_of(raw: &[u8]) -> String {
    Sha256::digest(raw).iter().take(8).map(|byte| format!("{byte:02x}")).collect()
}

/// Whether `signature` is a valid signature of `text` by the listed key it names.
fn verifies(keys: &[AuthorKey], signature: &AuthorSignature, text: &str) -> bool {
    let Some(key) = keys.iter().find(|key| key.key_id == signature.key_id) else { return false };
    let Some(raw) = STANDARD.decode(&key.public_key).ok().and_then(|bytes| <[u8; 32]>::try_from(bytes).ok()) else {
        return false;
    };
    if key_id_of(&raw) != key.key_id {
        return false;
    }
    let Ok(verifying_key) = VerifyingKey::from_bytes(&raw) else { return false };
    let Some(bytes) = STANDARD.decode(&signature.signature).ok().and_then(|bytes| <[u8; 64]>::try_from(bytes).ok()) else {
        return false;
    };
    verifying_key.verify_strict(text.as_bytes(), &Signature::from_bytes(&bytes)).is_ok()
}

/// Which listed key signed the package: `Ok(None)` for an unsigned one, an
/// error when there is a signature that does not check out.
pub(super) fn signer(
    id: &str,
    version: &str,
    sha256: &str,
    signature: Option<&AuthorSignature>,
    keys: &[AuthorKey],
) -> Result<Option<String>, String> {
    let Some(signature) = signature else { return Ok(None) };
    if verifies(keys, signature, &signed_text(id, version, sha256)) {
        Ok(Some(signature.key_id.clone()))
    } else {
        Err(format!("The author signature of {id} {version} does not match, so it was not installed."))
    }
}

/// The remembered keys plus every listed key they endorse, directly or through
/// a chain of endorsements. Endorsements that do not verify are ignored.
pub(super) fn endorsed_keys(id: &str, remembered: &[String], keys: &[AuthorKey]) -> Vec<String> {
    let mut trusted = remembered.to_vec();
    loop {
        let next = keys.iter().find(|key| {
            !trusted.contains(&key.key_id)
                && key.endorsed_by.as_ref().is_some_and(|endorsement| {
                    trusted.contains(&endorsement.key_id) && verifies(keys, endorsement, &endorsement_text(id, key))
                })
        });
        match next {
            Some(key) => trusted.push(key.key_id.clone()),
            None => return trusted,
        }
    }
}

/// How a new version's signer compares with the key remembered for the installed one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum KeyCheck {
    /// Nothing remembered and the new version is unsigned.
    Unsigned,
    /// Nothing remembered; the new version is signed (its key is remembered from now on).
    FirstKey,
    /// Signed by the remembered key, or a key it endorsed.
    SameKey,
    /// A key is remembered, and the new version is unsigned or signed by another key.
    Changed,
}

impl KeyCheck {
    /// Only signed versions on the remembered key (or a first key) update by themselves.
    pub(super) fn may_install_by_itself(self) -> bool {
        matches!(self, Self::FirstKey | Self::SameKey)
    }
}

/// `trusted`: the remembered keys and those they endorse (`endorsed_keys`).
pub(super) fn check_key(trusted: &[String], signer: Option<&str>) -> KeyCheck {
    match signer {
        Some(key) if trusted.iter().any(|known| known == key) => KeyCheck::SameKey,
        _ if !trusted.is_empty() => KeyCheck::Changed,
        Some(_) => KeyCheck::FirstKey,
        None => KeyCheck::Unsigned,
    }
}

#[cfg(test)]
mod tests;
