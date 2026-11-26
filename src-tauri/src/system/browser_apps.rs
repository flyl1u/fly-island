//! Which foreground programs count as a web browser, for "tuck while a browser is in front".
//!
//! Matches known executable names and the full paths of registered browsers, not window classes.

use std::{collections::HashSet, path::Path, time::{Duration, Instant}};
use windows::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};

use crate::win32::registry;

const CLIENTS: &str = r"SOFTWARE\Clients\StartMenuInternet";
const REFRESH_INTERVAL: Duration = Duration::from_secs(60);

const BROWSER_EXECUTABLES: &[&str] = &[
    // International
    "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "vivaldi.exe", "opera.exe",
    "opera_gx.exe", "arc.exe", "chromium.exe", "floorp.exe", "librewolf.exe", "waterfox.exe",
    "zen.exe", "yandex.exe", "thorium.exe", "iexplore.exe",
    "ego.exe", // Ego lite
    // China
    "360chrome.exe", "360se.exe", "360chromex.exe", "qqbrowser.exe", "sogouexplorer.exe",
    "baidubrowser.exe", "liebao.exe", "ucbrowser.exe", "2345explorer.exe", "maxthon.exe",
];

#[derive(Default)]
pub(super) struct RegisteredBrowsers {
    paths: HashSet<String>,
    refreshed_at: Option<Instant>,
}

impl RegisteredBrowsers {
    pub(super) fn refresh_if_due(&mut self) {
        let now = Instant::now();
        if self.refreshed_at.is_some_and(|last| now.duration_since(last) < REFRESH_INTERVAL) {
            return;
        }
        self.refreshed_at = Some(now);
        self.paths = [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER].into_iter()
            .flat_map(|root| registry::subkeys(root, CLIENTS).into_iter().filter_map(move |name| {
                let command = registry::read_command(root, &format!(r"{CLIENTS}\{name}\shell\open\command"))?;
                command_executable(&command, |key| std::env::var(key).ok())
            }))
            .collect();
    }

    pub(super) fn contains(&self, image_path: Option<&str>) -> bool {
        is_browser_image_path(image_path, &self.paths)
    }
}

fn normalize_path(path: &str) -> String {
    path.replace('/', "\\").to_lowercase()
}

fn command_executable(command: &str, variable: impl Fn(&str) -> Option<String>) -> Option<String> {
    let mut expanded = String::new();
    let mut remaining = command.trim_start();
    while let Some((prefix, suffix)) = remaining.split_once('%') {
        expanded.push_str(prefix);
        if let Some((key, rest)) = suffix.split_once('%') {
            if let Some(value) = variable(key) {
                expanded.push_str(&value);
                remaining = rest;
                continue;
            }
        }
        expanded.push('%');
        remaining = suffix;
    }
    expanded.push_str(remaining);

    let path = if let Some(quoted) = expanded.strip_prefix('"') {
        quoted.split_once('"')?.0
    } else {
        let end = expanded.to_ascii_lowercase().match_indices(".exe")
            .map(|(index, _)| index + 4)
            .find(|&end| expanded[end..].chars().next().is_none_or(char::is_whitespace))?;
        &expanded[..end]
    };
    let path = normalize_path(path);
    (Path::new(&path).is_absolute() && path.ends_with(".exe")).then_some(path)
}

fn is_browser_image_path(image_path: Option<&str>, registered: &HashSet<String>) -> bool {
    let Some(path) = image_path else { return false };
    let normalized = normalize_path(path);
    let name = normalized.rsplit('\\').next().unwrap_or_default();
    !matches!(name, "msedgewebview2.exe" | "electron.exe" | "slack.exe" | "claude.exe" | "chatgpt.exe")
        && (BROWSER_EXECUTABLES.contains(&name)
            || (name == "browser.exe" && normalized.contains(r"\yandex\yandexbrowser\"))
            || registered.contains(&normalized))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_common_browsers_by_executable_name() {
        for path in [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\MSEDGE.EXE",
            r"C:\Program Files\Mozilla Firefox\firefox.exe",
            r"C:\Users\user\AppData\Local\Vivaldi\Application\vivaldi.exe",
            r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
            r"C:\Users\user\AppData\Local\Yandex\YandexBrowser\Application\browser.exe",
            r"C:\Program Files (x86)\Tencent\QQBrowser\QQBrowser.exe",
            r"C:\Users\user\AppData\Roaming\360ChromeX\Chrome\Application\360ChromeX.exe",
            r"C:\Program Files (x86)\360\360se6\Application\360se.exe",
            r"C:\Users\user\AppData\Local\Programs\Arc\Arc.exe",
            "C:/Program Files/Opera/opera.exe",
            r"C:\Users\user\AppData\Local\Ego\ego.exe",
        ] {
            assert!(RegisteredBrowsers::default().contains(Some(path)), "{path}");
        }
    }

    #[test]
    fn embedded_browsers_other_apps_and_unknown_paths_do_not_count() {
        let browsers = RegisteredBrowsers::default();
        for path in [
            r"C:\Program Files\Microsoft\EdgeWebView\msedgewebview2.exe",
            r"C:\Windows\System32\notepad.exe",
            r"C:\Users\user\AppData\Local\Programs\Slack\slack.exe",
            r"C:\Apps\Claude\Claude.exe",
            r"C:\Apps\ChatGPT\ChatGPT.exe",
            r"C:\Tools\browser.exe",
            r"C:\Users\user\chrome.exe.bak",
        ] {
            assert!(!browsers.contains(Some(path)), "{path}");
        }
        assert!(!browsers.contains(None));
        assert!(!browsers.contains(Some("")));
    }

    #[test]
    fn parses_quoted_unquoted_and_expandable_commands() {
        let expected = Some(r"c:\program files\my browser\web.exe".to_owned());
        for command in [
            r#" "C:\Program Files\My Browser\web.EXE" -- "%1""#,
            r"C:\Program Files\My Browser\web.exe --private",
            r#""%ProgramFiles%\My Browser\web.exe" "%1""#,
        ] {
            assert_eq!(command_executable(command, |key| {
                (key == "ProgramFiles").then(|| r"C:\Program Files".to_owned())
            }), expected);
        }
        assert_eq!(command_executable("web.exe --private", |_| None), None);
        assert_eq!(command_executable(r#""C:\App\web.exe.bak""#, |_| None), None);
    }

    #[test]
    fn matches_registered_browsers_by_full_path_only() {
        let registered = [r"c:\apps\web.exe", r"c:\apps\slack.exe", r"c:\apps\msedgewebview2.exe"]
            .map(str::to_owned).into_iter().collect();
        assert!(is_browser_image_path(Some("C:/APPS/WEB.EXE"), &registered));
        assert!(!is_browser_image_path(Some(r"D:\Apps\web.exe"), &registered));
        assert!(!is_browser_image_path(Some(r"C:\Apps\slack.exe"), &registered));
        assert!(!is_browser_image_path(Some(r"C:\Apps\msedgewebview2.exe"), &registered));
    }
}
