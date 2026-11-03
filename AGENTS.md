# AGENTS.md

本文件是仓库的总规则，面向在本仓库工作的 AI 编程代理和协作者。规则按目录就近生效：

- 修改 `src/` 时还须遵守 [src/AGENTS.md](src/AGENTS.md)（前端规则）。
- 修改 `src-tauri/` 时还须遵守 [src-tauri/AGENTS.md](src-tauri/AGENTS.md)（Rust / Tauri 规则）。
- 目标架构见 [docs/architecture/overview.md](docs/architecture/overview.md)，结构重构的分步计划与进度见 [docs/architecture/refactor-plan.md](docs/architecture/refactor-plan.md)。

子目录规则比本文件更具体，两者冲突时以子目录规则为准。

## 项目概览

FocuSD Island（仓库名 fly-island）是 Windows 优先的桌面效率工具，以透明、无边框、始终置顶的 Tauri 悬浮岛形式运行。主要功能：待办、每日笔记与归档，外观设置与预设，媒体控制，剪贴板历史，快捷翻译，QQ 通知、QQ 邮箱和微信提醒，AI 代理状态，以及自动更新。

应用有三个窗口，前端通过同一入口的 `?window=` 参数分发：

| 窗口 label | 前端入口 | 说明 |
|---|---|---|
| `main` | 默认 | 悬浮岛本体，折叠态 / 展开态 / 贴边收起 |
| `translation` | `?window=translation` | 快捷翻译窗口，常驻、隐藏显示 |
| `settings` | `?window=settings` | 设置窗口，`create: false`，按需创建 |

**当前阶段：结构重构进行中（Phase 5 已完成，下一步是 Phase 6 的 `unsafe` 收口）。** 各模块中散落的 `unsafe` Win32 / COM 调用、`expect` 等旧写法是重构对象，**不是**新代码的风格样板。新代码按目标结构编写，旧代码按重构计划逐步迁移。

## 技术栈

- 前端：React 19、TypeScript（strict）、Vite 7，图标使用 lucide-react，HTML 清理使用 dompurify
- 桌面壳：Tauri 2（opener、updater、single-instance 插件）
- 原生能力：Rust 2021，`windows` crate（Win32 / WinRT）
- 包管理器：pnpm；前端单元测试使用 Node 内置 `node:test`

## 目录总览

```text
.
├── src/                 # React 前端（规则见 src/AGENTS.md）
├── src-tauri/           # Tauri / Rust 桌面端（规则见 src-tauri/AGENTS.md）
│   ├── src/             # 原生命令、后台服务、窗口管理
│   ├── examples/        # 手动运行的 QQ / 微信探测程序，不进入发布产物
│   ├── capabilities/    # Tauri 权限能力配置
│   └── tauri.conf.json  # 窗口、更新、打包配置
├── tests/               # node:test 单元测试（*.test.mjs）与浏览器回归页（*.html + *.tsx）
├── scripts/             # 发布、签名、latest.json 生成、代理状态 hook 脚本
├── docs/                # 专题文档；architecture/ 架构，releases/ 发布说明，reviews/ 评审记录
├── DESIGN.md            # 已确认的界面设计约定
└── README*.md           # 中英文项目说明
```

注意：`scripts/focusd-agent-running.cmd` 和 `scripts/focusd-agent-status.ps1` 通过 `include_str!` 编译进 Rust 二进制，修改它们等同于修改 Rust 侧代码。

## 常用命令

| 用途 | 命令 |
|---|---|
| 安装依赖 | `pnpm install` |
| 前端开发服务器 | `pnpm dev` |
| 桌面开发模式 | `pnpm tauri dev` |
| 类型检查并构建前端 | `pnpm build` |
| 前端单元测试 | `pnpm test`（即 `node --test tests/*.test.mjs`） |
| 前端静态检查 | `pnpm lint`（ESLint，配置见 `eslint.config.js`） |
| 文件行数检查 | `pnpm check:size` |
| 提交前总检查 | `pnpm check`（类型检查 + lint + 行数检查 + 单元测试） |
| Rust 单元测试 | `cargo test --manifest-path src-tauri/Cargo.toml` |
| 仅生成 release 可执行文件 | `pnpm tauri build --no-bundle` |
| 完整打包 | `pnpm tauri build` |
| 发布 | `pnpm release`（流程见 `docs/updater.md`） |

如果运行环境禁止派生子进程（例如受限沙箱），`node --test` 需要加 `--test-isolation=none`。此时 `tests/release-manifest.test.mjs` 仍会因 `spawnSync` 被拦截而失败，这是环境限制，报告时应如实说明。如果 `vite build` 报错无法删除系统临时目录中的 esbuild 文件（Access is denied），可以把 `TEMP` / `TMP` 指向 `node_modules/.cache/` 下的目录后重试。

## 代码规模规则（全局）

单个文件的行数上限（按物理行计）：

| 文件类型 | 上限 |
|---|---|
| `.ts` / `.tsx` / `.mjs` | 400 行 |
| `.css` | 500 行 |
| `.rs` | 800 行，只计生产代码（不含内联测试模块）；内联测试模块上限 150 行，超过时移到同目录的 `tests.rs`，`tests.rs` 不设上限 |
| `.ps1` / `.cmd` | 400 行 |

