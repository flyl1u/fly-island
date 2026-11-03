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
| `src/App.tsx` | 5644 | 2212 | 5644 / 400 | — | 行数 |
| `src/App.css` | 3865 | 1045 | 3865 / 500 | — | 行数 |
| `src/QQMail.tsx` | 404 | 360（已移出白名单） | 404 / 400 | — | 行数 |
| `src-tauri/src/qq_mail.rs` | 2162 | 2162 | 1465 / 800 | 697 / 150 | 生产代码、测试 |
| `src-tauri/src/lib.rs` | 1973 | 1970 | 1770 / 800 | 203 / 150 | 生产代码、测试 |
| `src-tauri/src/clipboard_history.rs` | 1068 | 1068 | 1068 / 800 | 0 | 生产代码 |
| `src-tauri/src/media_control.rs` | 829 | 829 | 829 / 800 | 0 | 生产代码 |
| `src-tauri/src/qq_notifications.rs` | 1081 | 1083 | 789 / 800 | 292 / 150 | 测试 |

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
- [ ] **2.8 窗口目录**：`SettingsWindow`、`LayoutEditor` 外壳（只做组合）、`TranslationWindow` 迁入 `windows/settings/`、`windows/translation/`，并抽出各自的 `api.ts` 和 `storage.ts`。

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
| 2026-11-03 | 2.8（3/4，搬迁） | 见提交说明 | 翻译窗口的设置类型、存储 key、默认值和 `loadSettings` 原样搬到 `windows/translation/storage.ts`；`TranslationWindow.tsx` 286 → 269 | `pnpm check`（78/78）、`pnpm build` |

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

## 待处理问题

重构中发现、但按约定不在重构提交中修复的问题。修复时单独提交，并在此标注。

| 发现于 | 问题 | 说明 |
|---|---|---|
| 0.3 | ESLint `react-hooks/exhaustive-deps` 报告 5 处存量缺失依赖（`App.tsx` 3、`QQMail.tsx` 1、`TranslationWindow.tsx` 1） | 可能是有意省略，也可能是闭包读取旧值的 bug；需逐个确认，不在搬迁提交中修改。 |
| 0.5 | `cargo` 提示依赖 `imap-proto v0.10.2` 含将被未来 Rust 版本拒绝的代码 | 见 `cargo report future-incompatibilities`；需要升级依赖，按约定不在重构期间处理。 |
| 2.1 | `features/todos/storage.ts` 的 `loadTodos`、`loadTodoArchives` 等把 `localStorage.getItem` 写在 `try` 外，`loadActiveTodoId`、`loadSaveDirectory` 等没有 `try`；存储被禁用时会抛异常，导致主窗口无法打开 | 改用 `lib/storage.ts` 即可修复，但会改变行为（由抛异常变为回退默认值），属于 bug 修复，需单独提交。在此之前 `storage.ts` 暂时直接读写 `localStorage`，不符合 src/AGENTS.md 的"统一通过 `lib/` 读写"。 |
| 2.3 | `features/clipboard/shortcut.ts` 的 `normalizeShortcutKeyLabel` 先判断 `key.length === 1` 并转大写，空格键 `" "` 因此走不到后面的 `case " "`，录制 Ctrl+Space 会得到 `"Ctrl+ "` 而不是 `"Ctrl+Space"` | 需确认 Rust 侧能否解析；修复属于行为变更，单独提交。测试中暂不覆盖该分支。 |
| 2.4 | `PresetSettingsSection.css` 中的 `.preset-panel`、`.preset-panel__header`，以及 `App.css` 中的 `.clipboard-settings-panel`、`.color-panel`（及各自的 `__header`）没有任何组件使用 | 疑似废弃样式，按约定原样搬迁；删除属于清理改动，单独提交。 |
| 2.6 | 回归页 `tests/collapsed-message-animation.tsx` 第 75 行传给 `IslandShell` 的 `mediaState` 缺少 `MediaState` 的大部分字段，按 tsconfig 的严格模式单独类型检查会报 TS2740（存量问题，与本次迁移无关；`tests/` 不在 `tsc` 的检查范围内） | 运行时不受影响；补全 mock 属于测试修改，单独提交。 |
