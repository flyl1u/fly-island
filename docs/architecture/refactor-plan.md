# 结构重构计划

目标：在**不改变任何用户可见行为**的前提下，把代码迁移到 [overview.md](overview.md) 描述的目标结构，并让所有文件满足根目录 [AGENTS.md](../../AGENTS.md#代码规模规则全局) 的行数上限。

执行规则：

- 按阶段顺序推进。同一阶段内的步骤之间没有依赖时可以调整顺序，但每一步单独提交。
- 搬迁和改写分开提交，提交信息使用 `refactor(<范围>): ...`。
- 每一步完成后：运行该步对应的验证，勾选本文的复选框，并在"进度记录"中追加一行（提交号、行数变化、验证结果）。
- 如果实际代码与映射表不一致，先更新 [overview.md](overview.md) 中的映射，再动手迁移。
- 重构期间如需修复 bug 或开发新功能，单独提交，并且写在目标位置。

## 基线（2026-11-03，提交 `f8e847d`）

按 `pnpm check:size` 的口径统计。`.rs` 文件分别统计生产代码和内联测试模块，权威数据以 `scripts/file-size-allowlist.json` 为准。

| 文件 | 物理行数 | 计入上限的行数 | 内联测试 | 超限项 |
|---|---|---|---|---|
| `src/App.tsx` | 5644 | 5644 / 400 | — | 行数 |
| `src/App.css` | 3865 | 3865 / 500 | — | 行数 |
| `src/QQMail.tsx` | 404 | 404 / 400 | — | 行数 |
| `src-tauri/src/qq_mail.rs` | 2162 | 1465 / 800 | 697 / 150 | 生产代码、测试 |
| `src-tauri/src/lib.rs` | 1973 | 1770 / 800 | 203 / 150 | 生产代码、测试 |
| `src-tauri/src/clipboard_history.rs` | 1068 | 1068 / 800 | 0 | 生产代码 |
| `src-tauri/src/media_control.rs` | 829 | 829 / 800 | 0 | 生产代码 |
| `src-tauri/src/qq_notifications.rs` | 1081 | 789 / 800 | 292 / 150 | 测试 |

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

- [ ] **2.1 todos**：`TodoNotebook`、`ArchiveBrowser`、待办/归档/笔记的存储与 normalize、Markdown 格式化、`createTodoId`，以及 `save_todo_markdown` 的封装。
- [ ] **2.2 media**：`MusicPlayerPanel`、`MusicWaveButton`、`MediaWaveform`、媒体状态比较、音乐来源优先级的存储，以及 `media_*` 命令的封装。
- [ ] **2.3 clipboard**：`ClipboardHistoryPanel`、快捷键解析与匹配（`shortcut.ts`，补测试），以及剪贴板命令与事件的封装。
- [ ] **2.4 appearance**：`LayoutEditor`、`AppearanceModeControl`、设置与预设的 load / normalize / merge（包括 `collapsed-text-default-v1` 迁移逻辑），以及 `hexToRgba`（见 1.2）。
- [ ] **2.5 agent-status**：状态标签和视觉状态函数，以及代理状态命令的封装。
- [ ] **2.6 messages**：`Messages`、`MessageSourceIcon`、`CollapsedMessageContent`、`messagePreview.ts`、`qqNotificationTiming.ts`、`QQMail`、`QQNotifications`、`WeChatReminders` 迁入 `features/messages/`，拆出各自的 `api.ts` 和 `storage.ts`。`QQMail.tsx` 拆分后应低于 400 行。
- [ ] **2.7 updater**：`UpdatePanel`、`updaterController.ts`。同步更新 `tests/updater-controller.test.mjs` 中的 import mock 表。
- [ ] **2.8 窗口目录**：`SettingsWindow`、`TranslationWindow` 迁入 `windows/settings/`、`windows/translation/`，并抽出各自的 `api.ts` 和 `storage.ts`。

超过 400 行的组件（`TodoNotebook` 470 行、`ClipboardHistoryPanel` 566 行、`LayoutEditor` 755 行，2026-11-03 统计）无法原样搬到一个文件里。经确认按以下顺序处理，搬迁和改写仍然分开提交：

1. 搬迁提交：先原样搬出该步的其余代码（类型、存储、纯函数、小组件）。`App.tsx` 变短，但**暂不下调**白名单记录值（`check:size` 只会给出提示）。
2. 改写提交：在 `App.tsx` 中原地把大组件拆成无状态的子组件，状态仍留在原组件中，不改变挂载结构。`App.tsx` 会增加几十行，但仍低于白名单记录值。
3. 搬迁提交：把拆分后的组件原样搬到 `features/<领域>/`，并把白名单下调到实际行数。

**验收**（每一步都要满足）：`pnpm check`、`pnpm build` 通过；`tests/` 中的导入路径已更新；手动检查对应面板的展开、折叠和数据保留情况，并在 `pnpm dev` 中打开相关的 `tests/*.html` 回归页确认。

## Phase 3：拆分 IslandApp

- [ ] **3.1** 把窗口尺寸、展开高度、拖拽、位置、贴边逻辑抽到 `windows/island/useIslandWindow.ts`，窗口命令封装到 `windows/island/api.ts`。
- [ ] **3.2** 各 feature 的状态与副作用抽成领域 hook：`useTodos`、`useMediaState`、`useClipboardHistory`、`useAgentStatus`。高频状态（音频电平）放进叶子组件。
- [ ] **3.3** `App` / `IslandApp` / `IslandShell` 迁到 `windows/island/`，改为具名导出，更新 `main.tsx`。`useIslandAutomation.ts` 同时迁移，并更新 `tests/island-automation.test.mjs`。
- [ ] **3.4** 删除 `src/App.tsx`，从白名单中移除。

**验收**：`IslandApp.tsx` 不超过 400 行，组件函数不超过 200 行；`useState` 数量不超过 8；`pnpm tauri dev` 中手动检查折叠、展开、贴边收起、拖拽和托盘隐藏。

## Phase 4：CSS 收尾

- [ ] **4.1** 把 `App.css` 中剩余的样式按组件分配到同名 `.css`。无法归属的样式放到 `windows/island/IslandApp.css`。
- [ ] **4.2** 把散落的颜色、圆角、间距硬编码替换为 `tokens.css` 中的变量（只替换数值完全相同的，不改变视觉效果）。
- [ ] **4.3** 删除 `src/App.css`，从白名单中移除。

**验收**：所有 `.css` 文件不超过 500 行；主窗口、设置窗口、翻译窗口在中英文下截图对比都没有差异。

## Phase 5：Rust 拆分（每个模块单独提交）

每一步都要：按 [overview.md](overview.md#迁移映射rust) 拆成目录模块；测试移到 `tests.rs`；命令名保持不变；更新 `generate_handler!` 中的路径。

`lib.rs`、`qq_mail.rs`、`media_control.rs` 在 0.6 中没有格式化。搬迁提交保持原格式；搬迁完成、相关文件已不在白名单中之后，紧接着单独提交一次 `cargo fmt`（`refactor(<范围>): apply cargo fmt`），格式化后仍须满足行数上限。`lib.rs` 在 5.3 完成后格式化，5.1、5.2 拆出的新文件在各自步骤后格式化。

- [ ] **5.1** 从 `lib.rs` 中拆出 `island/`，包括状态、几何计算、毛玻璃、鼠标穿透以及对应测试。
- [ ] **5.2** 从 `lib.rs` 中拆出 `agent_status/`。
- [ ] **5.3** 从 `lib.rs` 中拆出 `system/`（`startup.rs`、`updater.rs`、`todo_export.rs`）和 `tray.rs`。完成后 `lib.rs` 只剩组装代码。
- [ ] **5.4** 拆分 `qq_mail/`。
- [ ] **5.5** 拆分 `qq_notifications/`。
- [ ] **5.6** 拆分 `clipboard_history/`。
- [ ] **5.7** 拆分 `media_control/`。
- [ ] **5.8** 合并 `wechat_reminders.rs` 与 `wechat_reminder_source.rs`，形成 `wechat_reminders/`。

**验收**（每一步都要满足）：`cargo test` 的通过数量不少于基线；`pnpm tauri build --no-bundle` 成功，并按根目录规则同步桌面快捷方式；涉及窗口的步骤需要在 `pnpm tauri dev` 中手动检查。

## Phase 6：unsafe 收口与错误处理

- [ ] **6.1** 建立 `win32/`，先迁移注册表操作（`registry.rs`），再迁移窗口和句柄（`window.rs`）、COM 初始化（`com.rs`）。每次迁移一类调用，为每个 `unsafe` 块补上 `// SAFETY:` 注释。
- [ ] **6.2** 逐模块迁移剩余的 `unsafe` 调用：媒体与音频、通知、剪贴板、翻译、微信。
- [ ] **6.3** 清理生产代码中剩余的 `unwrap` / `expect`，将 Phase 0 中的 clippy lint 从 warn 升级为 deny。

**验收**：除 `win32/` 外，生产代码中不再出现 `unsafe`；clippy 没有告警；`cargo test` 和 `pnpm tauri build --no-bundle` 通过。

## Phase 7：收尾

- [ ] **7.1** 白名单清空，删除白名单机制中的存量条目。
- [ ] **7.2** 把 ESLint 中的存量 warn 全部升级为 error。
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
| 2026-11-03 | 2.1（3/4，改写） | 见提交说明 | 在 `App.tsx` 中把 `TodoNotebook`（470 行）的书脊按钮组拆为 `TodoNotebookSpine`（71 行）、单条待办拆为 `TodoListItem`（156 行），二者无状态，编辑与拖拽状态仍在 `TodoNotebook`（334 行）中；DOM 结构与 class 不变。`App.tsx` 5265 → 5358（+93，低于白名单记录 5488） | `pnpm check`（57/57）、`pnpm build`；交互待人工验收 |

## 待人工验收

无法在本地自动验证的检查。完成后在行首标注结果和日期。

| 提交 | 步骤 | 检查项 |
|---|---|---|
| `2e71e5c` | 0.7 | 推送后在 GitHub Actions 中确认 `CI` 工作流在 `windows-latest` 上全部通过（本地无法运行；按规则不执行 `git push`）。 |
| `5d17988` | 1.3 | 在设置窗口（中英文）对比滑块、颜色、开关、数字输入四种控件的外观与交互（拖动、选色、切换、焦点框），应与迁移前一致。 |
| `bc7cccd` | 1.4 | 三个窗口（主窗口、设置、翻译）在中英文下检查像素字体（`Fusion Pixel`）仍能加载、键盘 Tab 与鼠标点击下的按钮焦点框表现与迁移前一致。 |

## 待处理问题

重构中发现、但按约定不在重构提交中修复的问题。修复时单独提交，并在此标注。

| 发现于 | 问题 | 说明 |
|---|---|---|
| 0.3 | ESLint `react-hooks/exhaustive-deps` 报告 5 处存量缺失依赖（`App.tsx` 3、`QQMail.tsx` 1、`TranslationWindow.tsx` 1） | 可能是有意省略，也可能是闭包读取旧值的 bug；需逐个确认，不在搬迁提交中修改。 |
| 0.5 | `cargo` 提示依赖 `imap-proto v0.10.2` 含将被未来 Rust 版本拒绝的代码 | 见 `cargo report future-incompatibilities`；需要升级依赖，按约定不在重构期间处理。 |
| 2.1 | `features/todos/storage.ts` 的 `loadTodos`、`loadTodoArchives` 等把 `localStorage.getItem` 写在 `try` 外，`loadActiveTodoId`、`loadSaveDirectory` 等没有 `try`；存储被禁用时会抛异常，导致主窗口无法打开 | 改用 `lib/storage.ts` 即可修复，但会改变行为（由抛异常变为回退默认值），属于 bug 修复，需单独提交。在此之前 `storage.ts` 暂时直接读写 `localStorage`，不符合 src/AGENTS.md 的"统一通过 `lib/` 读写"。 |
