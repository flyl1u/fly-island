# 插件系统设计（草案）

> 状态：**提案，未实施**。本文用于评审方向，评审通过后再拆成实施计划。
> 前置条件：结构重构（[refactor-plan.md](refactor-plan.md)）Phase 6、Phase 7 完成之后再开工，避免把旧结构固化成对外契约。

## 1. 目标与非目标

**目标**

- 默认安装只包含现有功能；小众需求（待办对外接口、更多 AI Agent 适配等）以插件形式按需安装。
- 让第三方开发者不改主程序、不编译 Rust 也能扩展岛屿。
- 插件不能拿到用户的敏感数据（凭据、剪贴板历史、邮件正文、QQ / 微信通知），除非明确授权且该能力已开放。
- 插件崩溃、卡死不影响岛屿本身。

**非目标（至少第一版不做）**

- 插件任意修改岛屿布局或注入 CSS。
- 付费插件、账号体系、评分评论。
- 自建插件服务器（先用 GitHub 托管索引）。

## 2. 调研：其它产品怎么做

> 说明：本节依据各产品官方文档整理（2026-11-04 抓取）。uTools、Logseq、Flow Launcher 的文档本次没能抓取到，标注"未核实"的内容来自既有了解，实施前需要再确认。

| 产品 | 插件运行方式 | 隔离程度 | 分发与审核 |
|---|---|---|---|
| **VS Code** | 独立的 Extension Host 进程（Node.js），按"激活事件"懒加载 | 进程隔离，保证插件不拖慢 UI；不限制文件和网络 | 官方市场 |
| **Raycast** | 所有扩展跑在一个子 Node 进程里，每个扩展一个 V8 isolate；通过 stdio 上的 RPC 只暴露一组定义好的 API；UI 由 React 组件描述、Raycast 原生渲染 | 官方明确说明**不额外沙箱**文件 / 网络 | 开源，PR 到公共仓库，人工 + CI 审核后上架 |
| **Obsidian** | 插件 JS 直接在主程序里运行 | **无沙箱**，插件拥有 Obsidian 的全部权限 | `community-plugins.json` 索引 + 插件仓库的 GitHub Release（`manifest.json`、`main.js`、`styles.css`）；默认开启"受限模式"，用户手动关闭后才能运行第三方插件；每个版本自动扫描并展示安全评分 |
| **Figma** | 逻辑跑在主线程的 JS 沙箱里（最初用 Realms，出现漏洞后换成编译成 WASM 的 JS 虚拟机）；UI 跑在 null-origin iframe 里，两者用消息通信 | 白名单式沙箱，强隔离 | 官方社区 |
| **Zed** | Rust 编译成 WASM 组件，用 WIT 定义接口，在 Wasmtime 里运行 | WASM 沙箱，强隔离；代价是 API 很窄（没有自定义 UI、任意 HTTP、任意文件访问） | `extensions` 仓库作为索引，CI 构建后上传，官方也承认这种方式不好扩展 |
| **Stream Deck** | 每个插件是一个本地 Node.js 进程，通过 WebSocket 接收应用事件；配置界面（Property Inspector）是应用内渲染的 HTML | 进程隔离，不限制系统权限 | 官方 Marketplace |
| **MCP** | 宿主为每个服务器建一个客户端连接；本地服务器走 stdio，远程走 HTTP；JSON-RPC 2.0，有能力与版本协商、`*/list` 发现、通知订阅 | 进程隔离 | 不规定分发方式 |
| **uTools**（未核实） | `plugin.json` 声明功能入口，`preload.js` 拿到 Node 能力，界面是网页 | 弱 | 官方审核上架 |
| **Flow Launcher**（未核实） | JSON-RPC 插件：任意语言写的可执行文件，通过 stdin / stdout 通信 | 进程隔离 | GitHub 上的插件清单仓库 |

### 从调研中得出的结论

