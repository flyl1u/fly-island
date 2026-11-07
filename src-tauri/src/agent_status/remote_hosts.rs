//! Which computers the island reads agent sessions from over SSH (Settings → AI Agent): Host
//! aliases from ~/.ssh/config, kept in `agent-remote-hosts.json` in the app data folder.

use std::{fs, path::Path};

use serde::{Deserialize, Serialize};

pub(super) const FILE_NAME: &str = "agent-remote-hosts.json";
/// More would mean an ssh process every few seconds.
const MAX_HOSTS: usize = 8;

#[derive(Debug, Default, Serialize, Deserialize)]
struct RemoteHostsFile {
    hosts: Vec<String>,
}

/// Whether `alias` can be given to ssh as a host name: no option (`-`), spaces or patterns.
pub(super) fn is_valid_alias(alias: &str) -> bool {
    (1..=64).contains(&alias.len())
        && !alias.starts_with('-')
        && alias.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '@'))
}

/// The chosen hosts; none when the file is missing or unreadable.
pub(super) fn read(app_dir: &Path) -> Vec<String> {
    fs::read_to_string(app_dir.join(FILE_NAME))
        .ok()
        .and_then(|text| serde_json::from_str::<RemoteHostsFile>(&text).ok())
        .map(|file| file.hosts.into_iter().filter(|host| is_valid_alias(host)).take(MAX_HOSTS).collect())
        .unwrap_or_default()
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
    let text = serde_json::to_string_pretty(&RemoteHostsFile { hosts: chosen.clone() })
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(app_dir).map_err(|error| format!("Failed to create the app data folder: {error}"))?;
    fs::write(app_dir.join(FILE_NAME), text).map_err(|error| format!("Failed to save the remote computers: {error}"))?;
    Ok(chosen)
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
        let dir = std::env::temp_dir().join(format!("focusd-remote-hosts-{}", std::process::id()));
        assert_eq!(write(&dir, &["zcm6".into(), " zcm6 ".into(), "nc-e".into()]).unwrap(), ["zcm6", "nc-e"]);
        assert_eq!(read(&dir), ["zcm6", "nc-e"]);
        assert!(write(&dir, &["-x".into()]).is_err());
        let _ = fs::remove_file(dir.join(FILE_NAME));
        let _ = fs::remove_dir(&dir);
    }
}
