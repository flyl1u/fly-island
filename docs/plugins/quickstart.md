# 开发插件

1. Fork 本仓库并创建分支，把 `plugins/example-hello/` 复制到 `plugins/<id>/`；修改包名、manifest id、exe 和中英文名称。将 `<id>` 加入 `plugins/Cargo.toml` 的 workspace members；插件共用 `plugins/Cargo.lock`，不加入主程序 workspace，不在插件 crate 添加 `[workspace]`。
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
(Join-Path $PWD 'artifacts/plugins/plugins-index.json')
```

设置 → 插件安装示例，打开启用开关。Agent 页应出现 75% 额度与 Hello 会话，消息 → 插件应出现 Hello 通知。点击会话验证 RPC；停用后数据消失，卸载后目录移除。完整包校验流程在 Rust `plugin_host::tests::local_index_install_enable_publish_disable_uninstall` 中自动执行。

在设置 → 插件 → 开发者展开分组并开启开发者模式，将上面输出的 Windows 路径填入插件索引并保存，再刷新索引；也可填 file URL。本地源码调试可输入含 manifest 与 exe 的目录并加载。加载不会复制目录、默认不启用。卸载开发插件不删除源码。离开开发模式会停用开发目录插件。配置会持久保存，无需每次输入。

Manifest 字段：`id` 是唯一小写标识；`name`、`description` 是中英文对象；`version` 是语义版本；`apiVersion` 为 1；`runtime.command` 是包内 exe 名；`permissions` 声明所需权限；`contributes` 声明宿主扩展点；`settings` 定义设置项，`actions` 定义用户动作。详见示例。

5. 提 PR：只提交源码、manifest、插件 workspace 配置与锁文件、测试和必要的许可，不提交 target、exe、zip 或账号数据。清单中完整声明权限；文案中英文；纯读取第三方客户端，不注入、不更改其 profile 或文件；秘密只在本机使用且只访问对应官方接口。记录接口来源、刷新频率、失败行为、真实账号人工验收步骤。

PR 描述请填写功能、权限、联网域名、截图和自测步骤。审核标准：安全和隐私优先，实现与声明权限一致；UI 只能使用宿主扩展点，不得自带网页 UI；检查依赖许可；资源和日志有界；stdin 断开退出；凭据不进日志；可离线测试解析；clippy 零告警；主程序及浏览器回归通过。维护者 review 合并后由发布脚本构建，GitHub Release 索引才会提供下载。


## English

1. Fork the repository, create a branch, and copy `plugins/example-hello` to `plugins/<id>`. Rename the crate, manifest ID and executable. Add `<id>` to the members of `plugins/Cargo.toml`; plugins share `plugins/Cargo.lock` and remain separate from the host workspace. Do not add a `[workspace]` section to individual plugin crates.
2. In `fly-island-plugin.json`, provide localized `name` and `description`, semantic `version`, `apiVersion: 1`, the executable in `runtime.command`, declared `permissions` and `contributes`, and any `settings` or `actions`. Use the SDK stdio runtime; keep stdout reserved for protocol messages.
3. Run the build, test and clippy commands above for your crate. Package locally with `powershell -NoProfile -File scripts/release/build-plugins.ps1`.
4. In Settings → Plugins → Developer, enable developer mode, enter the absolute path to `artifacts/plugins/plugins-index.json`, save and refresh. Install and enable the plugin. Alternatively load a directory containing its manifest and executable.
5. Submit a PR containing source, manifest, lockfile, tests and licenses under `plugins/<id>/`. Describe its functionality, permissions, network domains, screenshots and self-test steps. Do not commit binaries, packages or account data.

Review covers security, privacy, declared permissions, network destinations, dependency licenses, bounded resources and tests. UI must use host extension points; plugins must not ship their own web UI. After review and merge, a Release builds the packages and publishes the index.
