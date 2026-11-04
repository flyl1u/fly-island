# 本地接口（Local API）

本地接口让脚本、AutoHotkey、Raycast、MCP 适配器等程序通过 HTTP 读写**今天的待办**和**每日笔记**。它是[插件系统](architecture/plugins.md)路线图的 P1。

## 开启

本地接口是一个**内置插件**（`focusd.local-api`）：它随岛屿一起安装，不需要下载，也不需要打开"允许运行第三方插件"。

设置 → 插件扩展 → **本地接口**：

1. 打开插件卡片上的 **启用**。这一步会授予它列出的权限：读写待办和每日笔记、上报 AI Agent 状态。
2. 点 **设置**，进入本地接口自己的设置页：
   - 需要添加、修改或删除时，打开 **允许修改待办、笔记和 Agent 状态**。关闭时只能读取，写请求返回 403。
   - 在 **运行信息** 里复制 **地址** 和 **访问令牌**。令牌默认隐藏，点"显示"才能看到。
   - 在 **操作** 里点 **重新生成令牌**，会换一个新令牌，使用旧令牌的脚本会立即失效。

默认关闭。地址只监听 `127.0.0.1`，优先使用端口 `39271`，被占用时自动换一个空闲端口。

> 从旧版本升级：以前在"设置 → 待办"里打开过本地接口的用户，第一次启动新版本时，原来的开关和"允许修改"设置会自动迁移到这个插件上。地址、端口、令牌都不变，已有的脚本不用修改。

脚本也可以直接读取配置文件来获取端口和令牌，路径为 `%APPDATA%\com.focusd.island\local-api.json`：

```json
{ "enabled": true, "allowWrite": true, "port": 39271, "token": "64 位十六进制" }
```

`enabled` 和 `allowWrite` 现在由插件的开关和设置写入，只供脚本参考；直接改这个文件不会让接口开启或关闭。

## 安全

- 只接受本机请求。
- 每个请求都必须带 `Authorization: Bearer <令牌>`，否则返回 401。
- 带 `Origin` 头的请求（来自网页）一律拒绝，返回 403。
- `Host` 必须是 `127.0.0.1:<端口>` 或 `localhost:<端口>`，用来防止 DNS 重绑定攻击。
- 请求体最大 64 KB。
- 只开放待办、每日笔记和 AI Agent 状态灯，剪贴板、邮件、消息、凭据都不开放。

## 接口

所有响应都是 JSON：成功时为 `{ "ok": true, "data": ... }`，失败时为 `{ "ok": false, "error": "..." }`，并带相应的 HTTP 状态码。

| 方法 | 路径 | 请求体 | 说明 |
|---|---|---|---|
| GET | `/v1/health` | — | `{ app, version, apiVersion, allowWrite }` |
| GET | `/v1/todos` | — | `{ date, todos, scheduled, activeTodoId }` |
| POST | `/v1/todos` | `{ "title": "...", "date"?: "YYYY-MM-DD" }` | 添加到今天列表的顶部；`date` 晚于今天时加入"以后"列表 |
| PATCH | `/v1/todos/{id}` | `{ "title"?: "...", "completed"?: true }` | 只修改给出的字段 |
| DELETE | `/v1/todos/{id}` | — | 删除 |
| GET | `/v1/note` | — | `{ date, note }` |
| PUT | `/v1/note` | `{ "note": "..." }` 或 `{ "append": "..." }` | `note` 整体替换；`append` 追加一行 |
| PUT | `/v1/agent-status/{source}` | `{ "phase": "running", "name"?: "Aider", "title"?: "...", "taskId"?: "..." }` | 上报一个 AI Agent 的状态，见下文 |
| DELETE | `/v1/agent-status/{source}` | — | 移除这个来源 |

待办对象的格式为 `{ id, title, completed, createdAt }`。标题不能为空，最长 500 个字符。

状态码：`400` 参数错误，`401` 令牌错误，`403` 被拒绝（网页请求、Host 不对、未允许修改），`404` 路径或待办不存在，`405` 方法不对，`413` 请求体太大，`503` / `504` 岛屿暂时没有响应。

## AI Agent 状态

除了内置的 Codex 和 Claude Code，任何工具都可以通过这个接口点亮状态灯，并在折叠的岛上显示会话标题（没有品牌图标时显示机器人图标）：

- `source`：来源名，1–32 个小写字母、数字或 `-`，例如 `aider`。在设置里显示的 id 是 `local-api/<source>`。
- `phase`：`running`（蓝灯）、`failed`（黄灯）、`completed` 或 `idle`（不亮）。`running` 超过 10 分钟没有再次上报时显示为 `stale`（黄灯）。
- `name` 是显示名称，省略时沿用上次的名称，第一次上报时默认用 `source`。`title` 最长 120 个字符，`name` 最长 40 个字符。
- 这些状态只保存在内存里，岛屿重启后就没有了。最多同时存在 16 个来源。

```powershell
# 在 Aider 等工具的开始 / 结束钩子里调用
Invoke-RestMethod "$api/agent-status/aider" -Method Put -Headers $headers -ContentType "application/json; charset=utf-8" `
  -Body ([Text.Encoding]::UTF8.GetBytes((@{ phase = "running"; name = "Aider"; title = "重构解析器" } | ConvertTo-Json)))
Invoke-RestMethod "$api/agent-status/aider" -Method Put -Headers $headers -ContentType "application/json" -Body '{"phase":"completed"}'
```

## 示例

PowerShell：

```powershell
$config = Get-Content "$env:APPDATA\com.focusd.island\local-api.json" | ConvertFrom-Json
$api = "http://127.0.0.1:$($config.port)/v1"
$headers = @{ Authorization = "Bearer $($config.token)" }

Invoke-RestMethod "$api/todos" -Headers $headers
Invoke-RestMethod "$api/todos" -Method Post -Headers $headers -ContentType "application/json" `
  -Body (@{ title = "写周报" } | ConvertTo-Json)
Invoke-RestMethod "$api/note" -Method Put -Headers $headers -ContentType "application/json; charset=utf-8" `
  -Body ([Text.Encoding]::UTF8.GetBytes((@{ append = "10:30 开会" } | ConvertTo-Json)))
```

curl：

```bash
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:39271/v1/todos
curl -X PATCH -H "Authorization: Bearer $TOKEN" -d '{"completed":true}' \
  http://127.0.0.1:39271/v1/todos/<id>
```

## 实现说明

AI Agent 状态由 Rust 直接处理（`src-tauri/src/agent_status/external.rs`）。待办和笔记存放在应用数据目录的 `todos.json` 中（2026-11 起；更早的版本存在主窗口的 `localStorage`，首次启动时由主窗口迁移过来）。请求的处理流程是：

1. Rust（`src-tauri/src/local_api/`）校验请求并转换成方法名，例如 `todos.add`。
2. 岛屿刚启动、主窗口还没完成迁移时，待办请求最多等 10 秒。
3. 待办在 `todos.json` 时，由 Rust 直接读写（`src-tauri/src/todos/calls.rs`，规则与 `src/features/todos/apiCommands.ts` 相同），再通知主窗口刷新界面。主窗口卡住或没有显示时也能正常读写。
4. 只有迁移失败、这次运行仍在用 `localStorage` 时，才像以前一样通过事件 `local-api-request` 交给 `main` 窗口执行；窗口 5 秒内没有回应时返回 504。

界面会实时刷新，修改也会和手动操作一样被保存。待办模块在设置里被关闭时，接口仍然可用，数据照常保留。
