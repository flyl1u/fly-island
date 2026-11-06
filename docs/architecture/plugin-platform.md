# 插件平台第 2 版：向 VS Code 式扩展靠拢的实施计划

> 状态：**P5、P6、P7、P9、P10 已完成**（2026-11-05，见各节末尾的「完成记录」；P6 的单独发版和真实数据升级验证还要人工完成）；P10 的 npm 包已发布 0.1.0（2026-11-05），PowerShell Gallery 还没发；P8 第一轮技术验证不通过，换成不经过 Tauri 的独立 WebView2 后第二轮验证通过并已实现（见 [p8-webview-validation.md](p8-webview-validation.md)），2026-11-06 人工验收通过；P11 完成了岛屿端（多签名、黑名单、发布者信任、后台检查与自动更新、市场搜索与分类），独立索引仓库 [TixXin/focusd-plugins](https://github.com/TixXin/focusd-plugins) 和 CI 签名已建好，岛屿还没改读新仓库。
> 现状见 [插件开发文档](../plugins/README.md) 和 [与 VS Code 的对比](../plugins/vscode.md)；第 1 版的设计与路线图（P1–P4）见 [plugins.md](plugins.md)。本文接着它的 P5。
> 编码规则仍以 [AGENTS.md](../../AGENTS.md)、[src/AGENTS.md](../../src/AGENTS.md)、[src-tauri/AGENTS.md](../../src-tauri/AGENTS.md) 为准；每个阶段都要登记新增的对外契约（[contracts.md](contracts.md)）。

## 0. 摘要

第 1 版插件只能在设置页里放设置项和按钮，并按权限读写待办、笔记和 AI Agent 状态。要让第三方像给 VS Code 写扩展那样给岛屿写插件，还缺五块：

| # | 缺什么 | 对应阶段 |
|---|---|---|
| 1 | 插件能在**岛上**显示东西：展开态页面、折叠条角标，由岛屿绘制的模板；必要时用 Webview | P7、P8 |
| 2 | 更宽的**宿主 API**：事件订阅、岛上提示、快捷键、命令、插件存储，以及更多需要单独授权的数据 | P5、P6 |
| 3 | **运行模型**：按需启动（激活事件）、空闲停止、Job Object、资源监控 | P9 |
| 4 | **开发者工具**：类型化 SDK、脚手架、CLI、开发模式热重载、模拟宿主、API 参考、实验 API 通道 | P10 |
| 5 | 能接收外部作者的**市场**：独立索引仓库、PR 加 CI、在 CI 里签名、作者身份、下架黑名单、自动更新 | P11 |

另有一项跨阶段工作：**API 版本与兼容规则**（P5 先定下来），以及**安全**（每个阶段各自带上）。

顺序：P5 → P6 → P7 → P9 → P10 → P11，P8 先做技术验证，通过后再排期。理由见第 4 节。

**不做**：插件改岛的布局或注入 CSS、在主 WebView 里运行插件 JS、加载 DLL、付费插件、评分评论。这些和第 1 版的结论一致（[plugins.md §3](plugins.md#3-方案比较)）。

## 1. 调研：VS Code 是怎么做的

以下内容依据 VS Code 官方文档（2026-11-04 抓取，来源见第 9 节）。旁边写了对岛屿的启示。

### 1.1 运行：Extension Host 与激活事件

- 扩展跑在 **Extension Host** 中，不在画界面的进程里。有三种宿主：本机 Node、Web Worker、远程 Node。官方说宿主的目的是不让“行为不当的扩展”影响启动速度、拖慢界面操作或改界面。
- 扩展必须导出 `activate()`，应该导出 `deactivate()`。`activate()` 在第一次触发 `activationEvents` 中任一事件时执行，例如 `onLanguage:markdown`、`onCommand:id`、`onView:id`、`onUri`、`onStartupFinished`。
- 从 1.74 起，扩展贡献的命令、视图、语言等**会自动生成对应的激活事件**，不用再手写。
- `*` 表示随 VS Code 启动，官方要求“只在其他组合都不行时才用”。`onStartupFinished` 在启动完成后才激活，不拖慢启动。
- `extensionKind`（`ui` / `workspace`）决定远程场景下扩展在哪一侧运行。

**对岛屿的启示**：岛屿现在一个插件一个进程，启用就启动。插件多了常驻进程就多。应借鉴激活事件：从清单的贡献项推导出“什么时候需要启动”，再加空闲停止（P9）。“一个插件一个进程”仍然保留，隔离比共享宿主更好，岛屿也不打算内置 Node。

### 1.2 贡献点（`contributes`）

VS Code 在 `package.json` 的 `contributes` 里静态声明能力，包括：`commands`、`menus`（带 `when` 条件和 `group` 排序）、`keybindings`、`configuration`、`views` / `viewsContainers` / `viewsWelcome`、`customEditors`、`languages` / `grammars`、`themes` / `iconThemes`、`debuggers`、`taskDefinitions`、`walkthroughs`、`authentication`、`languageModelTools` 等三十多项。

- `configuration` 用 JSON Schema 的超集描述。设置编辑器能直接编辑 `string`、`number`、`boolean`、`enum`、基本类型数组和简单对象，更复杂的只给出“在 settings.json 中编辑”的链接。支持 `markdownDescription`、`order`、`deprecationMessage`、`minimum` / `maximum` / `pattern`，以及作用域（`application`、`machine`、`window`、`resource` 等）。
- `menus` 的 `when` 只决定那一个菜单项是否显示；命令的 `enablement` 对所有菜单和快捷键都生效。

**对岛屿的启示**：静态声明加宿主绘制，是“插件多了界面也不乱”的关键。岛屿已有 `contributes.settings` 和 `contributes.commands`，要扩展成 `views`（岛上页面）、`statusItems`（折叠条）、`keybindings`、`menus`（例如待办右键菜单），并加一个简化版的 `when`。设置项补上 `markdownDescription`、`order`、`deprecationMessage`、`pattern` 和多行文本。

### 1.3 界面：原生视图优先，Webview 最后

- VS Code 的界面分为容器（活动栏、主侧栏、副侧栏、编辑器、面板、状态栏）和条目（视图、工具栏、状态栏项）。另有通知、快速选择、命令面板等通用元素。
- 官方对 Webview 的态度是“能不用就不用”：它“占资源，并且运行在与扩展不同的上下文中”，“能做到不代表应该做”。
- Webview 的安全要求：用 CSP，从 `default-src 'none'` 开始，只放开需要的；用 `localResourceRoots` 限制可加载的本地文件（空数组表示全部禁止）；默认不开脚本；Webview 只能通过 `postMessage` 和扩展通信，`acquireVsCodeApi()` 每个会话只能调用一次，返回的对象不得泄露到全局。
- 状态保存优先用 `getState` / `setState`；`retainContextWhenHidden` 内存开销大，只在别的办法都不行时用。

**对岛屿的启示**：先做宿主绘制的模板（P7），覆盖大多数需要；Webview 放在 P8，先验证再决定，规则照搬 VS Code 的 CSP、资源目录、消息桥和状态保存。

### 1.4 安全与信任

- 官方明确写：Extension Host “与 VS Code 本身权限相同”，扩展可以读写文件、联网、启动进程。
- **Workspace Trust** 不是沙箱，而是“是否信任这个文件夹”的同意信号，加上扩展自己声明的分级：`untrustedWorkspaces.supported` 为 `true`、`false` 或 `limited`，以及 `restrictedConfigurations`。官方提醒：界面上隐藏的命令仍然可以被调用，所以必须在代码里拦。
- 市场侧的防护：多引擎恶意软件扫描、在干净的虚拟机里做动态检测、验证发布者（证明域名所有权且信誉良好至少 6 个月）、异常下载监控、防抢注名称、**黑名单**（确认为恶意后，已安装的副本会被 VS Code 自动卸载）、发布时扫描密钥。
- 市场在发布时给**每个扩展签名**，VS Code 安装时校验签名，确认包的完整性和来源。
- 从 1.97 起，第一次安装某个第三方发布者的扩展时，VS Code 会要求用户确认信任这个发布者。

**对岛屿的启示**：岛屿的权限表比 VS Code 严（只开放白名单数据，第三方默认关闭），这个优势要保留。要补的是市场侧的东西：黑名单（含自动停用）、发布者信任提示、CI 里扫描密钥。敏感数据（剪贴板、消息）还要在首次调用时单独询问（P6）。

### 1.5 开发者体验

- 脚手架：`npx --package yo --package generator-code -- yo code`，生成 TypeScript 项目。
- 按 F5 打开 **Extension Development Host**，在里面运行扩展，可以下断点；改代码后执行“Developer: Reload Window”重新加载。
- 测试：`@vscode/test-cli` 加 `@vscode/test-electron`，会自动下载指定版本的 VS Code，在真实宿主里跑 Mocha 集成测试；可以分别测“信任”和“不信任”两种工作区。
- **Proposed API**：新 API 先以提案形式只在 Insiders 版提供，扩展用 `enabledApiProposals` 声明，类型定义用 `npx @vscode/dts dev` 拉取。用了提案 API 的扩展**不能发布到市场**。官方的理由是“API 一旦发布就很难再改”。
- `engines.vscode` 声明兼容的最低版本，不能写 `*`。

**对岛屿的启示**：要有脚手架、开发宿主（岛屿的“开发模式”加热重载）、能自动拉起宿主的测试工具、实验 API 通道（只对开发模式插件开放，市场拒收），以及严格的 API 兼容规则（P5、P10）。

### 1.6 发布与分发

- `vsce package` 生成 `.vsix`，`vsce publish` 上传。需要先建发布者（ID 一旦创建不能改）。图标不能是 SVG，README 里的图片必须是 https。
- 鉴权正在从 Azure DevOps 个人访问令牌改为**联合身份**：GitHub Actions 的 Trusted Publishing（OIDC，凭据 15 分钟过期，一个令牌只能换一次）。全局个人访问令牌将于 **2026-12-01** 停用。
- 预发布版本：`--pre-release`，不支持 semver 预发布后缀，建议偶数次版本号发正式版、奇数发预发布。
- 平台专属包：`--target win32-x64` 等，不带目标的包作为通用回退。
- 下架：“取消发布”保留统计；“移除”不可逆，名称永久保留不能再用；单个版本删除后版本号不能复用，也不能删最新版本。
- 也可以不走市场，直接安装 VSIX：`code --install-extension x.vsix`。
- **Open VSX**（开源注册表）：命名空间等于 `publisher`，用 `ovsx` 发布；创建命名空间不等于验证所有权，验证要另外申请。

### 1.7 小团队的做法：Raycast、Obsidian

- **Raycast**：作者运行 `npm run publish`，脚本会自动向 `raycast/extensions` 仓库开 PR（多个提交压成一个）。审核通过、合并后自动发布到商店；后续更新继续往同一个 PR 推。别人改过的代码要先 `pull-contributions` 再发布。
- **Obsidian**：仓库根目录要有 `README.md`、`LICENSE`、`manifest.json`；在 GitHub Release 里上传 `main.js`、`manifest.json`（以及可选的 `styles.css`），Release 标签必须等于清单里的版本号。在 community.obsidian.md 登录并关联 GitHub，系统会自动审核；只需提交第一版，之后发新 Release，Obsidian 就会直接拉取。

**对岛屿的启示**：岛屿没有能力运营一个 VS Code 那样的市场。最合适的是 **Obsidian 式**：插件包放在作者自己仓库的 GitHub Release 里；索引仓库只收录“插件 id → 仓库地址”；第一次提交走 PR 加人工审核；之后的版本由 CI 自动拉取、校验、签名（P11）。

## 2. 现状与差距

| 方面 | 现在（第 1 版） | 目标 | 阶段 |
|---|---|---|---|
| API 版本 | `apiVersion` 只能是 1，没有能力协商 | 版本 2 加能力列表；有弃用和兼容规则 | P5 |
| 事件 | 没有，插件只能定时轮询 | `events.subscribe` + `event` 通知 | P5 |
| 岛上提示 | 没有 | `island.notify`（折叠条短暂提示） | P5 |
| 插件存储 | 只有私有目录，插件自己读写文件 | `storage.get/set`（宿主保存，有大小上限） | P5 |
| 命令 | 最多 8 个按钮，只出现在设置页 | 命令可以绑快捷键、出现在岛上菜单，带 `when` | P5 |
| 数据位置 | 待办、笔记在主窗口的 localStorage，经主窗口转发 | 由 Rust 持有，前端订阅 | P6 |
| 敏感数据 | 剪贴板、消息、媒体没有接口 | 按权限开放，首次调用单独确认 | P6 |
| 岛上界面 | 没有 | 展开态页面、折叠条项，由宿主绘制模板 | P7 |
| 自定义界面 | 没有 | 沙箱 Webview（验证通过后） | P8 |
| 启动时机 | 启用即启动 | 激活事件、空闲停止 | P9 |
| 进程清理 | 关闭 stdin，2 秒后结束 | Job Object 连同子进程一起结束 | P9 |
| 资源 | 看不到 | 显示内存和 CPU，超限提醒 | P9 |
| SDK | PowerShell 和 Node 各一个文件，需要复制 | npm 包加类型定义；PowerShell 模块 | P10 |
| 脚手架和 CLI | 没有 | `npm create fly-island-plugin`、`fly-island-plugin validate/pack/dev/test` | P10 |
| 开发模式 | 改完点“重新加载” | 加载任意目录、文件变化后自动重启、请求日志 | P10 |
| 测试 | 自己写脚本扮演宿主 | 模拟宿主库加 CLI | P10 |
| 实验 API | 没有 | `experimentalApis`，只在开发模式可用 | P10 |
| 市场位置 | fork 的 `dev` 分支 | 独立索引仓库 `TixXin/focusd-plugins` | P11 |
| 上架 | 持有私钥的人手动打包签名 | PR 加 CI 校验，CI 签名 | P11 |
| 包托管 | 存在仓库里 | 作者的 GitHub Release | P11 |
| 发布者 | 没有概念 | GitHub 账号即发布者，首次安装确认信任 | P11 |
| 下架 | 只能删索引条目，已装的照样运行 | 黑名单，已安装的自动停用 | P11 |
| 更新 | 打开市场页才看得到 | 后台定时检查、自动更新（可关） | P11 |

## 3. 通用规则（所有阶段都遵守）

### 3.1 API 版本与兼容

参考 VS Code “API 一旦发布就很难再改”的原则：

- 清单的 `apiVersion` 继续表示**协议大版本**。只有不兼容的改动才升大版本；宿主至少同时支持当前和上一个大版本，旧版本退役前至少提前两个岛屿版本在日志和插件卡片上提示。
- 新增方法、事件、贡献点都属于兼容改动，不升大版本。宿主在 `initialize` 里给出 `capabilities` 列表（例如 `["events", "island.notify", "views.list"]`），插件按能力判断，不按岛屿版本号判断。
- `minAppVersion` 相当于 VS Code 的 `engines.vscode`，市场在客户端版本不够时显示“不兼容”（已实现）。
- 新 API 先进入**实验通道**（P10），稳定后再转正。实验 API 不进入市场。
- 每个 API 都写进机器可读的协议描述（`plugins/schema/`，P5 建立），SDK 类型、文档和宿主测试都从它生成或对照，避免三处不一致。

### 3.2 权限

- 沿用“权限只管宿主 API”的原则，不宣称沙箱。
- 权限分两级：**普通**（启用时一次性授予，例如 `todos:read`）和**敏感**（启用时授予，第一次实际调用时还要在岛上确认一次，可以随时在插件设置页撤销，例如 `clipboard:read`、`messages:read`）。
- 清单新增 `optionalPermissions`：用户启用时可以不勾选；插件调用前用 `permissions.request` 申请，被拒绝时返回 `-32001`。
- 每个插件在设置页可以看到最近 200 条宿主 API 调用记录（方法、时间、结果），方便用户核对插件做了什么。

### 3.3 对外契约

新增的清单字段、JSON-RPC 方法和通知、`plugins.json` 字段、索引格式都属于对外契约，登记到 [contracts.md](contracts.md) 和 [docs/plugins/README.md](../plugins/README.md)。

### 3.4 代码规模

`plugin_host/mod.rs` 已有 638 行，`runtime.rs` 460 行，离 800 行的上限不远。**P5 开工前先做一个纯搬迁的重构提交**：把 `mod.rs` 拆成 `commands.rs`（Tauri 命令）、`registry.rs`（扫描、内置插件合并、迁移）、`grants.rs`（授权与设置）；`runtime.rs` 把 RPC 方法分派拆到 `runtime/dispatch.rs`（`runtime` 的子模块，这样能直接用进程上下文 `Context`）。新功能各放新文件（`events.rs`、`views.rs`、`activation.rs`、`job.rs` 等），不往大文件里加。

### 3.5 验证

- Rust 改动：`cargo test --manifest-path src-tauri/Cargo.toml`、`cargo clippy --all-targets`、`pnpm tauri build --no-bundle`，然后同步桌面快捷方式。
- 前端改动：`pnpm check` + `pnpm build`；岛上界面改动还要更新 `tests/` 下的浏览器回归页，并在 `pnpm tauri dev` 中检查折叠态、展开态、贴边收起。
- 示例插件：每个阶段至少新增或更新一个示例，放在 `plugins/examples/`，并用 P10 的模拟宿主写自动化测试（P10 之前用 Rust 单元测试加手动验证）。

## 4. 阶段计划

### P5 宿主 API 第 2 版：协商、事件、提示、存储、命令

**目标**：插件不再轮询；能在岛上发出提示；能保存小量数据；命令能绑快捷键。

**设计**

1. **能力协商**
   - 清单 `apiVersion` 允许 `1` 或 `2`。`initialize` 增加 `capabilities: string[]` 和 `apiVersion`（宿主选定的版本）。
   - `apiVersion: 1` 的插件行为保持不变；新方法对它们同样可用（兼容新增）。
2. **事件订阅**
   - 请求 `events.subscribe { events: string[] }`、`events.unsubscribe { events }`；宿主通过通知 `event { name, payload }` 推送。
   - 第一批事件，每个都需要相应的读权限：`todos.changed`（`{ reason: "add" | "update" | "remove" | "reorder" | "dayChanged" }`，不带全部数据，插件需要时再调 `todos.list`）、`note.changed`、`agentStatus.changed`、`island.expanded` / `island.collapsed`（不需要权限）、`app.locale.changed`（不需要权限）。
   - 合并发送：同一事件 200 毫秒内只发一次，避免拖累岛屿。
   - 在 P6 之前，`todos.changed` 由主窗口在写 localStorage 后通过新事件 `plugin-host-event` 告诉 Rust，再由 Rust 转给订阅的插件。
3. **岛上提示** `island.notify { title, body?, durationMs?, actions?: [{ id, title }] }`
   - 权限 `island:notify`（普通）。复用折叠条的消息预览（`features/messages/` 的 5 秒预览规则），作为一种新的消息来源 `plugin`，显示插件图标或默认图标。
   - 每个插件每分钟最多 6 条，超过返回 `429`；用户可以在插件设置页把某个插件的提示静音。
   - 点了动作按钮后发送通知 `notification.action { id }`。
4. **插件存储** `storage.get { key }`、`storage.set { key, value }`、`storage.delete { key }`、`storage.keys`
   - 由宿主保存在 `plugins-data/<id>/storage.json`，单个值不超过 64 KB，总量不超过 1 MB；不需要权限。
   - 卸载插件时保留（与私有目录一致），设置页提供“清除数据”按钮。
   - 对应 VS Code 的 `globalState`。秘密信息另用 `secrets.get/set`（存进 Windows 凭据管理器，条目名 `com.focusd.island.plugin.<id>`），权限 `secrets`（普通）。
5. **命令扩展**
   - `contributes.commands[]` 增加 `keybinding`（例如 `"Ctrl+Alt+T"`）和 `when`。
   - 快捷键用现有 `win32/hotkey.rs` 注册全局热键。冲突时（已被岛屿或其他插件占用）注册失败，在插件卡片上显示，用户可在插件设置页改键或关闭。
   - `when` 第一版只支持几个上下文键，用 `&&` / `||` / `!` 组合：`island.expanded`、`island.page == <id>`、`todos.hasActive`。由岛屿在前端求值，不执行插件代码。
   - 新增贡献点 `contributes.menus`，第一版只有 `todo/context`（待办条目的右键菜单）。宿主以 `command { id, args: { todoId } }` 调用插件。
6. **协议描述** `plugins/schema/manifest.schema.json`、`plugins/schema/rpc.json`（方法、参数、结果、所需权限、引入的版本）。Rust 的 `permissions.rs` 用单元测试对照这份描述，保证表格一致。

**改动位置**

- Rust：先做 3.4 的拆分；新增 `plugin_host/events.rs`（订阅表、合并、分发）、`plugin_host/storage.rs`、`plugin_host/keybindings.rs`；`permissions.rs` 加新权限与方法；`manifest.rs` 解析新字段；`local_api/routes.rs` 可选同步提供 `POST /v1/island/notify`。
- 前端：`features/plugins/api.ts` 新事件；`features/messages/` 新增 `plugin` 来源；`features/todos/` 写入后发出变化事件；插件设置页增加“静音提示”“清除数据”“快捷键”。
- 文档与示例：`docs/plugins/README.md` 的方法表和事件表；示例 `dev.focusd.todo-digest` 改为订阅 `todos.changed`；新增示例 `dev.focusd.pomodoro`（`island.notify` + `storage` + 快捷键）。

**测试**：Rust 单测覆盖事件合并、订阅权限、限流、存储上限、快捷键解析与冲突、`when` 解析；`tests/` 增加 `when` 求值和消息来源排序的 node 测试。

**验收**：示例插件不再定时轮询；番茄钟示例在岛上发出提示，点“再来一轮”后插件收到动作；同一快捷键被两个插件声明时，第二个显示冲突且不影响第一个；关掉岛屿后 `storage.json` 内容仍在。

**提交拆分（建议）**：① 拆 `mod.rs` / `runtime.rs`（纯搬迁）② 能力协商 ③ 事件 ④ `island.notify` ⑤ 存储与 secrets ⑥ 快捷键与 `when` ⑦ `todo/context` 菜单 ⑧ 文档与示例。

**完成记录（2026-11-05）** ✅ 按上面 8 步提交：`40294fa` 拆分、`ce1fe39` 能力协商、`a55c603` 事件、`b2018aa` `island.notify`、`6ff2d7a` 存储与 secrets、`aac2e00` 快捷键与 `when`、`58337dd` `todo/context` 菜单，以及文档与示例的提交。示例 `dev.focusd.todo-digest` 1.2.0 改为订阅 `todos.changed`，新增 `dev.focusd.pomodoro` 1.0.0；市场索引已重新签名。

与上面设计的偏差：

- **版本"协商"**：宿主不另选版本，`initialize.apiVersion` 就是清单里写的版本；`capabilities` 对第 2 版插件是 `["events","notifications","storage","secrets"]`，对第 1 版插件是空列表（字段对两者都发送，属于新增字段）。
- **新方法对第 1 版插件**：设计写的是"同样可用"。为了保证第 1 版插件行为完全不变，不需要权限的 `events.*`、`storage.*` 只对第 2 版开放，第 1 版仍返回"方法不存在"；需要新权限的 `island.notify`、`secrets.*` 第 1 版清单也能申请。清单里的 `keybinding`、`when`、`menus` 对第 1 版忽略。
- **`todos.changed` 的载荷**只有 `{ date }`，没有 `reason`：主窗口只知道待办状态变了，区分 add / update / reorder 需要改动 `features/todos/` 的每个写入点，留到 P6 数据下沉时再做。另新增权限 `agent-status:read`，用于订阅 `agentStatus.changed`。
- **快捷键**：只有冲突提示（插件卡片），插件设置页里"改键或关闭"没做，留作后续；没有新增 capability，因为快捷键是清单声明，不是运行时方法。
- **菜单**：新增 Tauri 命令 `list_plugin_menu`、`run_plugin_menu_command`，原有 `run_plugin_command` 不变；每个插件的 `todo/context` 最多 4 项，`command` 通知多了可选的 `args`。
- **未做**：`local_api/routes.rs` 的 `POST /v1/island/notify`（设计中为可选）；消息来源排序的 node 测试（插件来源复用了现有排序，未单独加测试）；岛上新界面没有新增浏览器回归页，只更新了已有回归页的 mock。

### P6 数据下沉与更多数据权限

**目标**：待办和笔记不再依赖主窗口转发，宿主能可靠地读写和发出变化事件；按权限开放剪贴板、消息、媒体。

**为什么要下沉**：现在插件和本地接口的每次调用都要经过 `local-api-request` 事件让主窗口去读写 localStorage，有 5 秒超时；主窗口重载、卡顿时插件就会失败，变化事件也只能由前端发起。API 越宽，这个问题越突出。

**设计**

1. **待办与笔记由 Rust 持有**
   - 新模块 `src-tauri/src/todos/`：`store.rs`（读写应用数据目录下的 `todos.json`，原子写入：先写临时文件再改名）、`model.rs`（与 `features/todos/storage.ts` 的格式完全一致）、`mod.rs`（命令 `get_todos_state`、`apply_todos_change`，事件 `todos-changed`）。
   - 前端 `features/todos/storage.ts` 改为调用这些命令，并订阅 `todos-changed`，同时更新内存中的状态。
   - **迁移**：见下面的“从已发布的旧版本升级”。
   - 这是对外契约变更（数据位置），必须在同一提交里完成前后端、迁移和兼容读取，并在提交说明中写明（根目录 AGENTS.md）。

**从已发布的旧版本升级（已决定要做，必须保证不丢数据）**

用户会通过自动更新从任意已发布的旧版本直接升到这个版本，中间可能跳过很多版本，所以迁移要按“生产环境”的标准来做：

1. **迁移什么**：`focusd-island-todos`、`focusd-island-archives`、`focusd-island-scheduled-todos`、`focusd-island-daily-note`、`focusd-island-active-todo`、`focusd-island-current-date`。`focusd-island-save-directory` 和 `focusd-island-last-saved-signature` 是导出归档的设置，继续留在前端，不迁移。
2. **由谁来迁**：localStorage 存在 WebView2 的用户数据目录里，Rust 读不到，只能由主窗口读出来交给 Rust。主窗口启动时**先迁移、再显示待办**：迁移完成之前不渲染待办列表，也不处理插件和本地接口的待办请求（这些请求排队等待）。
3. **先规范化**：每个 key 都先用 `features/todos/storage.ts` 现有的 load / normalize 函数读一遍。它们已经兼容历史上的各种旧格式和损坏数据，所以新版本拿到的一定是当前格式。Rust 侧再按 `model.rs` 校验一次，不合法就拒绝，不写文件。
4. **安全写入**：
   - 写之前先把原始的 localStorage 内容（未经规范化的原文）存一份到应用数据目录的 `todos-migration-backup.json`，这个文件以后不自动删除；
   - `todos.json` 先写临时文件、刷盘，再改名替换；
   - 写完后读回来，和要写入的内容逐项比较，一致才算成功；
   - 成功后在 `todos.json` 里记录 `migration: { version: 1, fromAppVersion, at, sourceHash }`（`sourceHash` 是迁移时 localStorage 原文的哈希），同时在 localStorage 写入迁移标记 `focusd-island-todos-migrated-v1`。
5. **失败时**：任何一步失败，这次启动继续使用 localStorage（和旧版本行为相同），在岛上提示“待办数据迁移失败，已继续使用原数据”，并写日志；下次启动再试。不会出现“一半在文件、一半在 localStorage”的情况。
6. **可以重复执行**：迁移过程中断电或崩溃，下次启动发现没有迁移标记或 `todos.json` 不完整，就从头再迁一次。旧 key 一直在，所以重来是安全的。
7. **旧 key 保留不删**：新版本不再写这些 key，但也不删除。
8. **回退到旧版本再升级回来**：用户可能在迁移后又装回旧版本，在旧版本里继续改待办，然后再升级。这时 localStorage 的内容和 `sourceHash` 对不上，说明旧版本改过数据。新版本不能直接用 `todos.json` 覆盖用户在旧版本里的修改，处理方式是：把当前的 `todos.json` 另存为 `todos.before-reimport-<时间>.json`，再用 localStorage 的内容重新迁移一次，并在岛上提示“检测到旧版本修改过待办，已按旧版本的数据重新导入，之前的数据已备份”。例外：这份 localStorage 原文以前已经导入过（某个 `todos-migration-backup*.json` 里有同样的 `sourceHash`）时不再导入。这是同一台电脑上另一个构建（`pnpm tauri dev` 和安装版的 localStorage 各存一份，各自留着迁移前的旧原文）的旧副本，不是旧版本的新修改；否则每次在两个构建之间切换，都会用旧副本覆盖之后新建的待办。
9. **发布前的验证**：
   - 自动化测试的样例数据覆盖每一个修改过待办存储格式的已发布版本，以及空数据、损坏的 JSON、缺字段、超大归档；
   - 在一台装着旧版本、有真实数据的电脑（或真实数据的副本）上走一遍完整的自动更新流程：旧版本 → 新版本，检查待办、归档、笔记、以后的待办和当前选中的待办全部一致；
   - 再测一遍“新版本 → 装回旧版本修改 → 再升级”。
10. **单独发版**：这一步单独发一个版本，不和其他新功能一起发；发布说明里写明数据位置的变化，以及备份文件放在哪里。
   - `local_api::call_island` 改为直接调用 `todos` 模块，不再经过主窗口；`local-api-request` 事件保留给仍在前端的数据（若没有了就删除，同样是契约变更）。
2. **新的数据权限**（都是“敏感”级，见 3.2）
   - `clipboard:read`：`clipboard.history`（最近 N 条文字，不含图片），事件 `clipboard.changed`。只有剪贴板历史模块开启时可用。
   - `messages:read`：QQ、微信、QQ 邮箱的提醒（来源、发送者、预览文字；不含邮件正文），事件 `messages.received`。
   - `media:read`：当前播放（标题、歌手、状态），事件 `media.changed`；`media:control`（普通）：播放、暂停、上一首、下一首。
   - `shelf:read` / `shelf:write`：文件中转列表（只有路径）。
   - 凭据（QQ 邮箱授权码、翻译密钥）**永不开放**。
3. **首次调用确认**：敏感权限第一次被调用时，岛上弹出确认（“<插件名> 想读取剪贴板历史：允许 / 拒绝 / 本次允许”），结果写进 `plugins.json` 的 `grants.<id>.sensitive`。在用户回答之前，请求最多挂起 30 秒，超时按拒绝处理。

**测试**：迁移的单测（各种旧格式、损坏数据、空数据，与 `tests/unit/todos-storage.test.mjs` 现有用例对齐）；原子写入；并发修改；敏感权限确认的状态机；`tests/` 回归页覆盖迁移后数据完全一致。

**验收**：已有用户升级后待办、归档、笔记、以后的待办全部还在；关闭主窗口的渲染（例如岛屿刚启动、主窗口还没加载完）时，本地接口照常读写待办；拒绝剪贴板权限后插件收到 `-32001`，岛屿其他功能不受影响。

**风险**：数据迁移是这份计划里风险最高的一步。上线前要在一份真实用户数据的副本上验证，并保留回滚办法（旧 key 不删）。

**完成记录（2026-11-05）** ✅ 本地提交，未推送、未发版：`ba3c89f` 把待办数据的解析抽成纯函数（`features/todos/normalize.ts`）、`0191ba3` Rust `todos` 模块（模型与原子写入）、`3a81316` 迁移到 `todos.json`、`f44e6a7` 插件和本地接口由 Rust 直接读写待办、`ffcb270` 敏感权限的首次确认、`731cbe8` `clipboard:read`、`483cfb5` `messages:read` / `media:read` / `media:control`、`6cda52c` `shelf:read` / `shelf:write`，以及文档与示例的提交。另有 `65031b6` 修复了 P5 文档提交弄坏的市场测试。新增示例 `dev.focusd.now-playing`（`media:read` + `island.notify`）；发布说明草稿在 `docs/releases/draft-p6-todos-json.md`。

已验证：迁移的单测覆盖 v0.1.1–v0.2.14 写下的格式（这些版本的待办格式相同；`focusd-island-scheduled-todos` 尚未发布过）、当前格式、空数据、损坏的 JSON、缺字段、超大归档；另在隔离的应用标识下用 release 程序端到端跑过首次迁移、窗口重载、旧版本改过数据后重新导入、`todos.json` 来自更新的版本时退回 localStorage、本地接口直接读写、敏感权限的允许 / 本次 / 拒绝 / 超时 / 撤销。

与上面设计的偏差：

- **迁移期间的排队**：由 Rust 在本地接口和插件的待办请求上等待主窗口完成迁移，最多 10 秒，而不是在前端排队。
- **"主窗口没加载完时本地接口照常读写"只部分做到**：每次启动都要先由主窗口读一次 localStorage（只有它能判断旧版本有没有改过数据），完成后即使主窗口卡住或不显示，Rust 也能直接读写；如果这次启动主窗口一直没加载，待办请求等 10 秒后按旧路径交给窗口，最终返回 504。
- **提示位置**：迁移失败和重新导入的提示显示在待办页底部的一行（可关闭），不在折叠条上。
- **新增的保护**：`apply_todos_change` 带 `baseRevision`，插件或本地接口在这之后改过的字段不会被岛屿窗口的旧值覆盖；`todos-changed` 带 `fields`。备份文件除 `todos-migration-backup.json` 外，内容不同时另存 `todos-migration-backup-<毫秒>.json`。localStorage 被清空（`todos.json` 有数据而 6 个 key 都没有）时继续用 `todos.json`，不当作"旧版本改过"。
- **`local-api-request` 保留**：迁移失败、退回 localStorage 的那次运行仍要用它。
- **敏感权限**："拒绝"也记在 `plugins.json`（不然插件可以反复弹窗），30 秒没回答只拒绝这一次。确认条叠在岛屿顶部一行，折叠和展开时都能看到，贴边收起时会先露出岛屿；全屏游戏等隐藏岛屿时用户看不到，只能等超时。
- **数据范围**：微信只有"托盘图标在闪"，所以 `messages.list` 里微信条目没有发送者和预览；`media.changed` 由 Rust 在有插件订阅时每 2 秒检查一次；文件中转的开关只在前端设置里，Rust 不知道，所以 `shelf.*` 在文件中转页关掉时也能用。
- **未做**：§3.2 的 `optionalPermissions` / `permissions.request` 和最近 200 条调用记录（不在本次的步骤里）；新的浏览器回归页；单独发版（只写了发布说明草稿）。PowerShell 的 `lib/focusd.ps1` 等回答的时间只在新示例里改成 40 秒，旧示例的包不变（它们不用敏感权限）。

### P7 岛上界面扩展点：宿主绘制的模板

**目标**：插件能在岛的展开态拥有一个页面，在折叠条上显示一小段状态，界面由岛屿绘制，风格统一。

**设计**

1. **贡献点**
   ```json
   "contributes": {
     "views": [{ "id": "board", "title": { "zh-CN": "看板", "en": "Board" }, "icon": "kanban", "template": "list" }],
     "statusItems": [{ "id": "timer", "priority": 10 }]
   }
   ```
   - `views` 每个插件最多 2 个；`icon` 只能是 lucide 图标名（不收 SVG，与 VS Code 不收 SVG 图标的理由相同）。
   - 页面 id 在岛上表示为 `plugin:<插件 id>/<view id>`。`windows/island/types.ts` 的 `IslandPage` 改为 `BuiltinPage | PluginPageId`，`features.ts` 的页面顺序、Alt+数字快捷键、页面切换都要能处理插件页面；用户可以在设置中隐藏某个插件页面，并调整顺序。
2. **模板**（第一批四种，数据由插件提供，宿主负责绘制）
   - `list`：分组、条目（标题、副标题、图标、右侧附注、勾选框、最多 3 个行内动作）、空状态、加载状态、搜索框（可选，搜索文字发给插件或在本地过滤）。
   - `detail`：标题、一段受限 Markdown（标题、粗体、斜体、行内代码、列表、链接；用 dompurify 清理；链接用系统浏览器打开）、键值元数据、底部动作。
   - `form`：复用 `contributes.settings` 的字段类型，加上 `multiline`，提交时发 `view.submit`。
   - `status`：一行或两行大字（例如倒计时）、进度条。
   - 所有模板支持中英文文案（插件提供 `{ "zh-CN", "en" }` 或纯字符串）。
3. **协议**
   - 插件调用 `view.update { viewId, model }` 替换整个模型，或 `view.patch { viewId, items }` 只更新条目。模型序列化后不超过 256 KB，每个视图每秒最多 10 次更新，超过就合并。
   - 用户操作以通知发回：`view.action { viewId, itemId?, actionId }`、`view.submit { viewId, values }`、`view.search { viewId, query }`、`view.visible { viewId, visible }`。
   - 折叠条：`status.update { itemId, text, tooltip?, tone? }`，文字最多 24 个字符；折叠条只显示优先级最高的一个，与现有的待办摘要、消息预览、Agent 标题按现有规则排队，不挤掉它们。
4. **性能**：插件页面只在可见时订阅更新（宿主收到 `view.visible false` 后暂停转发）；模板组件放在叶子组件中，避免带动整个岛重渲染（见 `docs/investigations/expansion-performance-investigation.md`）；展开高度由 `expandedHeight.ts` 按模板计算行数，滚动规则沿用剪贴板页。

**改动位置**

- 前端：新目录 `src/features/plugin-views/`（`PluginViewPage.tsx`、`templates/ListTemplate.tsx`、`DetailTemplate.tsx`、`FormTemplate.tsx`、`StatusTemplate.tsx`、`model.ts` 负责校验和规范化插件数据、`api.ts`）；`windows/island/` 的页面类型、导航、快捷键、高度计算；设置窗口增加“岛上页面”的显示与排序。
- Rust：`plugin_host/views.rs`（缓存每个视图的最新模型、限流、按窗口转发），事件 `plugin-view-changed`。
- 回归页：`tests/regression/plugin-views.html` + `.tsx`，覆盖四种模板、窄宽度、超长文字、空状态、恶意 Markdown。

**验收**：示例插件 `dev.focusd.github-issues`（列表模板，展示一个仓库的待处理 issue，点条目用浏览器打开）和 `dev.focusd.pomodoro`（状态模板加折叠条倒计时）都能正常运行；插件崩溃时页面显示“插件已停止”和重启按钮，岛屿其他页面不受影响；展开动画帧率不比现在差（按性能调查文档的方法测）。

**完成记录（2026-11-05）** ✅ 本地提交，未推送、未发版：`e7e6113` 内置页面与页面顺序收拢到一处（只搬代码）、`cac7d7f` 清单 `views` / `statusItems`、`d5c556e` Rust `views.rs`（模型缓存、限流、按可见性转发、新命令）、`2ccec82` 前端插件页面与 list 模板、`af56569` detail / form / status 模板、`dc4e430` 折叠条状态文字、`a941ce2` 设置里的「岛上页面」与插件停止页面、`226eb5f` 渲染路径与列表高度，以及文档与示例的提交。新增示例 `dev.focusd.github-issues` 1.0.0，`dev.focusd.pomodoro` 升到 1.1.0；回归页 `tests/regression/plugin-views.html`。

帧率按性能调查文档的方法测（隔离的应用标识，点击折叠条后 800 毫秒内的 rAF 间隔）：P6 的程序首次展开最大间隔 32.6–39.4 ms，之后连续展开中位数 6.8–7.0 ms；本次的程序首次 26.3–32.9 ms，之后 6.8–8.3 ms，插件列表页和每秒更新的状态页也在同一范围，800 毫秒内的帧数相同（119–124）。

与上面设计的偏差：

- **图标**：只收一份固定的 lucide 图标名单（47 个，Rust、schema 和前端三处对照测试），不是全部 lucide 图标；名单外的名字在清单里报错，在条目里换成拼图图标。这样不必把整个图标库打进前端。
- **事件**：只用一个事件 `plugin-view-changed`，用 `kind` 区分模型、状态文字和插件重启；模型只在页面可见时转发，状态文字总是转发。
- **限流**：每个页面或状态项每 100 毫秒最多发一次，期间的更新合并成最后一次（即每秒最多 10 次），不给插件返回错误。
- **折叠条状态**：做成折叠条右侧的小标签，和待办摘要、Agent 标题同时显示，而不是和它们排队轮流；有消息预览或快捷翻译时先让位；点击打开该插件的第一个页面。
- **表单**：没有直接复用设置页的 `PluginSettingField` 组件（它属于 `features/plugins`），模板自己画同样的字段类型，外加 `multiline`。
- **列表勾选**：勾选框以 `view.action { actionId: "check", checked }` 发给插件，界面以插件发回的模型为准，没有本地乐观更新。列表高度按行数在 2–8 行之间变化，超过后滚动。
- **页面顺序**：保存在 localStorage（`focusd-island-plugin-pages`），在设置 → 插件扩展的「岛上页面」里调整；数字快捷键只到 9，排在第 10 个以后的页面只能点图标或左右切换。
- **未做**：`view.patch` 只替换已有条目，不新增也不删除；表单字段不能按条件显示；没有给插件页面单独的设置开关（插件关掉，页面就消失）。

### P8 Webview：先验证，再决定

**目标**：给模板满足不了的插件（图表、自定义小工具）一个沙箱化的自定义界面。

**第一步：技术验证（必须先做，产出一份结论文档）**，要回答：

1. 在 Tauri 2 / WebView2 中，`<iframe sandbox="allow-scripts" srcdoc=...>`（不带 `allow-same-origin`）里的脚本，能不能访问 `window.__TAURI_INTERNALS__`、`ipc://` 协议或自定义协议？Tauri 的 capabilities 能否按 webview 或来源拒绝 IPC？
2. 另一条路：给插件单独开一个 Tauri webview（嵌在岛的窗口区域，或一个子窗口），label 不加入任何 capability，验证它确实调用不了任何命令。
3. 能否用 CSP 禁止外部网络（`default-src 'none'`，只允许插件包内资源经自定义协议加载）。
4. 内存开销：一个空 Webview 增加多少内存；岛屿的展开性能会不会受影响。

**通过的标准**：插件页面里的脚本无法调用任何 Tauri 命令；无法加载插件包以外的资源（除非清单声明并且用户同意）；一个 Webview 的额外内存在可接受范围（目标 < 30 MB）。任何一条做不到就不做 P8，在文档里写明原因。

**验证结果（2026-11-05）：不通过，暂不实现。** 详见 [p8-webview-validation.md](p8-webview-validation.md)。要点：Windows 上 Tauri 的 IPC 脚本和调用密钥会被注入沙箱 iframe，现在只因为 iframe 的来源是 `null` 才调用不了命令，不是设计上的保证；本应用没有应用级 ACL，单独的 webview 从本地来源加载时能调用全部应用命令；CSP 挡得住子资源，但挡不住 iframe 把自己导航到外部网址（实测可以带出数据）。内存一条通过（沙箱 `srcdoc` iframe 在同一渲染进程，测不出差别）。文档里列了重新评估的条件。下面的设计保留，供以后参考。

**第二轮验证与实现（2026-11-05）：通过，已实现。** 插件页面改用岛屿自己创建的 WebView2（与岛屿共用 WebView2 环境，但不是 Tauri 的 webview，没有任何 Tauri 脚本），所有请求和跳转在原生层拦截。隔离实例里以页面脚本的身份重跑了第一轮的检查和更多外传手段，全部挡住；页面打开时多占约 25 MB，关闭后释放。详见 [p8-webview-validation.md](p8-webview-validation.md#第二轮独立的-webview2)。

**完成记录（2026-11-05）** ✅ 本地提交：`win32/webview_page.rs`（创建与加固 WebView2，unsafe 只在这里）、`plugin_host/webviews.rs`（放行规则、提供插件文件、消息与状态、页面的创建和关闭）、前端 `WebviewTemplate`、RPC `webview.postMessage` / `webview.message`、能力 `webview`、SDK 与模拟宿主、示例 `dev.focusd.todo-ring`、市场"自定义界面"标签。

**人工验收（2026-11-06）** ✅ 在 release 版本上用示例 `dev.focusd.todo-ring` 验收通过：页面显示进度环和"完成 x / y"；点页面里的「刷新」岛屿不收起，数字随待办变化更新；切换到其他页面或岛屿收起时页面随之隐藏，不残留在屏幕上。

与下面原设计的差异：

- **不是 iframe，也不是 Tauri webview**，而是独立的 WebView2 控制器，叠放在岛屿窗口里占位框的位置（前端报告占位框的位置，原生层移动页面）。岛屿弹出的菜单等不会盖在页面上面。
- **`webviewOptions` 没做**：脚本总是开启；可加载的文件固定为 `entry` 所在文件夹（相当于只有一个 `localResourceRoots`）；**不支持 `allowNetwork`**，页面需要网络数据时由插件进程去取再发给页面。
- **页面 API**：`acquireFocusdApi()` 返回 `{ locale, postMessage, onMessage, getState, setState }`（多了 `locale` 和 `onMessage`，消息不走 `window` 的 `message` 事件）。`getState` / `setState` 只保存在内存里，岛屿重启后清空。
- **权限确认**里没有单独标注"自定义界面"，只在插件市场加标签。
- 旧版本岛屿遇到 `webview` 模板会拒绝整个清单；示例没写 `minAppVersion`，因为 fork 的版本号还没变。

**通过后的设计（照搬 VS Code 的规则）**

- 贡献点：`views[].template: "webview"`，`entry: "ui/index.html"`；`webviewOptions: { enableScripts, localResourceRoots, allowNetwork: [...] }`。
- 宿主注入固定的 CSP；资源只能从插件目录内的 `localResourceRoots` 通过自定义协议加载。
- 通信只有 `postMessage`：页面通过宿主注入的 `acquireFocusdApi()` 拿到 `{ postMessage, getState, setState }`（每个会话只能取一次）；插件进程用 `webview.postMessage` / 通知 `webview.message` 收发。页面本身拿不到任何宿主 API，需要数据时找插件进程要。
- 页面隐藏时销毁，靠 `getState/setState` 恢复（不提供 `retainContextWhenHidden`）。
- 主题：宿主注入 CSS 变量（`--focusd-text`、`--focusd-accent` 等，取自 `styles/tokens.css`），引导插件风格一致。
- 市场：带 Webview 的插件在市场和权限确认中标注“自定义界面”，审核时重点看。

### P9 运行模型：按需启动、空闲停止、进程树、资源

**设计**

1. **激活事件**：清单 `activationEvents`，取值 `onStartup`（相当于 VS Code 的 `*`，市场审核时要说明理由）、`onStartupFinished`（岛屿启动 10 秒后）、`onCommand:<id>`、`onView:<id>`、`onEvent:<事件名>`、`onSchedule:<分钟>`（每 N 分钟唤醒一次，最小 5）、`onUri`（`focusd://plugin/<id>/...` 链接；第一次之前岛上询问，见 `plugin_host/uri.rs`）。
   - 与 VS Code 1.74 以后的做法一样，**从贡献项自动推导**：声明了命令就隐含 `onCommand`，声明了视图就隐含 `onView`。没写 `activationEvents` 的旧插件按 `onStartup` 处理，保持现有行为。
   - 触发事件时插件还没启动：宿主先启动它，等 `initialize` 完成后再投递这次的命令或事件（排队，超时 10 秒）。
2. **空闲停止**：不是 `onStartup` 的插件，60 秒内没有请求、没有可见视图、没有事件订阅需要处理时，宿主发 `shutdown` 让它退出；下次事件再启动。插件可以用 `host.keepAlive { reason }` 申请常驻，设置页会显示原因。
3. **Job Object**：新增 `win32/job.rs`（unsafe 只在这里），插件进程创建后放进一个设置了 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 的 Job，结束插件时整个进程树一起结束，岛屿崩溃时 Windows 也会清理。可选设置内存上限（默认 512 MB，超过就结束并显示原因）。
4. **资源显示**：每 5 秒读取 Job 的内存和 CPU 时间（复用 `win32/process_times.rs`），在插件卡片上显示；连续 1 分钟占用 CPU 超过 25% 时在卡片上提醒。
5. **启动影响**：设置页显示每个插件的启动耗时（从启动进程到 `initialize` 完成）。

**测试**：自动推导激活事件、排队投递、空闲停止的状态机单测；Job Object 用一个会拉起子进程的测试程序（`src-tauri/examples/`）验证结束后不留下子进程。

**验收**：装 10 个非常驻插件，岛屿空闲时只运行常驻的那些；点某插件的命令，它被拉起并执行，1 分钟后自动退出；插件里 `Start-Process notepad` 启动的程序在停用插件后被一起关掉。

**完成记录（2026-11-05）** ✅ 本地提交，未推送：按需启动、空闲停止、Job Object 与资源显示在一个提交里（见 git log 中 P9 的 `feat(plugins)` 提交）。隔离实例端到端验证过：启用后不启动、点命令被拉起（`initialize.activationEvent` 为 `onCommand:spawn`）、空闲 60 秒后停止且它用 `detached` 方式拉起的 `ping` 一并结束、`host.keepAlive` 后超过 60 秒仍在运行、资源采样（约 24 MB）。

与上面设计的偏差：

- **启动耗时**：从启动进程到插件在 stdout 写出第一条消息为止（宿主不知道插件何时"处理完" `initialize`）；只写 stderr 的插件不显示。
- **内存上限**：默认 512 MB，用户可在插件设置页按插件改为 256 MB、1 GB 或 2 GB（`plugins.json` 的 `memoryLimitMb`，命令 `set_plugin_memory_limit`；清单不能声明）；超过时由宿主结束插件（状态"已出错停止"），没有用 Job 的内核内存限制（那会让分配失败而不是结束进程）。上限只算插件自己的份额：进程树的私有字节减去运行时（PowerShell、Node.js）空闲时的大小（`lifecycle.rs` 的 `plugin_own_bytes`），和插件卡片上显示的内存一致。
- **进程树**：插件以 `CREATE_SUSPENDED` 启动，放进 Job 之后再恢复运行（`win32::job::resume` 通过 Toolhelp 线程快照恢复，因为 std 不暴露主线程句柄），所以它启动的每个子进程都在 Job 里。
- **Job Object 的测试**用 `win32/job.rs` 里的单元测试（cmd 拉起 ping），没有另写 `examples/` 程序。
- **空闲判断**：订阅了不在 `activationEvents` 里的事件时视为不空闲，以免错过事件。
- **`onUri`** 没做（计划里也写了以后再加）。

### P10 开发者工具

**目标**：第三方开发者能在一小时内从零写出、调试、测试并打包一个插件。

**交付物**

1. **SDK**
   - npm 包 `fly-island-plugin`（TypeScript）：类型由 `plugins/schema/` 生成；封装请求、通知、事件订阅、视图模型构造器、`storage`、`secrets`；零运行时依赖。现有的 `plugins/sdk/node/focusd.mjs` 改为由它构建出的单文件版本，供不想用 npm 的人复制。
   - PowerShell 模块 `FlyIsland.Plugin`（PowerShell Gallery，兼容 Windows PowerShell 5.1）：现有 `lib/focusd.ps1` 的正式版，加上事件和视图辅助函数。
   - 给其他语言的协议说明（Python、Go、Rust、C# 各一个最小示例，放在 `plugins/examples/minimal-*`）。
2. **脚手架** `npm create fly-island-plugin@latest`（npm 包 `create-fly-island-plugin`）：交互式选择语言（PowerShell / TypeScript）、模板（命令、列表页面、状态项、空白），生成清单、源码、`.focusdignore`、README、LICENSE、GitHub Actions 发布工作流。
3. **CLI** `fly-island-plugin`（和 SDK 在同一个 npm 包里，安装后就有这个命令）：
   - `validate`：用 `manifest.schema.json` 校验清单，检查文件夹名、入口文件、图标、文案中英文是否齐全、权限是否都用得到（静态扫描方法名）。
   - `pack`：生成和市场完全相同的确定性 zip（复用 `scripts/plugins/build-plugin-index.mjs` 的打包代码，抽成独立包），排除 `.focusdignore` 中的文件。
   - `dev`：通知正在运行的岛屿以开发模式加载当前目录，文件变化后自动重启插件，把插件日志实时打印到终端。
   - `test`：用模拟宿主运行插件（见下）。
   - `publish`：在作者的仓库创建 GitHub Release 并上传 zip，然后向索引仓库开 PR（第一次）或触发更新（之后），流程见 P11。
4. **开发模式（岛屿内）**
   - 设置 → 插件扩展 → “开发者”区域（默认收起）：加载一个本地目录作为插件、显示原始 JSON-RPC 收发记录、手动发送事件。
   - 开发模式插件不需要打开“允许第三方插件”，但卡片上标“开发中”，岛屿重启后需要重新确认。
   - 本地接口增加 `POST /v1/dev/plugins/{id}/reload`，只在开发模式打开时可用，供 CLI 的 `dev` 使用。
5. **模拟宿主** `fly-island-plugin/test`（同一个 npm 包的子路径，不另起名字）：在 Node 里启动插件进程，实现全部宿主方法（数据放在内存里），可以注入事件、断言插件发出的请求和视图模型，可以模拟授权和拒绝。相当于 VS Code 的 `@vscode/test-electron`，但不用启动岛屿。CI 里可以直接跑。
6. **实验 API**：清单 `experimentalApis: ["views.chart"]`。只有开发模式插件能用；`validate` 和市场 CI 都拒收带此字段的插件（对应 VS Code 的 `enabledApiProposals`）。
7. **文档**：`docs/plugins/` 拆成：快速开始、清单参考、API 参考（由 `rpc.json` 生成）、界面模板指南（含截图和设计规则：文字长度、图标、何时用折叠条）、权限说明、发布指南、常见问题、更新日志（每个岛屿版本新增了哪些 API）。

**放在哪里（已决定：只放本仓库）**

```text
packages/
├── fly-island-plugin/          # npm 包：SDK + CLI + 模拟宿主（子路径 /test）
├── create-fly-island-plugin/   # npm 包：脚手架和模板
└── powershell/FlyIsland.Plugin/ # PowerShell 模块
plugins/schema/                 # 协议的唯一来源，岛屿和上面的包都读它
```

- 仓库根目录增加 `pnpm-workspace.yaml`（`packages/*`）。岛屿本身仍是根目录的包，`pnpm dev`、`pnpm tauri build` 等命令不变；`packages/` 不进入岛屿的发布产物。
- `pnpm check` 增加 `packages/` 的类型检查和测试；`scripts/check-file-size.mjs` 的扫描范围加上 `packages/`，行数上限沿用根目录规则。
- 协议改动时，在**同一个提交**里改 `plugins/schema/`、Rust 宿主和 `packages/` 的 SDK 与模拟宿主，测试对照同一份描述。
- 发布：npm 包和 PowerShell 模块用独立的版本号和标签（`sdk-v1.2.0`），和岛屿的 `v0.x.y` 分开；由一个只在推送 `sdk-v*` 标签时运行的 GitHub Actions 工作流发布（npm 用 Trusted Publishing，不放长期令牌）。
- 现在 `plugins/sdk/node/focusd.mjs` 和示例里的 `lib/focusd.ps1` 改为从 `packages/` 构建生成，`pnpm test` 检查生成结果与源码一致。

**名字（已决定：以仓库名命名）**：npm 包 `fly-island-plugin`（SDK、CLI 命令、模拟宿主都在里面），脚手架 `create-fly-island-plugin`，PowerShell 模块 `FlyIsland.Plugin`。2026-11-04 查过，这三个名字在 npm 和 PowerShell Gallery 上都还没人用；P10 开始时先发一个占位版本把名字占住。不带 `@组织/` 前缀，不需要注册 npm 组织。

**验收**：一个没接触过本项目的人，按快速开始用脚手架建一个 TypeScript 列表页面插件，`dev` 模式下改代码能在 2 秒内看到变化，`fly-island-plugin test` 在 GitHub Actions 中通过。

**完成记录（2026-11-05）** ✅ 本地提交，未推送、未发布到 npm / PowerShell Gallery（见 git log 中 P10 的提交）。`packages/fly-island-plugin`（SDK、CLI、模拟宿主）、`packages/create-fly-island-plugin`（PowerShell / TypeScript / JavaScript × command / list / status / blank）、`packages/powershell/FlyIsland.Plugin`；岛屿的开发模式与 `/v1/dev` 接口；清单 `experimentalApis`；文档 `docs/plugins/quickstart.md`、`api.md`（生成）、`changelog.md`。自动化测试覆盖 12 种语言 × 模板组合（生成、`validate`、TypeScript 编译、各自的模拟宿主测试）。隔离实例端到端验证：`fly-island-plugin dev` 加载文件夹，改文件后约 0.3 秒插件重启，终端打印日志；收发记录和手动发事件；插件目录里带 `experimentalApis` 的插件被拒绝、以开发模式加载则可用；关闭开发模式后开发中的插件被移除。

与上面设计的偏差：

- **包的写法**：仓库没有 `@types/node`，又不新增依赖，所以 SDK、CLI、模拟宿主都是不需要构建的 ESM JavaScript 加手写的 `.d.mts` 类型；协议名称的类型（`protocol.d.mts`）和 API 参考由 `pnpm sdk:build` 从 `rpc.json` 生成，`pnpm test` 检查生成结果是否最新。清单校验用包内一个只支持 schema 所用关键字的小校验器，不依赖 ajv。
- **示例插件的 `lib/focusd.ps1` 没改**：已发布版本的包内容不能变，新的单文件版本放在 `plugins/sdk/powershell/focusd.ps1`，脚手架复制它。
- **其他语言的最小示例**（Python、Go、Rust、C#）没做，快速开始里只说明了协议和启动规则。
- **开发模式**：只在内存里，岛屿重启后要重新打开；开发中的插件自动获得清单申请的全部权限（敏感权限仍询问），同 id 时取代插件目录里的插件。CLI 通过本地 API 工作，所以还需要打开本地 API 插件。除 `reload` 外另加了加载、移除和读日志三个接口。
- **实验 API**：通道已建好，但岛屿目前没有任何实验 API，`initialize.experimentalApis` 总是空列表。
- **`publish`**：只打包并打印发布步骤；创建 Release 交给脚手架生成的 GitHub Actions 工作流。向索引仓库开 PR 等 P11 的索引仓库建好后再做。
- **pnpm workspace** 只列出两个 npm 包（不含 PowerShell 模块），`check:size` 已扫描 `packages/`。
- **未做**：PowerShell Gallery 发布、`sdk-v*` 标签的发布工作流（都需要维护者账号）。npm 的 `fly-island-plugin` 和 `create-fly-island-plugin` 已于 2026-11-05 发布 0.1.0。

### P11 市场：能接收外部作者

**目标**：外部作者不需要私钥、不需要本仓库写权限，就能把插件上架和更新；有问题的插件能及时下架。

**设计**

1. **索引仓库**：在 `TixXin` 账号下新建 `TixXin/focusd-plugins`（已决定，见第 8 节）。结构：
   ```text
   plugins/<插件 id>.json     # 作者提交：{ id, repo: "owner/name", publisher: "<GitHub 用户或组织>", categories, ... }
   index.json / index.json.sig # CI 生成，不接受人工修改
   revoked.json               # 黑名单：[{ id, versions: "*" | ["1.2.0"], reason, action: "disable" | "uninstall" }]
   ```
   插件包不再存在索引仓库中，而是作者仓库的 GitHub Release（Obsidian 的做法）：Release 标签等于清单 `version`，附件是 `fly-island-plugin pack` 生成的 `<id>-<version>.zip`。
2. **第一次提交**：作者（或 `fly-island-plugin publish`）向索引仓库开 PR，只新增 `plugins/<id>.json`。CI 检查：
   - PR 作者对 `repo` 有写权限（用 GitHub API 查），`publisher` 等于仓库所有者；
   - 插件 id 没被占用，不与已有 id 过于相似（防抢注），不包含 `focusd`（官方保留，参照 Obsidian 不允许 id 含 `obsidian`）；
   - 从 Release 下载 zip，大小 ≤ 20 MB，用 `validate` 校验，确认清单 id / version 与标签一致，zip 可以重现（重新打包得到同样的哈希）；
   - 扫描密钥（类似 VS Code 发布时的检查）；可选：把 zip 提交给 VirusTotal，等待结果；
   - 在评论里列出申请的权限、是否有 Webview、激活事件，方便人工审核。
   - **人工审核源码**后合并。
3. **后续版本**：作者发布新 Release 即可。索引仓库的定时 CI（每小时）检查已收录插件的最新 Release，自动执行同样的校验（不需要人工审核，**除非**新版本申请了新权限、加了 Webview 或改了 `repo`，这时自动开 PR 等人工批准），通过后更新 `index.json`。
4. **签名移到 CI**
   - 在索引仓库的 GitHub Actions 中用仓库密钥（Environment secret，需要审批的 `release` 环境）签名索引。
   - `plugins/signing-keys.json` 支持多个公钥：把 CI 的公钥加进去，随一个岛屿版本发布；之后 CI 签名的索引就被新版本接受。老版本岛屿仍然只认现有的私钥，所以在过渡期内，由现有私钥的持有者对 CI 生成的索引再签一份（`index.json.sig` 改为数组 `[{ keyId, signature }]`，岛屿接受其中任一有效签名）。这是索引格式的契约变更，需要同时兼容旧格式。
   - 签名覆盖 `index.json` 和 `revoked.json`。
5. **发布者与信任**
   - 发布者就是 GitHub 用户或组织。市场显示发布者名称和头像（只用 GitHub 上的公开信息）。
   - 第一次安装某个发布者的插件时，岛屿询问是否信任这个发布者（与 VS Code 1.97 的做法一致），信任列表可以在设置中管理。
   - 官方发布者（本项目）在市场上显示“官方”。以后可以考虑“已验证”（例如关联域名），先不做。
   - 可选的作者签名（以后再做）：作者用自己的密钥签 zip，第一次提交时登记公钥，之后的版本必须用同一个公钥签。这可以防止作者仓库被盗后发布恶意版本。
6. **黑名单**：岛屿每次刷新索引（启动时和之后每 6 小时，后台进行）都读取 `revoked.json`。命中的插件立即停止并禁用，插件卡片显示原因；`action: "uninstall"` 时直接删除插件目录（保留 `plugins-data`）。手动放进插件目录的同 id 插件也会被拦截，开发模式除外。
7. **自动更新**：后台刷新索引后，已安装插件有新版本时：默认只在插件卡片和市场页提示“有新版本”，由用户点更新。设置中可以打开“自动更新插件”（默认关）：打开后不增加权限的更新自动安装，并在卡片上显示“已更新到 x.y.z”；需要更多权限的更新始终只提示，不自动安装。
8. **市场页面**：分类筛选、搜索（名称、描述、发布者）、详情页（README 用受限 Markdown 渲染，图片只允许 https 且来自作者仓库，参照 VS Code 不允许 SVG 的做法）、版本历史和更新说明、“需要的权限”和“自定义界面”标签、发布者信息、“报告问题”链接（打开索引仓库的 issue 模板）。
9. **预发布版本（可选）**：参照 VS Code 的“偶数次版本号为正式版”约定，`plugins/<id>.json` 中允许 `"preRelease": true`，用户在插件设置页选择接收预发布版本。

**改动位置**

- 新仓库：索引结构、CI 工作流（校验、自动更新、签名）、PR 模板、审核清单、`CONTRIBUTING.md`。
- 本仓库 Rust：`plugin_host/market.rs` 改用新的索引地址，支持多签名、`revoked.json`、发布者信任；新增 `plugin_host/updates.rs`（后台刷新与自动更新）。
- 前端：`PluginMarketSection` 增加搜索、分类、详情页；`PluginCard` 显示发布者、已撤销状态、自动更新结果。
- 文档：`docs/plugins/README.md` 的“提交插件”一节改为新流程；`docs/plugins/vscode.md` 的分发对照同步更新。

**验收**：一个外部账号按文档上架插件，从开 PR 到在岛屿市场里看到不超过一个工作日（审核时间除外）；作者发布新 Release 后 1 小时内岛屿能看到更新；把一个版本加进 `revoked.json` 后，已安装它的岛屿在下一次刷新时停止并禁用它。

**完成记录（2026-11-05，岛屿端）** ✅ 本地提交，未推送：岛屿这一侧的多签名、黑名单、发布者信任、后台检查与自动更新、市场搜索 / 分类 / 详情在一个 `feat(plugins)` 提交里，文档另一个提交。

- **多签名**：`index.json.sig` 可以是单个 `{ keyId, signature }`，也可以是数组，任一可信公钥的有效签名即通过；`scripts/plugins/plugin-signing.mjs` 的校验同样接受数组。
- **`revoked.json`**：`{ "version": 1, "revoked": [{ id, versions: "*" | ["1.2.0"], reason: { "zh-CN", "en" }, action: "disable" | "uninstall" }] }`，配 `revoked.json.sig`（同样的签名格式）；与 `index.json` 从同一个提交读取，文件不存在（404）视为空列表，签名不对则整个市场刷新失败。命中的版本立即停止；`disable` 禁用，`uninstall` 删除插件目录（保留 `plugins-data`）。名单存进 `plugins.json` 的 `revoked`，离线时仍然生效；被撤销的版本不能启用、不能从市场安装；开发模式的插件不受影响。`pnpm plugins:index` 同时签名 `revoked.json`。
- **发布者**：索引条目新增 `publisher`、`repo`、`categories`、`preRelease`，由 `pnpm plugins:index` 从 `plugins/market/<id>.json` 读取；没有 `publisher` 的条目按官方发布者 `TixXin` 处理。官方发布者总是可信，市场上显示“官方”。安装其他发布者的插件时按钮变为“信任并安装”，信任列表存进 `plugins.json` 的 `trustedPublishers`，可以在插件设置页取消。
- **后台检查**：只在允许第三方插件时运行，启动 30 秒后检查一次，之后每 6 小时一次，也可以在设置里手动检查。检查会应用黑名单，并在卡片上提示“有新版本”。
- **自动更新**：默认关，存进 `plugins.json` 的 `autoUpdate`。打开后只自动安装来自可信发布者、且不申请新权限的更新，卡片显示“已更新到 x.y.z”。
- **市场页**：搜索名称、描述、id 与发布者，按分类筛选（`productivity`、`todos`、`developer`、`media`、`messages`、`information`、`utilities`），每个条目可展开详情：权限、运行时、仓库、主页和“报告问题”。

**与设计的差异**

- **索引仓库已建，岛屿还没切过去**：岛屿仍从 fork 的 `main` 读市场（见下面“索引仓库”）。
- **发布者信息**来自 `plugins/market/<id>.json`，不显示 GitHub 头像（避免在设置页请求外部图片）。
- **预发布版本**（2026-11-06）：按插件选择。插件详情页有「接收这个插件的预发布版本」开关（`plugins.json` 的 `plugins.<id>.preRelease`，新命令 `set_plugin_pre_release`）；打开后更新取比正式版新的最新预发布版本。版本比较按 semver（`compare_versions`：`1.3.0-beta.1` < `1.3.0-beta.2` < `1.3.0`），只用于判断市场版本是否更新；岛屿版本兼容检查仍忽略预发布后缀。市场页只列正式版，只有预发布版本的插件不上架。没有采用设计里“偶数次版本号为正式版”的约定。
- **详情页**（2026-11-06）：插件文件夹里的 `README.md` 和 `CHANGELOG.md` 由 `pnpm plugins:index` 写进索引的 `readme`、`changelog`（各最多 16 KB，和索引一起签名），市场详情里显示为「插件说明」和可展开的「版本历史」。渲染用 `src/components/markdown/` 的小型 Markdown 子集，只生成元素、不插入 HTML，链接只放行 http(s) 并交给默认浏览器打开。示例插件把这两个文件写进 `.focusdignore`，所以加文档不会改变已发布的包。没有单独的“这个版本的更新说明”，看版本历史的第一节。「报告问题」在索引写了 `repo` 时指向那个仓库的 issue，否则指向本仓库。
- **作者签名、“已验证”发布者**没做（设计里本来就是以后再做）；设计见 [plugin-author-signing.md](plugin-author-signing.md)（2026-11-06 已审：签名可选、自动更新只给签了名的插件、“已验证”发布者要做）。

**索引仓库（2026-11-05）** ✅ [`TixXin/focusd-plugins`](https://github.com/TixXin/focusd-plugins) 已建好并运行：

- 结构：`plugins/<id>.json`（作者提交）；仓库根目录的 `index.json`、`revoked.json` 和它们的 `.sig`（CI 生成）；`keys/trusted.json`（与本仓库 `plugins/signing-keys.json` 一致）。
- `Check submission`（每个 PR，只读、无密钥）：检查格式、id 是否被占用或易混淆、`focusd` 保留、PR 作者拥有 `repo`（本人或组织的公开成员），下载最新 Release 附件，用 `fly-island-plugin validate` 校验，重新打包核对，把权限、运行时、webview 写进运行摘要。
- `Update index`（每小时、`main` 变化时）：已上架的版本不重新下载；新版本申请新权限、首次加 webview 或改运行时则暂缓，开 `review-needed` issue，维护者在提交里写 `"approved": "<版本>"` 后上架。签名用 `release` 环境的 secret，该环境只允许 `main` 使用；**没有设人工审批**，否则每小时都要批准一次。
- CI 公钥 `e862885af5bba3dc` 已加进 `plugins/signing-keys.json`。旧密钥 `7ee2729370070df6` 保留，fork 里的索引仍由它签名。
- 官方示例插件的提交用 `"package"` 固定指向 fork 里的 zip（只允许官方发布者），没有在本仓库建按插件的 Release，以免影响岛屿更新用的 `releases/latest`。第一次 CI 生成的 5 个条目与 fork 的 `plugins/index.json` 完全一致。
- **还没做**：岛屿改读新仓库（`market.rs` 的 `MARKET_REPO`，索引在仓库根目录而不是 `plugins/`）。要等带 CI 公钥的版本普及后再切；在此之前，旧版本仍读 fork，切换时需要由旧密钥对新索引再签一份（`index.json.sig` 数组），或者继续在 fork 同步索引。`docs/plugins/README.md` 的“提交插件”一节也等切换时再改。

### 审查修复（2026-11-06）

对插件宿主做了一次代码审查，修复的问题：

- **管道**：发给插件的消息改走每个插件自己的有界队列，由单独线程写入（`runtime/outbox.rs`）。以前事件是在持有全局锁时同步写管道的，一个不读输入的插件会卡住整个插件宿主，连停止它都做不到；现在积压 512 条就结束这个插件。消息超过 1 MB 或读不了输出时会真正结束进程（以前只写日志、进程一直挂着）；stderr 按行限 1 MB；`stop()` 等进程退出并关闭 job 后才返回，紧接着卸载或更新不会碰到被占用的文件。Node SDK 在 `shutdown` 后关闭输入时会等 `onShutdown` 处理完。
- **敏感权限**：撤销后立即删除该插件需要此权限的事件订阅，并且每次推送敏感事件前再查一次当前授权。以前要等插件重启才停止推送。
- **事件**：`messages.received` 在 200 ms 内收到的每条消息都送达（最多 50 条），以前只送最后一条。
- **进程同步**：`sync_processes` 改为串行执行，避免另一次同步刚启动的按需插件被停掉、触发它的命令丢失。媒体监听线程退出的同时有插件订阅，也能继续监听。
- **黑名单与市场**：下载到的 `revoked.json` 只往保存的名单里加条目（防止 CDN 旧副本或 404 解除下架）；安装时同时检查保存的名单；不安装比已装版本更旧的版本。
- **存储**：`plugins.json` 先写临时文件再改名。卸载插件时删除它保存的网页状态。
- **本地接口**：开发模式的加载、重新加载、移除需要打开“允许修改”。
- **开发模式**：开发中的插件的岛上页面和网页页面能正常显示（以前要求 `plugins.json` 里有“已启用”记录）。

确认后不改的：

- **插件进程能读当前用户的凭据**（包括邮箱授权码）：插件以用户身份运行，权限只管岛屿接口。AppContainer 或受限令牌会让 Node.js / PowerShell 插件无法正常工作，所以不做；改为在设置页的风险提示和“信任发布者”提示里写清楚，见 [插件文档](../plugins/README.md)。
- **插件网页的 WebRTC 屏蔽可能被同源 `about:blank` iframe 绕过**：页面数据都来自它自己的插件进程，而插件进程本来就能联网，绕过不会多拿到东西；要彻底禁用得改整个岛屿共用的 WebView2 启动参数，不值得。
- **索引仓库的签名没有人工审批**：每小时的构建无法每次等人批准。只有维护者能推送 `main`；`main` 加了分支保护（禁止强推和删除，对管理员也生效），外部作者只能通过 PR 提交，由维护者审核源码后合并。

## 5. 对外契约变化汇总

| 阶段 | 变化 | 兼容方式 |
|---|---|---|
| P5 | 清单：`apiVersion: 2`、`commands[].keybinding/when`、`menus`；RPC：`events.*`、`event`、`island.notify`、`notification.action`、`storage.*`、`secrets.*`；权限：`island:notify`、`secrets`；凭据条目 `com.focusd.island.plugin.<id>`；文件 `plugins-data/<id>/storage.json`；事件 `plugin-host-event` | 全部新增，`apiVersion: 1` 插件不受影响 |
| P6 | 待办和笔记移到 `todos.json`；新命令 `get_todos_state`、`apply_todos_change`，事件 `todos-changed`；迁移标记 `focusd-island-todos-migrated-v1`；新权限 `clipboard:read`、`messages:read`、`media:read`、`media:control`、`shelf:read`、`shelf:write`；`plugins.json` 增加 `sensitive` 授权 | 首次启动迁移，旧 localStorage key 保留；`local-api-request` 只在确认无用后删除 |
| P7 | 清单 `views`、`statusItems`；RPC `view.*`、`status.update`；岛上页面 id `plugin:<id>/<view>`；事件 `plugin-view-changed` | 新增 |
| P8 | 清单 `views[].template: "webview"`、`entry`、`height`；RPC `webview.postMessage`、通知 `webview.message`；能力 `webview`；页面 API `acquireFocusdApi()`；Tauri 命令 `show_plugin_webview`、`hide_plugin_webview`；索引字段 `webview` | 新增；不支持的旧版本拒绝含 `webview` 页面的清单 |
| P9 | 清单 `activationEvents`；RPC `host.keepAlive` | 没写的插件按 `onStartup` 处理 |
| P10 | 清单 `experimentalApis`；本地接口 `POST /v1/dev/plugins/{id}/reload` | 新增 |
| P11 | `index.json.sig` 支持数组；新增 `revoked.json`（`.sig`）；索引条目增加 `publisher`、`categories`、`repo`、`preRelease`；`plugins.json` 增加 `revoked`、`trustedPublishers`、`autoUpdate`；新命令 `set_plugin_auto_update`、`set_plugin_publisher_trusted`、`check_plugin_updates`（索引地址暂未改到新仓库） | 岛屿同时接受旧的单签名格式；新字段都可省略 |

## 6. 顺序与依赖

```text
P5 API 第 2 版 ──┬──> P6 数据下沉 ──> P7 岛上模板 ──> P9 按需启动
                 │                          │
                 │                          └──> P8 Webview（验证通过才做）
                 └──> P10 开发者工具（可与 P6、P7 并行，跟随 API 增量更新）
P10 + P7 ──> P11 外部市场
```

- **P5 先做**：所有后续阶段都依赖能力协商、事件和协议描述。
- **P6 在 P7 之前**：岛上页面会频繁读写和订阅数据，依赖可靠的变化事件。
- **P9 在 P7 之后**：有了 `onView`，按需启动才有意义。
- **P11 放最后**：在 API 和工具稳定之前大量收录外部插件，以后改 API 的代价会很高。

粗略工作量（单人，包括测试和文档）：P5 约 2 周，P6 约 2 周，P7 约 3 周，P8 验证 3 天、实现约 2 周，P9 约 1 周，P10 约 3 周，P11 约 3 周。

## 7. 风险

| 风险 | 应对 |
|---|---|
| P6 数据迁移出错导致用户丢待办 | 旧 key 不删；迁移前备份原文；写后读回比较；失败时继续用 localStorage 并提示；回退旧版本后再升级时重新导入；在真实旧版本上验证完整的自动更新流程（见 P6） |
| 插件页面拖慢岛屿展开 | 模板组件放叶子组件，按可见性暂停更新，限流；按性能调查文档的方法复测 |
| Webview 沙箱验证不通过 | P8 只是可选项；模板覆盖大多数需求 |
| API 发布后改不动 | 实验通道先行；协议描述是唯一来源；大版本至少兼容一代 |
| 外部插件作恶 | 默认关闭第三方、权限白名单、敏感权限二次确认、人工审核首版和权限变化、黑名单、发布者信任 |
| 签名密钥丢失或泄露 | 支持多公钥和多签名；CI 密钥放在需要审批的环境；现有私钥另做离线备份 |
| 维护者审核跟不上 | 只有首版和权限变化需要人工；普通更新全自动 |
| 和上游 PR #36 的关系 | 索引仓库放在 `TixXin` 账号下，与上游仓库无关；PR #36 合并后，岛屿读取的索引地址不变 |

## 8. 已决定的问题

全部已决定（2026-11-04）：

| # | 问题 | 决定 |
|---|---|---|
| 1 | 市场索引仓库放在哪 | `TixXin` 账号下（`TixXin/focusd-plugins`），签名密钥放在这个仓库的 CI 里 |
| 2 | 开发者工具放在哪 | 只放本仓库的 `packages/`，仓库改为 pnpm workspace（见 P10） |
| 3 | 待办和笔记是否移到 Rust | 移，并且要处理好从已发布旧版本自动更新时的数据迁移（见 P6） |
| 4 | 插件自动更新 | 默认关，只提示有新版本 |
| 5 | 敏感数据 | 剪贴板和消息预览开放给第三方插件，第一次调用时要用户确认；凭据永不开放 |
| 6 | npm 包名和 PowerShell 模块名 | 以仓库名命名：`fly-island-plugin`、`create-fly-island-plugin`、`FlyIsland.Plugin` |

## 9. 来源

VS Code 官方文档（2026-11-04 抓取）：

- Extension Host：<https://code.visualstudio.com/api/advanced-topics/extension-host>
- Activation Events：<https://code.visualstudio.com/api/references/activation-events>
- Contribution Points：<https://code.visualstudio.com/api/references/contribution-points>
- Extension Manifest：<https://code.visualstudio.com/api/references/extension-manifest>
- Webview API：<https://code.visualstudio.com/api/extension-guides/webview>
- Workspace Trust：<https://code.visualstudio.com/api/extension-guides/workspace-trust>
- Extension runtime security：<https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security>
- Publishing Extensions：<https://code.visualstudio.com/api/working-with-extensions/publishing-extension>
- Testing Extensions：<https://code.visualstudio.com/api/working-with-extensions/testing-extension>
- Using Proposed API：<https://code.visualstudio.com/api/advanced-topics/using-proposed-api>
- Your First Extension：<https://code.visualstudio.com/api/get-started/your-first-extension>
- UX Guidelines：<https://code.visualstudio.com/api/ux-guidelines/overview>

其他：

- Open VSX 发布：<https://github.com/eclipse/openvsx/wiki/Publishing-Extensions>
- Raycast 发布扩展：<https://developers.raycast.com/basics/publish-an-extension>
- Obsidian 提交插件：<https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin>

未核实：VS Code 官方页面没有写多个扩展是否共用同一个 Extension Host 进程，以及宿主崩溃后如何恢复；本文没有依赖这两点。
