# Rust / Tauri 规则（src-tauri/）

适用于 `src-tauri/` 下的所有文件，在根目录 [AGENTS.md](../AGENTS.md) 的基础上补充原生侧细则。各模块从旧位置迁到新位置的映射见 [docs/architecture/migration-map.md](../docs/architecture/migration-map.md)。

## 目标结构

```text
src-tauri/src/
├── main.rs                  # 只调用 focusd_island_lib::run()
├── lib.rs                   # 只有 mod 声明和 run()：插件、setup、托盘、collect_commands!（汇总各模块的 tauri_commands!）
├── tray.rs                  # 托盘菜单与事件：文字跟随岛屿语言（命令 set_tray_language），显示 / 隐藏合成一项，按岛屿当前是否可见显示
├── island/                  # 主窗口：命令、窗口状态、几何计算、毛玻璃、鼠标穿透、贴边动画
├── agent_approval/          # 在岛上审批（B6 第 2 期）：127.0.0.1 上的审批端点（标准库 TcpListener，挂起时能发现 Agent 断开）、按会话排队、等待上限、agent-approval.json
├── agent_status/            # AI 代理状态：快照、运行标记、Codex / Claude Code hook 安装；hooks/ 为编入二进制的 hook 脚本；sound_packs.rs 为导入的音效包（应用数据目录的 sound-packs/）
│                            #   reply_marker.rs：可选的回复状态标记（B9），增删 CLAUDE.md 里岛屿自己的那段说明、识别回复末行的标记
│                            #   dsh_desktop.rs / dsh_sessions.rs / dsh_credentials.rs / dsh_usage.rs：DSH 桌面端本地会话检查点、只读凭据与官方余额查询
│                            #   workbuddy_sessions.rs：WorkBuddy 桌面端本地会话记录；workbuddy_connection.rs / workbuddy_usage.rs：WorkBuddy 官网独立登录窗口、积分汇总与内存缓存
├── system/                  # 开机自启（注册表）、更新代理与配置、待办 Markdown 导出、不合成 Alt 键地聚焦自己的窗口（window_focus）
├── clipboard_history/
├── file_shelf/              # 文件中转：路径列表（file-shelf.json）与命令；拖出调用 win32/ole.rs
├── media_control/           # diagnostics.rs：SMTC、进程、版本与网易云插件只读诊断
├── media_plugins/           # 网易云插件探测、固定清单下载校验、安装记录与受限提权安装 / 卸载
├── lyrics/                  # 音乐页歌词：本地 .lrc 文件夹（local.rs）、LRCLIB（lrclib.rs，用户开启才联网）、按歌名歌手时长匹配（matching.rs），在线结果缓存在 lyrics-cache/
├── mail/                    # 邮箱（命令名仍为 *_qq_mail）：附件（attachments.rs）、命令、每个邮箱一个后台服务（accounts.rs）及其崩溃后重启（supervisor.rs）、IMAP 会话、正文与内嵌图片解析、凭据
├── qq_notifications/        # QQ 通知监听；repair-qq-notification-registration.ps1 编入二进制，也可手动运行
├── wechat_reminders/        # source.rs 统一微信进程解析、窗口选择和任务栏提醒（被示例复用）；可选的 UI Automation 摘要与 Qt 标志恢复
├── translation/             # 快捷翻译：窗口、全局快捷键、凭据与翻译请求（mod.rs）
├── settings_window/         # 设置窗口：按需创建与显示（mod.rs）；sizing.rs 按屏幕缩放窗口尺寸，剪贴板窗口共用
├── clipboard_window/        # 剪贴板历史独立窗口：按需创建、显示、关闭与位置记忆
├── messenger_activation.rs
├── notification_diagnostics.rs
└── win32/                   # Win32 / COM 的安全封装，crate 中唯一允许 unsafe 的地方：window（窗口查询、枚举、前台切换）、
                             # message_window（隐藏消息窗口与安全的窗口过程）、hotkey、clipboard、shell_hook、input、
                             # com（COM / WinRT 初始化守卫）、audio、ole（文件拖出）、process / process_times、registry、
                             # notification_state（前台是否有全屏程序）、shell_open（不弹系统错误框地打开协议）、
                             # task_switcher（让主窗口不进 Alt+Tab）、known_folder（下载文件夹等已知文件夹）、
                             # icon、chinese、process_env / process_tree / process_memory、file_version（exe 文件版本）、uia_tabs / uia_list、caption_close、taskbar
```

## lib.rs 与模块组织

- `lib.rs` 只做组装：`mod` 声明、插件注册、`setup`、托盘创建、命令注册。不写业务逻辑、不定义命令。
- 命令清单不写在 `lib.rs`：每个有命令的模块在自己的 `mod.rs` 里用 `tauri_commands!` 宏列出命令（写 `crate::` 开头的完整路径，例如 `crate::mail::refresh_qq_mail`，子模块的命令也列在顶层模块里），`lib.rs` 的 `collect_commands!` 把各模块的清单串成一个 `generate_handler!`。新增命令只改所在模块的 `tauri_commands!`；新增一个有命令的模块时，才在 `collect_commands!([] ...)` 里加上模块名。`tauri_commands!` 要放在内联测试模块之前（clippy `items_after_test_module`）。
- 文件超过 800 行或承担多个职责时，改成目录模块 `foo/mod.rs` 加子文件。常见的拆法：

  | 文件 | 内容 |
  |---|---|
  | `mod.rs` | `#[tauri::command]` 薄层、`init()`、对外类型 |
  | `service.rs` / `state.rs` | 后台线程、全局状态、事件推送 |
  | 领域文件（如 `content.rs`、`geometry.rs`） | 纯逻辑，便于单测 |
  | `tests.rs` | 测试模块，超过 150 行时从源文件中移出 |

