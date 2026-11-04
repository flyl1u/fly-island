# 编写 FocuSD Island 插件

插件是一个由岛屿启动的程序。它通过 stdin / stdout 与岛屿通信，可以按授予的权限读写待办和每日笔记，并在设置页里提供按钮。设计背景见 [架构提案](../architecture/plugins.md)。

> 当前状态：插件 API 第 1 版。可以在 设置 → 插件 → 插件市场 中安装，也可以手动放进插件目录。

## 快速开始

1. 复制示例 [`plugins/examples/dev.focusd.todo-digest`](../../plugins/examples/dev.focusd.todo-digest/) 到
   `%APPDATA%\com.focusd.island\plugins\dev.focusd.todo-digest\`。
   插件目录也可以在 设置 → 插件 → 插件目录 → **打开** 中找到。
2. 示例需要 [Node.js](https://nodejs.org/)，并且 `node` 要在 PATH 中。
3. 在 设置 → 插件 中打开 **允许运行第三方插件**，点 **重新加载**，再打开插件卡片上的 **启用**。
4. 状态显示"运行中"后，点 **写入摘要**，每日笔记里会追加一段未完成待办的摘要。展开 **日志** 可以看到插件的输出。

修改插件文件后，点 **重新加载** 就会用新文件重启插件。

## 目录结构

```text
plugins/<插件 id>/        # 文件夹名必须等于插件 id
├── focusd-plugin.json    # 清单
├── main.mjs              # runtime.command 指向的程序
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
  "runtime": { "type": "process", "command": "main.mjs", "args": [] },
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
| `contributes.commands` | | 最多 8 个，显示为插件卡片上的按钮。`id` 只能用字母、数字和 `-`。 |

`runtime.command` 必须是插件文件夹内的相对路径，按扩展名决定如何启动：

| 扩展名 | 启动方式 |
|---|---|
| `.exe` | 直接运行 |
| `.js` / `.mjs` / `.cjs` | `node <文件>`，需要用户已经安装 Node.js |
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
| `initialize` | `{ apiVersion, appVersion, pluginId, dataDir, permissions }` | 进程启动后立即发送 |
| `command` | `{ id }` | 用户点击了 `contributes.commands` 中的某个按钮 |
| `shutdown` | `{}` | 插件被停用、重新加载或删除时发送；随后 stdin 会关闭，2 秒后进程被结束 |

**stdin 关闭时插件必须退出。** 岛屿自己退出时也会关闭 stdin。

### 插件调用的方法（请求）

| 方法 | 参数 | 结果 |
|---|---|---|
| `host.info` | — | 与 `initialize` 的参数相同 |
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

## Node.js SDK

示例中的 [`lib/focusd.mjs`](../../plugins/examples/dev.focusd.todo-digest/lib/focusd.mjs) 是一个没有任何依赖的 SDK，可以直接复制到你的插件里使用：

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

## 发布到插件市场

目前市场索引放在 `TixXin/fly-island` 仓库的 `dev` 分支中：

1. 把插件文件夹放到仓库的 `plugins/examples/<插件 id>/` 下。
2. 运行 `pnpm plugins:index`。脚本会把插件打包成 `plugins/packages/<id>-<version>.zip`，并重新生成 `plugins/index.json`（包含 SHA-256 和文件大小）。
3. 提交以上文件并推送到 fork 的 `dev` 分支后，应用里的插件市场就能看到这个插件。

规则：

- 已发布的版本**不能修改**，因为用户安装时校验的就是那个哈希值。修改插件后必须提高 `version`，否则脚本会报错。旧版本的 zip 保留在仓库里。
- 打包时文本文件的换行统一为 LF，所以 Windows 和其他系统打出的包完全相同。
- `pnpm test` 会检查 `index.json` 和 zip 是否与源码一致。

应用安装插件时会依次检查：

1. 下载的包大小和 SHA-256 与索引一致。
2. zip 内的路径没有跳出插件目录。
3. 解压后总大小不超过 100 MB。
4. 清单的 `id` 和 `version` 与索引一致。
5. 清单申请的权限没有超出索引里列出的权限。

全部通过后才会替换旧版本。新安装的插件默认不启用；更新时保留启用状态，但如果新版本需要更多权限，插件会暂停，等待用户重新授权。卸载插件会删除插件目录和授权记录，但保留 `plugins-data/<id>/` 中的数据。

## 调试

- 设置 → 插件 → 展开插件卡片上的 **日志**。启动失败的原因（例如找不到 Node.js）也会显示在卡片上。
- 不启动岛屿也能测试插件：自己写一个小脚本扮演宿主，往插件的 stdin 写 `initialize`，再回应它发出的请求。
