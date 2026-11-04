# 结构重构计划

目标：在**不改变任何用户可见行为**的前提下，把代码迁移到 [overview.md](overview.md) 描述的目标结构，并让所有文件满足根目录 [AGENTS.md](../../AGENTS.md#代码规模规则全局) 的行数上限。

执行规则：

- 按阶段顺序推进。同一阶段内的步骤之间没有依赖时可以调整顺序，但每一步单独提交。
- 搬迁和改写分开提交，提交信息使用 `refactor(<范围>): ...`。
- 每一步完成后：运行该步对应的验证，勾选本文的复选框，并在"进度记录"中追加一行（提交号、行数变化、验证结果）。
- 如果实际代码与映射表不一致，先更新 [overview.md](overview.md) 中的映射，再动手迁移。
- 重构期间如需修复 bug 或开发新功能，单独提交，并且写在目标位置。

## 基线（2026-11-03，提交 `f8e847d`）

按 `pnpm check:size` 的口径统计。"原始行数"是基线提交时的物理行数，"当前行数"是最近一次更新时的物理行数，每完成一步同步更新；后三列是基线数据。`.rs` 文件分别统计生产代码和内联测试模块，权威数据以 `scripts/file-size-allowlist.json` 为准。

| 文件 | 原始行数 | 当前行数 | 计入上限的行数 | 内联测试 | 超限项 |
|---|---|---|---|---|---|
| `src/App.tsx` | 5644 | 0（已删除） | 5644 / 400 | — | 行数 |
| `src/App.css` | 3865 | 0（已删除） | 3865 / 500 | — | 行数 |
| `src/QQMail.tsx` | 404 | 360（已移出白名单） | 404 / 400 | — | 行数 |
| `src-tauri/src/qq_mail.rs` | 2162 | 0（已拆为 `qq_mail/`） | 1465 / 800 | 697 / 150 | 生产代码、测试 |
| `src-tauri/src/lib.rs` | 1973 | 141（只剩组装代码，已移出白名单） | 1770 / 800 | 203 / 150 | 生产代码、测试 |
| `src-tauri/src/clipboard_history.rs` | 1068 | 0（已拆为 `clipboard_history/`） | 1068 / 800 | 0 | 生产代码 |
| `src-tauri/src/media_control.rs` | 829 | 0（已拆为 `media_control/`） | 829 / 800 | 0 | 生产代码 |
| `src-tauri/src/qq_notifications.rs` | 1081 | 0（已拆为 `qq_notifications/`） | 789 / 800 | 292 / 150 | 测试 |

其他基线指标：

- `App.tsx` 中有 48 个 `useState`、38 个 `useEffect`、30 个 `useRef`；`IslandApp` 组件约 1580 行。
- Rust 生产代码中约有 50 处 `unsafe`，分布在 8 个模块；生产代码中 `unwrap` / `expect` 共 4 处。
- 测试：`cargo test` 结果为 60 通过、5 忽略；`node --test` 共 33 个用例。在沙箱中有 3 个用例因 `spawnSync` 被拦截而失败，正常环境下应全部通过。

---

## Phase 0：工具与护栏

先建立自动检查，后续每一步都由工具把关。

- [x] **0.1 统一脚本入口。** 在 `package.json` 中新增：
  - `test`：`node --test tests/*.test.mjs`
  - `check:size`：运行行数检查脚本
  - `check`：依次运行 `tsc`、`check:size`、`test`。`lint` 在 0.3 中加入 `check`。
- [x] **0.2 行数检查脚本。** 新增 `scripts/check-file-size.mjs` 和 `scripts/file-size-allowlist.json`：
  - 扫描 `src/`、`src-tauri/src/`、`src-tauri/examples/`、`scripts/`、`tests/`，按根目录规则的上限和豁免清单检查；`.rs` 另外检查内联测试模块不超过 150 行；
  - 白名单分为 `lines` 和 `inlineTests` 两部分，记录上面基线表中的超限项。超过记录值时报错；变短时提示更新记录值；降到上限以下或文件已不存在时，报错要求删除条目；
  - 测试见 `tests/check-file-size.test.mjs`。
- [x] **0.3 ESLint。** 引入 `eslint`、`typescript-eslint`、`eslint-plugin-react-hooks`，使用 flat config（`eslint.config.js`）：
  - 启用 `react-hooks/rules-of-hooks`（error）和 `react-hooks/exhaustive-deps`（warn）；
  - 用 `no-restricted-imports` / `no-restricted-syntax` 落实分层规则：只有 `api.ts` 可以导入 `invoke` / `listen`，`utils/` 不得导入 React 和 Tauri。对存量文件暂时设为 warn，完成迁移后改为 error。
- [x] **0.4 TypeScript。** 在 `tsconfig.json` 中开启 `erasableSyntaxOnly`，保证 Node 能直接加载被测的 `.ts` 文件。
- [x] **0.5 Rust 静态检查。** 新增 `src-tauri/rustfmt.toml`（使用默认风格，只固定 edition），在 `Cargo.toml` 的 `[lints.clippy]` 中开启：
  - `undocumented_unsafe_blocks = "warn"`
  - `unwrap_used = "warn"`、`expect_used = "warn"`，测试代码通过 `src-tauri/clippy.toml` 的 `allow-unwrap-in-tests` / `allow-expect-in-tests` 放行。

  （原方案是在 `lib.rs` 中写 `#![warn]`、在测试模块上加 `#[allow]`，但这会让白名单中的 `lib.rs`、`qq_mail.rs`、`qq_notifications.rs` 变长，违反"只减不增"规则，因此改为在配置文件中声明。）

  记录 `cargo clippy --all-targets` 的告警基线，后续只减不增。

  **clippy 基线（2026-11-03，去重后）**：共 84 条。`undocumented_unsafe_blocks` 69、`expect_used` 5（全部在生产代码：`lib.rs` 4、`clipboard_history.rs` 1）、`unwrap_used` 0，其余默认 lint 10（`too_many_arguments` 2、`type_complexity` 2、`collapsible_if` 2、`items_after_test_module`、`derivable_impls`、`needless_lifetimes`、`needless_return` 各 1）。按位置：`qq_notifications.rs` 18、`lib.rs` 13、`media_control.rs` 8、`translation.rs` 8、`clipboard_history.rs` 7、`wechat_reminders.rs` 7、`wechat_reminder_source.rs` 4、`messenger_activation.rs` 3、`qq_mail.rs` 1、`examples/` 15。
- [x] **0.6 一次性格式化。** 在单独的提交中运行 `cargo fmt`。前端在本阶段不引入 Prettier，避免大面积改动干扰后续迁移的 diff。
  - 实际执行时发现，格式化会让白名单中的三个文件变长（`lib.rs` 生产代码 +1、内联测试 +37；`media_control.rs` +14；`qq_mail.rs` 生产代码 +19、内联测试 +8），违反"只减不增"规则。因此本步只格式化不受影响的文件（实际有改动的是 `qq_notifications.rs`、`wechat_reminders.rs`），这三个文件推迟到 Phase 5 拆分后再格式化，见 Phase 5 说明。
- [x] **0.7 CI。** 新增 `.github/workflows/ci.yml`（`windows-latest`），运行 `pnpm install --frozen-lockfile`、`pnpm check`、`pnpm build`、`cargo test`、`cargo clippy`。

**验收**：`pnpm check` 在本地和 CI 中都能通过；故意让白名单文件多出一行时，检查会失败。

## Phase 1：前端底座（零行为变化）

把 `App.tsx` 中不依赖组件状态的代码移出去，为拆分组件铺路。

- [x] **1.1** 建立 `src/lib/storage.ts`：提供安全的 JSON 读写函数（容错解析、写入失败时静默处理），并补测试。
- [x] **1.2** 把纯函数移到 `src/utils/`：`clamp`、颜色（`getColorSetting`、颜色校验）、日期（`getLocalDateString`、`getDisplayDateParts`）、`getErrorMessage`。补充 `node:test` 用例。
  - `hexToRgba` 以 `DEFAULT_SETTINGS.pulseColor` 作回退色，依赖外观领域。改为显式传参需要修改调用点，会让白名单中的 `App.tsx` 变长，因此改到 2.4 随外观设置迁移（映射已在 overview.md 中更新）。
- [x] **1.3** 通用控件 `SliderControl`、`ColorControl`、`ToggleControl`、`NumberControl` 移到 `src/components/controls/`，样式随组件一起迁移。
- [x] **1.4** 建立 `src/styles/`：从 `App.css` 中提取全局变量、重置样式和字体声明，作为 `tokens.css`、`base.css`、`fonts.css`，由 `main.tsx` 引入。
  - 实际 `App.css` 中没有全局 CSS 变量（现有变量都限定在 `.stage` 等组件上），因此本步只建 `fonts.css` 和 `base.css`，`tokens.css` 在 4.2 引入变量时再建。`.stage--font-pixel` 是 `.stage` 的修饰类，留在 `App.css`。

**验收**：`pnpm check`、`pnpm build` 通过；`App.tsx` 减少约 150 行；界面截图对比没有差异。

（原指标为"`App.tsx` 至少减少 600 行"。按本阶段实际列出的内容（若干纯函数和 4 个通用控件），可移出的代码只有约 150 行，600 行以上的体量都在 Phase 2 的各个 feature 中。2026-11-03 经确认改为按实际计算，实际为 5644 → 5488（-156），已达成。）

## Phase 2：拆分 feature（每个 feature 单独提交）

阶段目标：Phase 2 完成后 `App.tsx` 应比基线至少减少 600 行（承接原 Phase 1 的预期）。

每一步都要：把组件、领域函数、存储 key 和对应的 CSS 一起迁到 `features/<领域>/`；把该领域的 `invoke` / `listen` 收口到 `api.ts`；在 `App.tsx` 中改为导入新模块。

- [x] **2.1 todos**：`TodoNotebook`、`ArchiveBrowser`、待办/归档/笔记的存储与 normalize、Markdown 格式化、`createTodoId`，以及 `save_todo_markdown` 的封装。
- [x] **2.2 media**：`MusicPlayerPanel`、`MusicWaveButton`、`MediaWaveform`、媒体状态比较、音乐来源优先级的存储，以及 `media_*` 命令的封装。
- [x] **2.3 clipboard**：`ClipboardHistoryPanel`、快捷键解析与匹配（`shortcut.ts`，补测试），以及剪贴板命令与事件的封装。
- [x] **2.4 appearance**：`AppearanceModeControl`、设置与预设的 load / normalize / merge（包括 `collapsed-text-default-v1` 迁移逻辑）、`hexToRgba`（见 1.2），以及 `LayoutEditor` 中属于外观的区块（布局、颜色、预设）。
  - `LayoutEditor` 实际是设置窗口的整个页面（10 个区块，横跨约 7 个领域），不整体迁入 `features/appearance/`（2026-11-03 经确认调整）：各区块拆成子组件、放到所属领域，`LayoutEditor` 外壳只负责组合，在 2.8 随设置窗口迁到 `windows/settings/`。区块归属：布局、颜色、预设 → `features/appearance/`（2.4）；保存路径 → `features/todos/`、剪贴板设置 → `features/clipboard/`、语言 → `i18n/LocaleControl.tsx`（2.4 之后补做，见 2.4a）；AI 代理钩子 → `features/agent-status/`（2.5）；消息 → `features/messages/`（2.6）；项目链接与更新 → `features/updater/`（2.7）。
- [x] **2.4a 已完成领域的设置区块归位**：把 `LayoutEditor` 中的保存路径、剪贴板设置区块分别迁入 `features/todos/`、`features/clipboard/`，`LocaleControl` 迁入 `i18n/`。
  - 待办设置区块（跨天保留未完成、拖拽排序、轮播）编辑的是 `IslandSettings`，数据归外观存储所有，为避免 `features/todos` 依赖外观类型，放入 `features/appearance/TodoSettingsSection.tsx`。语言区块只有一个 `LocaleControl`，作为组合代码留在 `LayoutEditor` 外壳中。
- [x] **2.5 agent-status**：状态标签和视觉状态函数、代理状态命令的封装，以及 `LayoutEditor` 中的 AI 代理钩子区块。
- [x] **2.6 messages**：`Messages`、`MessageSourceIcon`、`CollapsedMessageContent`、`messagePreview.ts`、`qqNotificationTiming.ts`、`QQMail`、`QQNotifications`、`WeChatReminders` 迁入 `features/messages/`，拆出各自的 `api.ts` 和 `storage.ts`。`QQMail.tsx` 拆分后应低于 400 行。
  - `LayoutEditor` 中的消息区块只有标题和 `QQNotificationControls`、`WeChatReminderControls` 两个现成控件，与语言区块一样属于组合代码，留在 `LayoutEditor` 外壳中，不单独拆出。
- [x] **2.7 updater**：`UpdatePanel`、`updaterController.ts`，以及 `LayoutEditor` 中的项目链接区块。同步更新 `tests/updater-controller.test.mjs` 中的 import mock 表。
- [x] **2.8 窗口目录**：`SettingsWindow`、`LayoutEditor` 外壳（只做组合）、`TranslationWindow` 迁入 `windows/settings/`、`windows/translation/`，并抽出各自的 `api.ts` 和 `storage.ts`。

超过 400 行的组件（`TodoNotebook` 470 行、`ClipboardHistoryPanel` 566 行、`LayoutEditor` 755 行，2026-11-03 统计）无法原样搬到一个文件里。经确认按以下顺序处理，搬迁和改写仍然分开提交：

1. 搬迁提交：先原样搬出该步的其余代码（类型、存储、纯函数、小组件）。`App.tsx` 变短，但**暂不下调**白名单记录值（`check:size` 只会给出提示）。
2. 改写提交：在 `App.tsx` 中原地把大组件拆成无状态的子组件，状态仍留在原组件中，不改变挂载结构。`App.tsx` 会增加几十行，但仍低于白名单记录值。
3. 搬迁提交：把拆分后的组件原样搬到 `features/<领域>/`，并把白名单下调到实际行数。

**验收**（每一步都要满足）：`pnpm check`、`pnpm build` 通过；`tests/` 中的导入路径已更新；手动检查对应面板的展开、折叠和数据保留情况，并在 `pnpm dev` 中打开相关的 `tests/*.html` 回归页确认。

## Phase 3：拆分 IslandApp

- [x] **3.1** 把窗口尺寸、展开高度、拖拽、位置、贴边逻辑抽到 `windows/island/useIslandWindow.ts`，窗口命令封装到 `windows/island/api.ts`。展开高度仍由 `IslandApp` 计算后传入（依赖各页面内容）；贴边收起的 mode 状态留在 `IslandApp`，随 3.3 迁移。
- [x] **3.2** 各 feature 的状态与副作用抽成领域 hook：`useTodos`、`useMediaState`、`useClipboardHistory`、`useAgentStatus`。高频状态（音频电平）放进叶子组件——**暂缓**，原因见“待处理问题”3.2 一行；`IslandApp` 的 `useState` 已降到 6 个。
- [x] **3.3** `App` / `IslandApp` / `IslandShell` 迁到 `windows/island/`，改为具名导出，更新 `main.tsx`。`useIslandAutomation.ts` 同时迁移，并更新 `tests/island-automation.test.mjs`。
- [x] **3.4** 删除 `src/App.tsx`，从白名单中移除。（与 3.3 的搬迁同一提交：文件移走后白名单条目必须同时删除，否则行数检查报错。）

**验收**：`IslandApp.tsx` 不超过 400 行，组件函数不超过 200 行；`useState` 数量不超过 8；`pnpm tauri dev` 中手动检查折叠、展开、贴边收起、拖拽和托盘隐藏。

> 2026-11-03 结果：`IslandApp.tsx` 224 行，`IslandApp` 函数 194 行，直接 `useState` 2 个；`IslandShell` 函数 140 行，`IslandHeader` 144 行，`IslandCollapsedBar` 114 行（均含参数解构）。`pnpm tauri dev` 手动检查列入“待人工验收”。

## Phase 4：CSS 收尾

- [x] **4.1** 把 `App.css` 中剩余的样式按组件分配到同名 `.css`。无法归属的样式放到 `windows/island/IslandApp.css`。
  - 拆完后 `App.css` 已为空，删除文件与白名单条目（原 4.3）在同一个搬迁提交中完成，4.3 随之勾选；4.2 是改写步骤，单独提交。
- [x] **4.2** 把散落的颜色、圆角、间距硬编码替换为 `tokens.css` 中的变量（只替换数值完全相同的，不改变视觉效果）。
  - 范围：出现多次的颜色（hex 按原文小写匹配，rgba 按数值匹配）、单值 `border-radius`、单值 `gap`；不改自定义属性的定义（如 `.stage` 上的 `--task-text-color`，运行时由内联样式覆盖）、只出现一两次的颜色、padding / margin、字号，以及 TSX 中的内联颜色。回归页不经过 `main.tsx`，各自导入 `tokens.css`。
- [x] **4.3** 删除 `src/App.css`，从白名单中移除。（随 4.1 完成）

**验收**：所有 `.css` 文件不超过 500 行；主窗口、设置窗口、翻译窗口在中英文下截图对比都没有差异。

## Phase 5：Rust 拆分（每个模块单独提交）

每一步都要：按 [overview.md](overview.md#迁移映射rust) 拆成目录模块；测试移到 `tests.rs`；命令名保持不变；更新 `generate_handler!` 中的路径。

`lib.rs`、`qq_mail.rs`、`media_control.rs` 在 0.6 中没有格式化。搬迁提交保持原格式；搬迁完成、相关文件已不在白名单中之后，紧接着单独提交一次 `cargo fmt`（`refactor(<范围>): apply cargo fmt`），格式化后仍须满足行数上限。`lib.rs` 在 5.3 完成后格式化，5.1、5.2 拆出的新文件在各自步骤后格式化。

- [x] **5.1** 从 `lib.rs` 中拆出 `island/`，包括状态、几何计算、毛玻璃、鼠标穿透以及对应测试。
  - `run()` 中的岛屿初始化（首次定位、鼠标穿透循环、拖动位置记录）和托盘中的显示 / 隐藏仍在 `lib.rs`，改为通过 `island::` 路径调用；托盘在 5.3 移到 `tray.rs`。更新配置的 3 个测试留在 `lib.rs` 的测试模块，5.3 随 `system/updater.rs` 迁移。
- [x] **5.2** 从 `lib.rs` 中拆出 `agent_status/`。
  - `windows_home_dir` 同时被待办导出和钩子安装使用，暂留 `lib.rs`，5.3 再归位；`write_text_file` 实际只有钩子安装使用，放在 `agent_status/mod.rs`（overview 映射已更正）。
  - 执行顺序调整为 5.2 → 5.7 → 5.3 → 5.4 → 5.5 → 5.6 → 5.8：`lib.rs` 里还有 10 个媒体命令，计划没写归属，在 5.7 随 `media_control/` 迁移；5.3 放在其后，完成时 `lib.rs` 才能只剩组装代码。
- [x] **5.3** 从 `lib.rs` 中拆出 `system/`（`startup.rs`、`updater.rs`、`todo_export.rs`）和 `tray.rs`。完成后 `lib.rs` 只剩组装代码。
  - `windows_home_dir`（待办导出与 `agent_status` 共用）和 `CREATE_NO_WINDOW`（自启与代理查询共用）放在 `system/mod.rs`。更新配置测试随 `updater.rs` 迁移，`lib.rs` 不再有测试模块，clippy 的 `items_after_test_module` 随之消失（84 → 83）。
  - `lib.rs` 的格式化：直接运行 rustfmt 会顺着 `mod` 声明格式化尚未拆分的文件，因此把子模块临时替换为空的内联模块单独格式化，`mod` 声明按 rustfmt 的规则排序。
- [x] **5.4** 拆分 `qq_mail/`。
- [x] **5.5** 拆分 `qq_notifications/`。
  - 实际职责比映射多一块：查找并激活 QQ 窗口放在 `launcher.rs`；通知缓冲区即映射中的 `history.rs`。
- [x] **5.6** 拆分 `clipboard_history/`。完成后白名单的 `lines` 与 `inlineTests` 都已清空（7.1 只剩删除白名单机制中的存量条目说明）。
- [x] **5.7** 拆分 `media_control/`。（在 5.3 之前完成，见 5.2 的说明）
  - `lib.rs` 中的 10 个媒体命令一并迁入 `media_control/mod.rs`。命令 `get_audio_level` 与内部函数同名，因此内部 API（状态类型、`get_state` / `get_audio_level` / `run_command` / `seek` / `set_volume`、`MediaCommand`）放在 `service.rs`，命令里的 `media_control::` 路径改为 `service::`。
- [x] **5.8** 合并 `wechat_reminders.rs` 与 `wechat_reminder_source.rs`，形成 `wechat_reminders/`。
  - `examples/wechat_reminder_probe.rs` 通过 `#[path]` 引用监听源文件，路径同步改为 `../src/wechat_reminders/source.rs`；`source.rs` 不依赖父模块，仍可在示例中单独编译。

**验收**（每一步都要满足）：`cargo test` 的通过数量不少于基线；`pnpm tauri build --no-bundle` 成功，并按根目录规则同步桌面快捷方式；涉及窗口的步骤需要在 `pnpm tauri dev` 中手动检查。

## Phase 6：unsafe 收口与错误处理

- [x] **6.1** 建立 `win32/`，先迁移注册表操作（`registry.rs`），再迁移窗口和句柄（`window.rs`）、COM 初始化（`com.rs`）。每次迁移一类调用，为每个 `unsafe` 块补上 `// SAFETY:` 注释。
  - [x] 注册表：`win32/registry.rs` 的 `read_string` 替换两处 `RegGetValueW`（`1fcfa89`）。`system/startup.rs`、`updater.rs` 通过 `reg.exe` 子进程读写注册表，不含 `unsafe`，本步不改（见"待处理问题" 6.1）。
  - [x] 进程句柄：`win32/process.rs`（`window_process_id`、`image_path`，句柄由 RAII 关闭）替换 QQ 与微信两处"窗口属于哪个可执行文件"的查询（`a918a97`）。进程相关调用单独成文件，是因为 `examples/wechat_reminder_probe.rs` 通过 `#[path]` 只引入它和 `registry.rs`，避免示例编译到用不上的窗口函数。
  - [x] 窗口：`win32/window.rs`（`window_rect`、`cursor_position`、`clear_window_region`、`is_interactive`、`bring_to_foreground`）替换 `island/glass.rs`、`island/passthrough.rs`、`messenger_activation.rs` 中的调用；`island/mod.rs` 等待左键松开改用 `win32/input.rs` 新增的 `is_left_button_down`。窗口枚举回调属于 6.2（`qq_notifications/launcher.rs`），本步不做。
  - [x] COM：`win32/com.rs`（`ComApartment`、`WinRtApartment`，均为不可 `Send` 的 RAII 守卫）替换媒体线程的 `CoInitializeEx` / `CoUninitialize` 配对和 `qq_notifications/listener.rs` 的 `RoInitialize` + `WinRT` 守卫。示例程序中的 `RoInitialize` 不属于生产代码，本步不改。
- [x] **6.2** 逐模块迁移剩余的 `unsafe` 调用：媒体与音频、通知、剪贴板、翻译、微信。
  - [x] 媒体与音频：`win32/audio.rs`（`AudioDevices` → `AudioOutput` → `OutputVolume` / `PeakMeter`，每一层单独返回 `Result`，调用方仍按原来的阶段映射错误文案）；`win32/input.rs` 新增 `send_key_down` / `send_key_up`，媒体键的 80ms 按住时间留在调用方。
  - [x] 通知：`win32/window.rs` 新增 `for_each_top_level_window`（闭包经 `LPARAM` 传给 `EnumWindows`，只在同步调用期间有效）和标题、类名、所有者、还原位置、可见性、前台窗口、`AllowSetForegroundWindow`、`SendMessageTimeoutW`、托盘图标查询；`qq_notifications/launcher.rs` 的枚举回调改为普通的安全函数，不再含 `unsafe`。
  - [x] 剪贴板：新增 `win32/message_window.rs`（`WindowMessages` trait 让窗口过程成为安全的 `handle` 方法，返回 `None` 时交给 `DefWindowProcW`；类注册、仅消息窗口、`PostMessageW`、`GetMessageW` 循环）、`win32/hotkey.rs`（注册时总是加 `MOD_NOREPEAT`）、`win32/clipboard.rs`（剪贴板格式监听）。`clipboard_history/service.rs`、`hotkey.rs` 不再含 `unsafe`，`unregister_current_hotkey` 不再是 `unsafe fn`。
  - [x] 翻译：复用上一步的 `message_window`、`hotkey`，以及 `window::foreground_window` / `window_rect`；`translation/` 不再含 `unsafe`。
  - [x] 微信：`win32/process_times.rs`（进程启动时间，复用 `process.rs` 中改为 `pub(super)` 的句柄类型）、`win32/shell_hook.rs`（`SHELLHOOK` 消息与注册），`message_window.rs` 增加工具弹窗、销毁窗口、注销类和 `PeekMessageW` 派发，`window.rs` 增加 `is_minimized`。`wechat_reminders/mod.rs`、`source.rs` 不再含 `unsafe`。示例程序 `wechat_reminder_probe.rs` 同步引入 `message_window.rs`、`shell_hook.rs`、`window.rs`，只用到其中一部分的两个文件加了 `#[allow(dead_code)]`。至此生产代码中 `win32/` 以外没有 `unsafe`（`messenger_activation.rs` 测试模块里的 1 处除外）。
- [ ] **6.3** 清理生产代码中剩余的 `unwrap` / `expect`，将 Phase 0 中的 clippy lint 从 warn 升级为 deny。
  - [x] `expect`：窗口状态锁改为 `unwrap_or_else(PoisonError::into_inner)`（与 `island/mod.rs` 拖动结束时的写法一致）；默认剪贴板快捷键改为返回 `Option`，调用方不再 panic，新增测试确认默认值能解析且解析后的标签与常量相同；`lib.rs` 中 `run()` 的启动失败先保留了 `expect` 并用 `#[expect(clippy::expect_used)]` 标注（`c5110f5`），随后按 src-tauri/AGENTS.md"生产代码禁止 `expect`"改为打印错误后 `exit(1)`（见 6.3（3/n））。
  - [x] 测试与示例中的 `unsafe` 块补上 `// SAFETY:` 注释（`qq_notifications/tests.rs` 7、`wechat_reminders/tests.rs` 3、`messenger_activation.rs` 测试模块 1、3 个探测示例 11），只加注释，不改代码。升级为 deny 后这些位置也会被检查。

**验收**：除 `win32/` 外，生产代码中不再出现 `unsafe`；clippy 没有告警；`cargo test` 和 `pnpm tauri build --no-bundle` 通过。

### Phase 6 交接说明（2026-11-03）

Phase 6 剩余部分（6.1 的窗口与 COM、6.2、6.3）留给后续贡献者在上游 PR 中完成。下面是接手需要的信息。

**现状**

- `win32/` 已建立：`registry.rs`（`read_string`）、`process.rs`（`window_process_id`、`image_path`，`ProcessHandle` 在 `Drop` 中关闭句柄），各带单元测试。
- 生产代码中 `win32/` 以外还有 52 处 `unsafe`：`translation.rs` 8、`qq_notifications/launcher.rs` 7、`wechat_reminders/source.rs` 5、`wechat_reminders/mod.rs` 5、`media_control/session.rs` 4、`clipboard_history/hotkey.rs` 4、`qq_notifications/listener.rs` 3、`messenger_activation.rs` 3、`media_control/audio.rs` 3、`clipboard_history/service.rs` 3、`island/passthrough.rs` 2、`island/mod.rs` 1、`island/glass.rs` 1（按 `grep unsafe` 统计，含 `unsafe fn` / `unsafe extern "system" fn` 声明）。
- 生产代码中的 `expect` 共 5 处：`island/state.rs` 2、`island/mod.rs` 1（窗口状态锁）、`clipboard_history/mod.rs` 1（解析默认快捷键常量）、`lib.rs` 1（`run()` 启动失败）。
- clippy 基线 80 条，按位置：`qq_notifications/` 17、`examples/` 14、`wechat_reminders/` 10、`island/` 10、`translation.rs` 8、`media_control/` 8、`clipboard_history/` 7、`messenger_activation.rs` 3、`lib.rs` 2、`qq_mail/` 1；其中 66 条是 `undocumented_unsafe_blocks`。

**约定**

- 每类调用一个提交，提交信息用 `refactor(win32): ...`；封装函数尽量接收 Rust 类型（`&str`、`u32`），不让调用方传裸指针；每个 `unsafe` 块写 `// SAFETY:`；句柄用 RAII 类型。
- 迁移只改实现方式，不改行为：缓冲区大小、失败分支（跳过 / 返回错误 / 回退默认值）与原代码逐一对齐，提交说明里写明对照结果。
- `wechat_reminders/source.rs` 也被 `examples/wechat_reminder_probe.rs` 通过 `#[path]` 编译。它用到的 `win32` 文件要在示例的 `mod win32 { ... }` 中逐个引入，并且这些文件不能依赖 crate 内其他模块；只把示例用得到的函数放在这些文件里，避免示例产生 dead_code 告警。（6.2 更新：`message_window.rs`、`window.rs` 由主程序和示例共用，示例只用到一部分，在示例中对这两个引入加了 `#[allow(dead_code)]`；`process.rs` 仍只放示例用得到的函数，进程启动时间放在单独的 `process_times.rs`。）
- 每步验证：`cargo test`（当前 68 通过 / 5 忽略）、`cargo clippy --all-targets`（告警只减不增）、`cargo build --all-targets`、`pnpm check`、`pnpm build`、`pnpm tauri build --no-bundle`，并按根目录规则同步桌面快捷方式。

**建议的剩余步骤**

1. `window.rs`：`island/glass.rs`（`SetWindowRgn`）、`island/passthrough.rs`（`GetWindowRect`、`GetCursorPos`）、`island/mod.rs`（`GetAsyncKeyState`）、`messenger_activation.rs`（可交互判断、前台切换）。这些多为无指针参数或只写入局部变量的调用，适合先做。
2. `com.rs`：`media_control/service.rs` 的媒体线程 `CoInitializeEx` / `CoUninitialize` 配对改为 RAII 守卫；`qq_notifications/listener.rs` 的 `WinRT` 守卫一并评估。
3. 6.2：带窗口过程和消息循环的模块（`clipboard_history/service.rs`、`hotkey.rs`，`wechat_reminders/source.rs`，`translation.rs`），以及 `EnumWindows` 回调（`qq_notifications/launcher.rs`）。回调中把 `LPARAM` 转回引用的写法需要单独论证安全性。
4. 6.3：窗口状态锁改为 `unwrap_or_else(PoisonError::into_inner)`，默认快捷键解析改为不 panic 的写法；随后把 `Cargo.toml` 中的 clippy lint 从 warn 升级为 deny。

**需要人工验证**：上述调用全部依赖真实桌面环境（窗口、托盘、热键、COM、通知），单元测试覆盖不到，每步都要在 `pnpm tauri dev` 中检查相关功能，检查项可参考"待人工验收"中 5.1、5.5–5.8、6.1 各行。

### 5.4 可见性收窄交接说明（2026-11-03）

待处理问题 5.4 的代码改动留给上游贡献者。拆分 `qq_mail/`、`qq_notifications/`、`clipboard_history/` 时为了零行为变化，子文件之间统一用 `use super::*` 互相引用，搬过去的顶层项、结构体字段和固有方法一律加了 `pub(super)`。目标是改成显式导入和最小可见性，不改任何逻辑。

**现状（按单词搜索统计，`tests.rs` 中的引用也计入；以编译器结果为准）**

| 模块 | 文件（行数） | `use ...::*` | 只在本文件使用、可去掉 `pub(super)` 的项 |
|---|---|---|---|
| `qq_mail/` | `mod.rs` 301、`service.rs` 359、`session.rs` 449、`content.rs` 409、`credentials.rs` 38、`tests.rs` 708 | `mod.rs` glob 导入 4 个子模块；`service.rs`、`session.rs`、`content.rs`、`tests.rs` 各有 `use super::*` | 22 / 69：`content.rs` 12（`MAX_MIME_BYTES`、`MAX_INLINE_IMAGES`、`MAX_INLINE_IMAGE_BYTES`、`MAX_INLINE_TOTAL_BYTES`、`TextPart`、`is_attachment`、`text_part`、`InlineImage`、`cid_token_end`、`collect_inline_images`、`responses_for_message`、`inline_cid_images`），`session.rs` 6（`HOST`、`MAX_ITEMS`、`queued_work`、`open_connection`、`header_message`、`drain_mail_updates`），`service.rs` 3（`SYNC_INTERVAL`、`MailEvent`、`now_ms`），`credentials.rs` 1（`CREDENTIAL_SERVICE`） |
| `qq_notifications/` | `mod.rs` 261、`listener.rs` 294、`launcher.rs` 217、`history.rs` 37、`tests.rs` 296 | `mod.rs` glob 导入 3 个子模块；`listener.rs`、`history.rs`、`tests.rs` 有 `use super::*` | 9 / 21：`listener.rs` 8（`QQ_APP_ID`、`REGISTRATION_REPAIR`、`DIAGNOSTIC_TITLE`、`DIAGNOSTIC_BODY`、`qq_notification_setting`、`repair_registration`、`WinRT`、`read_qq_notification`），`launcher.rs` 1（`QQWindowSearch`） |
| `clipboard_history/` | `mod.rs` 233、`service.rs` 600、`hotkey.rs` 220、`store.rs` 95 | `mod.rs` glob 导入 3 个子模块；`service.rs`、`hotkey.rs`、`store.rs` 有 `use super::*` | 24 / 51：`service.rs` 19（含 `ClipboardHistoryService` 的大部分内部方法、剪贴板读写与重试、监听窗口），`hotkey.rs` 4（`CLIPBOARD_HOTKEY_REGISTERED`、`hotkey_registered`、`set_hotkey_registered`、`shortcut_key_code`），`store.rs` 1（`THUMBNAIL_MAX_SIDE`） |

另外，搬过去的结构体字段都加了 `pub(super)`：`qq_mail` 35 个、`qq_notifications` 10 个、`clipboard_history` 2 个。其中只被本文件读写的字段可以恢复为私有。

**建议做法**

1. 每个模块单独一个提交：`refactor(<模块>): narrow visibility and replace glob imports`。
2. 先去掉上表中只在本文件使用的项的 `pub(super)`，编译一次。
3. 把 `mod.rs` 的 `use <子模块>::*` 和子文件的 `use super::*` 换成显式导入。`mod.rs` 中定义的类型对子模块天然可见，不需要加可见性。
4. 字段：只在定义文件内读写的字段恢复为私有；跨文件构造或读取的保留 `pub(super)`。
5. 每一步都用编译器确认：`cargo build --all-targets` 不应出现 `unused import`、`dead_code` 或 `private_interfaces` 警告。

**注意事项**

- `tests.rs` 通过 `use super::*` 使用 `mod.rs` 中的项和子模块导出的项，并且自带拆分时补上的 std / imap / windows 导入。收窄后可能需要在 `tests.rs` 中补上 `use super::<子模块>::...`。测试函数本身不要改。
- `qq_mail/session.rs` 中 `BoundedStream` 的元组字段是 `pub(super)`，因为 `tests.rs` 要直接构造它，需要保留。
- `clipboard_history/mod.rs` 的 `pub(crate) use hotkey::parse_shortcut_binding;` 供 `translation.rs` 使用，必须保留。
- `cargo fix` 会留下一些 trait 导入（例如 `use base64::Engine as _`、`use sha2::Digest`、`use std::io::Read`）不处理，需要手动确认后删除。
- 收窄只改可见性和导入，不改函数体。提交前用"去掉缩进、可见性修饰和路径前缀后逐行比较"的方法核对，差异应只有 `use` 行。

**验证**：`cargo test`（Phase 6 交接时为 68 通过 / 5 忽略）、`cargo clippy --all-targets`（告警只减不增，基线 80）、`cargo build --all-targets`、`pnpm check`、`pnpm build`、`pnpm tauri build --no-bundle`，并同步桌面快捷方式。这一步不改行为，回归页与手动检查可以参考"待人工验收"中 5.4–5.6 各行，抽查即可。

## Phase 7：收尾

- [x] **7.1** 白名单清空，删除白名单机制中的存量条目。（5.6 完成后 `lines`、`inlineTests` 均为空；检查脚本保留，用于阻止新的超限文件）
- [x] **7.2** 把 ESLint 中的存量 warn 全部升级为 error。（`exhaustive-deps` 是唯一的 warn 规则；5 处存量警告在 `14eff59` 处理后升级，ESLint 0 error / 0 warning）
- [ ] **7.3** 更新根目录 `AGENTS.md`，删除"结构重构进行中"的说明；更新两份子目录 `AGENTS.md` 中的目录地图。如果 README 中的项目结构说明也受影响，同步更新中英文两个版本。
- [ ] **7.4** 运行完整的 `pnpm tauri build`，在本机做一轮回归。

---

## 进度记录

| 日期 | 步骤 | 提交 | 行数变化 | 验证 |
|---|---|---|---|---|
| 2026-11-03 | 规则与计划 | `a885920` | 新增规则文档 | 仅文档 |
| 2026-11-03 | 0.1、0.2 | 见提交说明 | 新增检查脚本（约 150 行）及其测试 | `pnpm check`（40/40）、`pnpm build` |
| 2026-11-03 | 0.3 | `8aac08f` | 新增 `eslint.config.js`；`check` 加入 `lint`。存量基线：0 error / 18 warn（13 条 IPC 收口、5 条 exhaustive-deps），7 个存量 IPC 文件登记在配置的 `legacyIpcFiles` 中 | `pnpm check`（40/40）、`pnpm build`（TEMP 指向 `node_modules/.cache/tmp`） |
| 2026-11-03 | 0.4 | `fc8d13b` | `tsconfig.json` 开启 `erasableSyntaxOnly`，现有代码无需改动 | `pnpm check`（40/40）、`pnpm build` |
| 2026-11-03 | 0.5 | `306430c` | 新增 `rustfmt.toml`、`clippy.toml`，`Cargo.toml` 增加 `[lints.clippy]`；源文件行数不变。clippy 基线 84 条（见 0.5） | `cargo test`（60 通过 / 5 忽略）、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-03 | 0.6 | `15cb0d0` | `cargo fmt` 仅作用于 `qq_notifications.rs`（+5/-3）和 `wechat_reminders.rs`（+3/-1），均未超出上限/白名单；`lib.rs`、`media_control.rs`、`qq_mail.rs` 推迟到 Phase 5 | `cargo test`（60 通过 / 5 忽略）、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-03 | 0.7 | `2e71e5c` | 新增 `.github/workflows/ci.yml`（windows-latest，Node 26、pnpm 11、stable Rust + clippy）；clippy 存量告警暂不阻断 | `pnpm check`（40/40）、`pnpm build`；CI 实际运行待人工验收。Phase 0 验收中"白名单文件变长时检查失败"已在 0.6 实测（格式化后 `pnpm check:size` 报 5 个错误） |
| 2026-11-03 | 1.1 | `c699c48` | 新增 `src/lib/storage.ts`（57 行：`readString` / `writeString` / `removeItem` / `readJson` / `writeJson`）与 `tests/storage.test.mjs`（5 个用例）；现有代码暂不改用，在 Phase 2 各目录的 `storage.ts` 中接入 | `pnpm check`（45/45）、`pnpm build` |
| 2026-11-03 | 1.2 | `bd16b6c` | `App.tsx` 5644 → 5602（-42）；新增 `utils/number.ts`、`color.ts`、`date.ts`、`error.ts` 和 `tests/utils.test.mjs`（6 个用例）；`SettingsWindow.tsx` 改为从 `utils/error` 导入 `getErrorMessage`；`getDisplayDateParts` 的参数类型改为结构类型 `{ localeTag: string }`（运行时不变）；`hexToRgba` 推迟到 2.4 | `pnpm check`（51/51）、`pnpm build` |
| 2026-11-03 | 1.3 | `5d17988` | `App.tsx` 5602 → 5488（-114）、`App.css` 3865 → 3677（-188）；新增 `components/controls/` 下 4 组 `.tsx` + `.css`。已核对 CSS 迁移不改变层叠结果：没有其他规则以相同特异性命中这些控件 | `pnpm check`（51/51）、`pnpm build`；截图对比待人工验收 |
| 2026-11-03 | 1.4 | `bc7cccd` | `App.css` 3677 → 3622（-55）；新增 `styles/fonts.css`（`@font-face`，url 改为 `../assets/…`）、`styles/base.css`，由 `main.tsx` 在 `App` 之前引入。打包产物 CSS 与 1.3 完全一致，只是这 785 字节的全局规则移到了开头；之前加载的组件 CSS 中没有同特异性的冲突规则 | `pnpm check`（51/51）、`pnpm build` |
| 2026-11-03 | Phase 1 验收 | 见提交说明 | `App.tsx` 5644 → 5488（-156），`App.css` 3865 → 3622（-243）；验收指标改为"减少约 150 行"，600 行预期移到 Phase 2 | `pnpm check`、`pnpm build`；截图对比待人工验收 |
| 2026-11-03 | 2.1（1/4，搬迁） | `4aba0c4` | `App.tsx` 5488 → 5268（-220，白名单按约定暂不下调）；新增 `features/todos/types.ts`、`storage.ts`、`markdown.ts`、`ArchiveBrowser.tsx` 和 `tests/todos.test.mjs`（6 个用例）；`SettingsWindow.tsx` 改为直接从 `features/todos` 导入 | `pnpm check`（57/57）、`pnpm build` |
| 2026-11-03 | 2.1（2/4，改写） | `7b044ca` | 新增 `features/todos/api.ts`（`saveTodoMarkdown`、`SaveTodoResult`）；`App.tsx` 改为调用封装函数，命令名和参数名不变；`App.tsx` 5268 → 5265 | `pnpm check`（57/57）、`pnpm build` |
| 2026-11-03 | 2.1（3/4，改写） | `3705001` | 在 `App.tsx` 中把 `TodoNotebook`（470 行）的书脊按钮组拆为 `TodoNotebookSpine`（71 行）、单条待办拆为 `TodoListItem`（156 行），二者无状态，编辑与拖拽状态仍在 `TodoNotebook`（334 行）中；DOM 结构与 class 不变。`App.tsx` 5265 → 5358（+93，低于白名单记录 5488） | `pnpm check`（57/57）、`pnpm build`；交互待人工验收 |
| 2026-11-03 | 2.1（4/4，搬迁） | `2b7b6f3` | `TodoNotebook`、`TodoNotebookSpine`、`TodoListItem` 原样搬到 `features/todos/`（343 / 75 / 162 行），`TODO_SCROLL_START_ROWS` 移到 `features/todos/layout.ts`；`App.tsx` 5358 → 4791，白名单 5488 → 4791 | `pnpm check`（57/57）、`pnpm build` |
| 2026-11-03 | 2.1（CSS 搬迁） | `1597286` | `App.css` 3622 → 2727（-895），白名单同步下调；待办样式按组件拆到 `TodoNotebook.css`（301）、`TodoNotebookSpine.css`（91，含 `saveSpin` / `savePop` 关键帧）、`TodoListItem.css`（230）、`ArchiveBrowser.css`（269）。打包产物的规则集合与长度不变（681 条），只有顺序变化；脚本检查顺序发生变化的规则对中，没有同特异性、同目标 class、同属性的冲突 | `pnpm check`（57/57）、`pnpm build`；面板检查待人工验收 |
| 2026-11-03 | 2.2（1/3，搬迁） | `49d34be` | `App.tsx` 4791 → 4260（-531），白名单同步下调；新增 `features/media/api.ts`（与 Rust 对应的类型）、`mediaState.ts`、`storage.ts`、`MusicWaveButton.tsx`、`MusicPlayerPanel.tsx`，`MediaWaveform.tsx/.css` 用 `git mv` 迁入；新增 `tests/media.test.mjs`（4 个用例）。`AUDIO_ACTIVE_THRESHOLD` 和音乐面板高度属于主窗口，留到 3.x | `pnpm check`（61/61）、`pnpm build` |
| 2026-11-03 | 2.2（2/3，改写） | `150ac83` | `features/media/api.ts` 新增 `getMediaState`、`sendMediaCommand`、`getAudioLevel` 和 `MediaCommand`；`App.tsx` 改为调用封装，命令名和参数名不变；`App.tsx` 4260 → 4255，白名单同步下调 | `pnpm check`（61/61）、`pnpm build` |
| 2026-11-03 | 2.2（3/3，CSS 搬迁） | `4dbdaa6` | `App.css` 2727 → 2255（-472），白名单同步下调；新增 `MusicPlayerPanel.css`（392，含 `music-control-track-change` 关键帧）、`MusicWaveButton.css`（78）。多组件共用的选择器和液态玻璃外观规则留在 `App.css`，在 4.1 处理。改用打包产物级检查：对比构建产物，顺序变化的规则对中无冲突，也覆盖了 2.1 的 CSS 搬迁和 2.2 中 `MediaWaveform.css` 的加载位置变化 | `pnpm check`（61/61）、`pnpm build`；面板检查待人工验收 |
| 2026-11-03 | 2.1 补充（改写） | `45058c0` | 2.1 漏掉了 `get_default_todo_save_directory`，补进 `features/todos/api.ts`（`getDefaultTodoSaveDirectory`），命令名不变；`App.tsx` 行数不变 | `pnpm check`（61/61）、`pnpm build` |
| 2026-11-03 | 2.3（1/5，搬迁） | `c50cfaa` | `App.tsx` 4255 → 4057（-198，白名单按约定暂不下调）；新增 `features/clipboard/api.ts`（与 Rust 对应的类型）、`shortcut.ts`、`settings.ts` 和 `tests/clipboard-shortcut.test.mjs`（5 个用例）；`SettingsWindow.tsx` 改为直接从 `features/clipboard` 导入 | `pnpm check`（66/66）、`pnpm build` |
| 2026-11-03 | 2.3（2/5，改写） | `101a714` | 在 `App.tsx` 中把 `ClipboardHistoryPanel`（566 行）的头部拆为 `ClipboardPanelHeader`（66）、筛选与搜索拆为 `ClipboardFilters`（56，返回 Fragment 以保持 DOM 层级）、单条记录拆为 `ClipboardHistoryItemRow`（184，`ref` 回调改由 `elementRef` 传入）；状态和副作用仍在 `ClipboardHistoryPanel`（360）中。`App.tsx` 4057 → 4160（+103，低于白名单记录 4255） | `pnpm check`（66/66）、`pnpm build`；交互待人工验收 |
| 2026-11-03 | 2.3（3/5，搬迁） | `e218865` | `ClipboardHistoryPanel`（367）、`ClipboardPanelHeader`（70）、`ClipboardFilters`（59）、`ClipboardHistoryItemRow`（188）原样搬到 `features/clipboard/`；`App.tsx` 4160 → 3485，白名单 4255 → 3485 | `pnpm check`（66/66）、`pnpm build` |
| 2026-11-03 | 2.3（4/5，改写） | `912749a` | `features/clipboard/api.ts` 新增 7 个命令封装、2 个事件名常量（与 Rust 常量一致）和 2 个 `listen` 封装；`App.tsx`、`SettingsWindow.tsx` 改为调用封装，命令名、参数名和事件名不变。`App.tsx` 3485 → 3469，白名单同步下调；ESLint warn 18 → 17（`SettingsWindow.tsx` 不再直接导入 `listen`） | `pnpm check`（66/66）、`pnpm build` |
| 2026-11-03 | 2.3（5/5，CSS 搬迁） | `5592ae5` | `App.css` 2255 → 1748（-507），白名单同步下调；样式按组件拆到 `ClipboardHistoryPanel.css`（66，含跨子组件的焦点样式）、`ClipboardPanelHeader.css`（128）、`ClipboardFilters.css`（98）、`ClipboardHistoryItemRow.css`（211）。打包产物级检查改为更严格的口径（不同伪类视为可能同时生效），用新口径重新检查了 2.1 起的全部 CSS 搬迁，均无冲突 | `pnpm check`（66/66）、`pnpm build`；面板检查待人工验收 |
| 2026-11-03 | 2.4（1/4，搬迁） | `8331f65` | `App.tsx` 3469 → 3148（-321，白名单暂不下调，`LayoutEditor` 的外观区块拆出后再调）；新增 `features/appearance/types.ts`、`settings.ts`（含 `hexToRgba`）、`storage.ts`（含 `collapsed-text-default-v1` 迁移）、`AppearanceModeControl.tsx`，`features/todos/index.ts` 公开导出 `createTodoId` 供预设使用；`SettingsWindow.tsx` 改为直接从 `features/appearance` 导入；新增 `tests/appearance.test.mjs`（8 个用例） | `pnpm check`（74/74）、`pnpm build` |
| 2026-11-03 | 2.4（2/4，改写） | `7a095b3` | 在 `App.tsx` 中把 `LayoutEditor` 的布局、颜色、预设区块拆为 `LayoutSettingsSection`（130）、`ColorSettingsSection`（58）、`PresetSettingsSection`（127）。预设改名的状态只被该区块使用、区块始终挂载，因此随区块一起移入，状态生命周期不变；其余两个无状态。`LayoutEditor` 755 → 500；`App.tsx` 3148 → 3211（+63，低于白名单记录 3469） | `pnpm check`（74/74）、`pnpm build`；设置窗口检查待人工验收 |
| 2026-11-03 | 2.4（3/4，搬迁） | `f061c7f` | `LayoutSettingsSection`（137）、`ColorSettingsSection`（63）、`PresetSettingsSection`（132）原样搬到 `features/appearance/`；`App.tsx` 3211 → 2892，白名单 3469 → 2892 | `pnpm check`（74/74）、`pnpm build` |
| 2026-11-03 | 2.4（4/4，CSS 搬迁） | `b035d02` | `App.css` 1748 → 1526（-222），白名单同步下调；新增 `AppearanceModeControl.css`（60，字体切换也复用这些 class）、`ColorSettingsSection.css`（5）、`PresetSettingsSection.css`（154）。打包产物级检查：677 条规则不变，无冲突 | `pnpm check`（74/74）、`pnpm build`；设置窗口检查待人工验收 |
| 2026-11-03 | 2.4a（1/n，搬迁） | `15e2b50` | `LocaleControl` 原样搬到 `i18n/LocaleControl.tsx`；`App.tsx` 2892 → 2859（白名单暂不下调，为后续原地拆分留出余量） | `pnpm check`（74/74）、`pnpm build` |
| 2026-11-03 | 2.4a（2/n，改写） | `cffa604` | 在 `App.tsx` 中拆出 `TodoSettingsSection`（无状态）和 `SavePathSettingsSection`（保存路径面板与输入框的 ref、"高亮保存路径"的滚动聚焦 effect 一并移入；区块始终挂载，行为不变）。`LayoutEditor` 500 → 401；`App.tsx` 2859 → 2890（低于白名单记录 2892） | `pnpm check`（74/74）、`pnpm build` |
| 2026-11-03 | 2.4a（3/n，搬迁） | `93250ce` | `TodoSettingsSection`（47）原样搬到 `features/appearance/`，`SavePathSettingsSection`（91）原样搬到 `features/todos/`；`App.tsx` 2890 → 2761（白名单暂不下调） | `pnpm check`（74/74）、`pnpm build` |
| 2026-11-03 | 2.4a（4/n，改写） | `548e7d1` | 在 `App.tsx` 中拆出 `ClipboardSettingsSection`（142），快捷键录制状态、两个 ref、"聚焦快捷键"的 effect 和按键处理一并移入；区块始终挂载，行为不变。`LayoutEditor` 401 → 276；`App.tsx` 2761 → 2779 | `pnpm check`（74/74）、`pnpm build` |
| 2026-11-03 | 2.4a（5/n，搬迁） | `0099449` | `ClipboardSettingsSection`（150）原样搬到 `features/clipboard/`；`App.tsx` 2779 → 2633，白名单 2892 → 2633 | `pnpm check`（74/74）、`pnpm build` |
| 2026-11-03 | 2.4a（6/6，CSS 搬迁） | `afdac27` | `App.css` 1526 → 1311（-215），白名单同步下调；新增 `i18n/LocaleControl.css`、`features/clipboard/ClipboardSettingsSection.css`、`features/todos/SavePathSettingsSection.css`。多个组件共用的 `.save-check-icon` 和保存动画关键帧留在 `App.css`（4.1 处理）。打包产物级检查：677 条规则不变，无冲突 | `pnpm check`（74/74）、`pnpm build`；设置窗口检查待人工验收 |
| 2026-11-03 | 2.5（1/5，搬迁） | `786329c` | `App.tsx` 2633 → 2532（-101，白名单暂不下调）；新增 `features/agent-status/api.ts`（与 Rust 对应的类型）、`status.ts`（默认值、提供方列表与标签、视觉状态与标签函数）和 `tests/agent-status.test.mjs`（4 个用例）；`SettingsWindow.tsx` 改为直接从 `features/agent-status` 导入 | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.5（2/5，改写） | `a85d047` | 在 `App.tsx` 中拆出 `AgentHooksSettingsSection`（113，无状态），只被该区块使用的 `agentStatusRows`、`agentStatusLabel` 计算一并移入。`LayoutEditor` 276 → 185；`App.tsx` 2532 → 2555（低于白名单记录 2633） | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.5（3/5，搬迁） | `cc43c85` | `AgentHooksSettingsSection`（118）原样搬到 `features/agent-status/`；`App.tsx` 2555 → 2440，白名单 2633 → 2440 | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.5（4/5，改写） | `ce5f912` | `features/agent-status/api.ts` 新增 `getAgentStatus`、`clearAgentProviderStatus`（避免与 `SettingsWindow` 中的同名回调冲突）、`installAgentStatusHooks`；`App.tsx`、`SettingsWindow.tsx` 改为调用封装，命令名和参数名不变；`App.tsx` 行数不变 | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.5（5/5，CSS 搬迁） | `1a29029` | `App.css` 1311 → 1120（-191），白名单同步下调；新增 `AgentHooksSettingsSection.css`（190）。主窗口上的 `.island__pulse--agent-*`、`.island__agent-status-icon*` 属于岛屿外壳，留在 `App.css`。打包产物级检查：677 条规则不变，无冲突 | `pnpm check`（78/78）、`pnpm build`；设置窗口检查待人工验收 |
| 2026-11-03 | 2.6（1/n，搬迁） | `c39a2da` | 邮件类型原样搬到 `features/messages/qq-mail/api.ts`，两个存储 key、`MailSettings` 与读写函数搬到 `qq-mail/storage.ts`；`QQMail.tsx` 暂留原位，404 → 360，**从白名单中删除**；`tests/mail-reader.tsx`、`tests/collapsed-message-animation.tsx` 的类型导入同步更新。先做这一步是因为 `QQMail.tsx` 在超限状态下无法改路径（白名单不允许新增条目） | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.6（2/n，搬迁） | `404f6fe` | `Messages`、`MessageSourceIcon`、`CollapsedMessageContent`、`messagePreview.ts`、`qqNotificationTiming.ts` 用 `git mv` 迁入 `features/messages/`，`QQMail`、`QQNotifications`、`WeChatReminders`（含 CSS）分别迁入 `qq-mail/`、`qq-notifications/`、`wechat/`；只改相对导入路径（含 `tests/` 中 5 个文件和 `eslint.config.js` 的存量 IPC 文件列表），组件导入顺序不变，CSS 打包顺序不变 | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.6（3/n，搬迁） | `3374ece` | `QQNotifications`、`WeChatReminders` 的类型原样搬到各自目录的 `api.ts`，存储 key 常量原样搬到各自的 `storage.ts`；组件文件 -24 / -13 行 | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.6（4/n，改写） | `63f8b1a` | 三个消息来源的 `invoke` / `listen` 收口到各自的 `api.ts`（含事件名常量），`localStorage` 读写收口到各自的 `storage.ts`（读写语义不变，未增减异常处理）；命令名、参数名、事件名、key 不变。打开 QQ / 微信的封装命名为 `launchQQ`、`launchWeChat`，避免与 hook 中同名回调冲突。`eslint.config.js` 的存量 IPC 文件列表移除这三个文件，ESLint warn 17 → 11 | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.7（1/3，搬迁） | `daf73ba` | `UpdatePanel.tsx/.css`、`updaterController.ts` 用 `git mv` 迁入 `features/updater/`，只改导入路径（含 `tests/updater-controller.test.mjs` 的源码路径和 `eslint.config.js` 的存量 IPC 文件列表） | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.7（2/3，改写） | `154082e` | 新增 `features/updater/api.ts`（`isUpdaterConfigured`、`getUpdaterProxy`），`updaterController.ts` 改为调用封装；`tests/updater-controller.test.mjs` 的 mock 表增加 `./api`，并让 `api.ts` 在同一个 core mock 上运行，命令名仍被测试覆盖；`updaterController.ts` 移出存量 IPC 文件列表，ESLint warn 11 → 10 | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.7（3/3，拆分） | `497943a` | 项目链接区块（含打开链接失败的状态与处理函数）直接拆到 `features/updater/ProjectSettingsSection.tsx`（54），作为一个零行为变化的拆分提交（根目录规则允许"只移动或拆分代码"）；超过 400 行组件的三步流程不适用于这个小区块，且原地拆分会让 `App.tsx` 超出白名单 5 行。`App.tsx` 2440 → 2395，白名单同步下调 | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.7（CSS 搬迁） | `5cb8545` | `App.css` 1120 → 1045（-75），白名单同步下调；`.project-link` 卡片样式移到 `ProjectSettingsSection.css`（`UpdatePanel` 只在该区块内渲染并复用这些 class，CSS 仍在 `UpdatePanel.css` 之后加载）。打包产物级检查：677 条规则不变，无冲突 | `pnpm check`（78/78）、`pnpm build`；设置窗口检查待人工验收 |
| 2026-11-03 | 2.8（1/4，搬迁） | `05d0c6d` | `LayoutEditor` 外壳（144）原样搬到 `windows/settings/LayoutEditor.tsx`，设置区块跳转 key 与 `SettingsFocusSection` 搬到 `windows/settings/storage.ts`，`openSettingsWindow` 搬到 `windows/settings/api.ts`；`App.tsx` 不再导出任何东西给设置窗口（只剩默认导出 `App`），`SettingsWindow.tsx` 改为从 `windows/settings` 导入。`App.tsx` 2395 → 2212，白名单同步下调 | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.8（2/4，搬迁） | `f6bdc1c` | `SettingsWindow.tsx/.css` 用 `git mv` 迁入 `windows/settings/`，`TranslationWindow.tsx/.css` 迁入 `windows/translation/`；只改导入路径（`main.tsx`、`tests/i18n.tsx`、`eslint.config.js` 的存量 IPC 文件列表），`main.tsx` 的导入顺序不变 | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.8（3/4，搬迁） | `0a5f8c3` | 翻译窗口的设置类型、存储 key、默认值和 `loadSettings` 原样搬到 `windows/translation/storage.ts`；`TranslationWindow.tsx` 286 → 269 | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.8（3b，搬迁） | `38c6c1a` | `takeFocusRequest` 与 `FOCUS_REQUEST_MAX_AGE_MS` 从 `SettingsWindow.tsx` 原样搬到 `windows/settings/storage.ts` | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.8（3c，改写） | `911dc62` | 新增 `windows/translation/api.ts`（8 个命令封装、事件名常量和 `listen` 封装）、`windows/settings/api.ts` 的 `readLaunchAtStartup` / `saveLaunchAtStartup`（避免与 `useState` 的 `setLaunchAtStartup` 同名）；`localStorage` 写入改用 `saveTranslationSettings`、`requestSettingsFocus`、`features/appearance/storage.ts` 的 `saveSettings` / `saveSettingPresets`、`features/todos/storage.ts` 的 `saveSaveDirectory`（写入内容与时机不变）。存量 IPC 文件列表只剩 `App.tsx`，ESLint warn 10 → 7 | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | 2.8（4/4，CSS 搬迁） | `ebe8c1e` | `App.css` 1045 → 912（-133），白名单同步下调；设置页外壳样式（`.editor-panel`、`.settings-section*`、`.reset-button`）移到 `windows/settings/LayoutEditor.css`，在各区块样式之后加载。事后补查：`05d0c6d` 把 `LayoutEditor` 移出 `App.tsx` 后，各设置区块的 CSS 改由设置窗口引入、排到 `App.css` 之后；打包产物级检查改为比较属性值后，对比 2.1 之前的产物，顺序变化的 61351 对规则中没有值不同的冲突（检查到的 2 对都是减少动效模式下的 `transition: none`） | `pnpm check`（78/78）、`pnpm build`；设置窗口检查待人工验收 |
| 2026-11-03 | 2.8（具名导出） | `64ca203` | `SettingsWindow`、`TranslationWindow` 改为具名导出（src/AGENTS.md 要求迁移时一并改），同步 `main.tsx`、`tests/i18n.tsx`；`App` 的默认导出在 3.3 处理 | `pnpm check`（78/78）、`pnpm build` |
| 2026-11-03 | Phase 2 验收 | — | `App.tsx` 5644 → 2212（-3432，阶段目标 -600 已达成），`App.css` 3865 → 912，`QQMail.tsx` 移出白名单；存量 IPC 文件只剩 `App.tsx`；ESLint 0 error / 7 warn | `pnpm check`（78/78）、`pnpm build`；各面板与回归页检查见"待人工验收" |
| 2026-11-03 | 3.1（1/2，搬迁） | `151157c` | `IslandMode`、`IslandPage`、`NativeGlassState` 搬到 `windows/island/types.ts`，位置存储 key、`IslandPosition`、`loadIslandPosition` 搬到 `storage.ts`，尺寸常量与 `getCollapsedIslandWidth`、`getTodoVisualRows` 搬到 `layout.ts`；新增 `tests/island-window.test.mjs`（3 个用例）。`App.tsx` 2212 → 2142，白名单同步下调 | `pnpm check`（81/81）、`pnpm build` |
| 2026-11-03 | 3.1（2/2，改写） | `d2b7ab0` | 原生窗口同步抽到 `useIslandWindow`（组合）、`useNativeLayout`（缩放与边距，每帧至多一次）、`useIslandPosition`（拖拽位置）。命令收口到 `windows/island/api.ts`，位置写入收口到 `storage.ts` 的 `saveIslandPosition` / `clearIslandPosition`（仍直接读写 `localStorage`，内容与时机不变），翻译窗口开关收口到 `windows/translation/api.ts`。展开高度仍由 `IslandApp` 计算后传入；贴边收起的 mode 状态留在 `IslandApp`。`App.tsx` 2142 → 1907，白名单同步下调。存量 IPC 豁免清空，ESLint warn 7 → 5：少掉的是 `App.tsx` 的 `invoke` / `listen`，5 条 exhaustive-deps 原样保留（2 条随代码移到新 hook）。外部 ref 与 setter 补进依赖数组，引用稳定，回调重建时机不变 | `pnpm check`（81/81）、`pnpm build`；拖拽、重置位置与失焦折叠待人工验收 |
| 2026-11-03 | 3.2（1/n，改写） | `0a04afc` | 代理状态的 state、刷新锁、200ms 轮询原样抽到 `features/agent-status/useAgentStatus.ts`（47），比较逻辑与轮询间隔不变；`App.tsx` 1907 → 1870，白名单同步下调 | `pnpm check`（81/81）、`pnpm build` |
| 2026-11-03 | 3.2（2/n，改写） | 4a32ef7 | 剪贴板历史的 state、6 个操作回调、变更与快捷键两个监听原样抽到 `features/clipboard/useClipboardHistory.ts`（127）。快捷键触发时要开关页面，属于窗口行为，`toggleClipboardHistory` 留在 `IslandApp`，作为 `onShortcut` 传入，监听的依赖与重订阅时机不变；窗口内 keydown 匹配快捷键的 effect 也留在 `IslandApp`。`App.tsx` 1870 → 1767，白名单同步下调 | `pnpm check`（81/81）、`pnpm build`；剪贴板页与快捷键待人工验收（同 2.3 的检查项） |
| 2026-11-03 | 3.2（3/n，改写） | 9a95e2b | 媒体会话 state、命令执行、1500ms 轮询、控制目标选择抽到 `features/media/useMediaState.ts`（216，超过 150 行软上限，后续评估是否把命令执行再拆出）；500ms 音量电平轮询抽到 `useAudioLevel.ts`（93），音源优先级与持久化抽到 `useMusicSourcePriority.ts`（68）；`AUDIO_ACTIVE_THRESHOLD` 移到 `mediaState.ts`，localStorage 写入移到 `storage.ts` 的 `saveMusicSourcePriority`（key 与格式不变）。音量 effect 依赖补上稳定的 ref 与 setter，行为不变。音量"叶子组件"暂缓：电平与 `refreshMediaState` 的峰值衰减、播放意图耦合。`musicSettingsOpen` 留在 `IslandApp`。`App.tsx` 1767 → 1434，白名单同步下调 | `pnpm check`（81/81）、`pnpm build`；音乐面板、波形、音源排序待人工验收 |
| 2026-11-03 | 3.2（4/n，改写） | 27af68c | 待办相关的 11 个 state、全部回调与 effect 抽到 `features/todos`：`useTodos.ts`（139，编排，并返回 `TodoNotebook` 的 props）、`useTodoList.ts`（132）、`useTodoArchives.ts`（40）、`useTodoSaving.ts`（120）、`useTodoSaveDirectory.ts`（80）、`useTodoAutoSave.ts`（93）、`useTodoRollover.ts`（112）。直接的 localStorage 读写改为 `storage.ts` 中的同名 key 包装函数，key 与格式不变。为保持 feature 不依赖 windows，"缺少保存路径时打开设置"与"开始待办后折叠"改为由 `IslandApp` 注入的回调；`setIslandMode`、`collapseIsland` 上移到 `useTodos` 调用之前。设置窗口的 storage 监听拆成两个（外观设置留在 `IslandApp`，保存路径进 `useTodoSaveDirectory`），卸载时的计时器清理也随之拆分；各 effect 彼此独立，顺序变化不影响结果。`App.tsx` 1434 → 913，白名单同步下调 | `pnpm check`（81/81）、`pnpm build`；待办增删改、拖动排序、开始待办后折叠、手动保存与无路径提示、自动保存、跨日归档与结转待人工验收 |
| 2026-11-03 | 3.3（1/n，改写） | 19b2329 | 迁移前先把 `IslandApp` 压到组件上限内：外观设置的 state、持久化与跨窗口同步抽到 `features/appearance/useIslandSettings.ts`（30，改用已有的 `saveSettings`）；mode / 贴边 / 当前页与剪贴板开关抽到 `windows/island/useIslandNavigation.ts`（67）；窗口内快捷键抽到 `useIslandKeyboard.ts`（35）；折叠态待办标题、计数与宽度抽到 `useCollapsedTodo.ts`（52）；展开高度与舞台 CSS 变量改为纯函数 `expandedHeight.ts`（51）、`stageStyle.ts`（51）。舞台样式的 memo 依赖由逐个设置字段改为整个 `settings`，其他设置变化时会重新计算出相同的值，渲染结果不变。`IslandApp` 194 行，直接 `useState` 2 个；`App.tsx` 913 → 747，白名单同步下调 | `pnpm check`（81/81）、`pnpm build`；折叠 / 展开 / 贴边、页面切换、Esc 与剪贴板快捷键、外观设置同步待人工验收 |
| 2026-11-03 | 3.3（2/n，搬迁）、3.4 | 9fb51f2 | `IslandApp` 原样搬到 `windows/island/IslandApp.tsx`（具名导出），`App` 包装去掉，`main.tsx` 与 `tests/i18n.tsx` 直接渲染 `IslandApp`。`IslandShell`（约 490 行）拆分搬到 `IslandShell.tsx`，折叠条与展开态页头拆成 `IslandCollapsedBar.tsx`、`IslandHeader.tsx`，毛玻璃指针、首帧预热、窗口拖拽手势拆成 `useGlassPointer.ts`、`useIslandPreparing.ts`、`useWindowDragGesture.ts`；JSX 与逻辑逐行一致（去空白比对），DOM 结构与 class 名不变。`useIslandAutomation.ts` 移到 `windows/island/`，同步测试路径。CSS 顺序：`App.css` 仍是最后一个导入；`IslandShell` 在页面面板之后导入，只有 `CollapsedMessageContent.css` 的位置后移，它与之后的样式没有共用选择器。回归页 `collapsed-message-animation.tsx` 先以副作用方式导入 `IslandApp`，保持原来的样式集合与顺序。删除 `src/App.tsx` 及其白名单条目 | `pnpm check`（81/81）、`pnpm build`；构建产物 CSS 与上一提交逐条规则比对：规则集合相同，仅 `CollapsedMessageContent.css` 的 21 条规则位置后移。回归页 `collapsed-message-animation.html?test=1` 24/24 通过；`i18n.html?test=1` 存量失败（见“待处理问题”3.3），临时补齐 mock 后确认 `IslandApp` 正常渲染（折叠条、页头 9 个按钮、舞台 CSS 变量），mock 改动未提交。折叠条点击 / 拖动、毛玻璃指针高光、首次展开待人工验收 |
| 2026-11-03 | Phase 3 验收 | 见提交说明 | 自动检查部分达标（数据见 Phase 3 验收说明）；ESLint 仍为 5 条存量 warning，位置随搬迁变为 `IslandApp.tsx`、`QQMail.tsx`、`useIslandWindow.ts`、`useNativeLayout.ts`、`TranslationWindow.tsx` | `pnpm check`（81/81）、`pnpm build`；`pnpm tauri dev` 手动检查待人工验收 |
| 2026-11-03 | 4.1、4.3（搬迁） | `2d82e1f` | `App.css` 912 → 0（删除），白名单条目删除。按行号原样切分：`windows/island/IslandShell.css`（329，外壳、毛玻璃、折叠 / 展开容器）、`IslandCollapsedBar.css`（128）、`IslandHeader.css`（154，页头、页面圆点、窗口按钮）由各组件自己导入；`features/messages/MessageSourceIcon.css`（9）；跨领域规则（`.stage` 与像素字体覆盖、`.icon-button` 一族、液态玻璃面板背景、`save-check-icon`、减少动效大列表）放到 `IslandApp.css`（258），仍是 `IslandApp` 的最后一个导入；未使用的 `.clipboard-settings-panel`、`.color-panel` 追加到 `ClipboardSettingsSection.css`、`ColorSettingsSection.css`。`tests/mail-reader.tsx` 改为导入 `IslandApp.css`。class 名不变 | `pnpm check`（81/81，ESLint 0 error / 5 warn 不变，行数检查 0 错误）、`pnpm build`；构建产物 CSS 与上一提交逐条规则比对：规则集合相同（694 条），615 条位置变化；顺序翻转且同名属性值不同的规则对中，特异性不同的由特异性决定，特异性相同的 444 对（466 组选择器）按 JSX className 共现分析均不会命中同一元素（过滤器先用 14 组已知共现 class 校验）。回归页 `collapsed-message-animation.html?test=1` 24/24、`mail-reader.html?run=1` 33 项全部通过 |
| 2026-11-03 | 4.2（改写） | `39afbc3` | 新增 `styles/tokens.css`（49 行，35 个变量：颜色 24、圆角 5、间距 6），由 `main.tsx` 最先导入，4 个回归页同步导入；37 个 CSS 文件中 371 处数值完全相同的字面量改为 `var(--…)`，各文件行数不变 | `pnpm check`（81/81，ESLint 0 error / 5 warn 不变，行数检查 0 错误）、`pnpm build`；构建产物与上一提交（worktree 构建）比对：把 `var()` 代回 token 值、两边颜色统一成 r,g,b,a（透明度按 1/255 量化）后，694 条规则集合与顺序完全一致；唯一的文本差异是 esbuild 对 `inset 0 1px 0 var(...)` 保留了值为 0 的模糊半径（字面量颜色时会省略），渲染等价。回归页 `collapsed-message-animation.html?test=1` 24/24、`mail-reader.html?run=1` 33 项通过，页面上 token 能解析出值 |
| 2026-11-03 | Phase 4 验收 | 见提交说明 | `App.css` 已删除；最大的 CSS 文件为 `MusicPlayerPanel.css`（392），全部不超过 500 行；白名单只剩 Rust 文件 | 三个窗口中英文截图对比待人工验收 |
| 2026-11-03 | 5.1（1/2，搬迁） | `4846273` | `lib.rs` 物理行 1970 → 1181，生产代码 1769 → 1133（白名单下调），内联测试 201 → 48（白名单条目删除）。拆到 `island/`：`state.rs`（130，状态类型、全局状态与访问函数、拖动位置记录）、`geometry.rs`（173，尺寸常量、定位与贴边动画）、`glass.rs`（54）、`passthrough.rs`（114）、`mod.rs`（6 个命令、`IslandLayout`、`WINDOW_LABEL`、`main_window` / `show_island` / `hide_island`）、`tests.rs`（9 个几何测试）。函数体不变，只调整可见性、`use` 和模块路径（`top_edge.rs` 改经 `super::` 访问）；命令名与参数不变，`generate_handler!` 改为 `island::` 路径。新旧代码去掉缩进、可见性和路径前缀后逐行比较，差异只有 `use` / `mod` 声明和模块文档注释 | `cargo test`（63 通过 / 5 忽略，与改动前相同）、clippy 84 条且各类数量不变（`lib.rs` 的 13 条中 10 条随代码移到 `island/`）、无新增 rustc 告警；`pnpm check`（81/81）、`pnpm build`；`pnpm tauri build --no-bundle` 成功，桌面快捷方式 `fly-island.lnk` 已核对指向本次产物 |
| 2026-11-03 | 5.1（2/2，格式化） | `3eca09a` | 只对 `island/` 运行 rustfmt（4 个文件 +66/-19，`tests.rs` 197 行），`lib.rs` 不动，5.3 后再格式化 | `cargo test`（63 / 5）、clippy 84 条、`pnpm check`（81/81）、`pnpm build`、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-03 | 5.2（1/2，搬迁） | `179b8ef` | `lib.rs` 生产代码 1133 → 451（低于 800，白名单条目删除）。拆到 `agent_status/`：`mod.rs`（3 个命令、`AgentHooksInstallResult`、钩子脚本常量与安装、`write_text_file`）、`snapshot.rs`（状态类型、快照归一化、毫秒时间戳）、`markers.rs`（运行标记与保持文件）、`codex_hooks.rs`、`claude_hooks.rs`。函数体不变；`include_str!` 路径因目录加深一层多一个 `../`，嵌入的仍是同一份脚本。`lib.rs` 测试模块去掉不再需要的 `use super::*`，自行导入 `json` / `Value`。去缩进、可见性与路径前缀后逐行比较，差异只有 `include_str!` 路径 | `cargo test`（63 / 5）、clippy 84 条且各类数量不变、无 rustc 告警；`pnpm check`（81/81）、`pnpm build`、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-03 | 5.2（2/2，格式化） | `4dc4908` | 只对 `agent_status/` 运行 rustfmt（4 个文件 +31/-8，合计 746 行） | 同上，桌面快捷方式已核对 |
| 2026-11-03 | 5.7（1/2，搬迁） | `c1a4730` | `media_control.rs`（829）拆为 `media_control/`：`mod.rs`（10 个命令，来自 `lib.rs`）、`service.rs`（状态类型与 5 个入口函数）、`session.rs`（会话查找、播放命令、元数据、封面缓存、COM 线程）、`audio.rs`（音量与电平），白名单条目删除；`lib.rs` 499 → 430。函数体不变，多余的 `use` 由 `cargo fix` 清理（当时没有其他 rustc 告警）；逐行比较的差异只有 `service::` 路径前缀 | `cargo test`（63 / 5）、clippy 84 条且各类数量不变；`pnpm check`（81/81）、`pnpm build`、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-03 | 5.7（2/2，格式化） | `829dd2c` | 对 `media_control/` 运行 rustfmt（4 个文件 +56/-43，最大 `session.rs` 639 行） | 同上，桌面快捷方式已核对 |
| 2026-11-03 | 5.3（1/2，搬迁） | `7ac01ed` | `lib.rs` 430 → 139。拆出 `system/startup.rs`（64）、`updater.rs`（128，含 3 个更新配置测试）、`todo_export.rs`（49）、`system/mod.rs`（`CREATE_NO_WINDOW`、`windows_home_dir`）和 `tray.rs`（52）。函数体不变；测试的 `include_str!` 路径多一层 `../`；`agent_status` 改为引用 `crate::system::windows_home_dir`；`lib.rs` 多余的 `use` 已清理。clippy 84 → 83（`items_after_test_module` 消失） | `cargo test`（63 / 5）、clippy 83 条；`pnpm check`（81/81）、`pnpm build`、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-03 | 5.3（2/2，格式化） | `bb66b4d` | `lib.rs`（141）单独格式化（见 5.3 说明），`system/`、`tray.rs` 用 rustfmt；改动 `lib.rs` 与 `updater.rs` 两个文件 | 同上，桌面快捷方式已核对 |
| 2026-11-03 | 5.4（1/2，搬迁） | `8008d5a` | `qq_mail.rs`（2162）按顶层块原样拆为 `qq_mail/`：`mod.rs`（301，类型、`init`、6 个命令）、`service.rs`（350，后台 worker 与状态）、`session.rs`（442，IMAP 连接、IDLE、收件箱同步、邮件头）、`content.rs`（393，正文与内嵌图片）、`credentials.rs`（39）、`tests.rs`（700，原内联测试）。两条白名单条目（生产 1465、测试 697）删除。函数体不变；子模块之间用 `use super::*`；`BoundedStream` 的元组字段改为 `pub(super)`（测试在 `tests.rs` 中构造它）；`tests.rs` 补上原来从模块根继承的 std / imap 导入。逐行比较无差异 | `cargo test`（63 / 5）、clippy 83 条；`pnpm check`（81/81）、`pnpm build`、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-03 | 5.4（2/2，格式化） | `a6e71dc` | 对 `qq_mail/` 运行 rustfmt（5 个文件 +61/-22，最大生产文件 `session.rs` 449 行） | 同上，桌面快捷方式已核对 |
| 2026-11-03 | 5.5（1/2，搬迁） | `2c12ab1` | `qq_notifications.rs`（1083）按顶层块原样拆为 `qq_notifications/`：`mod.rs`（259，类型、服务状态、`init`、7 个命令、诊断、`publish`）、`listener.rs`（287，WinRT 监听与注册修复）、`history.rs`（37，通知缓冲）、`launcher.rs`（252，QQ 窗口查找与激活）、`tests.rs`（304）。测试白名单条目删除。函数体不变；修复脚本的 `include_str!` 多一层 `../`；`tests.rs` 补上原模块根的导入。逐行比较只有该路径差异 | `cargo test`（63 / 5）、clippy 83 条；`pnpm check`（81/81）、`pnpm build`、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-03 | 5.5（2/2，格式化） | `ef6b311` | 对 `qq_notifications/` 运行 rustfmt（4 个文件 +21/-21） | 同上，桌面快捷方式已核对 |
| 2026-11-03 | 5.6（1/2，搬迁） | `a729752` | `clipboard_history.rs`（1068）按顶层块原样拆为 `clipboard_history/`：`mod.rs`（235，类型、服务状态、7 个命令、`init`）、`service.rs`（589，服务实现、剪贴板读写、监听窗口）、`store.rs`（99，历史文件、PNG 与缩略图）、`hotkey.rs`（211，快捷键解析与注册）。最后一条生产代码白名单条目删除，白名单清空。`mod.rs` 重新导出 `parse_shortcut_binding`，`translation.rs` 的导入路径不变。逐行比较无差异 | `cargo test`（63 / 5）、clippy 83 条；`pnpm check`（81/81）、`pnpm build`、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-03 | 5.6（2/2，格式化） | `9b7393f` | 对 `clipboard_history/` 运行 rustfmt（4 个文件 +28/-28） | 同上，桌面快捷方式已核对 |
| 2026-11-03 | 5.8（1/2，搬迁） | `f290a34` | `wechat_reminders.rs` → `wechat_reminders/mod.rs`（409），`wechat_reminder_source.rs` → `source.rs`（248，原样 `git mv`），内联测试 → `tests.rs`（140）。`mod.rs` 改从子模块 `source` 导入，`lib.rs` 去掉 `mod wechat_reminder_source`，示例程序的 `#[path]` 同步更新 | `cargo test`（63 / 5）、clippy 83 条（含示例）、`cargo build --all-targets`；`pnpm check`（81/81）、`pnpm build`、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-03 | 5.8（2/2，格式化） | `53e9de3` | rustfmt 只改 2 行（导入顺序、测试中一处换行） | 同上，桌面快捷方式已核对 |
| 2026-11-03 | Phase 5 验收 | 见提交说明 | `lib.rs` 141 行，只剩 `mod` 声明与 `run()`；Rust 文件全部满足 800 / 150 上限，白名单 `lines` 与 `inlineTests` 已清空；`cargo test` 63 通过 / 5 忽略（与 Phase 5 前相同）；clippy 84 → 83（`items_after_test_module` 消失），按位置：`qq_notifications/` 18、`examples/` 15、`wechat_reminders/` 11、`island/` 10、`translation.rs` 8、`media_control/` 8、`clipboard_history/` 7、`messenger_activation.rs` 3、`lib.rs` 2、`qq_mail/` 1。每一步都执行了 `pnpm tauri build --no-bundle` 并同步桌面快捷方式 | 涉及窗口与系统集成的手动检查见"待人工验收" 5.1–5.8 |
| 2026-11-03 | 6.1（1/n，改写） | `1fcfa89` | 新增 `win32/mod.rs`、`win32/registry.rs`（`read_string`：仅 `REG_SZ`、2048 单元缓冲、任何错误视为不存在，与原实现一致；参数为 `&str`，内部构造宽字符串）。QQ `DisplayIcon` 与微信 `InstallPath` 两处查询改用它；示例程序同步引入 `registry.rs`。新增 2 个测试 | `cargo test` 63 → 65、clippy 83 → 80（少 3 条未注释的 `unsafe` 块）、`cargo build --all-targets`；`pnpm check`（81/81）、`pnpm build`、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-03 | 6.1（2/n，改写） | `a918a97` | 新增 `win32/process.rs`（`window_process_id`、`image_path`，`ProcessHandle` 在 `Drop` 中关闭句柄）。QQ 窗口枚举与微信窗口匹配改用它，失败路径与原来一致（打不开进程或读不到路径都跳过 / 返回 `Err(())`）；示例程序同步引入。新增 2 个测试 | `cargo test` 65 → 67、clippy 80（原调用在 `unsafe fn` 内，不计为 `unsafe` 块）；`pnpm check`（81/81）、`pnpm build`、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-03 | 0.3、7.2 | `14eff59` 等 | 5 处 `exhaustive-deps` 警告逐个分析，均为有意省略或误报（结论见"待处理问题" 0.3）；2 处改为等价写法，3 处注释并就地禁用；`exhaustive-deps` 由 warn 升级为 error | `pnpm check`（82/82，ESLint 0 / 0）、`pnpm build`；回归页 collapsed 24/24、i18n 16/16、mail-reader 33/33 |
| 2026-11-04 | 6.1（3/n，改写） | 见提交说明 | 新增 `win32/window.rs`（5 个封装 + 1 个测试），`win32/input.rs` 新增 `is_left_button_down`（与原 `GetAsyncKeyState(VK_LBUTTON) < 0` 相同）。失败分支逐一对齐：取不到窗口矩形或光标位置仍视为"在岛屿内"；`SetWindowRgn` 返回 0 仍报同样的错误；可交互判断的短路顺序与 250ms 超时不变；前台切换仍先比较当前前台窗口。生产代码中 `island/`、`messenger_activation.rs` 不再含 `unsafe`（`messenger_activation.rs` 测试模块中的仍保留） | `cargo test`（84 通过 / 5 忽略）、clippy 79 → 73（基线按当前 HEAD 重新统计）；`pnpm check`（100/100）、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-04 | 6.1（4/n，改写） | 见提交说明 | 新增 `win32/com.rs`（`ComApartment`、`WinRtApartment` 与 1 个测试）。媒体线程改为持有 `ComApartment`：初始化失败仍返回同一条错误、不调用反初始化；成功时反初始化仍在 `operation()` 返回之后、结果移出线程之前。唯一差异是 `operation()` panic 时现在也会反初始化（线程随即结束，`join` 仍报同一条错误）。通知监听删除 `WinRT` 守卫，两处改用 `WinRtApartment`，错误文案与 `?` 传播不变 | `cargo test`（101 通过 / 5 忽略，含另一会话新增的测试）、clippy 73 → 68（改用 JSON 输出按位置去重统计）；`pnpm check`（109/109）、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-04 | 6.2（1/n，改写） | 见提交说明 | 新增 `win32/audio.rs`，`media_control/audio.rs` 不再含 `unsafe`：三个函数的阶段顺序、`ok()?` / 错误文案、音量钳制与"至少找到一个电平表"的判断逐一对应原代码。`send_media_key` 改用 `win32::input`，键码截断为 `u8` 与 80ms 间隔不变。`media_control/` 生产代码中已无 `unsafe` | `cargo test`（101 / 5）、clippy 68 → 63；`pnpm tauri build --no-bundle`，桌面快捷方式已核对。`pnpm check` 当时因另一会话进行中的前端改动（回归页缺少 `agentSession` 属性）失败，与本次 Rust 改动无关 |
| 2026-11-04 | 6.2（2/n，改写） | 见提交说明 | QQ 窗口查找：回调体逐行对应原代码（标题缓冲 32、类名缓冲 256、托盘宿主窗口优先记录、标题 / 类名 / 所有者 / 还原位置四个条件的短路顺序、500×300 阈值），枚举失败的错误文案不变；托盘图标 id 查找的嵌套 `if` 合并为 `&&`，只在图标存在时记录 id，与原来相同；托盘点击仍按相同的消息、参数、标志和 1 秒超时发送。`qq_notifications/` 生产代码中已无 `unsafe` | `cargo test`（102 / 5）、clippy 63 → 56；`pnpm check`（114/114）、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-04 | 6.2（3/n，改写） | 见提交说明 | 剪贴板监听：类名、窗口标题、仅消息窗口的样式与父窗口不变；取模块句柄、建窗、加监听失败仍返回 `error.to_string()`，注册类失败仍返回原来的固定文案；监听窗口句柄的保存、首次注册快捷键、消息循环（`GetMessageW` 返回 -1 时继续循环，与原写法相同）和退出时的注销顺序不变。窗口过程的三个分支和返回值逐一对应，未处理的消息仍交给 `DefWindowProcW`。快捷键注册的修饰键、`MOD_NOREPEAT`、失败日志不变 | `cargo test`（111 / 5）、clippy 56 → 51；`pnpm check`（115/115）、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-04 | 6.2（4/n，改写） | 见提交说明 | 翻译快捷键窗口：与剪贴板相同的对齐方式（类名、标题、仅消息窗口、错误文案、消息循环、退出时注销）；`CHANGE_HOTKEY_MESSAGE` 投递失败仍清空待处理绑定并返回同一文案；窗口过程中先注销旧快捷键、注册新快捷键、失败时恢复旧绑定的顺序不变。首次定位窗口仍只在前台窗口非空且能取到矩形时用它的中心点 | `cargo test`（115 / 5）、clippy 51 → 44；`pnpm check`（118/118）、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-04 | 6.2（5/5，改写） | 见提交说明 | 微信窗口查找：打不开进程或读不到路径仍跳过该窗口；路径比较、标题缓冲 32 与三个候选标题、500×300 判断不变；启动时间读不到仍记为 `u64::MAX`。差异：原代码用同一个进程句柄先读路径再读启动时间，现在 `image_path` 与 `start_time` 各自打开一次（进程在两次打开之间退出时启动时间记为 `u64::MAX`，只影响多个微信实例之间的排序）。提醒监听：注册 `SHELLHOOK`、取模块句柄、注册类、建窗失败的文案与清理不变，建窗失败仍注销类；监听对象仍在注册 shell hook 之前构造，失败时由 `Drop` 清理；窗口过程处理后仍总是调用 `DefWindowProcW`；`Drop` 的注销、销毁、注销类、清空上下文顺序不变。`tests.rs` 补上原来经 `use super::*` 得到的两个导入，测试函数未改 | `cargo test`（117 / 5）、`cargo build --all-targets`（示例无新增告警）、clippy 44 → 34；`pnpm check`（118/118）、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-04 | 6.3（1/n） | 见提交说明 | 生产代码中的 4 处 `expect` 处理完毕（见 6.3 说明）。行为差异只在失败路径：窗口状态锁中毒后不再 panic，而是继续使用锁内的值；默认快捷键（`Ctrl+X`）由测试保证可解析，正常路径不变 | `cargo test`（122 / 5）、clippy 34 → 30；`pnpm tauri build --no-bundle`，桌面快捷方式已核对。`pnpm check` 当时因另一会话进行中的前端改动（回归页 `AgentSession` 类型）失败，与本次 Rust 改动无关 |
| 2026-11-04 | 6.3（2/n） | 见提交说明 | 22 处测试与示例中的 `unsafe` 块补上 `// SAFETY:` 注释，代码不变 | `cargo test`（122 / 5）、`cargo build --all-targets`、clippy 30 → 8（剩下的都不是 Phase 0 的三条 lint）；`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |
| 2026-11-04 | 6.3（3/n） | 见提交说明 | 清掉其余 8 条 clippy 告警：`PersistedClipboardHistory` 改为 derive `Default`（字段默认值相同）；鼠标穿透循环的嵌套 `if` 合并为 `&&`（仍只在状态需要变化时调用）；`lib.rs` 去掉多余的 `return`；缩略图缓存与待处理快捷键的类型提取为类型别名；`responses_for_message` 省略生命周期；`set_island_interaction`（参数即 IPC 契约，不能改）与 `point_in_notch` 用带理由的 `#[expect(clippy::too_many_arguments)]`。另外 `run()` 的启动失败由 `expect` 改为打印错误后 `exit(1)`，只影响失败路径 | `cargo test`（123 / 6，含另一会话新增）、clippy 8 → 0；`pnpm check`（120/120）、`pnpm tauri build --no-bundle`，桌面快捷方式已核对 |

## 待人工验收

无法在本地自动验证的检查。完成后在行首标注结果和日期。

| 提交 | 步骤 | 检查项 |
|---|---|---|
| `2e71e5c` | 0.7 | 推送后在 GitHub Actions 中确认 `CI` 工作流在 `windows-latest` 上全部通过（本地无法运行；按规则不执行 `git push`）。 |
| `5d17988` | 1.3 | 在设置窗口（中英文）对比滑块、颜色、开关、数字输入四种控件的外观与交互（拖动、选色、切换、焦点框），应与迁移前一致。 |
| `bc7cccd` | 1.4 | 三个窗口（主窗口、设置、翻译）在中英文下检查像素字体（`Fusion Pixel`）仍能加载、键盘 Tab 与鼠标点击下的按钮焦点框表现与迁移前一致。 |
| `1597286` | 2.1 | 主窗口待办面板（中英文、经典/液态玻璃两种外观）：新增、勾选、编辑标题（Enter / Esc / 失焦）、开始/停止、删除、拖拽排序、每日笔记、保存到 Markdown（含未设置路径时跳转设置）、归档卡片与时间线两种布局及回看；样式与迁移前一致，刷新后数据保留。可在 `pnpm dev` 中打开 `/tests/i18n.html` 辅助检查。 |
| `4dbdaa6` | 2.2 | 音乐页（中英文、两种外观）：折叠态音乐波形按钮的动画和点击、播放/暂停/上一首/下一首、切歌动画、封面与曲目信息、错误提示、音乐来源设置中的拖拽排序和删除、刷新后来源顺序保留；有音频时波形随音量跳动。 |
| `5592ae5` | 2.3 | 剪贴板页（中英文、两种外观）：列表与搜索、全部/收藏切换、复制回剪贴板及"已复制"状态、收藏、备注编辑（Enter 保存、Esc 取消）、删除与清空的二次确认（3 秒自动取消、点击其他位置取消）、列表重排动画、图片缩略图；快捷键显示与按快捷键展开；设置窗口中修改剪贴板设置后主窗口同步。 |
| `b035d02` | 2.4 | 设置窗口（中英文）：外观模式与字体切换、毛玻璃强度、透明度、缩放、边距等滑块，开机自启与各开关，颜色选择与脉冲亮度；预设的保存、应用、改名（Enter / Esc / 失焦）、删除；修改后主窗口外观同步，重启后设置与预设保留。 |
| `afdac27` | 2.4a | 设置窗口（中英文）：语言切换；待办设置开关与轮播间隔；剪贴板设置（启用、截图、条数、快捷键开关、录制快捷键，Esc 取消录制）；保存路径的填写与保存（"已保存"状态）；从主窗口"未设置保存路径"跳转后滚动到保存路径并聚焦输入框；从主窗口跳转到剪贴板快捷键后自动进入录制。 |
| `1a29029` | 2.5 | 设置窗口（中英文）：AI 代理区块的安装钩子按钮（安装中、已安装、出错三种状态与脚本目录显示）、当前状态汇总、各提供方的阶段显示、失败或过期时的"清除状态"按钮；主窗口的代理状态脉冲点与图标随状态变化。 |
| `63f8b1a` 等 | 2.6 | 消息功能（中英文）：QQ 邮箱连接 / 断开 / 刷新 / 开关、重启后按保存的设置自动恢复、阅读邮件（远程图片开关及其偏好保留）、新邮件预览；QQ 通知开关、通知权限请求（只请求一次）、打开系统通知设置、清空、打开 QQ；微信提醒开关与打开微信；主窗口折叠态消息预览动画。可在 `pnpm dev` 中打开 `/tests/mail-reader.html`、`/tests/notification-startup.html`、`/tests/collapsed-message-animation.html` 辅助检查。 |
| `5cb8545` | 2.7 | 设置窗口（中英文）：检查更新的各状态（检查中、已是最新、有新版本、下载进度、安装中、出错与重试），离开再回到设置窗口后下载进度仍在；GitHub 项目链接在桌面端用系统浏览器打开，失败时显示提示。 |
| `ebe8c1e`、`64ca203` 等 | 2.8 | 设置窗口与翻译窗口（中英文）：设置窗口打开、各区块显示与滚动，重置按钮，开机自启的读取与切换（失败时回滚）；从主窗口"未设置保存路径"跳转后高亮保存路径；翻译窗口的打开（显示时清空并读取剪贴板）、翻译、方向切换、快捷键录制与注册、API 密钥保存与删除、复制结果、拖动与缩放、关闭，重启后翻译设置保留。可在 `pnpm dev` 中打开 `/tests/i18n.html` 辅助检查。 |
| `d2b7ab0` | 3.1 | 主窗口：拖拽后位置在重启后仍在、重置位置回到默认边距、展开后点击窗外自动折叠、首次启动会显示窗口、调节边距和缩放后原生窗口跟着变。 |
| `4a32ef7`、`9a95e2b` | 3.2 | 剪贴板页与快捷键（同 2.3 检查项）；音乐页（同 2.2 检查项），尤其是暂停后波形立即静止、切换音源后控制目标随优先级变化、刷新后音源顺序保留。 |
| `27af68c` | 3.2 | 待办（同 2.1 检查项），另查：开始待办后岛屿折叠并显示该待办；未设置保存路径时点保存会打开设置并定位到保存路径，设置窗口填好后主窗口的“需要路径”提示消失；编辑后约 0.7 秒自动保存；跨日（可改系统日期）时未保存内容进入归档、未完成待办按设置结转。 |
| `19b2329`、`9fb51f2` | 3.3 | `pnpm tauri dev` 主窗口（中英文、两种外观）：折叠 / 展开 / 贴边收起与悬停唤出、自动贴边、Esc 折叠、剪贴板快捷键开关剪贴板页、页面圆点切换、折叠条点击打开当前页与消息预览点击、从折叠条拖动窗口（拖动后不误触发点击）、页头设置 / 消息 / 翻译 / 重置位置 / 最小化到托盘、液态玻璃指针高光、首次展开无闪烁；设置窗口修改外观后主窗口同步。 |
| `2d82e1f` | 4.1 | `pnpm tauri dev` 主窗口（中英文、经典 / 液态玻璃、系统 / 像素字体）：折叠条（脉冲点、代理状态、品牌、当前待办、待办计数、静音按钮）、展开态页头（标题图标、页面圆点三种颜色与选中态、窗口按钮与重置位置高亮）、液态玻璃展开 / 收起光晕动画与 CSS 回退、贴边 / 分离圆角、各页面面板的玻璃背景、保存成功勾选动画、系统“减少动态效果”下无过渡；与 `47b9fe2` 截图对比无差异。 |
| `39afbc3` | 4.2 | 与 4.1 同一轮检查即可：主窗口、设置窗口、翻译窗口（中英文、经典 / 液态玻璃）与 `47b9fe2` 截图对比无差异，重点看焦点框颜色、圆角药丸按钮、待办纸张文字颜色、设置区块间距。这是 Phase 4 验收要求的截图对比。 |
| `4846273`、`3eca09a` | 5.1 | `pnpm tauri dev` 或桌面快捷方式启动：首次启动位置与显示、折叠 / 展开时原生窗口尺寸、贴边收起与唤出动画、拖动后松手的顶边吸附与位置保存、重置位置、窗口外点击穿透（折叠态与展开态、贴边与分离的圆角处）、液态玻璃开关、托盘显示 / 隐藏与单实例唤起。 |
| `179b8ef`、`4dc4908` | 5.2 | 设置窗口（中英文）：AI 代理区块安装钩子（脚本写入应用数据目录，`~/.codex/config.toml` 与 `~/.claude/settings.json` 中的托管块与原有内容保留），状态读取、运行中 / 过期显示、清除状态；主窗口代理状态随 Codex / Claude Code 实际运行变化。 |
| `c1a4730`、`829dd2c` | 5.7 | 音乐页（中英文）：多个播放器同时存在时的会话列表与控制目标、播放 / 暂停 / 上一首 / 下一首、随机与循环、拖动进度、音量调节、封面与曲目信息、有声音时波形跳动。 |
| `7ac01ed`、`bb66b4d` | 5.3 | 设置窗口：开机自启的读取与切换（注册表 `HKCU\…\Run` 的 `FocuSD Island` 值）、检查更新（含系统代理）；主窗口保存待办到 Markdown 与默认保存目录；托盘菜单的显示 / 隐藏 / 设置 / 退出与左键单击唤出。 |
| `8008d5a`、`a6e71dc` | 5.4 | QQ 邮箱（中英文）：连接（授权码写入凭据管理器）、开关、刷新、新邮件推送（IDLE）与 60 秒兜底刷新、阅读邮件（HTML / 纯文本、内嵌 cid 图片）、断开后凭据删除、重启后自动恢复。可在 `pnpm dev` 中打开 `/tests/mail-reader.html` 辅助检查前端部分。 |
| `2c12ab1`、`ef6b311` | 5.5 | QQ 通知（中英文）：开关、首次请求通知权限、打开系统通知设置、收到 QQ 消息后列表与折叠态预览更新、清空、打开 QQ（已运行时激活窗口，未运行时启动）、通知注册损坏时的自动修复、设置窗口的通知诊断。 |
| `a729752`、`9b7393f` | 5.6 | 剪贴板（同 2.3 检查项），重点看原生侧：复制文字与图片后列表实时更新、图片缩略图、复制回剪贴板、重启后历史与收藏保留、全局快捷键打开剪贴板页、在设置中修改快捷键后重新注册、快捷翻译快捷键仍可录制与注册（复用快捷键解析）。 |
| `f290a34`、`53e9de3` | 5.8 | 微信提醒（中英文）：开关、微信托盘图标闪烁时主窗口出现提醒、打开微信（恢复原主窗口，失败时显示提示）；可选：`cargo run --example wechat_reminder_probe` 仍能运行。 |
| `1fcfa89`、`a918a97` | 6.1 | 打开 QQ：已运行时激活现有窗口、未运行时按注册表中的安装路径启动；未安装 QQ 时显示"未找到 QQ 安装路径"。微信提醒：开启后能识别微信窗口与托盘闪烁，打开微信可恢复主窗口；未安装微信时显示"未找到微信安装路径"。 |

## 待处理问题

重构中发现、但按约定不在重构提交中修复的问题。修复时单独提交，并在此标注。

| 发现于 | 问题 | 说明 |
|---|---|---|
| 0.3（已处理） | ESLint `react-hooks/exhaustive-deps` 报告 5 处存量缺失依赖。3.1 改写后位置为 `App.tsx` 1（`qqMail`）、`useIslandWindow.ts` 1（交互同步未把整个 `settings` 列入依赖）、`useNativeLayout.ts` 1（布局同步只依赖 `marginY`）、`QQMail.tsx` 1、`TranslationWindow.tsx` 1。`App.tsx` 直接 import `invoke` / `listen` 的 2 条 warn 已随收口消失 | 可能是有意省略，也可能是闭包读取旧值的 bug；需逐个确认，不在搬迁提交中修改。逐个确认后均不是闭包读取旧值的 bug（提交 `14eff59`）：`QQMail` 的 `readerRequestRef` 是请求计数器，卸载时有意递增；`IslandApp` 依赖的就是 `qqMail.closeReader`；`useIslandWindow` 只列出 `syncNativeInteraction` 实际发送的 6 个设置字段，避免无关设置触发原生调用；`useNativeLayout` 只需响应 `marginY`，缩放由 `set_island_interaction` 同步；`TranslationWindow` 只在挂载时注册已保存的快捷键。前两处改为 linter 能识别的等价写法，后三处加注释说明原因并就地禁用该条规则。随后 7.2 把该规则升级为 error。 |
| 0.5 | `cargo` 提示依赖 `imap-proto v0.10.2` 含将被未来 Rust 版本拒绝的代码 | 见 `cargo report future-incompatibilities`；需要升级依赖，按约定不在重构期间处理。 |
| 2.1（已处理） | `features/todos/storage.ts` 的 `loadTodos`、`loadTodoArchives` 等把 `localStorage.getItem` 写在 `try` 外，`loadActiveTodoId`、`loadSaveDirectory` 等没有 `try`；存储被禁用时会抛异常，导致主窗口无法打开 | 改用 `lib/storage.ts` 即可修复，但会改变行为（由抛异常变为回退默认值），属于 bug 修复，需单独提交。在此之前 `storage.ts` 暂时直接读写 `localStorage`，不符合 src/AGENTS.md 的"统一通过 `lib/` 读写"。已修复：`storage.ts` 全部改用 `lib/storage.ts` 的 `readString` / `writeString` / `removeItem`，key 与数据格式不变；存储不可用时读取回退默认值、写入不抛异常。`saveSaveDirectory` 返回是否写入成功，设置窗口在失败时保留草稿、不显示"已保存"（与原来抛异常时的界面一致）。新增"存储被禁用"单元测试。 |
| 2.3（已处理） | `features/clipboard/shortcut.ts` 的 `normalizeShortcutKeyLabel` 先判断 `key.length === 1` 并转大写，空格键 `" "` 因此走不到后面的 `case " "`，录制 Ctrl+Space 会得到 `"Ctrl+ "` 而不是 `"Ctrl+Space"` | 需确认 Rust 侧能否解析；修复属于行为变更，单独提交。测试中暂不覆盖该分支。已修复：先判断空格键再走单字符分支。Rust 侧确认 `"Ctrl+ "` 解析失败（拆分后没有主键，快捷键注册不上）、`"Ctrl+Space"` 解析为虚拟键 0x20；前端与 Rust 各补了测试。翻译窗口的录制逻辑本来就先判断空格，不受影响。 |
| 2.4（已处理） | `PresetSettingsSection.css` 中的 `.preset-panel`、`.preset-panel__header`，以及原 `App.css` 中的 `.clipboard-settings-panel`、`.color-panel`（及各自的 `__header`，4.1 后分别位于 `ClipboardSettingsSection.css`、`ColorSettingsSection.css` 末尾）没有任何组件使用 | 疑似废弃样式，按约定原样搬迁；删除属于清理改动，单独提交。已删除这 6 条规则（提交 `chore(styles): remove unused preset, clipboard and color panel rules`）；构建产物对比只少这 6 条，其余 689 条内容与顺序不变。 |
| 2.6（已处理） | 回归页 `tests/collapsed-message-animation.tsx` 第 75 行传给 `IslandShell` 的 `mediaState` 缺少 `MediaState` 的大部分字段，按 tsconfig 的严格模式单独类型检查会报 TS2740（存量问题，与本次迁移无关；`tests/` 不在 `tsc` 的检查范围内） | 运行时不受影响；补全 mock 属于测试修改，单独提交。已补全为与 Rust `MediaState::empty()` 相同的值；补全后类型检查又发现缺 `collapsedTodoCount`、`onOpenSettings` 两个必填属性，分别补为 `null` 和空函数（回归页始终传入 `collapsedTaskTitle`，前者不会被读取）。用临时 tsconfig 检查 4 个回归页均无错误，`collapsed-message-animation.html?test=1` 仍为 24/24。`tests/*.tsx` 仍不在 `pnpm check` 的类型检查范围内。 |
| 3.2 | 音频电平没有放进叶子组件：`audioPeak` / `audioActive` 存在 `mediaState` 里，500ms 电平轮询和 1500ms 会话轮询都会衰减同一个峰值，电平轮询还会在暂停意图下把 `playbackStatus` 改成 `paused`；电平每次变化都会让 `IslandApp` 整体重渲染。另外 `useMediaState.ts` 216 行，超过 hook 150 行软上限 | 拆到叶子组件要重新设计峰值的归属与合并方式，属于行为变更，单独提交；届时可顺带把命令执行从 `useMediaState` 拆出。 |
| 3.3（已处理） | 回归页 `tests/i18n.tsx` 存量失败，有两处：一是 `get_media_state` 的 mock 缺少 `sessions`，`IslandApp` 渲染时在 `effectiveMediaTarget` 读 `sessions.length` 抛错（`4669733` 新增音源列表时引入，搬迁前的 `App.tsx` 同样会抛）；二是补齐 mock 后，第 88、112 行点击的 `.dot-button--layout` 已在 `f8e847d`（设置移到独立窗口）中删除 | 修改测试属于测试修复，单独提交：补齐 mock，并把这两步改成打开设置窗口或删除。已修复：`get_media_state` 的 mock 补成与 `MediaState::empty()` 相同的完整空状态；页面在同一个 `I18nProvider` 下同时挂载 `IslandApp` 与 `SettingsWindow`，去掉两处点击 `.dot-button--layout`；`get_clipboard_history` 的 mock 补上 `shortcutEnabled`（真实后端总会返回该字段，缺失时设置窗口会报受控输入警告）。`i18n.html?test=1` 16/16 通过。 |
| 5.4 | `qq_mail/` 的子模块之间用 `use super::*` 互相引用，搬迁时为跨文件访问给大部分项加了 `pub(super)`，可见性比需要的宽 | 收窄为显式导入和最小可见性属于整理改动，单独提交；之后拆分的 `qq_notifications/`、`clipboard_history/`、`wechat_reminders/` 若采用同样做法，一并处理。详细交接说明见 Phase 6 之后的"5.4 可见性收窄交接说明"。 |
| 6.1 | `system/startup.rs`、`system/updater.rs` 通过 `reg.exe` 子进程读写注册表（开机自启、系统代理），每次调用都要启动一个进程 | 不含 `unsafe`，不在 Phase 6 的收口范围内；改为 `win32/registry.rs` 中的 API 调用会改变实现方式与错误信息，需单独评估、单独提交。 |
| 2.6（已处理） | `tests/*.tsx` 回归页不在 `pnpm check` 的类型检查范围内，IslandShell 等组件的属性变化不会被发现（2.6 的缺失属性就是这样遗留下来的） | 可新增一个包含 `tests/*.tsx` 的 tsconfig 并加入 `pnpm check`；属于工具链改动，单独提交。当前 4 个回归页用临时 tsconfig 检查均无错误。已新增 `tsconfig.tests.json`（继承主配置，包含 `tests/*.tsx`）与脚本 `check:tests-types`，并加入 `pnpm check`；用故意写错类型的探针文件确认检查生效。 |
| 7 | `src/AGENTS.md` 的软性上限（组件函数 ≤ 200 行、hook ≤ 150 行、单组件 `useState` ≤ 8）在 2026-11-03 统计时超限：组件 `ClipboardHistoryPanel` 360、`TodoNotebook` 334、`SettingsWindow` 304、`MusicPlayerPanel` 298、`TranslationWindow` 254；hook `useMediaState` 209、`useQQMail` 169、`useIslandWindow` 153；`useState` 超过 8 个的有 `SettingsWindow` 12、`TranslationWindow` 13。接近上限：`IslandApp` 195、`ClipboardHistoryItemRow` 184、`useQQNotifications` 133。另外 `useQQMail`、`useQQNotifications`、`useWeChatReminders` 这些 hook 写在 `.tsx` 文件里，不符合"不含 JSX 的逻辑不放进 `.tsx`" | 软性上限只在代码评审时检查，拆分属于整理改动，逐个单独提交。`SettingsWindow` 已在 2026-11-04 拆分：状态移入 `useSettingPresets`、`useClipboardSettings`、`useAgentStatusSettings`、`useSaveDirectorySetting`、`useLaunchAtStartup`，各页拆成 `windows/settings/*SettingsPage.tsx`，`useState` 12 → 2；`useMediaState` 的拆分与 3.2（音频电平叶子组件）一起考虑。统计口径：从函数声明行数到顶格的 `}`。 |
