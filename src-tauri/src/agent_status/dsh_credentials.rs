//! A deliberately small reader for DSH's own scalar credential YAML layout. Unsupported YAML
//! (anchors, tags, block scalars, custom references) is unavailable, never executed or logged.

use std::{fs::File, io::Read, path::Path};

use sha2::{Digest, Sha256};

pub(super) enum Credential {
    ApiKey(String),
    Account(String),
}

impl Credential {
    pub(super) fn secret(&self) -> &str {
        match self { Self::ApiKey(s) | Self::Account(s) => s }
    }

    pub(super) fn fingerprint(&self) -> String {
        let kind = match self { Self::ApiKey(_) => "api", Self::Account(_) => "account" };
        format!("{kind}:{:x}", Sha256::digest(self.secret().as_bytes()))
    }
}

fn scalar(value: &str) -> Option<String> {
    let value = value.trim();
    let parsed = if value.starts_with('"') {
        serde_json::from_str::<String>(value).ok()?
    } else if let Some(quoted) = value.strip_prefix('\'') {
        quoted.strip_suffix('\'')?.replace("''", "'")
    } else {
        if value.starts_with(['&', '*', '!', '|', '>', '{', '[']) { return None; }
        value.split(" #").next()?.trim().to_string()
    };
    (!parsed.is_empty() && !parsed.chars().any(char::is_control)).then_some(parsed)
}

/// Only the built-in reference and first-party account grant are read. No environment or
/// arbitrary endpoint is followed, so a custom gateway's secret cannot be sent to DeepSeek.
pub(super) fn parse(text: &str, provider: &str) -> Option<Credential> {
    let mut stack: Vec<(usize, String)> = Vec::new();
    let mut version = false;
    let (mut api, mut token, mut issuer, mut grant_version, mut grant_kind) = (None, None, None, false, false);
    for line in text.lines() {
        if line.trim().is_empty() || line.trim_start().starts_with('#') { continue; }
        if line.contains('\t') { return None; }
        let indent = line.len() - line.trim_start().len();
        let (key, value) = line.trim_start().split_once(':')?;
        while stack.last().is_some_and(|(depth, _)| *depth >= indent) { stack.pop(); }
        let key = scalar(key)?;
        let parents: Vec<&str> = stack.iter().map(|(_, key)| key.as_str()).collect();
        if value.trim().is_empty() { stack.push((indent, key)); continue; }
        // Ignore unrelated records, including their values.
        let relevant = match (parents.as_slice(), key.as_str()) {
            ([], "version") => { version = value.trim() == "1"; false }
            (["refs"], "DEEPSEEK_API_KEY") if provider == "deepseek-official" => true,
            (["records", "deepseek-account-platform/default"], "kind") => true,
            (["records", "deepseek-account-platform/default", "payload"], "version" | "token" | "issuer") => true,
            _ => false,
        };
        if !relevant { continue; }
        let value = scalar(value)?;
        match key.as_str() {
            "DEEPSEEK_API_KEY" => api = Some(value),
            "kind" => grant_kind = value == "grant",
            "version" => grant_version = value == "1",
            "token" => token = Some(value),
            "issuer" => issuer = Some(value),
            _ => {}
        }
    }
    if !version { return None; }
    let credential = match provider {
        "deepseek-official" => Credential::ApiKey(api?),
        "deepseek-account" if grant_kind && grant_version && issuer.as_deref() == Some("https://platform.deepseek.com") => Credential::Account(token?),
        _ => return None,
    };
    // HTTP header values must be visible ASCII; the parser never returns a diagnostic with them.
    credential.secret().bytes().all(|c| (0x21..=0x7e).contains(&c)).then_some(credential)
}

pub(super) fn read(root: &Path, provider: &str) -> Option<Credential> {
    const MAX_BYTES: u64 = 64 * 1024;
    let file = File::open(root.join(".credentials.yaml")).ok()?;
    if file.metadata().ok()?.len() > MAX_BYTES { return None; }
    let mut text = String::new();
    file.take(MAX_BYTES + 1).read_to_string(&mut text).ok()?;
    if text.len() as u64 > MAX_BYTES { return None; }
    parse(&text, provider)
}

/// A conservative guard for customized built-in routes. We do not interpret configuration or
/// follow includes: any non-default destination/reference in the known local patches disables
/// automatic wallet lookup. This also avoids sending a gateway key to the official service.
pub(super) fn official_route(root: &Path) -> bool {
    for relative in ["settings.yaml", "settings.yaml.imported", "desktop-host-sources.patch.yml",
        "profiles/web/cordis.patch.yml", "profiles/web/cordis.yml", "profiles/desktop/cordis.patch.yml", "profiles/desktop/cordis.yml"] {
        let path = root.join(relative);
        if !path.is_file() { continue; }
        let Ok(file) = File::open(path) else { return false; };
        if file.metadata().is_ok_and(|m| m.len() > 256 * 1024) { return false; }
        let mut text = String::new();
        if file.take(256 * 1024 + 1).read_to_string(&mut text).is_err() || text.len() > 256 * 1024 { return false; }
        if !default_route_config(&text) { return false; }
    }
    true
}

fn default_route_config(text: &str) -> bool {
    text.lines().all(|line| {
        if line.trim_start().starts_with('#') { return true; }
        let Some((key, value)) = line.trim().split_once(':') else { return true; };
        let allowed = match key.trim_matches(['\'', '"']) {
            "baseURL" | "inferenceOrigin" => Some("https://api.deepseek.com"),
            "platformOrigin" => Some("https://platform.deepseek.com"),
            "apiKeyEnv" => Some("DEEPSEEK_API_KEY"),
            _ => None,
        };
        match allowed {
            Some(allowed) => scalar(value).is_some_and(|value| value.trim_end_matches('/') == allowed),
            None => !["baseURL:", "inferenceOrigin:", "platformOrigin:", "apiKeyEnv:"]
                .iter().any(|field| line.contains(field)),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_only_fixed_reference_and_matching_issuer() {
        let api = "version: 1\nrecords: {}\nrefs:\n  DEEPSEEK_API_KEY: 'fictional-key'\n";
        assert!(matches!(parse(api, "deepseek-official"), Some(Credential::ApiKey(_))));
        assert!(parse(api, "custom-provider").is_none());
        assert!(parse(&api.replace("'fictional-key'", "*alias"), "deepseek-official").is_none());
        let account = "version: 1\nrecords:\n  deepseek-account-platform/default:\n    kind: grant\n    payload:\n      version: 1\n      token: fictional-grant\n      issuer: https://platform.deepseek.com\nrefs: {}\n";
        assert!(matches!(parse(account, "deepseek-account"), Some(Credential::Account(_))));
        assert!(parse(&account.replace("platform.deepseek.com", "example.invalid"), "deepseek-account").is_none());
        assert!(parse(&account.replace("version: 1", "version: 99"), "deepseek-account").is_none());
    }

    #[test]
    fn never_uses_custom_endpoint_or_reference_credentials() {
        assert!(default_route_config("baseURL: https://api.deepseek.com/\napiKeyEnv: DEEPSEEK_API_KEY"));
        assert!(!default_route_config("baseURL: https://example.invalid"));
        assert!(!default_route_config("baseURL: https://api.deepseek.com.example.invalid"));
        assert!(!default_route_config("apiKeyEnv: CUSTOM_GATEWAY_KEY"));
        assert!(!default_route_config("platformOrigin: https://example.invalid"));
        assert!(!default_route_config("plugin: {baseURL: https://example.invalid}"));
    }
}
