//! Which foreground programs count as a web browser, for "tuck while a browser is in front".
//!
//! Matched by the executable's file name (never the window class, which Chromium-based browsers
//! share with many apps), so Electron apps and embedded WebViews do not count. Based on the list
//! of the contributor's browser auto-tuck patch (#118), with the Chinese browsers added.

const BROWSER_EXECUTABLES: &[&str] = &[
    // International
    "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "vivaldi.exe", "opera.exe",
    "opera_gx.exe", "arc.exe", "chromium.exe", "floorp.exe", "librewolf.exe", "waterfox.exe",
    "zen.exe", "yandex.exe", "thorium.exe", "iexplore.exe",
    // China
    "360chrome.exe", "360se.exe", "360chromex.exe", "qqbrowser.exe", "sogouexplorer.exe",
    "baidubrowser.exe", "liebao.exe", "ucbrowser.exe", "2345explorer.exe", "maxthon.exe",
];

/// Whether `image_path` (the process's full path, either slash) is a known browser. The generic
/// `browser.exe` only counts inside Yandex's folder.
pub(crate) fn is_browser_image_path(image_path: Option<&str>) -> bool {
    let Some(path) = image_path else { return false };
    let normalized = path.replace('/', "\\").to_ascii_lowercase();
    let Some(name) = normalized.rsplit('\\').next() else { return false };
    BROWSER_EXECUTABLES.contains(&name) || (name == "browser.exe" && normalized.contains(r"\yandex\yandexbrowser\"))
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
        ] {
            assert!(is_browser_image_path(Some(path)), "{path}");
        }
    }

    #[test]
    fn embedded_browsers_other_apps_and_unknown_paths_do_not_count() {
        for path in [
            r"C:\Program Files\Microsoft\EdgeWebView\msedgewebview2.exe",
            r"C:\Windows\System32\notepad.exe",
            r"C:\Users\user\AppData\Local\Programs\Slack\slack.exe",
            r"C:\Tools\browser.exe",
            r"C:\Users\user\chrome.exe.bak",
        ] {
            assert!(!is_browser_image_path(Some(path)), "{path}");
        }
        assert!(!is_browser_image_path(None));
        assert!(!is_browser_image_path(Some("")));
    }
}
