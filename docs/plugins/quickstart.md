# 快速开始 / Quickstart

> **先看[插件开发规范](README.md)。** 本文是小岛内部已有的「外部数据接入」机制（把其他 AI 工具的额度、会话、消息接进 Agent 页，外部进程 + JSON-RPC）的技术说明，**不是插件的定义**。插件是对小岛源码的改造，只有当你的插件需要接入外部数据源时才需要参考本文。
>
> **Read the [plugin guide](README.md) first.** This page documents the island's existing external data adapter mechanism (an external process over JSON-RPC that feeds quota, sessions and messages into the Agent page). It is **not the definition of a plugin**: plugins change the island's source. Refer to it only if your plugin needs an external data source.

[总览 / Overview](README.md) · [开发规范 / Specification](specification.md) · [API](api.md) · [设计 / Design](design.md) · [提交 / Contributing](contributing.md)

以下命令在 Windows PowerShell、仓库根目录执行。先 Fork/克隆自己的仓库、创建分支，安装 pnpm、Rust（按根目录 rust-toolchain.toml 固定版本）、MSVC C++ 构建工具与 Tauri 开发环境，再运行 `pnpm install --frozen-lockfile`。插件与主程序是独立 Cargo workspace。当前正式版只开放规范入口，以下安装/加载步骤**仅适用于本地启用插件的开发构建**。

Run these commands in Windows PowerShell from the repository root. Fork/clone your repository, create a branch, install pnpm, the Rust version pinned in rust-toolchain.toml, MSVC C++ build tools and the Tauri development prerequisites, then run `pnpm install --frozen-lockfile`. Plugins use a separate Cargo workspace. Production only exposes this guide; installation/loading below **requires a locally plugin-enabled development build**.

## 1. 构建并探测示例 / Build and probe the example

先不改示例，确认工具链与协议工作。显式设定同一个绝对编译缓存路径；普通克隆可使用本 worktree 的 `node_modules/.cache/cargo-target`，本文任务环境使用下列共享路径：

Start with the unmodified example. Set one absolute target directory consistently. An ordinary clone can use `node_modules/.cache/cargo-target` inside its worktree; this project's task environment uses the shared path below:

```powershell
$env:CARGO_TARGET_DIR = (Join-Path $PWD '.worktrees/.cargo-target')
cargo build --manifest-path plugins/example-hello/Cargo.toml
cargo test --manifest-path plugins/example-hello/Cargo.toml
cargo clippy --manifest-path plugins/example-hello/Cargo.toml --all-targets -- -D warnings
```

无需启动小岛即可探测 stdio；全部为单行 ASCII JSON，不包含凭据。预期依次看到 initialize result、publish（75% 额度、Hello 会话/消息）以及 action result；shutdown 后退出。它验证协议，不代替嵌入小岛的录屏。

Probe stdio without starting the island. These are single-line ASCII JSON messages without secrets. Expect an initialize result, publish (75% quota and Hello session/message), and an action result, followed by exit on shutdown. This checks protocol only and does not replace the required in-island recording.

```powershell
$rpc = @(
  '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"apiVersion":1,"settings":{"interval":"30"}}}',
  '{"jsonrpc":"2.0","id":1,"method":"action","params":{"id":"hello"}}',
  '{"jsonrpc":"2.0","method":"shutdown","params":{}}'
)
$rpc | & (Join-Path $env:CARGO_TARGET_DIR 'debug/example-hello.exe')
```

## 2. 仅本地启用宿主 / Enable the host locally

`release-features.json` 的 `plugins` 同时控制前端与 Rust。开发者模式、环境变量、浏览器回归用的 `FLY_ISLAND_REGRESSION_FEATURES` 都不能单独开启 Rust 宿主。**不要在插件 PR 或发行包中提交打开的发布开关**，也不要修改版本号。

The `plugins` flag controls both frontend and Rust. Developer mode, index environment overrides and browser-only `FLY_ISLAND_REGRESSION_FEATURES` cannot independently enable the Rust host. **Do not commit an enabled release flag or ship it in your plugin PR**, and do not change app versions.

先备份当前文件，再只改本地 plugins 值（不改其他发布开关）。以下在同一个 PowerShell 会话中运行，避免覆盖自己的备份：

Back up the current file, then change only plugins locally, preserving other flags. Run in the same PowerShell session and do not overwrite your backup:

