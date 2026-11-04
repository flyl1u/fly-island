# 编写 FocuSD Island 插件

插件是一个由岛屿启动的程序。它通过 stdin / stdout 与岛屿通信，可以按授予的权限读写待办和每日笔记，并在设置页里提供按钮。设计背景见 [架构提案](../architecture/plugins.md)，和 VS Code 的差别见 [和 VS Code 插件系统的对比](vscode.md)，后续计划见 [插件平台第 2 版](../architecture/plugin-platform.md)。

> 当前状态：插件 API 第 1 版。可以在 设置 → 插件市场 中安装，也可以手动放进插件目录。

## 快速开始

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

目前只有一个内置插件：[本地接口](../local-api.md)（`focusd.local-api`）。

内置插件的清单写在 `src-tauri/src/plugin_host/builtin.rs` 中，`runtime.type` 为 `builtin`。插件目录里的第三方插件不能使用这个类型，也不能使用内置插件的 id。

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
  "apiVersion": 1,
  "minAppVersion": "0.2.14",
  "author": "example",
  "homepage": "https://github.com/example/todo-sync",
  "runtime": { "type": "process", "command": "main.ps1", "args": [] },
  "permissions": ["todos:read", "todos:write"],
  "contributes": {
    "commands": [{ "id": "sync-now", "title": { "zh-CN": "立即同步", "en": "Sync now" } }]
  }
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 3–64 个字符，只能用小写字母、数字、`.`、`-`，必须和文件夹名相同。建议使用反向域名，例如 `dev.yourname.xxx`。 |
| `name` | ✅ | 中英文名称都要提供。 |
| `description` | | 中英文说明。 |
| `version` | ✅ | 1–32 个字符。 |
| `apiVersion` | ✅ | 目前只能是 `1`。 |
| `minAppVersion` | | 需要的最低 FocuSD Island 版本，版本不够时插件显示为"无法加载"。 |
| `author`、`homepage` | | 主页只显示 `https://` 链接。 |
| `runtime` | ✅ | `{ "type": "process", "command": "...", "args": [...] }` 表示运行一个程序；`{ "type": "none" }` 表示只有清单、不运行程序。 |
| `permissions` | | 见下文的权限表。 |
| `contributes.commands` | | 最多 8 个，显示为插件设置页上"操作"一栏里的按钮。`id` 只能用字母、数字和 `-`。 |
| `contributes.settings` | | 最多 20 个设置项，由岛屿画在插件自己的设置页上并负责保存，见下文的"设置页"。 |

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

| 权限 | 允许调用的方法 |
|---|---|
| `todos:read` | `todos.list` |
| `todos:write` | `todos.add`、`todos.update`、`todos.remove` |
| `notes:read` | `note.get` |
| `notes:write` | `note.set` |
| `agent-status:write` | `agentStatus.report`、`agentStatus.clear` |

用户启用插件时，会授予清单里列出的全部权限。新版本如果要求更多权限，插件会暂停，直到用户重新授权。

注意：权限只限制插件能调用哪些岛屿接口。插件程序本身以用户身份运行，可以读写文件和联网。

## 通信协议

使用 JSON-RPC 2.0，每行一条 JSON 消息，编码为 UTF-8。每条消息不超过 1 MB。

- **stdout** 只能输出协议消息。
- **stderr** 的每一行都会进入插件日志（设置页里最多保留 200 行）。

### 岛屿发给插件的通知

| 方法 | 参数 | 时机 |
|---|---|---|
| `initialize` | `{ apiVersion, appVersion, pluginId, dataDir, permissions, settings }` | 进程启动后立即发送 |
| `command` | `{ id }` | 用户点击了 `contributes.commands` 中的某个按钮 |
| `settings.changed` | `{ settings }` | 用户在设置页上改了设置；`settings` 是全部设置的新值 |
| `shutdown` | `{}` | 插件被停用、重新加载或删除时发送；随后 stdin 会关闭，2 秒后进程被结束 |

**stdin 关闭时插件必须退出。** 岛屿自己退出时也会关闭 stdin。

### 插件调用的方法（请求）

