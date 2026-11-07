//! Which computers the island reads agent sessions from over SSH (Settings → AI Agent → Remote
//! computers), kept in `agent-remote-hosts.json` in the app data folder: the chosen ones (`hosts`,
//! by name), and the computers added in the island itself (`custom`) next to the Host aliases of
//! ~/.ssh/config. The island never writes ~/.ssh/config.

use std::{fs, path::Path};

use serde::{Deserialize, Serialize};

pub(super) const FILE_NAME: &str = "agent-remote-hosts.json";
/// More would mean an ssh process every few seconds.
const MAX_HOSTS: usize = 8;
const MAX_CUSTOM: usize = 16;

/// A computer added in the island: listed and stored by `name` (like a Host alias), reached as
/// `ssh -p <port> <user>@<host>`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomHost {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    pub host: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct RemoteHostsFile {
    hosts: Vec<String>,
    /// Missing in files written before computers could be added in the island.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    custom: Vec<CustomHost>,
}

/// What ssh is given for a chosen computer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct SshTarget {
    pub(super) destination: String,
    pub(super) port: Option<u16>,
}

/// Whether `alias` can be given to ssh as a host name: no option (`-`), spaces or patterns.
pub(super) fn is_valid_alias(alias: &str) -> bool {
    (1..=64).contains(&alias.len())
        && !alias.starts_with('-')
        && alias.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '@'))
}

/// A DNS name or an IPv4 / IPv6 address, never read by ssh as an option.
fn is_valid_host_name(host: &str) -> bool {
    (1..=253).contains(&host.len())
        && !host.starts_with('-')
        && host.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | ':'))
}