```powershell
$pluginFlagOriginal = [IO.File]::ReadAllText((Join-Path $PWD 'release-features.json'))
$pluginFlags = $pluginFlagOriginal | ConvertFrom-Json
$pluginFlags.plugins = $true
[IO.File]::WriteAllText((Join-Path $PWD 'release-features.json'), ($pluginFlags | ConvertTo-Json) + "`n", [Text.UTF8Encoding]::new($false))
pnpm tauri dev
```

完整退出后重启开发应用，前端与原生端都需重新构建读取开关。此命令会执行仓库现有的停止旧岛脚本；它使用当前用户的应用数据，不是隔离账号环境，请使用测试账号，不加载不信任代码。退出后立刻恢复发布开关；下一次调试需要重新临时开启：

Restart the development app fully so both frontend and native code read the flag. This command runs the repository's existing old-island stop script and uses your current user's app data, not an isolated account environment. Use test accounts and trusted code. Restore the flag immediately after exiting; temporarily enable it again for later debugging:

```powershell
[IO.File]::WriteAllText((Join-Path $PWD 'release-features.json'), $pluginFlagOriginal, [Text.UTF8Encoding]::new($false))
git diff -- release-features.json
```

预期 diff 为空；若忘记恢复，提交前从自己的备份恢复，不覆盖其他人的改动。

Expect an empty diff. If you forgot to restore, recover your own backup before committing; do not overwrite others' changes.

## 3. 目录加载 / Load a development directory

先构建示例，将清单和 exe 放到同一目录；这一步不需要发布或下载包：

Stage the built example's manifest and executable together; no publishing or download is needed:

```powershell
$pluginDevDirectory = Join-Path $PWD 'node_modules/.cache/plugin-dev/example-hello'
New-Item -ItemType Directory -Force -Path $pluginDevDirectory | Out-Null
Copy-Item -LiteralPath 'plugins/example-hello/fly-island-plugin.json' -Destination $pluginDevDirectory
Copy-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'debug/example-hello.exe') -Destination $pluginDevDirectory
$pluginDevDirectory
```

在已启用插件的开发应用中：

In the plugin-enabled development app:

1. 齿轮或托盘 → 设置 → 插件，展开「开发者」，打开「开发者模式」。/ Open Settings from the gear/tray → Plugins → expand Developer → enable Developer mode.
2. 把上面输出的绝对路径填入「本地插件目录」，点「加载」。不会复制目录，注册后默认停用。/ Enter the absolute staged path in Local plugin folder and click Load. It registers in place, disabled by default.
3. 在「已安装」中启用示例。Agent 顶部应有 75% 额度、列表出现 Hello Island，消息区插件页有 Hello 消息；启用 AI Agent 模块才能查看 Agent 页。点击会话验证 action（示例只返回成功，不真的打开外部窗口）。/ Enable the example under Installed. With the AI Agent module on, expect 75% quota and Hello Island in the agent list, plus Hello in the plugin message tab. Clicking the example session tests action; it returns success without opening an external window.
4. 停用后额度/会话/消息消失、进程退出。目录插件卸载只解除注册，保留 staged 文件；关闭开发者模式会停用目录插件。/ Disable: contributions disappear and the process exits. Unregistering preserves staged files; turning developer mode off disables directory plugins.
5. 修改代码后先停用，再构建、复制新 exe 并重新启用。修改 manifest 后先卸载注册，再复制清单/重新加载。不支持热重载；运行中覆盖 exe 可能被 Windows 拒绝。/ For code changes disable, rebuild, copy the executable and re-enable. For manifest changes unregister first, replace the manifest and reload. There is no hot reload; Windows may reject overwriting a running executable.

## 4. 本地索引与包 / Local index and packages

在同一 CARGO_TARGET_DIR 下，仅构建示例包（脚本会执行 release 构建）：

Build only the example package using the same CARGO_TARGET_DIR; the script performs a release build:

```powershell
powershell -NoProfile -File scripts/release/build-plugins.ps1 -Ids example-hello
Join-Path $PWD 'artifacts/plugins/plugins-index.json'
```

输出为 ZIP 和 JSON 索引，url 默认为各 ZIP 的绝对 file URL，size/sha256 自动计算，minAppVersion 来自本地 package.json。用于官方发布的 BaseUrl 由维护者提供，本地测试不要上传。

Output includes ZIP and index JSON with absolute file URLs, computed size/sha256, and minAppVersion from local package.json. The maintainer supplies BaseUrl for publishing; do not upload local artifacts.

1. 如果之前已目录加载同 id，先卸载注册。/ Unregister a previously loaded directory with the same ID.
2. 保持开发构建的发布开关开启，设置 → 插件 → 开发者模式，将上面绝对索引路径填入「插件索引」并保存（也接受 file URL）。保存会重新读取索引，也可点「刷新」。/ Keep plugins enabled in the development build. Under Developer mode, enter/save the absolute index path (or file URL); saving reloads the index, and Refresh retries it.
3. 安装 example-hello，再启用；首次安装默认关闭。重复检查岛上显示、停用、卸载，确认安装目录删除。/ Install example-hello, then enable it; first installs are disabled. Repeat display/disable/uninstall checks and confirm installed files are removed.
4. 也可在启动宿主前设置 `$env:FLY_ISLAND_PLUGINS_INDEX = (Join-Path $PWD 'artifacts/plugins/plugins-index.json')`；它优先于 UI，调试完成后 `Remove-Item Env:FLY_ISLAND_PLUGINS_INDEX`。不要带着遗留变量排查 UI 索引不生效。/ Alternatively set this environment override before host startup. It takes precedence over the UI; remove it after debugging so it cannot mask UI index changes.

## 5. 创建自己的插件 / Create your plugin

复制 `plugins/example-hello/` 到 `plugins/<id>/`；修改 Cargo.toml 包名、manifest id/name/description/runtime.command/version。将 `<id>` 加入 `plugins/Cargo.toml` members，共享 `plugins/Cargo.lock`，不要复制 target 或保留独立的过时 Cargo.lock。SDK 依赖仍是 `../sdk`。按 [manifest](specification.md) 声明最小权限、设置与动作，按 [API](api.md) 用真实数据替换演示 poll。

Copy the example into `plugins/<id>/`, rename its Cargo package and manifest identity/localization/command/version, and add it to plugin workspace members. Share `plugins/Cargo.lock`; do not copy target or retain a stale individual lockfile. Keep the SDK path `../sdk`. Declare minimal permissions/settings/actions and replace demo polling with real data using the specification and API.

相应替换上述命令的 crate 路径、stage 路径和 exe 名。网络/文件解析写脱敏、离线可复现的测试，覆盖缺字段、坏数据、过期登录与大历史；用真实账号验证其余集成但不提交账号数据。生产通知不得照搬示例的周期新消息。

Substitute your crate/stage paths and executable in the commands above. Test network/file parsers offline with sanitized fixtures covering missing fields, malformed data, expired sign-in and large histories. Validate account-dependent integration manually without committing account data. Do not copy the example's periodic new-message behavior into production.

## 6. 排错与验收 / Troubleshooting and validation

| 现象 / Symptom | 检查 / Check |
| --- | --- |
| 只有开发计划 / Only development plan | plugins 仍为 false，或前后端未同时重建 / Flag false, or frontend/native build not both restarted |
| 索引始终失败 / Index unavailable | Windows 绝对路径/file URL、开发者模式、环境变量优先级；看应用数据目录 `plugin-logs/catalog.log` / Absolute path/file URL, developer mode, environment precedence; inspect catalog log |
| 清单改变拒绝启动 / Manifest changed | 停用、卸载注册并重新加载 / Disable, unregister and reload |
| 一直重启 / Restarting | `plugin-logs/<id>.log`；stdout 是否混入日志、握手版本/时间、字段拼写、条数/大小是否越界 / Check stdout purity, handshake/version, field names and limits in the log |
| 数据消失 / Data disappears | 每次 publish 是完整替换，SDK poll Err 发空快照；会话时间窗和插件启用状态 / Replacement snapshots, SDK empty-on-error, session window and enabled state |
| 停用后子进程仍在 / Child survives disable | EOF/shutdown、任务取消、浏览器清理与进程树退出 / EOF/shutdown, cancellation, browser and process-tree cleanup |

提交前恢复 `plugins: false`，按改动范围验证（更改了插件 Rust 或宿主 Rust 均需 Rust 验证）：

Restore `plugins: false` and validate the affected scope before submission; plugin/host Rust changes require Rust validation:

```powershell
pnpm check
pnpm build
pnpm test:regression
cargo build --manifest-path plugins/example-hello/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build --no-bundle
```

宿主进程测试依赖先构建 example-hello 到**相同** CARGO_TARGET_DIR；新插件也运行自己的 build/test/clippy。阅读[设计指南](design.md)，录制真实嵌入小岛演示，再按[提交要求](contributing.md)提 PR。只提交源码、清单、workspace/锁文件、脱敏测试及必要许可，不提交 exe、ZIP、target、密钥或开启发布开关的改动。

Host process tests require example-hello in the **same** CARGO_TARGET_DIR; also build/test/clippy your new crate. Follow design integration, record the real island and submit using the contribution checklist. Commit source, manifest, workspace/lockfile changes, sanitized tests and licenses only; no executables, ZIPs, target, secrets or enabled release flags.