| 方法 | 参数 | 结果 |
|---|---|---|
| `host.info` | — | 与 `initialize` 的参数相同 |
| `settings.get` | — | 全部设置的当前值（不需要权限） |
| `ui.setInfo` | `{ items: [{ label, value, copy?, secret? }] }` | `{}`。替换设置页上的"运行信息"，最多 10 项，`value` 最长 500 个字符；`copy` 表示显示"复制"按钮，`secret` 表示默认隐藏（适合令牌）；传空列表表示清空。插件停止后信息会自动清空。不需要权限。 |
| `todos.list` | — | `{ date, todos, scheduled, activeTodoId }` |
| `todos.add` | `{ title, date? }` | 新增的待办；`date` 晚于今天时加入"以后"列表 |
| `todos.update` | `{ id, title?, completed? }` | 修改后的待办 |
| `todos.remove` | `{ id }` | `{ id }` |
| `note.get` | — | `{ date, note }` |
| `note.set` | `{ note }` 或 `{ append }` | `{ date, note }` |
| `agentStatus.report` | `{ source, phase, name?, title?, taskId? }` | 保存后的状态，`id` 为 `<插件 id>/<source>` |
| `agentStatus.clear` | `{ source? }` | `{ cleared }`；省略 `source` 时清除这个插件的全部来源 |

这些方法和 [本地接口](../local-api.md) 的 HTTP 接口一一对应，参数和结果完全相同。`agentStatus.*` 的字段规则见本地接口文档的“AI Agent 状态”一节；`name` 省略时默认使用插件清单里的英文名称。插件停止、停用或出错退出时，它上报的来源会被自动清除。

插件还可以发送通知 `log`，参数为 `{ message }`，内容会写入日志。

### 错误码

| code | 含义 |
|---|---|
| `-32700` | 不是合法的 JSON |
| `-32600` | 不是合法的 JSON-RPC 消息（缺少 `"jsonrpc": "2.0"`、`method` 或 `id` 类型不对） |
| `-32601` | 方法不存在 |
| `-32001` | 没有对应的权限 |
| `-32000` | 岛屿返回了错误，`data.status` 是对应的 HTTP 状态码（400 参数错误、404 不存在、429 同时发送的请求超过 16 个、504 岛屿没有及时响应） |

### 环境变量