1. **桌面工具里几乎没人做真正的沙箱**（Raycast、Obsidian、VS Code、Stream Deck 都不限制系统权限）。它们的安全靠三样东西：**进程隔离保证稳定性**、**公开源码加审核**、**默认关闭第三方插件**。真正做到强沙箱的是 Figma 和 Zed，代价分别是投入多年的工程量，以及非常窄的 API。
2. **"宿主渲染 UI"比"插件自带 UI"更适合小空间**。Raycast 让插件只描述"列表 / 详情 / 表单"，由宿主统一渲染，所以风格一致，也不存在 UI 注入风险。岛屿空间比 Raycast 还小，更应该这么做。
3. **用协议做扩展，比用代码做扩展更持久**。MCP、Stream Deck、Flow Launcher 都是"任意语言的进程加 JSON 协议"，宿主换实现也不会破坏插件。我们现有的 AI Agent hook（标记文件加 `agent-status.json`）本质上就是一个协议。
4. **"GitHub 索引仓库加 Release 下载"是小团队最现实的分发方式**（Obsidian、Zed、Flow Launcher 都在用）。缺点是规模大了不好扩展，但我们短期不会遇到这个问题。
5. **默认关闭第三方插件**（Obsidian 的受限模式）是成本最低、收益最高的安全措施。

## 3. 方案比较

| 方案 | 说明 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| A. 插件 JS 直接在主 WebView 运行（Obsidian 式） | 动态 `import()` 插件脚本 | 开发最简单，能做任意 UI | 主 WebView 能调用全部 Tauri 命令（凭据、剪贴板、邮件），等于把这些全部交出去；一个插件出错可能拖垮岛屿 | ❌ 不采用 |
| B. 加载 DLL / Rust 动态库 | `libloading` | 原生能力最强 | Rust 没有稳定 ABI；零隔离；崩溃即退出 | ❌ 不采用 |
| C. **进程插件 + JSON-RPC** | 宿主启动插件进程，通过 stdio 用 JSON-RPC 通信；插件只能通过宿主 API 读写岛屿数据 | 任意语言；崩溃不影响宿主；协议稳定；与 MCP / Stream Deck 同构 | 插件进程本身拥有用户的系统权限，不受沙箱约束 | ✅ **主方案** |
| D. **声明式插件（无代码）** | 只有清单和资源：状态源定义、预设主题、设置项 | 零运行风险，审核简单 | 能力有限 | ✅ **与 C 并行**，覆盖很多简单需求 |
| E. WASM 插件（Extism / Wasmtime） | 插件编译成 WASM，宿主按需注入函数 | 真正的沙箱 | 开发门槛高，生态小，体积和工期都大 | ⏸ 以后如果确实需要运行"不信任的代码"再考虑 |
| F. iframe 界面插件 | 插件 HTML 跑在 sandbox iframe 中，通过 `postMessage` 与宿主通信 | 能自定义界面 | 需要验证 Tauri 2 在 WebView2 下 iframe 无法访问 IPC；风格难统一；岛屿空间太小 | ⏸ 第一版不做，先用宿主渲染的模板 |

**推荐：C + D，再配上宿主渲染的 UI 模板。** 承认进程插件不受沙箱约束，安全靠"权限只管宿主 API"、"默认关闭"、"开源审核"、"哈希校验"这几层叠加。

## 4. 总体架构

```text
┌──────────────── 前端（main / settings）────────────────┐
│ 待办、笔记等数据（localStorage）    插件 UI 模板渲染器      │
└───────▲─────────────────────────────────▲──────────────┘
        │ 事件桥（请求 / 应答）             │ 事件
┌───────┴──────────────── Rust ──────────┴──────────────┐
│ plugin_host：清单解析 · 权限检查 · 进程管理 · 事件总线    │
│ local_api：127.0.0.1 HTTP（给脚本和外部程序用）          │
└───────▲───────────────────────────▲───────────────────┘
        │ stdio JSON-RPC             │ HTTP + token
   进程插件（任意语言）          外部脚本 / AutoHotkey / Raycast / MCP 适配器
```

两个入口共用同一套 **宿主 API** 和同一个权限检查：

- **进程插件**：由宿主启动和管理生命周期，通过 stdio 走 JSON-RPC。
- **本地 API**：不由宿主管理的外部程序使用。这正是"待办外部接口"的需求，**它是核心功能，不是插件**。

### 4.1 关键问题：数据属于前端

待办、笔记、归档目前存放在 WebView 的 `localStorage` 中，由 `features/todos/storage.ts` 管理，Rust 端读不到。可选做法：

