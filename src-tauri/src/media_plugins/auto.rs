//! 装好岛屿后自动启用网易云进度插件，用户不用自己点“一键启用”。
//!
//! 只在稳妥的情况下自动做：64 位网易云 3.1.20 及以后（含测试范围之后的新版本）、目录里还没有任何加载器
//! （或只有我们的加载器缺插件）、没有旧版 InfLink。每个网易云安装目录 + 版本只自动尝试一次，
//! 需要管理员权限时最多弹一次 UAC；用户卸载过就不再自动装。从不结束或重启网易云。

use std::{fs, path::Path, time::Duration};

use serde::{Deserialize, Serialize};
use tauri::Manager;

use super::netease::{self, NeteasePluginStatus};

const FILE: &str = "media-plugins-auto.json";
/// 启动后等一会儿再装，不和窗口、托盘、各后台服务的初始化抢时间。
const START_DELAY: Duration = Duration::from_secs(15);
/// 开机自启时更晚：可能下载、可能弹 UAC，不和登录时的桌面抢。
const AUTOSTART_DELAY: Duration = Duration::from_secs(120);
const MAX_ATTEMPTS_KEPT: usize = 8;

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AutoState {
    pub version: u32,
    /// 用户卸载过插件：不再自动安装，直到用户自己再装一次。
    pub opted_out: bool,
    /// 自动尝试过的 `<安装目录>|<版本>`；网易云升级后版本变了会再试一次。
    pub attempted: Vec<String>,
}

fn read(data: &Path) -> AutoState {
    fs::read(data.join(FILE)).ok().and_then(|bytes| serde_json::from_slice::<AutoState>(&bytes).ok())
        .filter(|state| state.version == 1).unwrap_or_default()
}

fn write(data: &Path, state: &AutoState) {
    let state = AutoState { version: 1, opted_out: state.opted_out, attempted: state.attempted.clone() };
    if let Ok(bytes) = serde_json::to_vec_pretty(&state) {
        let _ = fs::create_dir_all(data);
        let _ = fs::write(data.join(FILE), bytes);
    }
}

/// 用户点了卸载（`installed = false`）或自己装了一次（`true`）。
pub(super) fn remember_choice(data: &Path, installed: bool) {
    let mut state = read(data);
    if state.opted_out == !installed { return; }
    state.opted_out = !installed;
    write(data, &state);
}

/// 这次该不该自动装；该装时返回要记下的 `<安装目录>|<版本>`。
pub(super) fn attempt_key(status: &NeteasePluginStatus, state: &AutoState) -> Option<String> {
    if state.opted_out || !status.supported || status.legacy_inf_link { return None; }
    if !netease::auto_install_supported(status.version.as_deref(), status.arch) { return None; }
    if !matches!(status.state, "none" | "loaderOnly") { return None; }
    let key = format!("{}|{}", status.install_dir.as_ref()?.display(), status.version.as_deref()?);
    (!state.attempted.contains(&key)).then_some(key)
}

/// 失败原因会自己消失（网易云正开着、网络不通、另一个操作在跑）时，下次启动再试。
pub(super) fn retry_later(kind: &str) -> bool {
    matches!(kind, "NeedsClose" | "Network" | "Busy")
}

pub(super) fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(START_DELAY);
        crate::system::startup::hold_after_autostart(AUTOSTART_DELAY);
        let Ok(data) = app.path().app_data_dir() else { return };
        let mut state = read(&data);
        let Some(key) = attempt_key(&netease::status(), &state) else { return };
        let result = super::operate_blocking(&app, &data, false);
        if result.as_ref().err().is_some_and(|error| retry_later(error.kind)) { return; }
        state.attempted.push(key);
        let excess = state.attempted.len().saturating_sub(MAX_ATTEMPTS_KEPT);
        state.attempted.drain(..excess);
        write(&data, &state);
    });
}