| 变量 | 说明 |
|---|---|
| `FOCUSD_PLUGIN_ID` | 插件 id |
| `FOCUSD_PLUGIN_DATA_DIR` | 插件私有的数据目录 `%APPDATA%\com.focusd.island\plugins-data\<id>\`，已经创建好。插件的数据请存在这里，不要写进插件目录，否则更新插件时会被覆盖。 |
| `FOCUSD_PLUGIN_API_VERSION` | `1` |

工作目录是插件文件夹，进程不会显示控制台窗口。

## 生命周期

- 插件在同时满足以下条件时才会运行：用户允许了第三方插件、启用了这个插件、所需权限都已授权、清单有效。
- 进程意外退出后，会依次在 1 秒、5 秒、30 秒后重启。连续失败 3 次后停止，状态显示为"已出错停止"。只要插件连续运行超过 60 秒，失败次数就会清零。
- 状态信息包括：未运行、启动中、运行中、重启中、已出错停止。

## SDK

### PowerShell（不需要用户安装任何东西）

示例中的 [`lib/focusd.ps1`](../../plugins/examples/dev.focusd.todo-digest/lib/focusd.ps1) 适用于 Windows 自带的 PowerShell 5.1，可以直接复制到你的插件里使用。完整用法见示例的 [`main.ps1`](../../plugins/examples/dev.focusd.todo-digest/main.ps1)。

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

[`plugins/sdk/node/focusd.mjs`](../../plugins/sdk/node/focusd.mjs) 是一个没有任何依赖的 SDK，可以直接复制到你的插件里使用：

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

市场列表来自 [`TixXin/fly-island`](https://github.com/TixXin/fly-island) 仓库 `dev` 分支上的 `plugins/index.json`。索引必须由私钥签名，私钥不在仓库里。自己改 `index.json`、签名文件或 zip，岛屿都不会接受。

插件作者提交源码，持有私钥的人打包并签名：

1. 把插件放在 `plugins/examples/<插件 id>/`。文件夹名必须等于清单里的 `id`，里面要有 `focusd-plugin.json` 和要运行的程序。
2. 向该仓库的 `dev` 分支提 pull request，**只包含插件源码**。不要提交 `plugins/index.json`、`plugins/index.json.sig` 或 `plugins/packages/` 里的 zip，这些由打包脚本生成。不要推到 `main`：上游的 pull request 跟踪的是这个仓库的 `main`。
3. 审核通过后，维护者在本机运行 `pnpm plugins:index`（需要签名私钥，见下文）。脚本会把插件打成 `plugins/packages/<id>-<version>.zip`，重写 `plugins/index.json`（含 SHA-256 和文件大小），并用私钥写 `plugins/index.json.sig`。文本文件打包时统一成 LF，时间戳固定，所以同一份源码每次得到同一个哈希。
4. 维护者把生成的索引、签名、zip 和源码一起提交，推送到 `dev`。用户在 **设置 → 插件市场** 点 **刷新** 就能看到。装好后插件默认是关闭的，到 **设置 → 插件扩展** 里启用并授权。

如果你自己持有签名私钥，可以跳过 pull request，直接做第 1、3、4 步。没有私钥时不要运行 `pnpm plugins:index`，它签不了名。

### 签名

岛屿只接受签名有效的索引。索引里有每个插件包的 SHA-256，所以给索引签名，也就间接保护了插件包：即使有人能修改仓库或 CDN 上的文件，没有私钥也无法让岛屿安装被改过的插件。

- **算法**：Ed25519。签名对象是 LF 换行的 `index.json`。签名文件的格式为 `{ "keyId", "signature" }`。
- **公钥**：放在 `plugins/signing-keys.json` 中，编译时嵌入岛屿。如果要换密钥，需要把新公钥加进这个文件，并发布一个新版本的岛屿。
- **私钥**：只有一份，由 `pnpm plugins:keygen` 生成（只需要运行一次），保存在 `~/.tauri/fly-island/plugin-index-signing.key`，用 Windows DPAPI 加密，只有生成它的 Windows 账户能解开。也可以用环境变量 `FOCUSD_PLUGIN_SIGNING_KEY`（PEM 文本）提供私钥，比如在 CI 里。
- **备份私钥**：私钥丢失后，已经安装的岛屿不会接受用新密钥签名的索引，只能随新版岛屿换密钥。DPAPI 加密的文件换了电脑或账户就解不开，所以备份时要另外导出一份明文 PEM，放在安全的地方。
- **下载方式**：岛屿先通过 GitHub API 查出 `dev` 分支最新的提交号，再按提交号下载 `index.json` 和 `index.json.sig`。这样两个文件一定来自同一次提交，也不会读到 CDN 的旧缓存。GitHub API 不可用时，退回按分支名下载；这时如果刚好赶上 CDN 缓存，可能短暂出现"签名不匹配"，稍等几分钟再刷新即可。

规则：

- 已发布的版本**不能修改**，因为用户安装时校验的就是那个哈希值。修改插件后必须提高 `version`，否则脚本会报错。旧版本的 zip 保留在仓库里。
- 打包时文本文件的换行统一为 LF，所以 Windows 和其他系统打出的包完全相同。
- `pnpm test` 会检查 `index.json` 和 zip 是否与源码一致。

应用安装插件时会依次检查：

1. 索引的签名有效（见上文）。
1. 下载的包大小和 SHA-256 与索引一致。
2. zip 内的路径没有跳出插件目录。
3. 解压后总大小不超过 100 MB。
4. 清单的 `id` 和 `version` 与索引一致。
5. 清单申请的权限没有超出索引里列出的权限。

全部通过后才会替换旧版本。新安装的插件默认不启用；更新时保留启用状态，但如果新版本需要更多权限，插件会暂停，等待用户重新授权。卸载插件会删除插件目录和授权记录，但保留 `plugins-data/<id>/` 中的数据。

## 调试

- 设置 → 插件扩展 → 展开插件卡片上的 **日志**。启动失败的原因（例如找不到 Node.js）也会显示在卡片上。
- 不启动岛屿也能测试插件：自己写一个小脚本扮演宿主，往插件的 stdin 写 `initialize`，再回应它发出的请求。
