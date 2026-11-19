//! The Z Code desktop app's sign-in, read from `~/.zcode/v2/credentials.json`. Its values are
//! plain, `enc:v1:` (AES-256-GCM with a key derived from the Windows user) or `enc:v2:` (the key
//! kept in the Credential Manager, or in a secret file / variable). Ported from
//! xiaotang-daozai's `zcode_quota.rs` (MIT, see docs/third-party-licenses.md). Nothing is written.

use std::{env, fs, io::Read, path::{Path, PathBuf}};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ring::{aead, digest};
use serde_json::Value;

const CREDENTIAL_ERROR: &str = "无法读取 Z Code 的登录，请在 Z Code 中重新登录";

pub(super) fn credentials_path(home: &Path) -> PathBuf {
    home.join(".zcode").join("v2").join("credentials.json")
}

fn hash(bytes: &[u8]) -> String {
    digest::digest(&digest::SHA256, bytes).as_ref().iter().map(|b| format!("{b:02x}")).collect()
}

fn sha256(bytes: &[u8]) -> Vec<u8> {
    digest::digest(&digest::SHA256, bytes).as_ref().to_vec()
}

/// The key Z Code keeps in the Credential Manager under the SHA-256 of the file's absolute path.
fn system_key(path: &Path) -> Result<Vec<u8>, String> {
    let path = std::path::absolute(path).map_err(|_| CREDENTIAL_ERROR)?;
    let path = path.to_str().ok_or(CREDENTIAL_ERROR)?.replace('/', "\\");
    let path = match path.strip_prefix("\\\\?\\UNC\\") {
        Some(unc) => format!("\\\\{unc}"),
        None => path.strip_prefix("\\\\?\\").unwrap_or(&path).to_string(),
    };
    let encoded = keyring::Entry::new("ZCode Credential Encryption", &hash(path.as_bytes()))
        .and_then(|entry| entry.get_password())
        .map_err(|_| "无法读取 Z Code 的安全存储密钥，请用当前 Windows 用户打开 Z Code 后重试")?;
    URL_SAFE_NO_PAD.decode(encoded.trim()).ok().filter(|key| key.len() == 32).ok_or_else(|| CREDENTIAL_ERROR.to_string())
}

fn managed_key(path: &Path, source: &str) -> Result<Vec<u8>, String> {
    let secret = env::var("ZCODE_CREDENTIAL_SECRET").ok().filter(|s| !s.is_empty());
    let secret_file = env::var_os("ZCODE_CREDENTIAL_SECRET_FILE").filter(|s| !s.is_empty()).map(PathBuf::from);
    if source == "os" {
        return system_key(path);
    }
    if let Some(secret) = secret {
        return Ok(sha256(secret.as_bytes()));
    }
    let file = secret_file.unwrap_or_else(|| path.with_file_name("credential-secret"));
    let mut bytes = Vec::new();
    fs::File::open(file).and_then(|f| f.take(4097).read_to_end(&mut bytes)).map_err(|_| CREDENTIAL_ERROR)?;
    if !(32..=4096).contains(&bytes.len()) || std::str::from_utf8(&bytes).is_err() {
        return Err(CREDENTIAL_ERROR.to_string());
    }
    Ok(sha256(&bytes))
}

fn open_sealed(encoded: &str, key: &[u8]) -> Option<String> {
    let parts = encoded.split('.').map(|part| URL_SAFE_NO_PAD.decode(part)).collect::<Result<Vec<_>, _>>().ok()?;
    let [iv, tag, cipher] = parts.as_slice() else { return None };
    if tag.len() != 16 {
        return None;
    }
    let mut bytes = cipher.clone();
    bytes.extend_from_slice(tag);
    let key = aead::LessSafeKey::new(aead::UnboundKey::new(&aead::AES_256_GCM, key).ok()?);
    let plain = key.open_in_place(aead::Nonce::try_assume_unique_for_key(iv).ok()?, aead::Aad::empty(), &mut bytes).ok()?;
    String::from_utf8(plain.to_vec()).ok()
}

