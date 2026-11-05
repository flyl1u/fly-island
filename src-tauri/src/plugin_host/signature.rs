//! Ed25519 check of the market's signed files (index.json, revoked.json)
//! against the keys in plugins/signing-keys.json, compiled in. Signatures are
//! made by scripts/plugins/plugin-signing.mjs over the file with LF line ends.
//!
//! A `.sig` file is one `{ keyId, signature }` (the first format) or a list of
//! them, so a file can be signed by the old key and a new one while islands
//! that trust only one of them are still around. One valid signature by a
//! trusted key is enough.

use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;

/// The keys this build trusts; a new key only takes effect with a new release.
pub(super) const TRUSTED_KEYS: &str = include_str!("../../../plugins/signing-keys.json");

#[derive(Deserialize)]
struct TrustedKeys {
    keys: Vec<TrustedKey>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrustedKey {
    key_id: String,
    public_key: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileSignature {
    key_id: String,
    signature: String,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum SignatureFile {
    One(FileSignature),
    Many(Vec<FileSignature>),
}

/// Checks `signature` (the contents of index.json.sig) for the index `text`.
pub(super) fn verify_index(text: &str, signature: &str, trusted_keys: &str) -> Result<(), String> {
    verify_file(text, signature, trusted_keys, "plugin index")
}

/// Checks a signed market file; `what` names it in the error ("plugin index").
pub(super) fn verify_file(text: &str, signature: &str, trusted_keys: &str, what: &str) -> Result<(), String> {
    let refused = format!("The {what} signature does not match, so the {what} was not used.");
    let signatures = match serde_json::from_str::<SignatureFile>(signature) {
        Ok(SignatureFile::One(one)) => vec![one],
        Ok(SignatureFile::Many(many)) => many,
        Err(_) => return Err(format!("The {what} signature is missing or unreadable.")),
    };
    let trusted: TrustedKeys =
        serde_json::from_str(trusted_keys).map_err(|error| format!("The trusted plugin keys are invalid: {error}"))?;
    // A CRLF checkout of the file is the same file.
    let data = text.replace("\r\n", "\n");
    let mut any_trusted = false;
    for signature in &signatures {
        let Some(key) = trusted.keys.iter().find(|key| key.key_id == signature.key_id) else { continue };
        any_trusted = true;
        if verifies(&key.public_key, &signature.signature, data.as_bytes())? {
            return Ok(());
        }
    }
    if any_trusted {
        Err(refused)
    } else {
        Err(format!("The {what} is signed with a key this FocuSD Island does not trust. Update FocuSD Island."))
    }
}

/// Whether `signature` (base64) is `public_key`'s (base64) signature of `data`.
fn verifies(public_key: &str, signature: &str, data: &[u8]) -> Result<bool, String> {
    let public: [u8; 32] = STANDARD
        .decode(public_key)
        .ok()
        .and_then(|bytes| bytes.try_into().ok())
        .ok_or("A trusted plugin key is not a valid Ed25519 key.")?;
    let verifying_key = VerifyingKey::from_bytes(&public).map_err(|_| "A trusted plugin key is not a valid Ed25519 key.")?;
    let Some(signature) = STANDARD.decode(signature).ok().and_then(|bytes| <[u8; 64]>::try_from(bytes).ok()) else {
        return Ok(false);
    };
    Ok(verifying_key.verify_strict(data, &Signature::from_bytes(&signature)).is_ok())
}
