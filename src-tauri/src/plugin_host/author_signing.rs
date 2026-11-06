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

use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const DOMAIN: &str = "focusd-plugin-package/1";

/// An author's public key as the index lists it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorKey {
    pub(super) key_id: String,
    pub(super) public_key: String,
}

/// The `<zip>.sig` the author published, carried in the index.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorSignature {
    pub(super) key_id: String,
    pub(super) signature: String,
}

pub(super) fn signed_text(id: &str, version: &str, sha256: &str) -> String {
    format!("{DOMAIN}\n{id}\n{version}\n{}", sha256.to_ascii_lowercase())
}

/// The first 16 hex digits of the raw key's SHA-256.
fn key_id_of(raw: &[u8]) -> String {
    Sha256::digest(raw).iter().take(8).map(|byte| format!("{byte:02x}")).collect()
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
    let refused = || format!("The author signature of {id} {version} does not match, so it was not installed.");
    let key = keys.iter().find(|key| key.key_id == signature.key_id).ok_or_else(refused)?;
    let raw: [u8; 32] = STANDARD.decode(&key.public_key).ok().and_then(|bytes| bytes.try_into().ok()).ok_or_else(refused)?;
    if key_id_of(&raw) != key.key_id {
        return Err(refused());
    }
    let verifying_key = VerifyingKey::from_bytes(&raw).map_err(|_| refused())?;
    let bytes: [u8; 64] = STANDARD.decode(&signature.signature).ok().and_then(|bytes| bytes.try_into().ok()).ok_or_else(refused)?;
    verifying_key
        .verify_strict(signed_text(id, version, sha256).as_bytes(), &Signature::from_bytes(&bytes))
        .map_err(|_| refused())?;
    Ok(Some(key.key_id.clone()))
}

/// How a new version's signer compares with the key remembered for the installed one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum KeyCheck {
    /// Nothing remembered and the new version is unsigned.
    Unsigned,
    /// Nothing remembered; the new version is signed (its key is remembered from now on).
    FirstKey,
    /// Signed by the remembered key.
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

pub(super) fn check_key(remembered: &[String], signer: Option<&str>) -> KeyCheck {
    match signer {
        Some(key) if remembered.iter().any(|known| known == key) => KeyCheck::SameKey,
        _ if !remembered.is_empty() => KeyCheck::Changed,
        Some(_) => KeyCheck::FirstKey,
        None => KeyCheck::Unsigned,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn key(seed: u8) -> (SigningKey, AuthorKey) {
        let signing = SigningKey::from_bytes(&[seed; 32]);
        let raw = signing.verifying_key().to_bytes();
        (signing, AuthorKey { key_id: key_id_of(&raw), public_key: STANDARD.encode(raw) })
    }

    fn sign(signing: &SigningKey, key: &AuthorKey, id: &str, version: &str, sha: &str) -> AuthorSignature {
        let signature = signing.sign(signed_text(id, version, sha).as_bytes());
        AuthorSignature { key_id: key.key_id.clone(), signature: STANDARD.encode(signature.to_bytes()) }
    }

    #[test]
    fn a_signature_holds_only_for_its_plugin_version_hash_and_listed_key() {
        let sha = "ab".repeat(32);
        let (signing, listed) = key(1);
        let signature = sign(&signing, &listed, "a.b", "1.0.0", &sha);
        let keys = [listed.clone()];
        assert_eq!(signer("a.b", "1.0.0", &sha.to_uppercase(), Some(&signature), &keys), Ok(Some(listed.key_id.clone())));
        assert_eq!(signer("a.b", "1.0.0", &sha, None, &keys), Ok(None));
        assert!(signer("a.c", "1.0.0", &sha, Some(&signature), &keys).is_err());
        assert!(signer("a.b", "1.0.1", &sha, Some(&signature), &keys).is_err());
        assert!(signer("a.b", "1.0.0", &"cd".repeat(32), Some(&signature), &keys).is_err());
        let (_, other) = key(2);
        assert!(signer("a.b", "1.0.0", &sha, Some(&signature), std::slice::from_ref(&other)).is_err(), "key not listed");
        let lying = AuthorKey { key_id: listed.key_id.clone(), public_key: other.public_key };
        assert!(signer("a.b", "1.0.0", &sha, Some(&signature), &[lying]).is_err(), "keyId of another key");
    }

    /// The SDK (sign.mjs) signed the official packages; the island must read them the same way.
    #[test]
    fn an_official_package_signed_by_the_sdk_verifies() {
        let zip = include_bytes!("../../../plugins/packages/dev.focusd.todo-ring-1.0.1.zip");
        let sha: String = Sha256::digest(zip).iter().map(|byte| format!("{byte:02x}")).collect();
        let key: AuthorKey = serde_json::from_str(include_str!("../../../plugins/author-key.json")).expect("author-key.json");
        let signature: AuthorSignature =
            serde_json::from_str(include_str!("../../../plugins/packages/dev.focusd.todo-ring-1.0.1.zip.sig")).expect("zip.sig");
        let keys = [key.clone()];
        assert_eq!(signer("dev.focusd.todo-ring", "1.0.1", &sha, Some(&signature), &keys), Ok(Some(key.key_id)));
    }

    #[test]
    fn only_the_remembered_key_updates_without_asking() {
        let remembered = vec!["k1".to_string()];
        assert_eq!(check_key(&[], None), KeyCheck::Unsigned);
        assert_eq!(check_key(&[], Some("k1")), KeyCheck::FirstKey);
        assert_eq!(check_key(&remembered, Some("k1")), KeyCheck::SameKey);
        assert_eq!(check_key(&remembered, Some("k2")), KeyCheck::Changed);
        assert_eq!(check_key(&remembered, None), KeyCheck::Changed);
        assert!(KeyCheck::SameKey.may_install_by_itself() && KeyCheck::FirstKey.may_install_by_itself());
        assert!(!KeyCheck::Unsigned.may_install_by_itself() && !KeyCheck::Changed.may_install_by_itself());
    }
}
