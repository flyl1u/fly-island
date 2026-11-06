# 编写 FocuSD Island 插件

插件是一个由岛屿启动的程序。它通过 stdin / stdout 与岛屿通信，可以按授予的权限读写待办和每日笔记，并在设置页里提供按钮。设计背景见 [架构提案](../architecture/plugins.md)，和 VS Code 的差别见 [和 VS Code 插件系统的对比](vscode.md)，后续计划见 [插件平台第 2 版](../architecture/plugin-platform.md)。

> 当前状态：插件 API 第 2 版（第 1 版的插件照常运行，见下文的「API 版本」）。可以在 设置 → 插件市场 中安装，也可以手动放进插件目录。机器可读的协议描述在 [`plugins/schema/`](../../plugins/schema/)：`manifest.schema.json`（清单）和 `rpc.json`（方法、事件、权限、错误码），岛屿的单元测试会对照检查，本文和它不一致时以它为准。

> 从零写一个新插件请看 [快速开始：一小时写出一个插件](quickstart.md)（脚手架、开发模式、模拟宿主、打包）。全部方法和事件见 [API 参考](api.md)（由 `rpc.json` 生成），各批次新增的内容见 [更新日志](changelog.md)。

## 快速开始

下面是不用任何工具、手动安装一个示例插件的步骤。