- 模块对外只暴露命令、`init()` 和前端需要的类型，其余用 `pub(crate)` 或保持私有。
- 不新建 `utils.rs`、`common.rs` 这类杂物模块。确实有通用代码时，按用途命名（例如 `win32/registry.rs`、`fs_write.rs`）。

## 命令

- 命令返回 `Result<T, String>`，错误信息要让用户能读懂，因为前端会原样显示。
- 会阻塞的命令，或调用窗口、COM、Windows UI 的命令，声明为 `async`，避免阻塞 IPC 线程（在 Windows 上可能死锁，见 `settings_window/mod.rs`）。
- 命令函数保持薄：只做参数校验，然后调用服务或领域函数。
- 命令名就是函数名，属于对外契约。纯重构中可以移动函数所在模块，但不能改函数名或参数名。
- 事件名定义为模块内的 `const`，向特定窗口发事件时使用窗口 label 常量（例如 `settings_window::WINDOW_LABEL`），不写字面量。
- 新增命令后，同步更新前端对应的 `api.ts`；用到插件权限时更新 `capabilities/default.json`。新窗口的 label 必须加入 capabilities 的 `windows` 列表。

## 错误处理

- 生产代码禁止使用 `unwrap()` 和 `expect()`。只有在能证明不会失败时才允许使用（例如字面量常量的解析），并且必须附注释说明理由。测试代码不受此限。
- `Mutex` 加锁使用 `lock().map_err(...)` 或 `unwrap_or_else(PoisonError::into_inner)`，不要因为锁中毒导致整个应用崩溃。
- `let _ = ...` 忽略错误只用于尽力而为的操作，例如推送事件、清理临时文件。
- 错误转换就近写 `map_err(|error| error.to_string())` 或带上下文的 `format!`，不吞掉原始错误信息。

## unsafe 与 Windows API

- **`unsafe` 只能写在 `win32/` 中**，对外暴露安全函数，参数尽量用 Rust 类型（`&str`、`u32`），不让调用方传裸指针。生产代码中 `win32/` 以外没有 `unsafe`；窗口过程实现 `win32::message_window::WindowMessages`，枚举窗口用 `win32::window::for_each_top_level_window` 的闭包。
- `wechat_reminders/source.rs` 及它用到的 `win32/` 文件也被 `examples/wechat_reminder_probe.rs` 通过 `#[path]` 编译，这些文件只能依赖 `windows` crate，不能引用 crate 内其他模块。
- 每个 `unsafe` 块上方必须写 `// SAFETY:` 注释，说明满足了哪些前置条件。
- 句柄、COM 对象等资源用 RAII 类型包装，在 `Drop` 中释放，不手动配对 close。
- COM 初始化与反初始化在同一线程中配对完成。
- 开机自启只使用当前用户注册表路径 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`，遵循最小权限。
- 写文件（例如 Markdown 导出）必须校验目录和文件名，禁止写入不受控的路径。
- 新增 `windows` crate feature 时只加实际需要的项，`dev-dependencies` 中同样如此。

## 状态与线程

- 全局状态（`OnceLock`、`static`）封装在所属模块内部，通过访问函数使用，不跨模块直接引用。
- 后台线程和 worker 在对应功能关闭时必须能退出或暂停；长循环要检查停止信号，不能空转轮询。
- 跨线程推送事件统一走 `AppHandle::emit` / `emit_to`，不在后台线程直接操作窗口，必要时切换到主线程执行。

## 测试

- 纯逻辑（几何计算、解析、状态机、配置合并）必须有单元测试。
- 测试模块超过 150 行时移到 `<模块>/tests.rs`，在 `mod.rs` 中通过 `#[cfg(test)] mod tests;` 引入。
- 依赖真实桌面环境（运行中的 QQ / 微信、通知权限）的测试必须标注 `#[ignore = "原因"]`，不得进入默认测试集。
- `examples/` 中的探测程序用 `cargo run --example <name>` 手动运行，用于排查兼容性问题，不放生产逻辑。

## 配置与构建

- 修改 `tauri.conf.json` 中的窗口配置时，同步检查 `capabilities/default.json`、前端 `main.tsx` 的窗口分发，以及 Rust 中的 label 常量。
- `agent_status/hooks/focusd-agent-*.{cmd,ps1}` 和 `qq_notifications/repair-qq-notification-registration.ps1` 通过 `include_str!` 编入二进制，修改后需要完整的 Rust 验证。
- clippy lint 在 `Cargo.toml` 的 `[lints.clippy]` 中声明（`undocumented_unsafe_blocks`、`unwrap_used`、`expect_used` 为 deny），测试代码的放行写在 `clippy.toml`；不要在源文件中用 `#![warn]` / `#[allow]` 重复声明这些 lint。`cargo clippy --all-targets` 保持 0 告警；个别确实无法消除的默认 lint（例如参数即 IPC 契约的命令触发 `too_many_arguments`）在该项上用带 `reason` 的 `#[expect(...)]`。
- 验证：`cargo test --manifest-path src-tauri/Cargo.toml` + `pnpm tauri build --no-bundle`。涉及窗口、托盘、注册表行为的改动，在风险需要时用 `pnpm tauri dev` 手动检查折叠态、展开态、贴边收起和托盘隐藏。
- 成功生成 release 可执行文件后，按根目录规则同步桌面快捷方式。
