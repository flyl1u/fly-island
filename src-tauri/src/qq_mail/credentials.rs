//! Authorization code storage in the Windows Credential Manager, and address validation.

use keyring::{Entry, Error as KeyringError};


pub(super) const CREDENTIAL_SERVICE: &str = "com.focusd.island.qq-mail";

pub(super) fn credential(email: &str) -> Result<Entry, String> {
    Entry::new(CREDENTIAL_SERVICE, email).map_err(|_| "无法访问 Windows 邮箱凭据。".into())
}

pub(super) fn read_secret(email: &str) -> Result<Option<String>, String> {
    match credential(email)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err("无法读取 Windows 邮箱凭据。".into()),
    }
}

pub(super) fn delete_secret(email: &str) -> Result<(), String> {
    match credential(email)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err("无法删除 Windows 邮箱凭据。".into()),
    }
}

pub(super) fn normalize_email(email: &str) -> Result<String, String> {
    let email = email.trim().to_ascii_lowercase();
    let local = email.strip_suffix("@qq.com").unwrap_or("");
    if local.is_empty()
        || local.len() > 64
        || !local
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._+-".contains(&byte))
    {
        return Err("请输入有效的 @qq.com 邮箱地址。".into());
    }
    Ok(email)
}
