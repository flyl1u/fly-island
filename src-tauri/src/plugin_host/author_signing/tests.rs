use super::*;
use ed25519_dalek::{Signer, SigningKey};

fn key(seed: u8) -> (SigningKey, AuthorKey) {
    let signing = SigningKey::from_bytes(&[seed; 32]);
    let raw = signing.verifying_key().to_bytes();
    (signing, AuthorKey { key_id: key_id_of(&raw), public_key: STANDARD.encode(raw), endorsed_by: None })
}

fn sign_text(signing: &SigningKey, key: &AuthorKey, text: &str) -> AuthorSignature {
    AuthorSignature { key_id: key.key_id.clone(), signature: STANDARD.encode(signing.sign(text.as_bytes()).to_bytes()) }
}

fn sign(signing: &SigningKey, key: &AuthorKey, id: &str, version: &str, sha: &str) -> AuthorSignature {
    sign_text(signing, key, &signed_text(id, version, sha))
}

/// `new`, vouched for by `old` for plugin `id`.
fn endorse(id: &str, old: (&SigningKey, &AuthorKey), new: &AuthorKey) -> AuthorKey {
    AuthorKey { endorsed_by: Some(sign_text(old.0, old.1, &endorsement_text(id, new))), ..new.clone() }
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
    let lying = AuthorKey { key_id: listed.key_id.clone(), public_key: other.public_key, endorsed_by: None };
    assert!(signer("a.b", "1.0.0", &sha, Some(&signature), &[lying]).is_err(), "keyId of another key");
}

/// The SDK (sign.mjs) signed the official packages; the island must read them the same way.
#[test]
fn an_official_package_signed_by_the_sdk_verifies() {
    let zip = include_bytes!("../../../../plugins/packages/dev.focusd.todo-ring-1.0.1.zip");
    let sha: String = Sha256::digest(zip).iter().map(|byte| format!("{byte:02x}")).collect();
    let key: AuthorKey = serde_json::from_str(include_str!("../../../../plugins/author-key.json")).expect("author-key.json");
    let signature: AuthorSignature =
        serde_json::from_str(include_str!("../../../../plugins/packages/dev.focusd.todo-ring-1.0.1.zip.sig")).expect("zip.sig");
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

#[test]
fn keys_endorsed_by_the_remembered_key_count_as_it_even_through_a_chain() {
    let (s1, k1) = key(1);
    let (s2, k2) = key(2);
    let (_, k3) = key(3);
    let k2 = endorse("a.b", (&s1, &k1), &k2);
    let k3 = endorse("a.b", (&s2, &k2), &k3);
    let keys = [k1.clone(), k2.clone(), k3.clone()];
    let remembered = [k1.key_id.clone()];
    let trusted = endorsed_keys("a.b", &remembered, &keys);
    assert_eq!(trusted, vec![k1.key_id.clone(), k2.key_id.clone(), k3.key_id.clone()]);
    assert_eq!(check_key(&trusted, Some(&k3.key_id)), KeyCheck::SameKey);
    // Order in the list does not matter.
    let reversed = [k3.clone(), k2.clone(), k1.clone()];
    assert_eq!(endorsed_keys("a.b", &remembered, &reversed).len(), 3);
}

/// A key change made by the SDK (`endorseKey` in sign.mjs) is read the same way here.
#[test]
fn a_key_change_endorsed_by_the_sdk_verifies() {
    #[derive(Deserialize)]
    struct Fixture {
        id: String,
        keys: Vec<AuthorKey>,
    }
    let fixture: Fixture = serde_json::from_str(include_str!("endorsement.fixture.json")).expect("fixture");
    let remembered = [fixture.keys[0].key_id.clone()];
    let trusted = endorsed_keys(&fixture.id, &remembered, &fixture.keys);
    assert_eq!(trusted, vec![fixture.keys[0].key_id.clone(), fixture.keys[1].key_id.clone()]);
    assert_eq!(endorsed_keys("com.example.other", &remembered, &fixture.keys).len(), 1);
}

#[test]
fn endorsements_for_another_plugin_or_by_unknown_keys_do_not_count() {
    let (s1, k1) = key(1);
    let (s9, k9) = key(9);
    let (_, k2) = key(2);
    let remembered = [k1.key_id.clone()];
    // Signed for another plugin id.
    let elsewhere = endorse("other.plugin", (&s1, &k1), &k2);
    assert_eq!(endorsed_keys("a.b", &remembered, &[k1.clone(), elsewhere]), remembered.to_vec());
    // Endorsed by a key the user never had (an attacker's own chain).
    let foreign = endorse("a.b", (&s9, &k9), &k2);
    assert_eq!(endorsed_keys("a.b", &remembered, &[k1.clone(), k9, foreign]), remembered.to_vec());
    // A forged signature naming the remembered key.
    let forged = AuthorKey { endorsed_by: Some(AuthorSignature { key_id: k1.key_id.clone(), signature: STANDARD.encode([7u8; 64]) }), ..k2 };
    assert_eq!(endorsed_keys("a.b", &remembered, &[k1, forged]), remembered.to_vec());
    // Nothing remembered: nothing is trusted through endorsements.
    assert!(endorsed_keys("a.b", &[], &[]).is_empty());
}
