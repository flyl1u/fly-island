# AGENTS.md

本文件是仓库的总规则，面向在本仓库工作的 AI 编程代理和协作者。规则按目录就近生效：

- 修改 `src/` 时还须遵守 [src/AGENTS.md](src/AGENTS.md)（前端规则）。
- 修改 `src-tauri/` 时还须遵守 [src-tauri/AGENTS.md](src-tauri/AGENTS.md)（Rust / Tauri 规则）。
- 目标架构见 [docs/architecture/overview.md](docs/architecture/overview.md)，结构重构的分步记录、验证结果与待人工验收项见 [docs/architecture/refactor-plan.md](docs/architecture/refactor-plan.md)。

子目录规则比本文件更具体，两者冲突时以子目录规则为准。

## 项目概览

FocuSD Island（仓库名 fly-island）是 Windows 优先的桌面效率工具，以透明、无边框、始终置顶的 Tauri 悬浮岛形式运行。主要功能：待办、每日笔记与归档，外观设置与预设，媒体控制，剪贴板历史，快捷翻译，QQ 通知、QQ 邮箱和微信提醒，AI 代理状态，以及自动更新。

应用有三个窗口，前端通过同一入口的 `?window=` 参数分发：

| 窗口 label | 前端入口 | 说明 |
|---|---|---|
| `main` | 默认 | 悬浮岛本体，折叠态 / 展开态 / 贴边收起 |
| `translation` | `?window=translation` | 快捷翻译窗口，常驻、隐藏显示 |
| `settings` | `?window=settings` | 设置窗口，`create: false`，按需创建 |

