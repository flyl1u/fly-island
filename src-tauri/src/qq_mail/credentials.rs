//! Authorization code storage in the Windows Credential Manager, and address validation.

use keyring::{Entry, Error as KeyringError};

const CREDENTIAL_SERVICE: &str = "com.focusd.island.qq-mail";

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

fn is_domain(value: &str) -> bool {
    value.len() <= 253
        && value.contains('.')
        && value.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
}

// The address is also the IMAP login and the credential key, so only plain ASCII is accepted.
pub(super) fn normalize_email(email: &str) -> Result<String, String> {
    let email = email.trim().to_ascii_lowercase();
    let valid = email.split_once('@').is_some_and(|(local, domain)| {
        !local.is_empty()
            && local.len() <= 64
            && local
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"._+-".contains(&byte))
            && is_domain(domain)
    });
    if !valid {
        return Err("请输入有效的邮箱地址。".into());
    }
    Ok(email)
}

/// `imap.<domain>` serves QQ, Foxmail, 163, 126 and most school and company mail.
pub(super) fn imap_host(email: &str) -> String {
    let domain = email.split_once('@').map_or(email, |(_, domain)| domain);
    format!("imap.{domain}")
}
