# 设置内嵌与独立窗口切换验证

- 默认在小岛中显示设置；「通用 → 独立设置窗口」可切换显示方式，选择单独持久化，不进入外观预设。
- 两种显示方式共用 `SettingsPanel` 和原有设置存储；内嵌面板直接更新主窗口状态，独立窗口继续通过 storage 事件同步。
- 托盘设置请求交给主窗口按偏好路由；关闭独立模式时唤起主窗口并关闭独立设置窗口。
- 打开面板不再重写已保存的外观预设。没有更改应用 identifier、用户数据目录或已有业务存储键，也没有新增清空数据操作。

## 验证

- `pnpm check`：108 项前端测试通过，包括旧数据默认内嵌、显示方式切换保留业务数据、重复保存目录定位、存储写入失败处理。
- `cargo test --manifest-path src-tauri/Cargo.toml`：67 项通过，5 项需要桌面环境的既有测试忽略。
- Ego 浏览器回归：内嵌 → 独立 → 内嵌、重新加载记住偏好、外观即时生效、中英文控件无横向溢出；切换前后待办、每日笔记、归档保留。
- `pnpm release --no-upload`：生成本地签名 NSIS / MSI 安装包、更新清单与校验文件，不上传公开 Release。
- 真实桌面测试使用隔离 identifier `com.focusd.island.settings-qa-20261106`。用户按 Esc 终止 Computer Use 后停止桌面操控，真实窗口往返切换尚未完成验收。

## 本机数据保留

替换 release 前已备份真实用户的原生数据以及 WebView2 Local Storage、IndexedDB、Session Storage 和 Preferences（存在时），备份在当前用户 `AppData/Local/FocuSD/recovery/before-v0.2.21-*` 下。备份时已有 75 条剪贴板历史、7 条收藏；不记录收藏内容。

Windows 打包终端可能把 AppData 访问重定向到其隔离目录。本机启动 release 应通过 Explorer 的 `Shell.Application.ShellExecute`，避免由代理终端直接派生应用进程；原有数据无需迁移或重置。桌面验收中止后不自动启动应用，由用户通过已同步的桌面快捷方式运行。
