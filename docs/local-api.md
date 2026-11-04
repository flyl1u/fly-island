# 本地接口（Local API）

本地接口让脚本、AutoHotkey、Raycast、MCP 适配器等程序通过 HTTP 读写**今天的待办**和**每日笔记**。它是[插件系统](architecture/plugins.md)路线图的 P1。

## 开启

设置 → 待办 → **本地接口**：

1. 打开 **开启本地接口**。
2. 需要添加、修改或删除时，再打开 **允许修改待办和笔记**。关闭时只能读取，写请求返回 403。
3. 复制 **地址** 和 **访问令牌**。

默认关闭。地址只监听 `127.0.0.1`，优先使用端口 `39271`，被占用时自动换一个空闲端口。

脚本也可以直接读取配置文件来获取端口和令牌，路径为 `%APPDATA%\com.focusd.island\local-api.json`：

```json
{ "enabled": true, "allowWrite": true, "port": 39271, "token": "64 位十六进制" }
```

点 **重新生成** 会换一个新令牌，使用旧令牌的脚本会立即失效。

## 安全

- 只接受本机请求。
- 每个请求都必须带 `Authorization: Bearer <令牌>`，否则返回 401。
- 带 `Origin` 头的请求（来自网页）一律拒绝，返回 403。
- `Host` 必须是 `127.0.0.1:<端口>` 或 `localhost:<端口>`，用来防止 DNS 重绑定攻击。
- 请求体最大 64 KB。
- 只开放待办和每日笔记，剪贴板、邮件、消息、凭据都不开放。

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

待办对象的格式为 `{ id, title, completed, createdAt }`。标题不能为空，最长 500 个字符。

状态码：`400` 参数错误，`401` 令牌错误，`403` 被拒绝（网页请求、Host 不对、未允许修改），`404` 路径或待办不存在，`405` 方法不对，`413` 请求体太大，`503` / `504` 岛屿暂时没有响应。

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

待办和笔记存放在主窗口的 `localStorage` 中，Rust 端读不到。所以请求的处理流程是：

1. Rust（`src-tauri/src/local_api/`）校验请求并转换成方法名，例如 `todos.add`。
2. 通过事件 `local-api-request` 把请求发给 `main` 窗口。
3. 前端（`src/features/local-api/`，待办部分在 `src/features/todos/apiCommands.ts`）执行后，调用命令 `answer_local_api_request` 返回结果。
4. 窗口 5 秒内没有回应时返回 504。

界面会实时刷新，修改也会和手动操作一样被保存。待办模块在设置里被关闭时，接口仍然可用，数据照常保留。