- **豁免**：`src/i18n/locales/*.ts`、`src/i18n/types.ts`（文案字典），锁文件、二进制资源和生成产物。
- **存量白名单（只减不增）**：重构前已经超限的文件登记在 `scripts/file-size-allowlist.json` 中，并记录当前行数作为上限。白名单内的文件**不得变得更长**；变短后把记录值同步改小；降到上限以下或文件被移走后，必须删除对应条目。只允许调小或删除白名单记录，不得调大或新增。
- `pnpm check:size`（`scripts/check-file-size.mjs`）负责检查以上规则，扫描 `src/`、`src-tauri/src/`、`src-tauri/examples/`、`scripts/`、`tests/`。
- **不往超限文件里加新功能**。新功能写在目标结构的对应位置，再从旧文件中引用。
- 一个文件只承担一个职责。不新建 `helpers.ts`、`common.rs`、`misc.css` 这类没有明确领域的"杂物"文件。

## 对外契约（不得随意变更）

下列标识会被已安装用户的数据、配置或外部程序引用。纯重构提交中**一律不得改变**：

- `localStorage` key（`focusd-island-*`，完整清单见架构文档）及其存储的数据格式
- Tauri 命令名（即 Rust 函数名）、参数名，以及事件名
- 窗口 label（`main` / `translation` / `settings`）和 `?window=` 参数值
- 应用标识 `com.focusd.island`、开机自启注册表值 `FocuSD Island`、凭据管理器条目、应用数据目录下的文件名（如 `agent-status.json`）
- 更新端点和 `latest.json` 格式

确实需要变更时，必须在同一个提交里同步修改前后端，提供旧数据的迁移或兼容读取，并在提交说明中写明。

## 重构约定

- **搬迁和改写分开提交。** 一个提交要么只移动或拆分代码（零行为变化），要么只修改行为，不能混在一起。
- 搬迁时不顺手改名、改格式、改逻辑；CSS class 名保持不变，避免视觉回归。
- 每个提交都是一个可独立验证的小步骤，提交信息使用 `refactor(<范围>): ...` 前缀。
- 严格按 [refactor-plan.md](docs/architecture/refactor-plan.md) 的顺序推进，完成一步后在计划中勾选并更新基线数据。
- 重构过程中不升级依赖、不整仓格式化。引入格式化工具的那个专门提交除外。
- 目录或模块结构变化后，同步更新对应 `AGENTS.md` 中的目录地图和 `docs/architecture/overview.md`。

## 通用开发约定

- 优先复用现有组件、类型、工具函数和 CSS class；不为小改动引入新的抽象层。
- 前端状态继续用 `localStorage` 持久化，除非需求明确要求迁移到文件、数据库或云同步。
- 新增 Tauri 命令时，同步更新 Rust handler、前端类型化封装和必要的权限配置（细则见子目录规则）。
- 修改窗口大小、定位、透明度、置顶、托盘或注册表逻辑时，要同时考虑折叠态、展开态、贴边收起和托盘隐藏。
- 注释只写在能降低理解成本的地方，用于解释"为什么"，不复述代码。
- 用户可见文案必须支持中英文，并注意窄窗口下按钮、标签和标题不溢出。
- 避免与任务无关的改动和对生成产物的改动。

## 验证

验证范围必须覆盖改动范围。纯搬迁的重构提交同样需要完整验证。

| 改动范围 | 必须运行 |
|---|---|
| 仅文档 | 无需构建，确认 Markdown 可读 |
| 前端逻辑、样式、依赖或脚本 | `pnpm check` + `pnpm build` |
| Rust、Tauri 命令、窗口、托盘、注册表、Windows API、桌面配置 | `cargo test --manifest-path src-tauri/Cargo.toml` + `pnpm tauri build --no-bundle` |
| 发布相关 | 完整的 `pnpm tauri build` |

- 涉及界面或窗口行为的改动，在风险需要时用 `pnpm dev`（浏览器回归页）或 `pnpm tauri dev` 手动检查。
- 不得因为构建耗时而跳过必要验证。必要构建失败或受环境阻塞时，必须明确报告原因，不得把未完成的验证描述为已验证。

## 本机更新与桌面快捷方式

- 每次完成应用更新并成功生成 release 可执行文件后，都要检查并同步当前用户桌面的岛屿快捷方式，无需再次确认；仅文档改动不需要重新构建。
- 优先更新已有的 FocuSD / fly-island 快捷方式；不存在时创建 `fly-island.lnk`。使用 Windows 当前用户的实际桌面目录，不硬编码用户名或桌面路径。
- 快捷方式目标应指向当前仓库的 `src-tauri/target/release/focusd-island.exe` 绝对路径，工作目录设为该程序所在目录，图标使用该可执行文件。不得指向 debug 程序、旧备份或临时构建目录。
- 构建失败时不切换快捷方式。更新后重新读取快捷方式，确认目标文件存在、目标路径与本次成功构建产物一致，再报告完成；不要修改其他应用的快捷方式。

## Git 与协作

- 修改前先查看 `git status --short`，不要覆盖用户已有改动。
- 不要使用 `git reset --hard`、`git checkout --` 等破坏性命令，除非用户明确要求。
- 如果工作区已有与当前任务无关的修改，保留它们，只处理本次任务相关的文件。
- 每次完成仓库改动后，按改动范围执行必要验证，并主动创建 Git 提交，无需再次确认。只提交当前任务相关的文件，在最终说明中给出提交号和验证结果。
- 提交前尽量让改动范围保持聚焦，并在最终说明中列出已验证的命令。

## 文档

- 源码保持项目当前编码风格；中文文档使用 UTF-8。
- README 包含中英文说明，更新时不要破坏现有的双语结构。
- 界面方向的决定记录在 `DESIGN.md`；功能专题文档放在 `docs/`；架构变化更新 `docs/architecture/overview.md`。