| 做法 | 说明 | 评价 |
|---|---|---|
| ① 事件桥 | Rust 收到请求后 `emit_to("main", "plugin-api-request", {id, method, params})`，前端执行后调用命令回写结果，Rust 端等待（带超时） | ✅ 第一版采用：不改存储契约，前端仍是唯一数据所有者，界面也能实时刷新 |
| ② 迁移到 Rust 存储 | 待办改由 Rust 写入应用数据目录下的文件 | 更彻底，但属于对外契约变更，需要迁移旧数据，单独立项 |

`main` 窗口总是存在（只会隐藏），所以 ① 可行。前端用一个 `features/plugin-bridge/` 统一分发请求，各 feature 只暴露有限的方法，不直接把 storage 交给桥。

## 5. 插件清单（`focusd-plugin.json`）

```json
{
  "id": "dev.example.todo-sync",
  "name": { "zh-CN": "待办同步", "en": "Todo Sync" },
  "description": { "zh-CN": "把待办同步到 xxx", "en": "Sync todos to xxx" },
  "version": "1.2.0",
  "apiVersion": 1,
  "minAppVersion": "0.3.0",
  "author": "example",
  "homepage": "https://github.com/example/focusd-todo-sync",
  "runtime": {
    "type": "process",
    "command": "bin/todo-sync.exe",
    "args": []
  },
  "activation": ["onStartup"],
  "permissions": ["todos:read", "todos:write", "island:notify"],
  "contributes": {
    "settings": [
      { "key": "token", "type": "secret", "label": { "zh-CN": "访问令牌", "en": "Token" } },
      { "key": "interval", "type": "number", "default": 5, "min": 1, "max": 60,
        "label": { "zh-CN": "同步间隔（分钟）", "en": "Interval (min)" } }
    ],
    "statusSources": [],
    "commands": [
      { "id": "sync-now", "title": { "zh-CN": "立即同步", "en": "Sync now" } }
    ]
  }
}
```

- `runtime.type`：`process`（方案 C）或 `none`（方案 D，纯声明）。
- `apiVersion`：宿主 API 的大版本。宿主同时支持当前版本和上一个版本；不兼容的插件显示"需要更新"，不加载。
- `activation`：参考 VS Code 的懒加载，取值如 `onStartup`、`onCommand:<id>`、`onEvent:todos.changed`，避免一安装就常驻进程。
- 所有用户可见文字都要求同时提供 `zh-CN` 和 `en`，与主程序的双语规则一致。
- `settings`：由宿主按声明渲染设置表单，插件不用写 UI；`secret` 类型存入凭据管理器，条目为 `com.focusd.island.plugin.<id>`。

## 6. 宿主 API 与权限

插件与宿主之间用 JSON-RPC 2.0 通信，借鉴 MCP 的做法：建立连接时先协商版本和能力，再用 `*/list` 发现，事件需要订阅。

| 权限 | 方法 / 事件 | 第一版 |
|---|---|---|
| `todos:read` | `todos.list`、`todos.get`、事件 `todos.changed` | ✅ |
| `todos:write` | `todos.add`、`todos.update`、`todos.complete`、`todos.remove` | ✅ |
| `notes:read` / `notes:write` | 每日笔记的读写 | ✅ |
| `island:notify` | `island.notify`：在折叠态显示一条短消息（由宿主渲染，限制频率） | ✅ |
| `agent-status:write` | `agentStatus.report({ source, phase, taskId })` | ✅ |
| `storage` | 插件私有的键值存储（应用数据目录 `plugins-data/<id>/`） | ✅（默认授予） |
| `media:read` | 当前播放信息 | 以后 |
| `clipboard:*`、邮件、QQ / 微信通知、凭据 | — | ❌ 不开放，以后也要单独评审 |

需要说明的是：**权限只限制插件能调用哪些宿主 API，不能阻止进程插件自己读文件、联网**。这一点要在安装确认框里明确告诉用户，参考 Obsidian 的措辞。

### 本地 API（给外部程序）

- 只监听 `127.0.0.1`，端口随机；端口和随机 token 写入应用数据目录的 `local-api.json`（只有当前用户可读）。
- 每个请求都要带 `Authorization: Bearer <token>`；校验 `Host` 头以防 DNS 重绑定；不开 CORS，网页无法调用。
- 默认关闭，在设置页手动开启，可以单独授权 `todos:read` / `todos:write`。
- 路由与 JSON-RPC 方法一一对应，例如 `POST /v1/todos` 对应 `todos.add`。
- 可以另外发布一个**官方 MCP 适配插件**，把待办 API 包装成 MCP 工具，Claude Code、Codex 等就能直接读写待办，正好和 AI Agent 功能形成联动。

