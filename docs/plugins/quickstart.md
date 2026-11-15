# 开发插件

1. 从 `plugins/example-hello/` 复制一个独立 crate；修改包名、manifest id、exe 和中英文名称。每个 crate 保留自己的 `[workspace]`，不加入主程序编译。
2. 复用 `plugins/sdk` 的 stdio 运行时，poll 返回三种扩展点快照；按需实现 action。stdout 禁止 println 调试。
3. 构建与检查（PowerShell）：

```powershell
$env:CARGO_TARGET_DIR = 'D:/FocuSD/.worktrees/.cargo-target'
cargo build --manifest-path plugins/example-hello/Cargo.toml
cargo test --manifest-path plugins/example-hello/Cargo.toml
cargo clippy --manifest-path plugins/example-hello/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

宿主的真实进程集成测试需要先构建示例 exe 到相同 CARGO_TARGET_DIR；CI 已执行这一步。没有设置目标目录时，先用 `cargo build --manifest-path plugins/example-hello/Cargo.toml --target-dir src-tauri/target`。

4. 构建本地分发包（不上传）：

```powershell
powershell -NoProfile -File scripts/release/build-plugins.ps1
$env:FOCUSD_PLUGINS_INDEX = ([uri](Join-Path $PWD 'artifacts/plugins/plugins-index.json')).AbsoluteUri
pnpm tauri dev
```

设置 → 插件安装示例，打开启用开关。Agent 页应出现 75% 额度与 Hello 会话，消息 → 插件应出现 Hello 通知。点击会话验证 RPC；停用后数据消失，卸载后目录移除。完整包校验流程在 Rust `plugin_host::tests::local_index_install_enable_publish_disable_uninstall` 中自动执行。

本地源码调试：聚焦插件页内控件，按 Ctrl+Shift+D 显示隐藏开发者开关；开启后可配置本地索引 URL，或输入含 manifest 与 exe 的目录并加载。加载不会复制目录、默认不启用。卸载开发插件不删除源码。离开开发模式会停用开发目录插件。配置会持久保存，无需每次输入。

5. 提 PR：只提交源码、manifest、独立 Cargo.lock、测试和必要的许可，不提交 target、exe、zip 或账号数据。清单中完整声明权限；文案中英文；纯读取第三方客户端，不注入、不更改其 profile 或文件；秘密只在本机使用且只访问对应官方接口。记录接口来源、刷新频率、失败行为、真实账号人工验收步骤。

审核标准：实现与声明权限一致；无任意 shell / HTML / Webview 扩展；资源和日志有界；stdin 断开退出；凭据不进日志；可离线测试解析；clippy 零告警；主程序及浏览器回归通过。维护者 review 合并后由发布脚本构建，GitHub Release 索引才会提供下载。