1. 复制示例 [`plugins/examples/dev.focusd.todo-digest`](../../plugins/examples/dev.focusd.todo-digest/) 到
   `%APPDATA%\com.focusd.island\plugins\dev.focusd.todo-digest\`。
   插件目录也可以在 设置 → 插件扩展 → 插件目录 → **打开** 中找到。
2. 示例使用 Windows 自带的 PowerShell 运行，不需要另外安装任何东西。
3. 在 设置 → 插件扩展 中打开 **允许运行第三方插件**，点 **重新加载**，再打开插件卡片上的 **启用**。
4. 状态显示"运行中"后，点 **写入摘要**，每日笔记里会追加一段未完成待办的摘要。展开 **日志** 可以看到插件的输出。

修改插件文件后，点 **重新加载** 就会用新文件重启插件。

## 内置插件

有些可选功能直接编译在岛屿里，但在"插件扩展"中的显示和管理方式与普通插件一样：可以启用和停用，启用时授予权限，有自己的设置页。区别是：

- 不需要下载；
- 不需要打开"允许运行第三方插件"；
- 不能卸载；
- 卡片上标着"内置"。

目前的内置插件：

- [本地接口](../local-api.md)（`focusd.local-api`）；
- 中心图案（`focusd.center-pattern`，默认关闭）：折叠岛没有摘要文字时，在中间显示眼睛、小鸟、光点、小猫或一只 Codex Pets 宠物，宠物随 Agent 会话的状态变换动作。
- Claude 用量环（`focusd.claude-usage`，默认关闭）：收起条上的同心双环，外环 5 小时、内环 7 天，悬停显示详情卡片。数据与 Agent 页顶部的用量相同（`get_agent_usage`）：Claude Code 经本机 magpie 网关时读它的 `/v1/magpie/quotas`（只请求本机），否则读 claude-hud 写出的用量快照；都不联网、不读登录凭据。设置「直接向 Anthropic 查询」（默认关）打开后，原生端（`src-tauri/src/claude_usage/`）只读 Claude Code 的 `~/.claude/.credentials.json` 里的 access token（不刷新、不改写，不进日志、前端和事件），经 http(s) 代理请求 `api.anthropic.com/api/oauth/usage`：代理依次取插件设置、`HTTPS_PROXY`、Windows 系统代理，都没有就不请求，**从不直连**；不跟随重定向；间隔 5–120 分钟（设置「刷新间隔」），失败时加倍退避，429 遵守 `Retry-After`。`get_agent_usage` 在两份数据中取较新的，并带上最近一次失败的原因。这个接口没有公开文档，可能随时失效。
- Agent 会话环（`focusd.session-ring`，默认关闭）：AI Agent 开启时，在收起条上用分段小环代替蓝色会话数，按状态着色（等你确认、等你回复、运行、可能已停、刚完成），中间是会话数，悬停列出等你处理的会话，点击打开 Agent 页。数据就是 Agent 页的会话列表（Claude Code 和 Codex），只在岛屿窗口工作，没有原生部分。

内置插件的清单写在 `src-tauri/src/plugin_host/builtin.rs` 中，`runtime.type` 为 `builtin`。插件目录里的第三方插件不能使用这个类型，也不能使用内置插件的 id。

只在岛屿窗口里工作的内置插件（例如收起条上的小环）只需在 `BUILTINS` 表里加一行"id + 清单"：后端启动和停止时什么都不做；前端用 `useBuiltinPlugin(id)`（`src/features/plugins/useBuiltinPlugin.ts`）读到 `{ enabled, settings }`，插件启停或改设置时自动更新（宿主发出 `plugin-view-changed` 的 `reset` 事件），再在 `src/windows/island/useCollapsedSlots.tsx` 里填收起条槽位。

## 目录结构

```text
plugins/<插件 id>/        # 文件夹名必须等于插件 id
├── focusd-plugin.json    # 清单
├── main.ps1              # runtime.command 指向的程序
└── ...                   # 其他文件随意
```

## 清单 `focusd-plugin.json`

```json
{
  "id": "dev.example.todo-sync",
  "name": { "zh-CN": "待办同步", "en": "Todo Sync" },
  "description": { "zh-CN": "……", "en": "…" },
  "version": "1.0.0",
  "apiVersion": 2,
  "minAppVersion": "0.2.14",
  "author": "example",
  "homepage": "https://github.com/example/todo-sync",
  "runtime": { "type": "process", "command": "main.ps1", "args": [] },
  "permissions": ["todos:read", "todos:write"],
  "contributes": {
    "commands": [
      { "id": "sync-now", "title": { "zh-CN": "立即同步", "en": "Sync now" },
        "keybinding": "Ctrl+Alt+S", "when": "!todos.hasActive" },
      { "id": "push-todo", "title": { "zh-CN": "推送这条", "en": "Push this one" } }
    ],
    "menus": { "todo/context": [{ "command": "push-todo" }] }
  }
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 3–64 个字符，只能用小写字母、数字、`.`、`-`，必须和文件夹名相同。建议使用反向域名，例如 `dev.yourname.xxx`。 |
| `name` | ✅ | 中英文名称都要提供。 |
| `description` | | 中英文说明。 |
| `version` | ✅ | 1–32 个字符。 |
| `apiVersion` | ✅ | `1` 或 `2`，见下文的「API 版本」。新插件请写 `2`。 |
| `minAppVersion` | | 需要的最低 FocuSD Island 版本，版本不够时插件显示为"无法加载"。 |
| `activationEvents` | | 第 2 版：什么时候启动插件进程，见下文的「按需启动」。不写时随岛屿一直运行。 |
| `experimentalApis` | | 申请还在设计中的 API（最多 10 个名称，如 `views.chart`）。只有以开发模式加载的插件能用，装在插件目录里的插件写了它就无法使用，见下文的「调试」。目前岛屿没有实验 API。 |
| `author`、`homepage` | | 主页只显示 `https://` 链接。 |
| `runtime` | ✅ | `{ "type": "process", "command": "...", "args": [...] }` 表示运行一个程序；`{ "type": "none" }` 表示只有清单、不运行程序。 |
| `permissions` | | 见下文的权限表。 |
| `contributes.commands` | | 最多 8 个，显示为插件设置页上"操作"一栏里的按钮。`id` 只能用字母、数字和 `-`。 |
| `contributes.commands[].keybinding` | | 第 2 版：全局快捷键，见下文的「快捷键与 `when`」。 |
| `contributes.commands[].when` | | 第 2 版：快捷键在什么情况下生效，最长 200 个字符。 |
| `contributes.menus` | | 第 2 版：把命令放进岛屿的菜单，见下文的「待办右键菜单」。 |
| `contributes.views` | | 第 2 版：岛屿展开后的页面，最多 2 个，由岛屿按模板绘制，见下文的「岛上页面」。 |
| `contributes.statusItems` | | 第 2 版：折叠条上的一小段状态文字，最多 2 个，见下文的「岛上页面」。 |
| `contributes.settings` | | 最多 20 个设置项，由岛屿画在插件自己的设置页上并负责保存，见下文的"设置页"。 |

第 1 版的清单里如果写了 `keybinding`、`when` 或 `menus`，岛屿会忽略它们，不会报错。

### 快捷键与 `when`

```json
{ "id": "start", "title": { "zh-CN": "开始番茄钟", "en": "Start pomodoro" },
  "keybinding": "Ctrl+Alt+P", "when": "island.expanded && island.page == todo" }
```

- `keybinding` 是一个或多个修饰键（`Ctrl`、`Alt`、`Shift`、`Win`）加一个键：字母、数字、`F1`–`F24`、`Esc`、`Tab`、`Enter`、`Space`、方向键、`Home` / `End`、`PageUp` / `PageDown`、`Insert` / `Delete`、`Backspace`。大小写和空格不限，岛屿会规范成 `Ctrl+Alt+P` 这样的写法；写不出合法组合时，清单无效。
- 只有运行中的插件才会注册快捷键。快捷键已经被其他程序、岛屿自己或另一个插件占用时，注册失败，插件卡片上会提示"快捷键已被其他程序占用"，先注册的一方不受影响。
- 清单里的 `keybinding` 只是默认值。用户可以在 **设置 → 快捷键 → 插件快捷键** 里改成别的组合键、关闭，或者给没有写 `keybinding` 的命令设一个；选择保存在 `plugins.json` 里该插件的 `keybindings`（命令 id → 组合键，空字符串表示关闭）。
- 按下快捷键时，岛屿先求值 `when`，结果为真才给插件发送 `command { id }`，和点了设置页上的按钮一样。
- `when` 可用的名称：`island.expanded`（岛屿是否展开）、`todos.hasActive`（是否有正在进行的待办）、`island.page`（当前页面：`todo`、`music`、`clipboard`、`shelf`、`qq`、`agents`、`translation`）。用 `==` / `!=` 比较（值可以加引号），用 `&&`、`||`、`!` 和括号组合，`&&` 比 `||` 优先。不认识的名称当作假；写错语法的 `when` 永远不生效；省略或为空表示总是生效。
- `when` 由岛屿求值（`src/features/plugins/when.ts`），不会执行插件代码。

### 待办右键菜单

```json
"menus": { "todo/context": [{ "command": "push-todo" }] }
```

`todo/context` 是待办条目的右键菜单，最多列 4 个命令，每个都必须是本插件 `contributes.commands` 里的命令，且不能重复。用户右键一条待办时，菜单里会列出所有运行中插件的条目（显示命令标题和插件名）；点了以后插件收到 `command { id, args: { todoId } }`。需要待办内容时，用 `todos.list` 查（要 `todos:read` 权限）。没有插件提供条目时，右键行为和以前一样。

同样的写法还有三个菜单：`clipboard/context`（剪贴板历史里的文字条目）、`shelf/context`（文件中转条目）和 `message/context`（QQ 通知和邮件）。点了以后插件收到 `command { id, args: { item } }`，`item` 分别和 `clipboard.history`、`shelf.list`、`messages.list` 里的一项相同，由岛屿查出这一条再发给插件。这是用户亲手选的条目，所以不需要 `clipboard:read`、`shelf:read` 或 `messages:read`；要读别的条目仍然需要权限。图片剪贴板条目和微信提醒没有这个菜单。

### 岛上页面（第 2 版）

插件可以在岛屿展开后拥有自己的页面，并在折叠条上显示一小段状态。页面一般由岛屿按模板绘制：插件只发数据，不发 HTML、脚本或 SVG，所以和岛屿的其他页面风格一致。模板画不出来的（图表、小工具），可以用 `webview` 模板显示插件自己的网页，见下面的「自定义界面」。

```json
"contributes": {
  "views": [{ "id": "issues", "title": { "zh-CN": "Issue", "en": "Issues" }, "icon": "git-pull-request", "template": "list" }],
  "statusItems": [{ "id": "countdown", "priority": 10 }]
}
```

| 字段 | 说明 |
|---|---|
| `views[].id` | 1–32 个字母、数字或 `-`，同一插件内不能重复。 |
| `views[].title` | 中英文都要提供。 |
| `views[].icon` | lucide 图标名，只能用 `plugins/schema/manifest.schema.json` 里列出的那些（如 `list`、`timer`、`git-pull-request`、`kanban`），省略时为 `puzzle`。 |
| `views[].template` | `list`、`detail`、`form`、`status` 或 `webview`，见下面的模板说明。 |
| `views[].entry` / `views[].height` | 只用于 `webview`：页面文件和页面高度，见「自定义界面」。 |
| `statusItems[].id` | 同上。 |
| `statusItems[].priority` | -100 到 100，默认 0。所有插件有文字的状态项里，只显示优先级最高的一个。 |

- 页面在岛上的 id 是 `plugin:<插件 id>/<view id>`。插件页面排在内置页面之后，用页眉里的小图标打开，也参与 Alt+数字 和左右切换（数字键只到 9）。用户可以在 **设置 → 插件扩展 → 岛上页面** 里隐藏某个页面、调整顺序。
- 插件用 `view.update { viewId, model }` 发整个模型（序列化后不超过 256 KB，超过返回状态 413），用 `view.patch` 只改列表里的几项（在 `view.update` 之前调用返回 409）：`items` 按 `id` 替换，`remove: [id]` 删除，`add: [{ item, before?, group? }]` 插入（`before` 那一项前面，否则第 `group` 组末尾，否则列表末尾）。每个页面每秒最多显示 10 次更新，更快的会合并成最后一次。
- 页面不在屏幕上时，岛屿不转发更新；打开和关上页面时插件会收到 `view.visible { viewId, visible }`。插件可以只在 `visible` 为 `true` 时去准备数据（`dev.focusd.github-issues` 就是这样）。
- 用户的操作以通知发回：`view.action { viewId, actionId, itemId?, checked? }`、`view.submit { viewId, values }`、`view.search { viewId, query }`。
- 插件进程停止或崩溃时，它发过的模型和状态文字都会清空；页面显示"插件已停止"、原因和"重新启动"按钮，不影响其他页面。插件重启后要重新发模型（一般在收到 `view.visible` 时发）。
- 所有文字都可以是字符串，或 `{ "zh-CN": "…", "en": "…" }`（按岛屿当前语言选）。超长的文字会被截断，不合格式的字段会被忽略。

**`list` 模板**：`{ items?, groups?: [{ title?, items }], empty?, loading?, error?, search? }`

| 条目字段 | 说明 |
|---|---|
| `id` | 必填，1–128 个字母、数字或 `-_.:/`，同一页面内不能重复。 |
| `title` / `subtitle` / `note` | 标题（必填）、第二行、右侧的短附注。 |
| `icon` | 同 `views[].icon` 的图标名。 |
| `checked` | `true` / `false` 时显示勾选框；点击后插件收到 `view.action { actionId: "check", itemId, checked }`，界面以插件下一次发来的模型为准。 |
| `url` | 只收 `https://` 链接；点条目时岛屿用系统浏览器打开。 |
| `action` | 没有 `url` 时，点条目发 `view.action { actionId: <action>, itemId }`。 |
| `actions` | 最多 3 个行内按钮 `[{ id, title, icon? }]`，点击发 `view.action`。 |

`search` 为 `{ placeholder?, mode? }` 时显示搜索框：`mode` 默认 `local`，由岛屿按标题、第二行和附注过滤；`remote` 时岛屿把输入（停顿 250 毫秒后）以 `view.search` 发给插件，由插件发回新的列表。一个页面最多 500 项，超过 8 行时页面滚动。

**`detail` 模板**：`{ title?, markdown?, meta?: [{ label, value }], actions?, loading?, error? }`。`markdown` 只支持标题、粗体、斜体、行内代码、列表、段落和 `https://` 链接（在浏览器中打开）；其他写法（包括 HTML）原样显示为文字。`meta` 最多 20 项，`actions` 最多 3 个，显示在底部。

**`form` 模板**：`{ fields, submitTitle?, message?, error? }`。`fields[]` 为 `{ key, type, title, description?, placeholder?, value?, options?, min?, max? }`，`type` 与插件设置页相同（`boolean`、`string`、`number`、`select`），另外多一个 `multiline`（多行文字，最长 4000 字）。用户点提交后插件收到 `view.submit { viewId, values }`，`values` 已按字段类型整理（数字取整并限定在 `min`–`max`）。用 `message` / `error` 告诉用户结果。

**`status` 模板**：`{ primary, secondary?, caption?, progress?, tone?, actions? }`。`primary` 是一行大字（例如倒计时），`secondary` 是第二行，`progress` 是 0–1 的进度条，`tone` 为 `neutral`、`accent`、`warning` 或 `danger`。

**自定义界面（`webview` 模板，P8）**：`{ "id": "ring", "title": …, "template": "webview", "entry": "ui/index.html", "height": 200 }`

- `entry` 必填，是插件文件夹里的 `.html` 文件（相对路径，不能有 `..`）。页面只能加载 `entry` 所在文件夹及其子文件夹里的文件；`height` 是页面在岛上的高度，80–480 像素，默认 240。
- 页面不在岛屿自己的网页里，而是一个单独的 WebView2：页面里**没有**岛屿的任何接口（`__TAURI__` 之类都不存在），只能和自己的插件进程通信。页面在无痕模式下运行，关掉后不留下 `localStorage` 之类的数据。
- 页面不能联网：岛屿拦截页面和其中所有框架、Worker 的每一个请求，只回答插件文件夹里的文件，其他一律拒绝；离开插件来源的跳转、新窗口、下载和权限请求（摄像头等）都会被拒绝，WebRTC 不可用。每个文件都带固定的 CSP：`default-src 'none'`，允许本插件的脚本（含内联脚本）、样式、图片和字体，`connect-src 'self'`（只能 `fetch` 自己的文件），禁止 `eval`、Worker、表单提交。页面可以用 `<meta>` 再加限制，不能放宽。
- 页面来源是 `https://<插件 id>.plugin.focusd.invalid`，用相对路径引用文件即可。
- 页面脚本调用 `acquireFocusdApi()`（每个页面只能调用一次）拿到：
  - `postMessage(message)`：发给插件进程，插件收到通知 `webview.message { viewId, message }`（不超过 256 KB）；
  - `onMessage(listener)`：收插件用 `webview.postMessage { viewId, message }` 发来的消息，返回取消函数；
  - `getState()` / `setState(state)`：岛屿运行期间为这个页面保存的一小段数据（不超过 64 KB），页面关掉再打开时能马上拿到；
  - `locale`：岛屿当前语言，`"zh-CN"` 或 `"en"`。
- 页面打开时才创建，离开屏幕就关闭。`webview.postMessage` 返回 `{ shown }`，页面不在屏幕上时为 `false`，消息被丢弃；页面脚本还没运行时发的消息也会丢失，所以让页面加载后先发一条"准备好了"，插件收到再发数据（示例 `dev.focusd.todo-ring` 就是这样）。
- 主题：页面里有岛屿的颜色变量 `--focusd-text`、`--focusd-text-muted`、`--focusd-accent`、`--focusd-surface`、`--focusd-border`、`--focusd-success`、`--focusd-warning`、`--focusd-danger`、`--focusd-radius`、`--focusd-font`。页面背景默认透明，下面是岛屿的页面底色。
- 开发模式加载的插件，页面可以右键打开开发者工具（F12）；其他插件没有右键菜单和浏览器快捷键。
- 插件市场会给带自定义界面的插件加上"自定义界面"标签，安装前值得多看一眼。
- `initialize.capabilities` 含 `webview` 时岛屿支持这个模板。不支持的旧版本岛屿无法安装带 `webview` 页面的插件（清单校验不通过），发布这样的插件时最好写上 `minAppVersion`。

**折叠条状态**：`status.update { itemId, text, tooltip?, tone? }`，`text` 最多 24 个字符，空字符串表示清除。状态文字显示在折叠条右侧的小标签里，和待办摘要、Agent 标题同时显示，不替换它们；有消息预览或快捷翻译时先让位。点击标签会打开这个插件的第一个页面。

### 设置页

插件不能自带界面代码。插件卡片上有一个"设置"按钮，点开后是这个插件自己的设置页，页面由岛屿统一绘制，包括四部分：

- **运行信息**：插件运行时调用 `ui.setInfo` 提供的信息。
- **设置**：清单里 `contributes.settings` 声明的设置项。
- **操作**：`contributes.commands` 声明的按钮。
- **日志**。

```json
"contributes": {
  "settings": [
    { "key": "allowWrite", "type": "boolean", "title": { "zh-CN": "允许修改", "en": "Allow changes" }, "default": false },
    { "key": "interval", "type": "number", "title": { "zh-CN": "间隔（分钟）", "en": "Every (minutes)" }, "min": 1, "max": 60, "default": 5 },
    { "key": "name", "type": "string", "title": { "zh-CN": "名称", "en": "Name" },
      "description": { "zh-CN": "显示在……", "en": "Shown in…" } },
    { "key": "mode", "type": "select", "title": { "zh-CN": "模式", "en": "Mode" },
      "options": [{ "value": "fast", "title": { "zh-CN": "快", "en": "Fast" } }, { "value": "slow", "title": { "zh-CN": "慢", "en": "Slow" } }] }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `key` | 1–32 个字符，只能用字母、数字、`-`、`_`，在同一个插件里不能重复。 |
| `type` | `boolean`（开关）、`number`（整数输入框，范围由 `min` / `max` 限定）、`string`（文本，最长 1000 个字符）、`select`（下拉，选项来自 `options`）。 |
| `title` / `description` | 中英文都要提供；`description` 可以省略。 |
| `default` | 默认值，必须符合 `type`。省略时：开关为 `false`，数字为 `min` 或 0，文本为空，下拉为第一个选项。 |

设置值由岛屿保存在 `plugins.json` 里，卸载插件时一并删除。插件拿到的设置总是完整的：默认值已经填好，过期或不合法的值会被换成默认值。

`runtime.command` 必须是插件文件夹内的相对路径，按扩展名决定如何启动：

| 扩展名 | 启动方式 |
|---|---|
| `.exe` | 直接运行 |
| `.js` / `.mjs` / `.cjs` | `node <文件>`，需要用户已经安装 Node.js |

**选择建议：给普通用户用的插件，优先选 `.ps1` 或 `.exe`，这样用户不需要另外安装任何东西。** 插件市场和插件卡片会根据扩展名显示"无需另外安装"或"需要 Node.js"。检测不到 Node.js 时，会提示用户并给出下载链接。岛屿会在 PATH 和默认安装目录 `%ProgramFiles%\nodejs` 中查找 `node.exe`，所以用户在岛屿运行期间装好 Node.js，不需要重启岛屿也能找到。
| `.ps1` | `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <文件>` |

不支持 `.cmd` / `.bat`：停止 `cmd.exe` 时，它启动的程序会继续运行。

## 权限

| 权限 | 版本 | 允许的方法 | 允许订阅的事件 |
|---|---|---|---|
| `todos:read` | 1 | `todos.list`、`todos.days`（第 2 版） | `todos.changed` |
| `todos:write` | 1 | `todos.add`、`todos.update`、`todos.remove` | |
| `notes:read` | 1 | `note.get` | `note.changed` |
| `notes:write` | 1 | `note.set` | |
| `agent-status:read` | 2 | | `agentStatus.changed` |
| `agent-status:write` | 1 | `agentStatus.report`、`agentStatus.clear` | |
| `island:notify` | 2 | `island.notify` | |
| `secrets` | 2 | `secrets.get`、`secrets.set`、`secrets.delete` | |
| `clipboard:read`（敏感） | 2 | `clipboard.history` | `clipboard.changed` |
| `messages:read`（敏感） | 2 | `messages.list` | `messages.received` |
| `media:read`（敏感） | 2 | `media.nowPlaying`、`media.cover` | `media.changed` |
| `media:control` | 2 | `media.playPause`、`media.next`、`media.previous`、`media.seek`、`media.setVolume`、`media.toggleShuffle`、`media.cycleRepeat` | |
| `shelf:read`（敏感） | 2 | `shelf.list` | `shelf.changed` |
| `shelf:write`（敏感） | 2 | `shelf.add`、`shelf.remove` | |

QQ 邮箱授权码、翻译服务密钥这类凭据，任何权限都拿不到。

不需要权限的方法：`host.info`、`settings.get`、`ui.setInfo`，以及第 2 版的 `events.subscribe`、`events.unsubscribe`、`storage.*`。事件 `island.expanded`、`island.collapsed`、`app.locale.changed` 也不需要权限。

用户启用插件时，会授予清单里列出的全部权限。新版本如果要求更多权限，插件会暂停，直到用户重新授权。

注意：权限只限制插件能调用哪些岛屿接口。插件程序本身以用户身份运行，可以读写文件和联网，也能直接读取 Windows 凭据管理器里当前用户的条目（包括岛屿保存的邮箱授权码 `com.focusd.island.qq-mail` 和翻译密钥）。岛屿的接口不会把这些凭据交给插件，但无法阻止插件进程自己去读；所以市场要求人工审核源码，安装其他发布者的插件前要先信任发布者，设置页也写明了这一点。用 AppContainer 或受限令牌隔离插件进程会让 Node.js 和 PowerShell 插件无法正常运行，目前不做。

同样的原因，插件网页的 WebRTC 屏蔽只是减少意外：页面里的数据都来自它自己的插件进程，而插件进程本来就能联网，页面即使绕过屏蔽也拿不到更多东西。

### 敏感权限

标着"敏感"的权限，启用插件时照常授予，但插件**第一次实际使用**（调用方法或订阅事件）时，岛上还会弹出一行确认："<插件名> 想读取剪贴板历史 [允许] [本次] [拒绝]"。

- 插件的这次请求会一直等到用户回答，最多 30 秒。所以插件的请求超时要设得比 30 秒长（Node.js SDK 不限时；PowerShell 示例 `dev.focusd.now-playing` 里的 `lib/focusd.ps1` 等 40 秒）。
- **允许** / **拒绝**：记在 `plugins.json` 里，以后不再询问。拒绝时插件收到 `-32001`。
- **本次**：这次允许，插件进程重启后会再问。
- 30 秒没有回答：这次按拒绝处理（`-32001`），不记下来，下次使用再问。
- 用户可以在插件设置页的"需要询问的权限"里看到这些回答，并随时撤销；撤销后下次使用会再问，需要这个权限的事件订阅也会立即断开。
- 岛屿贴边收起时，确认会先把岛屿露出来；全屏游戏等让岛屿隐藏的时候，用户可能看不到，插件会在 30 秒后收到 `-32001`。

### 可选权限（第 2 版）

只在某个功能里才用到的权限，写进清单的 `optionalPermissions`（取值和 `permissions` 一样），不要写进 `permissions`。启用插件时不会要求用户同意它们，市场和插件卡片把它们标成"可选，用到时询问"。

- 用之前调用 `permissions.request { permissions: ["clipboard:read"] }`。岛上用和敏感权限一样的确认询问用户，返回 `{ granted, denied }`；一次可以申请多个，逐个询问。
- 没有获准就调用需要它的方法或订阅事件，返回 `-32001`，错误信息提示先调用 `permissions.request`。
- 答案的记法和敏感权限相同：允许和拒绝记在 `plugins.json`，本次允许到插件进程重启为止。记下的拒绝不会再弹出询问，`permissions.request` 直接把它放进 `denied`，直到用户在设置页撤销这个回答。
- `initialize.permissions` 是插件现在能用的权限（`permissions` 加上已获准的可选权限），`initialize.optionalPermissions` 是清单里的可选权限。宿主有这项功能时，`initialize.capabilities` 里有 `permissions`。
- SDK：Node `plugin.permissions.request("clipboard:read")`、`plugin.permissions.has(name)`；PowerShell `Request-FocusdPermission 'clipboard:read'`；模拟宿主的 `deny` 选项同样决定可选权限的回答。
- 第 1 版清单里的 `optionalPermissions` 会被忽略。

### 调用记录

插件设置页的「调用记录」列出插件最近 200 次请求了哪个方法、结果如何（成功、没有权限、没有这个方法、出错和状态码），最新的在最上面；同一方法连续得到同样的结果合成一行并计数。只记方法名，不记参数和返回内容，岛屿重启后清空。用户可以用它看插件实际在做什么，插件不需要配合。

## 通信协议

使用 JSON-RPC 2.0，每行一条 JSON 消息，编码为 UTF-8。每条消息不超过 1 MB。

- **stdout** 只能输出协议消息。
- **stderr** 的每一行都会进入插件日志（设置页里最多保留 200 行）。

### API 版本

清单的 `apiVersion` 是插件按哪一版 API 编写的。岛屿支持第 1 版和第 2 版，`initialize`、`host.info` 和环境变量 `FOCUSD_PLUGIN_API_VERSION` 里的 `apiVersion` 就是清单里写的版本。

- `initialize.capabilities` 列出岛屿为这个插件提供的能力。第 2 版插件收到 `["events", "notifications", "storage", "secrets", "views", "status"]`，第 1 版插件收到空列表。以后的岛屿可能增加能力；插件应先查这个列表，再调用对应的方法。

| 能力 | 含义 |
|---|---|
| `events` | `events.subscribe` / `events.unsubscribe` 和 `event` 通知 |
| `notifications` | `island.notify` 和 `notification.action` 通知 |
| `storage` | `storage.get` / `set` / `delete` / `keys` |
| `secrets` | `secrets.get` / `set` / `delete` |
| `views` | `contributes.views` 页面；`view.update` / `view.patch` 和 `view.*` 通知 |
| `status` | `contributes.statusItems` 折叠条状态；`status.update` |

- **第 1 版插件的行为不变**：`events.*`、`storage.*`、`view.*`、`status.update` 对它们仍然返回"方法不存在"；清单里的 `keybinding`、`when`、`menus`、`views`、`statusItems` 被忽略（写成什么样都不影响加载）。新权限（`island:notify`、`secrets` 等）在第 1 版清单里也能申请，申请了就能调用对应方法。
- 兼容规则：同一版本内只做新增（新方法、新的可选参数和结果字段、新事件）。插件要忽略不认识的字段和通知。

### 岛屿发给插件的通知

| 方法 | 版本 | 参数 | 时机 |
|---|---|---|---|
| `initialize` | 1 | `{ apiVersion, capabilities, activationEvent?, appVersion, pluginId, dataDir, permissions, settings, experimentalApis? }` | 进程启动后立即发送；`capabilities` 见上文；`activationEvent`（第 2 版）是这次启动的原因，见「按需启动」；`experimentalApis` 只发给清单里写了 `experimentalApis` 的开发中插件，列出岛屿实际提供的那些 |
| `command` | 1 | `{ id, args? }` | 用户点击了 `contributes.commands` 中的某个按钮，或按下了它的快捷键（第 2 版），参数为 `{ id }`；在待办右键菜单里选了它（第 2 版），参数为 `{ id, args: { todoId } }` |
| `settings.changed` | 1 | `{ settings }` | 用户在设置页上改了设置；`settings` 是全部设置的新值 |
| `event` | 2 | `{ name, payload }` | 订阅的事件发生了，见下文的「事件」 |
| `notification.action` | 2 | `{ id }` | 用户点了 `island.notify` 消息上的某个按钮 |
| `uri` | 2 | `{ uri, path, query }` | 打开了发给这个插件的 `focusd://` 链接（清单需要 `onUri`），见「链接」 |
| `view.visible` | 2 | `{ viewId, visible }` | 插件页面出现在屏幕上或被关上；不可见时岛屿不转发更新 |
| `view.action` | 2 | `{ viewId, actionId, itemId?, checked? }` | 用户点了页面上的按钮、条目或勾选框 |
| `view.submit` | 2 | `{ viewId, values }` | 用户提交了 `form` 页面 |
| `view.search` | 2 | `{ viewId, query }` | 用户在 `list` 页面的搜索框里输入（`search.mode` 为 `remote` 时） |
| `shutdown` | 1 | `{}` | 插件被停用、重新加载或删除时发送；随后 stdin 会关闭，2 秒后进程被结束 |

**stdin 关闭时插件必须退出。** 岛屿自己退出时也会关闭 stdin。

### 插件调用的方法（请求）

| 方法 | 版本 | 权限 | 参数 | 结果 |
|---|---|---|---|---|
| `host.info` | 1 | — | — | 与 `initialize` 的参数相同 |
| `host.keepAlive` | 2 | — | `{ reason }`（1–100 个字符，`null` 表示取消） | `{}`。按需启动的插件申请不在空闲时停止，见「按需启动」 |
| `island.openView` | 2 | — | `{ viewId }` | `{}`。展开岛屿并打开插件自己的这个页面（能力 `openView`）。只在用户用过这个插件后 15 秒内有效：执行了它的命令或快捷键、点了它提示上的按钮、打开了发给它的链接、在它的页面上点了按钮、提交了表单或网页页面发来消息；否则状态 403。不是清单里的页面为 404；用户在设置里隐藏了的页面不会打开 |
| `settings.get` | 1 | — | — | 全部设置的当前值 |
| `settings.set` | 2 | — | `{ values: { 键: 值 } }` | `{ settings }`：改完后的全部设置。只能改清单 `contributes.settings` 里声明过的键，值要符合声明的类型；全部生效或全部不改，否则 400。设置页会显示新值，插件自己的修改不会再收到 `settings.changed`。适合登录后把账号写进设置 |
| `ui.setInfo` | 1 | — | `{ items: [{ label, value, copy?, secret? }] }` | `{}`。替换设置页上的"运行信息"，最多 10 项，`value` 最长 500 个字符；`copy` 表示显示"复制"按钮，`secret` 表示默认隐藏（适合令牌）；传空列表表示清空。插件停止后信息会自动清空。 |
| `events.subscribe` | 2 | — | `{ events: [名称] }`，一次最多 16 个 | `{ events }`：现在订阅的全部事件（已排序）。每个事件都要有对应权限；只要有一个不认识或没权限，整次请求失败，一个也不订阅。 |
| `events.unsubscribe` | 2 | — | `{ events: [名称] }` | `{ events }` |
| `storage.get` | 2 | — | `{ key }`（1–128 个字符） | `{ value }`，没有时为 `null` |
| `storage.set` | 2 | — | `{ key, value }`，`value` 是任意 JSON | `{}`。单个值序列化后不超过 64 KB，整个插件不超过 1 MB，超过返回状态 413 |
| `storage.delete` | 2 | — | `{ key }` | `{ deleted }` |
| `storage.keys` | 2 | — | — | `{ keys }` |
| `todos.list` | 1 | `todos:read` | `{ date? }`（第 2 版） | `{ date, todos, scheduled, activeTodoId }`。不带 `date` 是今天；过去的日期读那天的归档（多一个 `archived: true`，没有归档时状态 404）；以后的日期在 `scheduled` 里给出排到那天的待办 |
| `todos.days` | 2 | `todos:read` | `{ from, to }` | `{ days: [{ date, total, completed, hasNote, archived }] }`：从 `from` 到 `to`（含）里的今天和每个归档的日子，按日期从早到晚。适合周报、完成率统计 |
| `todos.add` | 1 | `todos:write` | `{ title, date? }` | 新增的待办；`date` 晚于今天时加入"以后"列表 |
| `todos.update` | 1 | `todos:write` | `{ id, title?, completed? }` | 修改后的待办 |
| `todos.remove` | 1 | `todos:write` | `{ id }` | `{ id }` |
| `note.get` | 1 | `notes:read` | `{ date? }`（第 2 版） | `{ date, note }`。过去的日期读那天归档的笔记（`archived: true`，没有归档时 404）；以后的日期 400 |
| `note.set` | 1 | `notes:write` | `{ note }` 或 `{ append }` | `{ date, note }` |
| `agentStatus.report` | 1 | `agent-status:write` | `{ source, phase, name?, title?, taskId? }` | 保存后的状态，`id` 为 `<插件 id>/<source>` |
| `agentStatus.clear` | 1 | `agent-status:write` | `{ source? }` | `{ cleared }`；省略 `source` 时清除这个插件的全部来源 |
| `island.notify` | 2 | `island:notify` | `{ title, body?, durationMs?, actions? }` | `{ muted }`，见下文的「岛上提示」 |
| `secrets.get` | 2 | `secrets` | `{ key }` | `{ value }`，没有时为 `null` |
| `secrets.set` | 2 | `secrets` | `{ key, value }` | `{}` |
| `secrets.delete` | 2 | `secrets` | `{ key }` | `{ deleted }` |
| `view.update` | 2 | — | `{ viewId, model }` | `{}`；见上文的「岛上页面」 |
| `view.patch` | 2 | — | `{ viewId, items }` | `{ missing }`：没找到的条目 id |
| `status.update` | 2 | — | `{ itemId, text, tooltip?, tone? }` | `{}` |
| `clipboard.history` | 2 | `clipboard:read` | `{ limit? }`（1–50，默认 20） | `{ items: [{ id, text, truncated, copiedAt, favorite }] }`：只有文字，没有图片，最新的在前；`text` 最长 4000 个字符，被截断时 `truncated` 为 `true`。剪贴板历史关闭时返回状态 409 |
| `messages.list` | 2 | `messages:read` | — | `{ items: [{ source, id, sender, preview, receivedAt, unread? }] }`，最新的在前，只包含用户打开了的来源。`source` 为 `qq`、`wechat` 或 `qqMail`；微信只知道托盘图标在闪，所以 `sender`、`preview` 为 `null`；QQ 邮箱的 `preview` 是主题，从不包含正文、邮箱地址或授权码 |
| `media.nowPlaying` | 2 | `media:read` | — | `{ available, status, title, artist, album, sourceApp, positionMs, durationMs, canSeek, canNext, canPrevious, shuffle, repeat, volume }`，不含封面图片；`status` 为 `playing`、`paused` 或 `unavailable`；`shuffle` 为 `true` / `false`，播放器不支持时为 `null`；`repeat` 为 `none`、`track`、`list` 或 `unknown`；`volume` 是系统音量 0–1，读不到时为 `null` |
| `media.cover` | 2 | `media:read` | — | `{ cover }`：封面的 `data:` URL，没有封面或超过 1 MB 时为 `null` |
| `media.playPause`、`media.next`、`media.previous`、`media.toggleShuffle`、`media.cycleRepeat` | 2 | `media:control` | — | 执行后的 `media.nowPlaying` 结果。循环模式按「不循环 → 列表 → 单曲」切换 |
| `media.seek` | 2 | `media:control` | `{ positionMs }` | 执行后的结果；播放器不支持（`canSeek` 为 false）时出错 |
| `media.setVolume` | 2 | `media:control` | `{ level }`（0–1） | 执行后的结果。改的是默认输出设备的系统音量，和岛屿自己的音量条一样 |
| `shelf.list` | 2 | `shelf:read` | — | `{ items: [{ id, path, name, isDir, size, addedAt, pinned, missing, unreachable }] }`：只有路径等信息，不读取文件内容 |
| `shelf.add` | 2 | `shelf:write` | `{ paths }`（1–20 个已存在的文件或文件夹的绝对路径，其他的会被跳过） | 同 `shelf.list` |
| `shelf.remove` | 2 | `shelf:write` | `{ ids }`（1–20 个） | 同 `shelf.list`；只把条目移出列表，不删除文件 |

`todos.*`、`note.*`、`agentStatus.*` 和 [本地接口](../local-api.md) 的 HTTP 接口一一对应，参数和结果完全相同。`agentStatus.*` 的字段规则见本地接口文档的“AI Agent 状态”一节；`name` 省略时默认使用插件清单里的英文名称。插件停止、停用或出错退出时，它上报的来源会被自动清除。

插件还可以发送通知 `log`，参数为 `{ message }`，内容会写入日志。

### 事件（第 2 版）

插件用 `events.subscribe` 订阅，岛屿用通知 `event { name, payload }` 推送。不用再定时轮询。

| 事件 | 权限 | `payload` | 时机 |
|---|---|---|---|
| `todos.changed` | `todos:read` | `{ date, reason? }` | 今天的待办、"以后"列表或正在进行的待办变了，或者换了一天。不带待办内容，需要时调 `todos.list`。`reason` 为 `add`、`remove`、`reorder`、`update` 或 `dayChanged`；待办数据还留在 localStorage 时（迁移失败的那次运行）没有 `reason` |
| `note.changed` | `notes:read` | `{ date }` | 每日笔记变了，需要时调 `note.get` |
| `agentStatus.changed` | `agent-status:read` | `{ agents: [{ id, name, phase, title? }] }` | AI 代理状态变了 |
| `island.expanded` | — | `{}` | 岛屿展开 |
| `island.collapsed` | — | `{}` | 岛屿收起 |
| `app.locale.changed` | — | `{ locale }` | 界面语言变了，`locale` 为 `zh-CN` 或 `en` |
| `clipboard.changed` | `clipboard:read` | `{}` | 剪贴板历史变了（只在剪贴板历史打开时），需要时调 `clipboard.history` |
| `messages.received` | `messages:read` | 与 `messages.list` 的一项相同 | 新的 QQ 通知、QQ 邮件或微信提醒到了 |
| `media.changed` | `media:read` | 与 `media.nowPlaying` 相同 | 换歌、换播放器或播放 / 暂停时（有插件订阅时每 2 秒检查一次），进度变化不算 |
| `shelf.changed` | `shelf:read` | `{ count }` | 文件中转的条目变了（用户或插件改的），需要时调 `shelf.list` |
| `system.locked` / `system.unlocked` | — | `{}` | 锁屏 / 解锁 |
| `system.suspended` / `system.resumed` | — | `{}` | 电脑睡眠 / 唤醒。睡眠前留给插件的时间很短，要保存的东西平时就存好 |
| `system.idle` | — | `{ idleSeconds }` | 5 分钟没有键盘鼠标输入（每 5 秒检查一次）；在有输入之前只发一次 |
| `system.active` | — | `{}` | `system.idle` 之后又有了输入 |

- 同一个事件 200 毫秒内最多发一次，带最后一次的 `payload`。连续输入时不会刷屏。
- 订阅只在这次进程里有效：插件重启后要重新订阅，一般在收到 `initialize` 后马上订阅。
- 订阅之前发生的变化不会补发；插件启动时自己读一次当前状态。

### 岛上提示（第 2 版）

`island.notify { title, body?, durationMs?, actions? }` 在岛屿上显示一条消息，和 QQ、邮件消息一样出现在折叠条的消息预览里，来源显示为插件名。

- `title` 1–80 个字符，`body` 最长 200 个字符。`durationMs` 默认 5000，限制在 2000–15000 之间。
- `actions` 最多 2 个按钮：`{ id, title }`，`id` 为 1–32 个字母、数字或 `-`，`title` 最长 16 个字符。用户点了按钮，插件收到 `notification.action { id }`。
- 每个插件每分钟最多 6 条，超过返回 `-32000`、状态 429。
- 用户可以在插件设置页关掉这个插件的提示。关掉后调用仍然成功，但什么也不显示，结果是 `{ muted: true }`。

### 存储与秘密（第 2 版）

- `storage.*` 由岛屿保存在 `plugins-data/<id>/storage.json`，不需要权限，适合保存设置以外的小量数据（对应 VS Code 的 `globalState`）。写入是原子的，岛屿崩溃也不会留下半个文件。
- `secrets.*` 保存在 Windows 凭据管理器中（服务名 `com.focusd.island.plugin.<id>`），需要 `secrets` 权限，适合令牌和密码。`key` 为 1–64 个字母、数字、`.`、`_`、`-`；`value` 是最长 1024 个字符的字符串；每个插件最多 32 个，超过返回状态 413。
- 卸载插件时，存储和秘密都会保留，重新安装后还能读到。插件设置页的 **清除数据** 会删除 `plugins-data/<id>/` 整个目录和这个插件的全部秘密，运行中的插件会被重启。

### 错误码

| code | 含义 |
|---|---|
| `-32700` | 不是合法的 JSON |
| `-32600` | 不是合法的 JSON-RPC 消息（缺少 `"jsonrpc": "2.0"`、`method` 或 `id` 类型不对） |
| `-32601` | 方法不存在（第 1 版插件调用第 2 版才有的 `events.*`、`storage.*`、`view.*`、`status.update` 也是这个错误） |
| `-32001` | 没有对应的权限（包括订阅没有权限的事件），或者用户拒绝了敏感权限、30 秒内没有回答 |
| `-32000` | 岛屿返回了错误，`data.status` 是对应的 HTTP 状态码：400 参数错误、404 不存在（包括清单里没有声明的页面或状态项）、409 对应功能被用户关掉了（例如剪贴板历史），或在 `view.update` 之前调用了 `view.patch`、413 太大（存储、秘密或页面模型超出上限）、429 请求太多（同时发送的请求超过 16 个，或 `island.notify` 超过每分钟 6 条）、500 岛屿做不到（例如写文件或凭据管理器失败）、504 岛屿没有及时响应 |

### 环境变量

| 变量 | 说明 |
|---|---|
| `FOCUSD_PLUGIN_ID` | 插件 id |
| `FOCUSD_PLUGIN_DATA_DIR` | 插件私有的数据目录 `%APPDATA%\com.focusd.island\plugins-data\<id>\`，已经创建好。插件的数据请存在这里，不要写进插件目录，否则更新插件时会被覆盖。 |
| `FOCUSD_PLUGIN_API_VERSION` | 清单里的 `apiVersion`（`1` 或 `2`） |

工作目录是插件文件夹，进程不会显示控制台窗口。

## 生命周期

- 插件在同时满足以下条件时才**可以**运行：用户允许了第三方插件、启用了这个插件、所需权限都已授权、清单有效。什么时候真正启动，由下面的「按需启动」决定。
- 进程意外退出后，会依次在 1 秒、5 秒、30 秒后重启。连续失败 3 次后停止，状态显示为"已出错停止"。只要插件连续运行超过 60 秒，失败次数就会清零。
- 状态信息包括：未运行、启动中、运行中、重启中、已出错停止、待命（按需启动的插件此刻没有运行）。
- **进程树**：插件进程和它启动的所有程序都放在同一个 Windows Job Object 里。插件被停止、出错退出，或者岛屿自己崩溃时，这些程序会一起被结束。插件用 `Start-Process` 等方式启动的程序也不例外。
- **资源**：岛屿每 5 秒读取一次插件进程树的内存（私有字节）和 CPU。插件卡片上只显示**插件自己**的内存：PowerShell 和 Node.js 插件会减去运行时本身的份额，这个份额是岛屿单独启动一个什么都不做的 PowerShell / Node.js 量出来的（空闲的 PowerShell 约 60 MB，这部分每个 PowerShell 插件都有，插件脚本本身通常只有几 MB；在意内存的插件可以改用原生 exe）。鼠标停在这一行上会列出每个进程的已提交内存和工作集，以及进程合计和运行时的份额。连续 1 分钟 CPU 超过 25%（占整台电脑的比例）时卡片上会提醒。内存超过上限时插件会被结束，状态为"已出错停止"并说明原因；上限和卡片一样只算插件自己的份额，默认 512 MB，用户可以在插件设置页改成 256 MB、1 GB 或 2 GB（插件自己不能改）。

### 按需启动（第 2 版）

清单写了 `activationEvents` 的插件不会随岛屿一直运行，而是等到需要时才启动，空闲时再停掉。没写这个字段的插件（以及所有第 1 版插件）和以前一样，岛屿运行期间一直运行。

```json
"activationEvents": ["onEvent:todos.changed", "onSchedule:30"]
```

| 激活事件 | 什么时候启动 |
|---|---|
| `onStartup` | 岛屿启动时，并且一直运行（等于不写这个字段）。审核时要说明为什么需要常驻 |
| `onStartupFinished` | 岛屿启动 10 秒后 |
| `onCommand:<id>` | 用户点了这个命令的按钮、按了它的快捷键，或在待办右键菜单里选了它 |
| `onView:<id>` | 用户打开了这个岛上页面 |
| `onEvent:<事件名>` | 发生了这个事件（需要事件对应的权限；敏感权限会先在岛上询问）。插件会直接收到这次的 `event` 通知，不用先订阅 |
| `onSchedule:<分钟>` | 每隔这么多分钟启动一次，5–1440 |
| `onUri` | 打开了 `focusd://plugin/<插件 id>/...` 链接，见下文的「链接」 |

- `contributes.commands` 和 `contributes.views` 会自动加上对应的 `onCommand:<id>` / `onView:<id>`，不用重复写。所以 `"activationEvents": []` 表示"只在用户用到命令或页面时启动"。
- 启动时，触发这次启动的命令、事件或页面消息会等 `initialize` 发出之后再送达，最多等 10 秒。`initialize.activationEvent` 告诉插件这次是因为什么启动的（常驻插件为 `onStartup`）。
- **空闲停止**：按需启动的插件 60 秒内没有收到消息、没有发出请求、没有打开的岛上页面时，岛屿发送 `shutdown` 让它退出，之后有激活事件时再启动。插件订阅了不在 `activationEvents` 里的事件时，会一直运行，以免错过事件。
- 需要一直运行时调用 `host.keepAlive { reason }`，插件卡片会显示原因；`{ reason: null }` 取消。插件重启后要重新申请。
- 插件被停止时，它的 `storage` 不受影响，但订阅、岛上页面的模型和折叠条状态文字都会清空，下次启动后要重新设置。

### 链接（第 2 版）

岛屿为当前用户注册了 `focusd://` 链接。网页或其他程序打开 `focusd://plugin/<插件 id>/<路径>?<查询>` 时，Windows 把链接交给岛屿（岛屿没在运行时会先启动它），岛屿再发给这个插件，插件可以借此接收登录回调之类的数据。

- 只有 `activationEvents` 里写了 `onUri` 的插件能收到链接；按需启动的插件会被唤醒。插件收到 `uri { uri, path, query }`：`path` 是插件 id 后面的部分（以 `/` 开头，没有时为空），`query` 是 `?` 后面、`#` 前面的部分，仍是百分号编码。整个链接最长 2048 个字符，不能有空白。
- 任何网页都能放这种链接，所以插件第一次收到链接前，岛上会像敏感权限一样询问用户（允许 / 本次 / 拒绝）。答案记在插件的「敏感权限」里，可以撤销。插件被关闭、没写 `onUri` 或用户拒绝时，链接被丢弃。
- 把链接里的数据当成不可信的输入：检查格式，不要直接执行；做登录回调时用 `state` 参数核对是自己发起的请求。
- Node SDK：`plugin.onUri(({ path, query }) => ...)`；模拟宿主：`host.openUri("/auth", "code=1")`。PowerShell：在 `Invoke-FocusdLoop` 的处理函数表里加 `uri`。
- 注册写在 `HKCU\Software\Classes\focusd`，指向最近一次启动的岛屿程序；卸载岛屿不会删除它。

## SDK

SDK 的源码在 [`packages/`](../../packages/)：npm 包 `fly-island-plugin`（Node.js SDK、命令行工具和模拟宿主）、脚手架 `create-fly-island-plugin` 和 PowerShell 模块 `FlyIsland.Plugin`。供直接复制的单文件版本在 [`plugins/sdk/`](../../plugins/sdk/)，由 `pnpm sdk:build` 从源码生成（`pnpm test` 检查是否最新），不要手改。两个 npm 包推送 `sdk-v<版本>` 标签后由 CI 发布，见 [发布插件 SDK](sdk-release.md)。

### PowerShell（不需要用户安装任何东西）

[`plugins/sdk/powershell/focusd.ps1`](../../plugins/sdk/powershell/focusd.ps1) 适用于 Windows 自带的 PowerShell 5.1，复制到插件的 `lib/` 里使用。除了下面的基本函数，还有 `Invoke-FocusdLoop`（按通知名分派处理函数）、事件、提示、页面、状态文字、存储和秘密的辅助函数，见 [快速开始](quickstart.md#6-其他写法)。示例插件里的 `lib/focusd.ps1` 是较早的版本（已发布的插件包不能改），只有下面这几个基本函数。完整用法见示例的 [`main.ps1`](../../plugins/examples/dev.focusd.todo-digest/main.ps1)。

```powershell
. "$PSScriptRoot\lib\focusd.ps1"

while ($true) {
    $message = Receive-FocusdNotification 1000   # 1 秒内没有消息时返回 $null，可以借机做定时任务
    if ($message.method -eq 'command' -and $message.params.id -eq 'sync-now') {
        $todos = @((Invoke-FocusdMethod 'todos.list').todos)
        Write-FocusdLog "$($todos.Count) todos"
    }
}
```

注意：

- 函数返回数组时，PowerShell 会把只有一个元素的数组展开成单个对象，所以调用处要用 `@(...)` 包起来再取 `.Count`。
- stdin 关闭时，`Read-FocusdLine` 会让插件自动退出。

### Node.js（需要用户安装 Node.js）

[`plugins/sdk/node/focusd.mjs`](../../plugins/sdk/node/focusd.mjs) 是一个没有任何依赖的 SDK，可以直接复制到你的插件里使用（同目录的 `focusd.d.mts`、`protocol.d.mts` 是它的类型）。它还封装了事件（`onEvent`）、提示（`notify`）、页面（`views.*`）、状态文字（`status.*`）、`storage`、`secrets`、`keepAlive` 等，见 [API 参考](api.md) 和类型定义：

```js
import { createPlugin } from "./lib/focusd.mjs";

const plugin = createPlugin();
plugin.onReady(async () => {
  const { todos } = await plugin.todos.list();
  plugin.log(`${todos.length} todos`);
});
plugin.onCommand("sync-now", async () => {
  await plugin.todos.add("Synced from my plugin");
});
```

用其他语言写插件时，只要在 stdin / stdout 上实现上面的协议即可。

## 提交插件

插件进岛屿有两条路：只在自己的电脑上用，或者放进插件市场，让别人在 **设置 → 插件市场** 里安装。

### 只在这台电脑上用

按上面的「快速开始」把插件文件夹放进插件目录，在 **设置 → 插件扩展** 里允许第三方插件并重新加载。这种方式不经过市场，也不需要签名。改完文件后再点一次 **重新加载** 即可。

### 放进插件市场

市场列表来自 [`TixXin/focusd-plugins`](https://github.com/TixXin/focusd-plugins) 仓库根目录的 `index.json`。插件包放在**你自己仓库的 GitHub Release** 里，市场仓库只记录插件在哪里；它的 CI 每小时检查一次新版本，校验后重建索引并签名。完整步骤见那里的 [CONTRIBUTING.md](https://github.com/TixXin/focusd-plugins/blob/main/CONTRIBUTING.md)，简要来说：

1. 用 `npx fly-island-plugin validate` 检查，`npx fly-island-plugin pack` 打包，得到 `<id>-<version>.zip`。
2. 在自己的仓库发布 GitHub Release：标签是清单的 `version`（可以带 `v`），附件是这个 zip，文件名不能改。
3. 向 `focusd-plugins` 开 pull request，只新增 `plugins/<插件 id>.json`（见下文）。PR 会自动检查所有权、下载并校验插件包；维护者阅读源码后合并，一小时内插件出现在 **设置 → 插件市场**。
4. 以后发新版本只要在自己的仓库发新的 Release。申请新权限、第一次加入自定义网页界面或换了运行时的版本不会自动上架，要等维护者审核。

装好后插件默认是关闭的，到 **设置 → 插件扩展** 里启用并授权。

### 发布者与分类

`plugins/<插件 id>.json`（在 `focusd-plugins` 里）：

```json
{
  "id": "com.example.clock",
  "repo": "example/focusd-clock",
  "publisher": "example",
  "categories": ["productivity", "developer"]
}
```

- `publisher`：`repo` 的所有者（GitHub 用户或组织），市场上显示为发布者；你必须是它本人，或该组织的公开成员。官方发布者 `TixXin` 显示为“官方”，含 `focusd` 的 id 只留给官方插件。
- `repo`：`owner/name`，必须公开；详情里的“仓库”按钮打开它。
- `categories`：只能取 `productivity`、`todos`、`developer`、`media`、`messages`、`information`、`utilities`。
- `preRelease`：为 `true` 时也收录标成 Pre-release 的 Release，版本号用 semver 预发布后缀（例如 `1.3.0-beta.1`）。插件市场只列正式版；已安装的插件在设置页打开「接收这个插件的预发布版本」后，更新会安装比正式版新的预发布版本，卡片上也会提示有预发布版本可选。正式版发布后（例如 `1.3.0` 高于 `1.3.0-beta.2`），装着预发布版本的用户会更新到正式版。关掉开关不会退回旧版本。
- `tagPrefix`：一个仓库放多个插件时的标签前缀，例如 `clock-`（标签 `clock-v1.2.0`）。
- `domain`：可选，用来成为已验证发布者的域名（见下文）。
- `path`：插件在仓库里的文件夹，例如 `plugins/clock`，默认仓库根目录。
- **说明和版本历史**：插件的 `README.md` 和 `CHANGELOG.md` 会写进索引（各最多 16 KB），在插件市场的详情里显示。先在插件包里找；包里没有（写进了 `.focusdignore`）时，读仓库里 Release 标签处 `path` 文件夹中的同名文件。它们跟着版本走，改了要发新版本才会更新。支持标题、段落、列表、引用、代码块、粗体、斜体和 http(s) 链接；HTML 和图片不显示（图片只显示替代文字）。`CHANGELOG.md` 建议每个版本一节、最新的在最前（`## 1.2.0`）。

**已验证发布者**：市场在发布者名字旁显示「已验证 · GitHub 组织」或「已验证 · <域名>」，说明发布者确实是它的名字所指的组织或个人，不代表插件安全。在 GitHub 上验证过域名的组织自动得到；其他发布者在提交里写 `"domain": "example.com"`，并让 `https://example.com/.well-known/focusd-publisher.json` 返回 `{ "github": "<publisher>" }`。市场每小时重新检查一次。

用户第一次安装非官方发布者的插件时，按钮显示 **信任并安装**，点了就把这个发布者记进信任列表（存在 `plugins.json` 的 `trustedPublishers`），可以在 **设置 → 插件扩展 → 更新** 里取消信任。

### 作者签名

可选。签了名，用户的岛屿才会**自动更新**你的插件；岛屿还会记下第一次看到的密钥，之后换了密钥的版本要用户确认才装。这样即使你的 GitHub 账号或仓库被盗，攻击者发的新版本也不会悄悄装到用户电脑上。设计见 [plugin-author-signing.md](../architecture/plugin-author-signing.md)。

1. 只需一次：`npx fly-island-plugin keygen` 生成签名密钥。私钥存在 `~/.fly-island-plugin/signing.key`（Windows 上用 DPAPI 加密，只有当前 Windows 账户能解开），也可以用环境变量 `FLY_ISLAND_PLUGIN_SIGNING_KEY`（PEM 文本）提供。它打印的 `{ keyId, publicKey }` 写进 `focusd-plugins` 里你的提交 `plugins/<插件 id>.json` 的 `"signingKeys": [ ... ]`。
2. 每次发版：`npx fly-island-plugin pack --sign`，把 `<id>-<version>.zip` 和 `<id>-<version>.zip.sig` 一起附到 Release。已经打好的包可以用 `npx fly-island-plugin sign <zip>` 补签。
3. 登记了 `signingKeys` 之后，没有签名或签名不对的版本不会上架，维护者也不能放行。

岛屿这一侧：

- 市场上签了名的插件带「作者已签名」标签，鼠标停在上面显示密钥编号；插件卡片的版本号后面也会写「作者已签名」。
- 签名不对的包不安装（和 SHA-256 不对一样）。
- 安装后岛屿记下签名的密钥（`plugins.json` 的 `plugins.<id>.authorKeys`）。之后的更新换了密钥或者没有签名时，不会自动更新，卡片和市场上都会提示；市场上的按钮变成「仍然更新」，再点「确认更新」才会安装，装好后改记新的密钥。
- **自动更新只给签了名的插件**：还要同时满足发布者可信、不申请新权限。

签名对象是 `focusd-plugin-package/1`、插件 id、版本和 zip 的 SHA-256 四行文本（Ed25519），所以签名不能挪到别的插件或别的版本上。**备份私钥**：丢了只能换新密钥，而换密钥后的第一个版本要每个用户手动确认。最安全的做法是在自己电脑上签名再上传，不要把私钥放进仓库的 CI。

**换密钥**（旧密钥还在时）：`npx fly-island-plugin keys rotate`（在插件文件夹里运行；一把密钥签多个插件时加 `--ids a,b`）。它把旧密钥改名为 `<密钥文件>.<旧 keyId>.old` 保留下来，在原位置生成新密钥，并打印每个插件要加进 `signingKeys` 的新条目，里面的 `endorsedBy` 是旧密钥对“插件 id + 新密钥”的签名。把新条目加在旧密钥**后面**（旧密钥先别删）开 PR，合并后用新密钥签名发版。岛屿看到新密钥有已记下的密钥的证明（可以一环接一环），就当作同一个作者，照常自动更新，并改记新密钥。证明只对写在里面的插件 id 有效。丢了旧密钥就做不出证明，只能按 [设计](../architecture/plugin-author-signing.md#35-换密钥与丢失密钥) 里的“丢了密钥”处理，用户要手动确认。

### 官方插件

本仓库 `plugins/examples/` 里的示例插件是官方插件，发布方式不同：

1. 修改插件并提高 `version`，在本机运行 `pnpm plugins:index`（需要旧签名私钥，见下文；以及官方作者密钥 `~/.tauri/fly-island/plugin-author-signing.key`，公钥在 `plugins/author-key.json`）。脚本把插件打成 `plugins/packages/<id>-<version>.zip` 并写出作者签名 `<zip>.sig`，重写并签名本仓库的 `plugins/index.json` 和 `plugins/revoked.json`。文本文件打包时统一成 LF，时间戳固定，所以同一份源码每次得到同一个哈希。
2. 提交并 land。
3. 在 `focusd-plugins` 里把 `plugins/<id>.json` 的 `package` 改成新 zip 的地址（`https://raw.githubusercontent.com/TixXin/fly-island/main/plugins/packages/<id>-<version>.zip`），合并后 CI 更新市场索引。

本仓库的 `plugins/index.json` 只给切换到 `focusd-plugins` 之前发布的岛屿（它们读 `main`，更早的读 `dev`，`dev` 与 `main` 保持同一个提交），只含官方插件。

### 更新

允许第三方插件时，岛屿在启动 30 秒后和之后每 6 小时在后台刷新一次市场（也可以点 **立即检查**），已安装的插件有新版本时卡片上提示。**自动更新插件**默认关闭；打开后，只有作者签了名（密钥和已安装的版本相同）、来自可信发布者、而且不申请新权限的更新会自动安装，其他更新仍然只提示。

### 下架

`focusd-plugins` 根目录的 `revoked.json` 列出被撤销的版本（本仓库的 `plugins/revoked.json` 是给旧版岛屿的副本，要同步修改）：

```json
{
  "version": 1,
  "revoked": [
    {
      "id": "dev.example.plugin",
      "versions": ["1.2.0"],
      "reason": { "zh-CN": "这个版本会删除数据", "en": "This version deletes data" },
      "action": "disable"
    }
  ]
}
```

- `versions`：`"*"` 表示所有版本，或者列出具体版本。
- `action`：`disable` 停止并禁用插件；`uninstall` 停止并删除插件目录（`plugins-data/<id>/` 保留）。
- 岛屿每次刷新市场时读取它，名单保存在 `plugins.json` 的 `revoked` 里，离线时也有效。下载到的名单只会往保存的名单里**加**条目，不会删：旧的缓存副本或者暂时读不到 `revoked.json`，都不会让已下架的版本重新可用。误下架的插件请发一个新版本。市场也不会把已安装的插件换成更旧的版本。被撤销的版本不能启用，也不能从市场安装；插件卡片显示原因。手动放进插件目录的同 id 同版本也会被拦截，开发模式加载的插件除外。
- 它和 `index.json` 一样要签名（`focusd-plugins` 的 CI 合并后重新签名）。没有这个文件时视为没有撤销任何版本；有文件但签名不对时，整个市场刷新失败。

### 签名

岛屿只接受签名有效的索引。索引里有每个插件包的 SHA-256，所以给索引签名，也就间接保护了插件包：即使有人能修改仓库或 CDN 上的文件，没有私钥也无法让岛屿安装被改过的插件。

- **算法**：Ed25519。签名对象是 LF 换行的 `index.json`（`revoked.json` 同理）。签名文件的格式为 `{ "keyId", "signature" }`，或者这种对象的数组（多把密钥各签一份，例如换密钥的过渡期）；数组中任一由可信公钥做出的有效签名即可通过。
- **公钥**：放在 `plugins/signing-keys.json` 中，编译时嵌入岛屿；`focusd-plugins` 的 `keys/trusted.json` 与它一致。如果要换密钥，需要先把新公钥加进这个文件并发布一个新版本的岛屿。
- **私钥**：有两把。`focusd-plugins` 的市场索引由 CI 签名（密钥 `e862885af5bba3dc`，存在该仓库 `release` 环境的 secret 里，只有 `main` 分支能用）。本仓库给旧版岛屿的 `plugins/index.json` 用较早的密钥签名：由 `pnpm plugins:keygen` 生成，保存在 `~/.tauri/fly-island/plugin-index-signing.key`，用 Windows DPAPI 加密，只有生成它的 Windows 账户能解开；也可以用环境变量 `FOCUSD_PLUGIN_SIGNING_KEY`（PEM 文本）提供。
- **备份私钥**：私钥丢失后，已经安装的岛屿不会接受用新密钥签名的索引，只能随新版岛屿换密钥。DPAPI 加密的文件换了电脑或账户就解不开，所以备份时要另外导出一份明文 PEM，放在安全的地方。
- **下载方式**：岛屿先通过 GitHub API 查出 `focusd-plugins` 的 `main` 分支最新的提交号，再按提交号下载 `index.json`、`revoked.json` 和它们的签名。这样两个文件一定来自同一次提交，也不会读到 CDN 的旧缓存。GitHub API 不可用时，退回按分支名下载；这时如果刚好赶上 CDN 缓存，可能短暂出现"签名不匹配"，稍等几分钟再刷新即可。

规则：

- 已发布的版本**不能修改**，因为用户安装时校验的就是那个哈希值。同一个版本号的包变了，市场 CI 会拒绝，官方插件的 `pnpm plugins:index` 也会报错；请发新版本号。
- 本仓库的 `pnpm test` 会检查 `plugins/index.json` 和 zip 是否与示例插件的源码一致。

应用安装插件时会依次检查：

1. 索引的签名有效（见上文）。
1. 下载的包大小和 SHA-256 与索引一致。
2. zip 内的路径没有跳出插件目录。
3. 解压后总大小不超过 100 MB。
4. 清单的 `id` 和 `version` 与索引一致。
5. 清单申请的权限没有超出索引里列出的权限。
6. 索引里有作者签名时签名有效；签名密钥和已安装的版本不同时，要用户确认（见「作者签名」）。

全部通过后才会替换旧版本。新安装的插件默认不启用；更新时保留启用状态，但如果新版本需要更多权限，插件会暂停，等待用户重新授权。卸载插件会删除插件目录和授权记录，但保留 `plugins-data/<id>/` 中的数据和凭据管理器里的秘密。

## 调试

- 设置 → 插件扩展 → 展开插件卡片上的 **日志**。启动失败的原因（例如找不到 Node.js）也会显示在卡片上。
- **开发模式**：设置 → 插件扩展 → **开发者**（默认收起）→ 打开 **开发模式**。之后可以从任意文件夹加载插件（文件夹名不必等于插件 id），不需要打开"允许运行第三方插件"；开发中的插件卡片标着"开发中"，自动获得清单里申请的全部权限（敏感权限第一次使用时仍会询问），可以使用 `experimentalApis`，和插件目录里同 id 的插件同时存在时以开发中的为准。选中一个开发中的插件可以看到最近 200 行原始 JSON-RPC 收发记录，也可以手动给它发一个事件（不管有没有订阅）。开发模式只在内存里，岛屿重启后需要重新打开、重新加载。
- **命令行**：`npx fly-island-plugin dev` 通过[本地 API](../local-api.md#开发模式) 让岛屿加载当前文件夹，文件变化后自动重启插件，并在终端打印插件日志。需要打开本地 API 插件和它的"允许修改"，以及开发模式。
- **不启动岛屿**：`npx fly-island-plugin test` 用模拟宿主运行插件，或在自己的测试里用 `fly-island-plugin/test` 的 `startMockHost`，见 [快速开始](quickstart.md#4-测试不用启动岛屿)。