## 7. UI 扩展点（宿主渲染）

插件不提供 HTML，只提交结构化数据，由宿主用现有组件渲染，保证符合 `DESIGN.md`、窄窗口不溢出：

| 扩展点 | 插件提供 | 宿主渲染 |
|---|---|---|
| 状态灯来源 | `statusSources` 声明加 `agentStatus.report` | 复用现有状态灯，在设置里选择要显示哪些来源 |
| 折叠态短消息 | `island.notify({ text, icon, durationMs })` | 复用折叠态消息动画 |
| 设置分区 | `contributes.settings` | 设置窗口"插件"页下的通用表单 |
| 命令 | `contributes.commands` | 设置页里的按钮，以后可接入快捷键 |
| 展开态面板（以后） | 列表 / 详情模板数据（参考 Raycast 的 `List` / `Detail`） | 新的通用面板组件 |

## 8. AI Agent 适配：协议化

现在的 hook 方案（`agent-*-running.flag` 加 `agent-status.json`，见 [agent-status-hooks.md](../agent-status-hooks.md)）只认 `codex`、`claudeCode` 两个 id。建议：

1. 把来源 id 改成开放集合：`agentStatus.report` 和本地 API 接受任意已声明的 `source`。
2. Codex 和 Claude Code 的适配保留为**内置**，它们的 hook 安装逻辑不变（已有契约）。
3. 新增的 Agent（Cursor、Gemini CLI、Aider 等）作为插件：多数只需要一个**声明式插件**加一段 hook 命令，hook 调用 `focusd-agent-report <source> <phase>`（或者本地 API），不需要常驻进程。

这条路既不破坏现有用户的 hook，又让新的 Agent 适配不再需要发版。

## 9. 安装、存储与生命周期

