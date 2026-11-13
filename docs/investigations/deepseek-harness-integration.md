# DSH 社区桌面端接入核查

调研日期：2026-11-13。工作区 D:/FocuSD-wt-dsh，分支 feat/dsh-community。不创建提交，不修改 DSH 自身数据，不升级依赖。

## 结论与上一版纠正

上一版把 DataElement 的 %APPDATA%/dsh-desktop/harness 描述为旧版官方目录，依据不足，现已纠正。官方仓库确有 Electron Desktop 源码，但不能据此把社区安装包认定为官方。GitHub API 检查官方全部 38 个 Release，附件均为 0；未确认官方已公开发布 Windows 桌面安装包。支持官方源码构建的已知宿主，不声称验证了官方发行包。

按 DSH Desktop 相关项目 star 排序，选择必选的 DataElement 和排名最高的另一个直接桌面客户端 anywhere-labs；两者近期均有更新。

| 程序 / GitHub | Stars | Windows exe / 标题 | 数据与会话来源 | 指定会话定位 | 凭据来源 |
|---|---:|---|---|---|---|
| [官方 DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | 279,782 | DeepSeek Harness.exe；标题 DeepSeek Harness | 默认 ~/.dsh，Desktop profile 为 profiles/desktop，引擎检查点 | dsh://open 仅主窗 | 引擎 .credentials.yaml 官方 API key / 官方账户 grant |
| [DataElement DSH Desktop](https://github.com/dataelement/dsh-desktop) | 18,424 | DSH Desktop.exe；标题 DSH Desktop | %APPDATA%/dsh-desktop 为 Electron 数据，harness/ 为独立引擎；可从 ~/.dsh 导入 | 未找到公开外部会话路由；内部 dsh-desktop:// 不是系统深链 | 独立引擎 .credentials.yaml；只接受明确官方来源 |
| [anywhere-labs DSH Desktop / NEXT](https://github.com/anywhere-labs/dsh-desktop) | 35,860 | Stable DSH Desktop.exe、Beta DSH Desktop Beta.exe、NEXT DSH NEXT.exe；标题同产品名 | Electron %APPDATA%/DSH Desktop、DSH Desktop Beta、DSH NEXT；引擎默认 ~/.dsh / Beta ~/.dsh-beta，旧安装可共享；已保存目录选择可覆盖 | 未找到稳定的公开外部会话路由；NEXT dsh-app:// 为内部协议 | 同引擎凭据；不增加社区专用解析，不从新增定位文件切换余额身份 |

Stars 是本次 API 快照。均基于 Electron，Chrome_WidgetWin_1 是框架常见类名，未实机确认，不能作为身份依据；代码不使用标题或类名识别。Linux 的 dsh-desktop / dsh-desktop-next 与 Windows 产品 exe 名不同，保留兼容识别。

## 一手源码依据

- 官方：[Release 列表](https://github.com/deepseek-ai/deepseek-harness/releases)、[打包产品名](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/scripts/electron-builder-config.mjs)、[共享目录](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/src/paths.ts)、[主窗协议](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/src/main.ts)。
- DataElement：[产品名和版本](https://github.com/dataelement/dsh-desktop/blob/main/package.json)、[userData / harness / 主窗口](https://github.com/dataelement/dsh-desktop/blob/main/src/main/index.ts)、[DSH_HOME 和本地服务](https://github.com/dataelement/dsh-desktop/blob/main/src/main/runtime/harness-runtime.ts)、[内部协议](https://github.com/dataelement/dsh-desktop/blob/main/src/main/desktop-protocol.ts)、[Web 数据导入](https://github.com/dataelement/dsh-desktop/blob/main/src/main/state/web-home-import.ts)。
- anywhere：[Stable/Beta 身份](https://github.com/anywhere-labs/dsh-desktop/blob/master/dsh-plugin-desktop/src/product-identity.ts)、[Beta 旧目录兼容](https://github.com/anywhere-labs/dsh-desktop/blob/master/dsh-plugin-desktop/src/desktop-channel-home.ts)、[Stable 目录选择](https://github.com/anywhere-labs/dsh-desktop/blob/master/dsh-plugin-desktop/src/desktop-data-directory.ts)、[NEXT 数据目录](https://github.com/anywhere-labs/dsh-desktop/blob/master/dsh-desktop-next/src/data-directory.ts)、[NEXT 打包](https://github.com/anywhere-labs/dsh-desktop/blob/master/dsh-desktop-next/package.json)。

社区宿主有本地 Host / 浏览器桥接能力，DataElement 默认首选端口 43129，但连接依赖启动 token；官方也使用带认证的启动 IPC。端口、token、profile 与版本耦合，本次不把私有服务当作公开接口，不抓 token、不扫端口。

## 本机只读确认

卸载项 DSH Desktop 0.12.1，Publisher DataElement；DSH Desktop.exe 的文件版本及相邻 resources/app.asar 清单一致：name 为 dsh-desktop，version 为 0.12.1，repository 为 dataelement/dsh-desktop。安装路径只在只读探测中使用，不把绝对路径或用户名写入 fixtures。

%APPDATA%/dsh-desktop 含 harness、desktop-service、launch-root、Electron Cache/Local Storage 等；%LOCALAPPDATA%/dsh-desktop-updater 含安装器。核对时 DSH 未运行，不启动或修改它。临时 Rust 测试调用生产解析函数：5 个会话，completed 5，closed 5，宿主 DSH Desktop (dataelement)。不输出标题、正文、用户名或凭据，临时探测测试已移除。

## 实现与限制

- agentShowDsh 统一控制全部来源，既有 key、命令、事件和会话 ID 不变。
- 独立库、共享库、Beta、NEXT 已保存的绝对目录选择合并读取；重复 ID 保留最新检查点，相同时间保留先发现来源。共享库不再要求 Desktop profile，兼容社区 Web profile。
- 根据进程完整路径的 exe 名和 Electron 包 repository 分辨同名社区程序。清单限长读取，按修改时间缓存；失败时保留通用 DSH Desktop，不猜成官方。
- 点击会话优先所属程序的窗口，无法区分时取 DSH 窗口 Z-order 最前者。这是最近使用的近似，没有长期激活历史。无窗口时保留现有未找到反馈，不启动其他程序。
- 托盘隐藏仍通过进程判定存活；独立库不会借另一家进程误报运行。共享库无法确认最初创建者，使用当前兼容宿主或通用 DSH。
- 不调用社区私有 RPC 或系统默认深链，不能切换具体对话。工具审批、错误结局和离线状态延迟的限制沿用原接入。
- 余额环与请求实现不变：仍优先现有 DataElement 独立根，再使用默认共享根。新增目录选择仅用于会话，不切换余额身份；不同安装余额不相加。固定官方 HTTPS、禁重定向、凭据只留 Rust 内存、不写日志等约束保持。
- 仅存在于其他进程环境的自定义 DSH_HOME / DSH_DESKTOP_NEXT_HOME、便携版任意改名、自选 profile 当前会话指示和未来格式不保证发现。
- 中英文宿主产品名通过字典提供，沿用既有图标和样式；DSH 名称使用 600 字重，窄窗口长名称省略，完整名称保留在 title。

## 验证与人工确认

单测仅使用虚构 ID、路径和包清单。全部必要验证通过：

| 精确命令 | 结果 |
|---|---|
| cargo test --manifest-path src-tauri/Cargo.toml | 296 通过，7 个既有环境测试忽略，0 失败；doc tests 通过 |
| cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings | 通过，0 警告 |
| pnpm check | 类型、回归类型、ESLint、行数及 284 个 Node 测试全部通过 |
| pnpm build | 通过 |
| pnpm test:regression | 22 页全部通过，DSH 12 项含社区宿主和 280px 三种视图不溢出 |
| pnpm build:web-demo | 通过 |
| pnpm tauri build --no-bundle | 通过；最终产物 src-tauri/target/release/focusd-island.exe |
| pnpm check:tests-types | 最终新增窄窗口断言类型检查通过 |
| git diff --check | 通过 |

所有 Cargo 调用显式设置 CARGO_TARGET_DIR 为 D:/FocuSD-wt-dsh/src-tauri/target；最终桌面构建 TEMP/TMP 位于本 worktree 的 node_modules/.cache/dsh-validation。构建保留 Vite 原有大 chunk 提示，不影响成功。未启动岛屿或 DSH，无需停止占用程序。临时调研资料移入本 worktree 的 node_modules 缓存，不进入改动清单。

本机只读临时命令：cargo test --manifest-path src-tauri/Cargo.toml dsh_community_local_probe -- --ignored --nocapture；测试通过，仅输出数量、宿主名和状态分布，随后删除临时测试并重新执行全量 Rust 验证。

仍需人工确认：真实客户端最小化/托盘恢复、多个客户端同时运行时聚焦、官方/anywhere 实机安装。核对时无运行客户端，浏览器 mock 不能替代原生窗口验收。

## 改动文件

- README.en.md
- README.md
- docs/architecture/data-storage.md
- docs/architecture/overview.md
- docs/deepseek-harness.md
- docs/design/agent.md
- docs/investigations/deepseek-harness-integration.md
- src-tauri/AGENTS.md
- src-tauri/src/agent_status/dsh_desktop.rs
- src-tauri/src/agent_status/dsh_sessions.rs
- src-tauri/src/agent_status/dsh_sessions_tests.rs
- src-tauri/src/agent_status/focus.rs
- src-tauri/src/agent_status/mod.rs
- src-tauri/src/agent_status/session_host.rs
- src/features/agent-status/AgentSessionsPanel.css
- src/features/agent-status/SessionHostLabel.tsx
- src/features/agent-status/dshHost.ts
- src/i18n/sections/agent.ts
- tests/regression/agent-dsh.tsx
- tests/unit/agent-dsh.test.mjs