**结构重构已完成（Phase 0–6，收尾与待人工验收项见 [refactor-plan.md](docs/architecture/refactor-plan.md)）。** 代码已按 [overview.md](docs/architecture/overview.md) 的目标结构组织：Rust 侧的 `unsafe` 只在 `src-tauri/src/win32/` 中，生产代码不用 `unwrap` / `expect`，clippy 与 ESLint 均为 0 告警。新代码沿用这套结构与子目录规则。

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
├── tests/               # unit/ 前端单元测试、scripts/ 脚本测试（node:test，*.test.mjs）；regression/ 浏览器回归页（*.html + *.tsx）
├── packages/            # 插件开发者工具（pnpm workspace）：fly-island-plugin（Node SDK、CLI、模拟宿主）、create-fly-island-plugin（脚手架）、powershell/FlyIsland.Plugin；不进入岛屿的发布产物
├── plugins/             # 插件市场：examples/ 示例插件源码（PowerShell，含 lib/focusd.ps1），schema/ 协议描述，sdk/ 单文件 SDK（pnpm sdk:build 从 packages/ 生成），packages/ 打包好的 zip，index.json 与 index.json.sig 给切换前的旧版岛屿的市场索引（pnpm plugins:index 生成；新版岛屿读 TixXin/focusd-plugins），signing-keys.json 可信公钥（编译进岛屿）；不进入发布产物
├── scripts/             # release/ 发布、签名与 latest.json 生成；plugins/ 插件索引、签名与 SDK 生成；根目录放开发流程脚本：合并队列的检查（land-check.mjs）与 dev 同步（land-sync-dev.mjs）、行数检查、浏览器回归页运行器（run-regression.mjs）、dev 前停止运行中的岛屿
├── .githooks/           # pre-push：合并队列的推送保护与检查（core.hooksPath 指向这里）
├── docs/                # 专题文档（功能说明放在根目录）；architecture/ 架构，plugins/ 插件开发，investigations/ 排查与验收记录，releases/ 发布说明，reviews/ 评审记录，assets/ 演示视频与图片
├── DESIGN.md            # 已确认的界面设计约定
└── README*.md           # 中英文项目说明
```

注意：被 `include_str!` 编译进 Rust 二进制的脚本放在使用它们的模块旁边（`src-tauri/src/agent_status/hooks/`、`src-tauri/src/qq_notifications/`），修改它们按 Rust 改动验证。

## 常用命令

| 用途 | 命令 |
|---|---|
| 安装依赖 | `pnpm install` |
| 前端开发服务器 | `pnpm dev` |
| 桌面开发模式 | `pnpm tauri dev`（主工作区，用户自己跑） |
| lane 的预览岛屿 | `pnpm dev:lane`（在 lane 里运行，和用户的岛屿并排，见下文） |
| 类型检查并构建前端 | `pnpm build` |
| 前端单元测试 | `pnpm test`（即 `node --test "tests/**/*.test.mjs"`） |
| 前端静态检查 | `pnpm lint`（ESLint，配置见 `eslint.config.js`） |
| 文件行数检查 | `pnpm check:size` |
| 回归页类型检查 | `pnpm check:tests-types`（`tsconfig.tests.json`，检查 `tests/regression/*.tsx`） |
| 浏览器回归页 | `pnpm test:regression [页面名中的词]`（自带 Vite，用无头 Chrome / Edge 跑 `tests/regression/` 下全部回归页并汇总结果，约 20 秒） |
| 提交前总检查 | `pnpm check`（类型检查 + 回归页类型检查 + lint + 行数检查 + 单元测试） |
| Rust 单元测试 | `cargo test --manifest-path src-tauri/Cargo.toml` |
| 仅生成 release 可执行文件 | `pnpm build:exe`（在主工作区或任意 lane 运行，写到主工作区的 `src-tauri/target/release`，岛屿在运行也不用关） |
| 完整打包 | `pnpm tauri build` |
| 发布 | `pnpm release`（流程见 `docs/updater.md`） |
| 合入 main（在 lane 里） | `pnpm mq:land`；主工作区快进 `pnpm mq:sync`；列出无人使用的 lane `pnpm mq:reconcile` |

如果运行环境禁止派生子进程（例如受限沙箱），`node --test` 需要加 `--test-isolation=none`。此时 `tests/scripts/release-manifest.test.mjs` 仍会因 `spawnSync` 被拦截而失败，这是环境限制，报告时应如实说明。如果 `vite build` 报错无法删除系统临时目录中的 esbuild 文件（Access is denied），可以把 `TEMP` / `TMP` 指向 `node_modules/.cache/` 下的目录后重试。

## 代码规模规则（全局）

单个文件的行数上限（按物理行计）：

| 文件类型 | 上限 |
|---|---|
| `.ts` / `.tsx` / `.mjs` | 400 行 |
| `.css` | 500 行 |
| `.rs` | 800 行，只计生产代码（不含内联测试模块）；内联测试模块上限 150 行，超过时移到同目录的 `tests.rs`，`tests.rs` 不设上限 |
| `.ps1` / `.cmd` | 400 行 |

- **豁免**：`src/i18n/locales/*.ts`、`src/i18n/sections/**/*.ts`、`src/i18n/types.ts`（文案字典），锁文件、二进制资源和生成产物。
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

适用于所有结构性重构（移动、拆分、改名模块）。Phase 0–6 这一轮已经完成，其记录见 [refactor-plan.md](docs/architecture/refactor-plan.md)。

- **搬迁和改写分开提交。** 一个提交要么只移动或拆分代码（零行为变化），要么只修改行为，不能混在一起。
- 搬迁时不顺手改名、改格式、改逻辑；CSS class 名保持不变，避免视觉回归。
- 每个提交都能独立验证，提交信息使用 `refactor(<范围>): ...` 前缀。"分开提交"约束的是一个提交里不能混杂两类改动，不是要求提交越小越好：同一类改动若属于同一个步骤，放在一个提交里。
- 跨多个提交的大型重构，先在 `docs/architecture/` 写分步计划，按计划顺序推进，完成一步后勾选并更新基线数据。
- 重构提交中不升级依赖、不整仓格式化。引入格式化工具的那个专门提交除外。
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
| Rust、Tauri 命令、窗口、托盘、注册表、Windows API、桌面配置 | `cargo test --manifest-path src-tauri/Cargo.toml` + `pnpm build:exe` |
| 发布相关 | 完整的 `pnpm tauri build` |

- 改动岛屿、消息、设置窗口等界面组件或它们的 `api.ts` 类型时，再运行 `pnpm test:regression`；回归页的 mock 落后于代码时页面会失败，要同步更新。其余界面或窗口行为在风险需要时用 `pnpm tauri dev` 手动检查。
- 不得因为构建耗时而跳过必要验证。必要构建失败或受环境阻塞时，必须明确报告原因，不得把未完成的验证描述为已验证。

## 本机更新与桌面快捷方式

- 每次完成应用更新并成功生成 release 可执行文件后，都要检查并同步当前用户桌面的岛屿快捷方式，无需再次确认；仅文档改动不需要重新构建。
- 优先更新已有的 FocuSD / fly-island 快捷方式；不存在时创建 `fly-island.lnk`。使用 Windows 当前用户的实际桌面目录，不硬编码用户名或桌面路径。
- 快捷方式目标应指向当前仓库的 `src-tauri/target/release/focusd-island.exe` 绝对路径，工作目录设为该程序所在目录，图标使用该可执行文件。不得指向 debug 程序、旧备份或临时构建目录。
- 构建失败时不切换快捷方式。更新后重新读取快捷方式，确认目标文件存在、目标路径与本次成功构建产物一致，再报告完成；不要修改其他应用的快捷方式。

## Git 与协作

- **每个代理会话在自己的 lane（worktree + 分支）上工作，经合并队列合入 `main`**（工具是 [claude-code-merge-queue](https://github.com/funador/claude-code-merge-queue)，配置在 `claude-code-merge-queue.config.mjs`）：
  - 开 lane：用 `claude -w <任务名>` 启动，或在会话里调用 EnterWorktree。本机 `.claude/settings.json` 的 WorktreeCreate 钩子会分配 `lane/N` 分支，并在 `../fly-island-lanes/N` 建 worktree（所有 lane 都在这一个文件夹里）。钩子不可用时，手动 `git worktree add ../fly-island-lanes/<N> -b lane/<N> origin/main`，`<N>` 选一个 `../fly-island-lanes/<N>` 文件夹和 `lane/<N>` 分支都不存在的编号：往已有文件夹里建会先建出分支、再因为文件夹非空而失败，留下没有 worktree 的孤儿分支。钩子建 lane 时会自动 `pnpm install`；手动建的 lane 自己运行一次。
  - 在 lane 里开发、验证、提交。一个功能单元完成并提交后，在 lane 里运行 `pnpm mq:land`，不用问用户。它会排队、rebase 到 `origin/main`、跑 `scripts/land-check.mjs`（`pnpm check`，改到 Rust 相关文件时再加 `cargo test`），然后推送 `origin/main`，并把主工作区快进到新的 `main`。land 成功后会自动把 fork 的 `dev` 推到同一提交（旧版本岛屿从 `dev` 读插件市场），结果记在 `.git/land-sync-dev.log`。
  - land 失败不算完成：rebase 冲突时它会自动中止，自己 `git fetch origin main && git rebase origin/main` 解决冲突后重新 land；检查失败就修好再 land。如果输出里已经有 `landed`，只是后面的快进主工作区失败了，不要重复 land，在主工作区运行 `pnpm mq:sync`。
  - `release` 可执行文件构建（`pnpm build:exe`）和桌面快捷方式同步不在队列里，按"验证"一节在 land 之后另外做。不要为了构建让用户关掉岛屿或 dev：`build:exe` 会把正在运行的 exe 改名挪开再写新的（Windows 允许改名正在运行的 exe），下次启动就是新版本。
  - **预览**：用户想看某个 lane 的效果时，在那个 lane 里运行 `pnpm dev:lane`。它起一个和用户的岛屿并排的预览岛屿：Vite 端口 1500+lane 编号，应用标识 `com.focusd.island.lane-<N>`（数据、WebView 存储、单实例都和用户的分开，开始时没有数据），不注册 focusd:// 链接，不能改开机自启，也不能安装 AI 代理状态 hook。不要在 lane 里直接跑 `pnpm tauri dev`：它会先关掉所有正在运行的岛屿，还要占用主工作区的 1420 端口。只看界面时也可以起 lane 的 Vite，打开 `tests/regression/*.html`。
  - 主工作区留给用户（例如运行 `pnpm tauri dev`），必须保持干净并停在 `main` 上，代理不要在里面改文件或提交。`main` 只通过 land 移动：`.githooks/pre-push`（`git config core.hooksPath .githooks`）会拒绝直接推送 `main`，紧急情况才设 `CLAUDE_CODE_MERGE_QUEUE_EMERGENCY_PUSH=1`。
  - 别人留下的、没有会话在用的 lane（land 或会话开始时输出里带 `⚠`，`pnpm mq:reconcile` 会列出）：问用户怎么处理，不要删除。已经合入、没有未提交改动、而且建它的会话（钩子记下的 `claude.exe`）已经退出的 lane，会在下次 land 时自动删除；会话还开着的 lane 不会删。手动建的 lane 没有这条记录，不会被自动删除，用完自己 `git worktree remove` 并删除分支。Windows 上 `git worktree remove` 常常删不掉 `node_modules`，会留下只剩 `node_modules` 的 `../fly-island-lanes/<N>` 文件夹；钩子会把它当成还在用的 lane 而跳过这个编号，所以删完要确认文件夹已经不在，残留的用 `cmd /c rmdir /s /q <路径>` 删除（不会顺着 pnpm 的目录联接删到 store）。
  - 工具在 Windows 上的几个问题（找不到 `pwd` 导致各 lane 的队列锁互不相通、调用 `pnpm` 时没开 shell），以及清理 lane 时路径对不上、没有 `lsof`、删不掉 `node_modules` 导致 lane 越积越多，都由 `patches/claude-code-merge-queue@0.7.1.patch` 修复（`pnpm-workspace.yaml` 的 `patchedDependencies`）。升级这个包时要重新做补丁，并确认两个 lane 同时 land 会排队。
  - Rust 构建分几个目录，都在主工作区的 `src-tauri/target` 下（`scripts/build-dirs.mjs`）：用户的 `pnpm tauri dev` 用 `debug`，release 用 `release`，代理的 `cargo test` / `clippy` 用 `agents`（`land-check.mjs` 已经这样设置；在 lane 里手动跑时设 `CARGO_TARGET_DIR=<主工作区>/src-tauri/target/agents`），lane 预览用 `lane-<N>`。代理不要用 `debug`，否则会和用户的 dev 互相等锁、互相触发重编译。
  - Rust 版本固定在 `rust-toolchain.toml`（CI 的 `ci.yml` 写同一个版本，改时一起改），本机、lane 和 CI 用同一个编译器，本机 clippy 通过 CI 也会通过。
- 修改前先查看 `git status --short`，不要覆盖用户已有改动。
- 不要使用 `git reset --hard`、`git checkout --` 等破坏性命令，除非用户明确要求。
- 如果工作区已有与当前任务无关的修改，保留它们，只处理本次任务相关的文件。
- 每完成一个**可验证的功能单元**（一个用户可感知的功能、一个完整的修复，或计划中的一个步骤），按改动范围执行必要验证，再主动创建 Git 提交，无需再次确认。不要每改一处就提交一次；同一功能单元内的多处改动合在一个提交里。只提交当前任务相关的文件，在最终说明中给出提交号和验证结果。
- 修补自己尚未推送的提交（漏掉的文案、测试、拼写、小 bug）时，不新开 `fix:` 提交：最近一个提交用 `git commit --amend`，更早的用 `git commit --fixup=<提交号>`，推送前再用 `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash <基点>` 合并（非交互，代理可执行）。
- 改写历史只限于自己创建、尚未推送、也尚未合入 `main` 的提交（即自己 lane 分支上还没 land 的提交）。已经合入 `main` 的提交不再改写，有问题就新开修复提交。
- 一个功能阶段（例如插件 API 的一期）通常对应 1–5 个提交，而不是十几个。修复提交只用于已推送内容的问题。
- 提交前尽量让改动范围保持聚焦，并在最终说明中列出已验证的命令。

## 文档

- 源码保持项目当前编码风格；中文文档使用 UTF-8。
- README 包含中英文说明，更新时不要破坏现有的双语结构。
- 界面方向的决定记录在 `DESIGN.md`；功能专题文档放在 `docs/`；架构变化更新 `docs/architecture/overview.md`。
- 待完善的任务记在 `docs/roadmap.md`，开发时实时维护：开始做某项就把状态改成「进行中」并写上自己的会话名，做完改成「已完成」、填上提交号并移到「已完成」表；发现的新问题和方案变化写进对应条目。改这个文件和功能改动放在同一个提交里。