/// A stored value, decrypted. An unknown `enc:` scheme is an error, never used as plain text.
pub(super) fn value(root: &Value, name: &str, path: &Path) -> Result<String, String> {
    let raw = root[name].as_str().ok_or("请先在 Z Code 中登录个人账号")?;
    let (encoded, key) = if let Some(encoded) = raw.strip_prefix("enc:v2:") {
        let parts: Vec<&str> = encoded.split(':').collect();
        let [source, fingerprint, payload] = parts.as_slice() else { return Err(CREDENTIAL_ERROR.into()) };
        if !matches!(*source, "os" | "env") || fingerprint.len() != 24 || !fingerprint.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
            return Err(CREDENTIAL_ERROR.into());
        }
        let key = managed_key(path, source)?;
        if hash(&key)[..24] != **fingerprint {
            return Err("Z Code 凭据与安全存储密钥不匹配，请在 Z Code 中确认登录".into());
        }
        (*payload, key)
    } else if let Some(encoded) = raw.strip_prefix("enc:v1:") {
        let secret = env::var("ZCODE_CREDENTIAL_SECRET").ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| {
            format!("zcode-credential-fallback:win32:{}:{}", env::var("USERPROFILE").unwrap_or_default(), env::var("USERNAME").unwrap_or_default())
        });
        (encoded, sha256(secret.trim().as_bytes()))
    } else if raw.starts_with("enc:") {
        return Err("Z Code 登录凭据的格式暂不支持".into());
    } else {
        return Ok(raw.to_string());
    };
    open_sealed(encoded, &key).ok_or_else(|| CREDENTIAL_ERROR.to_string())
}

/// The signed-in account: its region ("zai" abroad, "bigmodel" in China), the coding plan's
/// account id when there is one, and the app's own token.
pub(super) struct Login {
    pub(super) family: &'static str,
    pub(super) coding_subject: Option<String>,
    pub(super) jwt: String,
}

pub(super) fn login(root: &Value, path: &Path) -> Result<Login, String> {
    let provider = value(root, "oauth:active_provider", path)?;
    let family = match provider.as_str() {
        "zai" => "zai",
        "bigmodel" | "zai_cn" => "bigmodel",
        _ => return Err("暂不支持这个 Z Code 登录区域".into()),
    };
    let jwt = value(root, "zcodejwttoken", path)?;
    let claims = jwt.split('.').nth(1).and_then(|s| URL_SAFE_NO_PAD.decode(s).ok())
        .and_then(|s| serde_json::from_slice::<Value>(&s).ok()).ok_or("Z Code 账号标识无效")?;
    let id = claims["sub"].as_str().or_else(|| claims["user_id"].as_str()).ok_or("Z Code 未返回账号标识")?.to_string();
    // A China sign-in names its plan account through the linked BigModel account.
    let coding_subject = if provider == "zai_cn" {
        match root.get("oauth:linked_bigmodel") {
            Some(_) => serde_json::from_str::<Value>(&value(root, "oauth:linked_bigmodel", path)?).ok()
                .and_then(|linked| linked["customerId"].as_str().filter(|s| !s.trim().is_empty()).map(str::to_string)),
            None => None,
        }
    } else {
        Some(id)
    };
    Ok(Login { family, coding_subject, jwt })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sealed(value: &str, key: &[u8], prefix: &str) -> String {
        let iv = [7; 12];
        let mut bytes = value.as_bytes().to_vec();
        let cipher = aead::LessSafeKey::new(aead::UnboundKey::new(&aead::AES_256_GCM, key).unwrap());
        let tag = cipher.seal_in_place_separate_tag(aead::Nonce::assume_unique_for_key(iv), aead::Aad::empty(), &mut bytes).unwrap();
        format!("{prefix}{}.{}.{}", URL_SAFE_NO_PAD.encode(iv), URL_SAFE_NO_PAD.encode(tag), URL_SAFE_NO_PAD.encode(bytes))
    }

    #[test]
    fn opens_values_and_rejects_unknown_schemes() {
        let key = sha256(b"synthetic");
        let raw = sealed("zai", &key, "");
        assert_eq!(open_sealed(&raw, &key).as_deref(), Some("zai"));
        assert!(open_sealed(&raw, &sha256(b"other")).is_none());
        let path = Path::new("credentials.json");
        assert_eq!(value(&serde_json::json!({"a": "plain"}), "a", path).as_deref(), Ok("plain"));
        for raw in ["enc:v9:secret", "enc:v2:os:bad:secret", "enc:v1:invalid"] {
            let error = value(&serde_json::json!({ "a": raw }), "a", path).unwrap_err();
            assert!(!error.contains("secret"));
        }
    }

    #[test]
    fn reads_the_region_and_plan_account() {
        let jwt = format!("e30.{}.sig", URL_SAFE_NO_PAD.encode(r#"{"sub":"u1"}"#));
        let path = Path::new("credentials.json");
        let global = login(&serde_json::json!({"oauth:active_provider": "zai", "zcodejwttoken": jwt}), path).unwrap();
        assert_eq!((global.family, global.coding_subject.as_deref()), ("zai", Some("u1")));
        let china = login(&serde_json::json!({"oauth:active_provider": "zai_cn", "zcodejwttoken": jwt}), path).unwrap();
        assert_eq!((china.family, china.coding_subject), ("bigmodel", None));
    }
}