fn is_valid_user(user: &str) -> bool {
    (1..=32).contains(&user.len())
        && !user.starts_with('-')
        && user.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn read_file(app_dir: &Path) -> RemoteHostsFile {
    let mut file = fs::read_to_string(app_dir.join(FILE_NAME))
        .ok()
        .and_then(|text| serde_json::from_str::<RemoteHostsFile>(&text).ok())
        .unwrap_or_default();
    file.hosts.retain(|host| is_valid_alias(host));
    file.hosts.truncate(MAX_HOSTS);
    file.custom.retain(|custom| check(custom).is_ok());
    file.custom.truncate(MAX_CUSTOM);
    file
}

fn save(app_dir: &Path, file: &RemoteHostsFile) -> Result<(), String> {
    let text = serde_json::to_string_pretty(file).map_err(|error| error.to_string())?;
    fs::create_dir_all(app_dir).map_err(|error| format!("Failed to create the app data folder: {error}"))?;
    fs::write(app_dir.join(FILE_NAME), text).map_err(|error| format!("Failed to save the remote computers: {error}"))
}

/// The chosen hosts; none when the file is missing or unreadable.
pub(super) fn read(app_dir: &Path) -> Vec<String> {
    read_file(app_dir).hosts
}

/// The computers added in the island.
pub(super) fn custom(app_dir: &Path) -> Vec<CustomHost> {
    read_file(app_dir).custom
}

/// The chosen hosts with what ssh is given for each: an added computer's address, else the alias.
pub(super) fn chosen_targets(app_dir: &Path) -> Vec<(String, SshTarget)> {
    let file = read_file(app_dir);
    file.hosts
        .into_iter()
        .map(|name| {
            let target = match file.custom.iter().find(|custom| custom.name == name) {
                Some(custom) => SshTarget {
                    destination: match &custom.user {
                        Some(user) => format!("{user}@{}", custom.host),
                        None => custom.host.clone(),
                    },
                    port: custom.port,
                },
                None => SshTarget { destination: name.clone(), port: None },
            };
            (name, target)
        })
        .collect()
}

pub(super) fn write(app_dir: &Path, hosts: &[String]) -> Result<Vec<String>, String> {
    let mut chosen: Vec<String> = Vec::new();
    for host in hosts.iter().map(|host| host.trim()) {
        if !is_valid_alias(host) {
            return Err(format!("\"{host}\" is not an SSH host name"));
        }
        if !chosen.iter().any(|known| known == host) {
            chosen.push(host.to_string());
        }
    }
    if chosen.len() > MAX_HOSTS {
        return Err(format!("At most {MAX_HOSTS} computers"));
    }
    let custom = read_file(app_dir).custom;
    save(app_dir, &RemoteHostsFile { hosts: chosen.clone(), custom })?;
    Ok(chosen)
}

/// Trims an added computer and says what is wrong with it; an empty name becomes the host.
fn check(custom: &CustomHost) -> Result<CustomHost, String> {
    let host = custom.host.trim().to_string();
    if !is_valid_host_name(&host) {
        return Err(format!("\"{host}\" is not a host name or address"));
    }
    let name = match custom.name.trim() {
        "" => host.clone(),
        name => name.to_string(),
    };
    if !is_valid_alias(&name) {
        return Err(format!("\"{name}\" cannot be a name: use letters, digits, . _ - or @"));
    }
    let user = custom.user.as_deref().map(str::trim).filter(|user| !user.is_empty());
    if let Some(user) = user.filter(|user| !is_valid_user(user)) {
        return Err(format!("\"{user}\" is not a user name"));
    }
    if custom.port == Some(0) {
        return Err("The port must be 1–65535".into());
    }
    Ok(CustomHost { name, user: user.map(str::to_string), host, port: custom.port })
}

/// Adds a computer (or replaces the one of the same name) and switches it on when there is room.
pub(super) fn add_custom(app_dir: &Path, custom: &CustomHost) -> Result<Vec<CustomHost>, String> {
    let custom = check(custom)?;
    let mut file = read_file(app_dir);
    match file.custom.iter().position(|known| known.name == custom.name) {
        Some(index) => file.custom[index] = custom.clone(),
        None if file.custom.len() >= MAX_CUSTOM => return Err(format!("At most {MAX_CUSTOM} added computers")),
        None => file.custom.push(custom.clone()),
    }
    if !file.hosts.contains(&custom.name) && file.hosts.len() < MAX_HOSTS {
        file.hosts.push(custom.name);
    }
    save(app_dir, &file)?;
    Ok(file.custom)
}

/// Removes an added computer, and stops reading it.
pub(super) fn remove_custom(app_dir: &Path, name: &str) -> Result<Vec<CustomHost>, String> {
    let mut file = read_file(app_dir);
    file.custom.retain(|custom| custom.name != name);
    file.hosts.retain(|host| host != name);
    save(app_dir, &file)?;
    Ok(file.custom)
}

/// The Host aliases in an ssh config, in order, without patterns (`*`, `?`, `!`).
pub(super) fn ssh_config_hosts(config: &str) -> Vec<String> {
    let mut hosts: Vec<String> = Vec::new();
    for line in config.lines() {
        let line = line.trim();
        let Some((keyword, rest)) = line.split_once(|c: char| c.is_whitespace() || c == '=') else {
            continue;
        };
        if !keyword.eq_ignore_ascii_case("host") {
            continue;
        }
        for alias in rest.split_whitespace().map(|alias| alias.trim_matches('"')) {
            if is_valid_alias(alias) && !hosts.iter().any(|known| known == alias) {
                hosts.push(alias.to_string());
            }
        }
    }
    hosts
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("focusd-remote-hosts-{tag}-{}", std::process::id()))
    }

    fn cleanup(dir: &Path) {
        let _ = fs::remove_file(dir.join(FILE_NAME));
        let _ = fs::remove_dir(dir);
    }

    #[test]
    fn lists_host_aliases_without_patterns_or_repeats() {
        let config = "Host zcm6 zcm6-proxy\n  HostName ln2\n\nHost zcm6\nHost *\nhost=nc-e\nHost !bad *.x dghpc\nMatch host foo\n";
        assert_eq!(ssh_config_hosts(config), ["zcm6", "zcm6-proxy", "nc-e", "dghpc"]);
    }

    #[test]
    fn aliases_that_ssh_could_read_as_options_are_refused() {
        assert!(is_valid_alias("zcm6-gateway"));
        assert!(is_valid_alias("user@host.example"));
        assert!(!is_valid_alias("-oProxyCommand=calc"));
        assert!(!is_valid_alias("a b"));
        assert!(!is_valid_alias(""));
    }

    #[test]
    fn saving_drops_repeats_and_refuses_bad_names() {
        let dir = temp_dir("write");
        assert_eq!(write(&dir, &["zcm6".into(), " zcm6 ".into(), "nc-e".into()]).unwrap(), ["zcm6", "nc-e"]);
        assert_eq!(read(&dir), ["zcm6", "nc-e"]);
        assert!(write(&dir, &["-x".into()]).is_err());
        cleanup(&dir);
    }

    #[test]
    fn added_computers_are_switched_on_reached_by_address_and_kept_when_choosing() {
        let dir = temp_dir("custom");
        write(&dir, &["zcm6".into()]).unwrap();
        let lab = CustomHost { name: " lab ".into(), user: Some("louis".into()), host: "10.0.0.5".into(), port: Some(2222) };
        assert_eq!(add_custom(&dir, &lab).unwrap()[0].name, "lab");
        let bare = CustomHost { name: String::new(), user: None, host: "gpu.example.org".into(), port: None };
        add_custom(&dir, &bare).unwrap();
        assert_eq!(
            chosen_targets(&dir),
            [
                ("zcm6".into(), SshTarget { destination: "zcm6".into(), port: None }),
                ("lab".into(), SshTarget { destination: "louis@10.0.0.5".into(), port: Some(2222) }),
                ("gpu.example.org".into(), SshTarget { destination: "gpu.example.org".into(), port: None }),
            ]
        );
        // Switching hosts off keeps the added computers.
        write(&dir, &["zcm6".into()]).unwrap();
        assert_eq!(custom(&dir).len(), 2);
        assert_eq!(remove_custom(&dir, "lab").unwrap().len(), 1);
        cleanup(&dir);
    }

    #[test]
    fn added_computers_that_ssh_could_misread_are_refused() {
        let dir = temp_dir("refuse");
        let with = |user: Option<&str>, host: &str, port| CustomHost { name: String::new(), user: user.map(Into::into), host: host.into(), port };
        assert!(add_custom(&dir, &with(None, "-oProxyCommand=calc", None)).is_err());
        assert!(add_custom(&dir, &with(Some("-l"), "host", None)).is_err());
        assert!(add_custom(&dir, &with(None, "a b", None)).is_err());
        assert!(add_custom(&dir, &with(None, "host", Some(0))).is_err());
        // An IPv6 address needs a name, since it cannot be one.
        assert!(add_custom(&dir, &with(None, "fe80::1", None)).is_err());
        cleanup(&dir);
    }

    #[test]
    fn files_from_before_added_computers_still_read() {
        let dir = temp_dir("old");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), r#"{ "hosts": ["zcm6"] }"#).unwrap();
        assert_eq!(read(&dir), ["zcm6"]);
        assert!(custom(&dir).is_empty());
        cleanup(&dir);
    }
}