- 插件目录：`%APPDATA%\com.focusd.island\plugins\<id>\`；私有数据：`plugins-data\<id>\`；启用状态与授权记录：`plugins.json`。这些都是新增契约，落地时登记到 [overview.md](overview.md#对外契约清单)。
- **受限模式**：第三方插件默认不运行，用户在设置中开启"允许第三方插件"后才运行。内置插件不受影响。
- 安装时展示权限清单让用户确认；升级时如果权限变多，需要重新确认。
- 进程管理：插件崩溃后按退避策略重启（例如 1s、5s、30s，连续失败三次后停用并提示）；每个请求设置超时；停用或卸载时结束进程（使用 Job Object，确保子进程一并退出）。
- 开发者模式：可以直接加载任意本地目录作为插件，显示日志，方便调试。

## 10. 分发（插件市场）

> P4 的实际做法（2026-11-04）：没有单独建索引仓库，也没有使用 GitHub Releases。索引和插件包都放在当前 fork 仓库 `TixXin/fly-island` 的 `dev` 分支的 `plugins/` 目录下（不用 `main`，因为上游 PR #36 跟踪的是 `TixXin:main`），应用从 `raw.githubusercontent.com` 下载。打包脚本生成的 zip 内容是固定的（同样的文件每次得到同样的哈希），已发布的版本内容不得修改。以后迁到上游仓库或独立仓库时，需要同时修改 `scripts/build-plugin-index.mjs` 中的 `MARKET_BASE_URL` 和 `src-tauri/src/plugin_host/market.rs` 中的 `INDEX_URL`。索引签名还没有做。

参考 Obsidian / Zed，第一版不建服务器：

1. 建一个索引仓库（例如 `focusd-plugins`），其中 `index.json` 每项包含 `id`、仓库地址、版本、下载地址、`sha256`、所需权限和 `minAppVersion`。
2. 开发者通过 PR 提交新插件或版本；CI 校验清单格式、下载包能否解压、哈希是否一致；人工审核源码后合并。
3. 应用内的"插件市场"页面拉取 `index.json`（复用更新器的代理设置），下载 Release 压缩包并校验哈希后安装。
4. 以后可以再加：索引签名（与更新器一样使用 minisign）、自动扫描、按下载量排序。

## 11. 开发者体验

- 提供 `@focusd/plugin-sdk`（TypeScript，封装 JSON-RPC）和一份 Rust / Python 最小示例，因为插件可以用任意语言写。
- 提供模板仓库：清单、示例代码、打包脚本、GitHub Actions 发布流程。
- 提供 `focusd-plugin validate` 校验脚本，与索引仓库的 CI 共用。
- 文档放在 `docs/plugins/`：快速上手、清单字段、API 参考、权限说明、发布流程。

## 12. 路线图

| 阶段 | 内容 | 交付给用户的价值 |
|---|---|---|
| P0 | 完成重构 Phase 6、7 | — |
| P1 ✅ | Rust `local_api` + 前端 `features/local-api/`（即本文的 plugin-bridge），只开放待办和笔记，见 [local-api.md](../local-api.md) | **待办外部接口**（当前用户的需求）直接可用 |
| P2 ✅ | 插件（权限 `agent-status:write`）和本地接口（`/v1/agent-status/{source}`）都可以上报 AI Agent 状态，在快照里作为 `others` 列表返回；Codex / Claude Code 的 hook 保持不变。声明式插件加载随 P3 一起完成（`runtime.type: none`） | 新的 AI Agent 适配不必再等发版 |
| P3 ✅ | 进程插件宿主（`src-tauri/src/plugin_host/`）、设置 → 插件页（`src/features/plugins/`）、Node SDK 和示例插件，开发文档见 [docs/plugins/README.md](../plugins/README.md) | 第三方开发者可以写插件 |
| P4 ✅ | 暂用 fork 仓库 `TixXin/fly-island` 的 `dev` 分支上的 `plugins/index.json` 作为索引，插件包放在同一仓库的 `plugins/packages/`；应用内可以浏览、安装、更新、卸载插件，并校验 SHA-256 | 用户可以在应用内浏览和安装插件 |
| P5（视情况） | 展开态面板模板、索引签名、WASM 沙箱 | 根据生态规模再决定 |

每个阶段都可以单独发布、单独验证。如果 P3 之后没人写插件，P4 可以不做，P1、P2 的成果仍然有用。

### P3 实现与本草案的差异

- 没有实现 `activation`：插件启用后立即启动，`activation` 字段会被忽略。
- 没有实现 `contributes.settings`、`statusSources` 和 `island.notify`，所以也没有 `secret` 设置项和凭据条目。
- 不支持 `.cmd` / `.bat`。没有使用 Job Object，而是约定插件在 stdin 关闭时退出；岛屿退出时 stdin 会自动关闭。
- 没有单独的"开发者模式"：插件目录里的任何插件都可以直接加载，改完文件后点"重新加载"即可。
- 权限名使用 `notes:*`，方法名沿用本地接口的 `note.get` / `note.set`。

## 13. 待决定的问题

1. 本地 API 用 HTTP 还是命名管道？HTTP 对脚本更友好（`curl`、`Invoke-RestMethod`），命名管道更不容易被其他程序探测到。目前倾向 HTTP。
2. 长期看，待办存储是否要迁移到 Rust（见 4.1 ②）？
3. 官方插件（例如 MCP 适配）放在本仓库，还是放在独立仓库？
4. 索引仓库的审核由谁负责？审核标准是什么？
5. 插件是否允许自带运行时（例如捆绑 Node）？允许的话体积会很大；不允许的话要求用户自行安装。

## 参考资料

- Raycast 安全与运行模型：https://developers.raycast.com/information/security
- Figma 插件系统设计：https://www.figma.com/blog/how-we-built-the-figma-plugin-system/
- VS Code Extension Host：https://code.visualstudio.com/api/advanced-topics/extension-host
- Zed 扩展实现：https://zed.dev/blog/zed-decoded-extensions
- Obsidian 插件安全：https://obsidian.md/help/Extending+Obsidian/Plugin+security
- Obsidian 插件分发：https://github.com/obsidianmd/obsidian-releases
- Stream Deck 插件环境：https://docs.elgato.com/streamdeck/sdk/introduction/plugin-environment
- MCP 架构：https://modelcontextprotocol.io/docs/learn/architecture
- Tauri 隔离模式：https://v2.tauri.app/concept/inter-process-communication/isolation/
- Extism：https://extism.org/docs/overview
