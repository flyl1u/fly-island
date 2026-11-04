//! Ed25519 check of the market index against the keys in
//! plugins/signing-keys.json, compiled in. Signatures are made by
//! scripts/plugin-signing.mjs over the index with LF line ends.

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
struct IndexSignature {
    key_id: String,
    signature: String,
}

/// Checks `signature` (the contents of index.json.sig) for the index `text`.
pub(super) fn verify_index(text: &str, signature: &str, trusted_keys: &str) -> Result<(), String> {
    const REFUSED: &str = "The plugin index signature does not match, so the index was not used.";
    let signature: IndexSignature =
        serde_json::from_str(signature).map_err(|_| "The plugin index signature is missing or unreadable.".to_string())?;
    let trusted: TrustedKeys =
        serde_json::from_str(trusted_keys).map_err(|error| format!("The trusted plugin keys are invalid: {error}"))?;
    let key = trusted
        .keys
        .iter()
        .find(|key| key.key_id == signature.key_id)
        .ok_or("The plugin index is signed with a key this FocuSD Island does not trust. Update FocuSD Island.")?;

    let public: [u8; 32] = STANDARD
        .decode(&key.public_key)
        .ok()
        .and_then(|bytes| bytes.try_into().ok())
        .ok_or("A trusted plugin key is not a valid Ed25519 key.")?;
    let verifying_key = VerifyingKey::from_bytes(&public).map_err(|_| "A trusted plugin key is not a valid Ed25519 key.")?;
    let signature: [u8; 64] = STANDARD
        .decode(&signature.signature)
        .ok()
        .and_then(|bytes| bytes.try_into().ok())
        .ok_or(REFUSED)?;
    // A CRLF checkout of the index is the same index.
    let data = text.replace("\r\n", "\n");
    verifying_key
        .verify_strict(data.as_bytes(), &Signature::from_bytes(&signature))
        .map_err(|_| REFUSED.to_string())
}
