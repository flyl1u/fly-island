//! Shares the host's Windows Credential Manager namespace; never writes plaintext credentials.
fn entry(plugin: &str, key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.flyisland.app.plugins", &format!("{plugin}/{key}"))
        .map_err(|_| "Cannot open plugin credential".into())
}

pub fn load(plugin: &str, key: &str) -> Result<Option<String>, String> {
    match entry(plugin, key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Cannot read plugin credential".into()),
    }
}

pub fn save(plugin: &str, key: &str, value: &str) -> Result<(), String> {
    entry(plugin, key)?.set_password(value).map_err(|_| "Cannot save plugin credential".into())
}
