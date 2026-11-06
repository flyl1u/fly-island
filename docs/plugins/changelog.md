# 插件 API 更新日志

每次岛屿发布时在这里记录插件能用的新东西。插件应按 `initialize.capabilities` 判断宿主有没有某项能力，不要按岛屿版本号判断；`apiVersion` 只在不兼容的改动时才升。完整列表见 [API 参考](api.md)。

下面几批改动都还没有随正式版岛屿发布（2026-11-05 时最新的正式版是 0.2.14），发布时补上版本号。

## npm 包 0.2.0（2026-11-06）

- `fly-island-plugin` 0.2.0：新增 `keygen`、`pack --sign`、`sign`、`keys rotate`（作者签名与换密钥，见 [作者签名](README.md#作者签名)），`publish` 改为指向插件市场 `TixXin/focusd-plugins`；SDK 带上 `onUri`、`view.patch` 增删条目、运行时申请的可选权限等这一批的 API 和类型。
- `create-fly-island-plugin` 0.2.0：生成的项目依赖 `fly-island-plugin` ^0.2.0，复制的单文件 SDK 是最新版本。

## 可选权限

- 清单 `optionalPermissions`：用到时再申请的权限。方法 `permissions.request { permissions }` 在岛上询问用户，返回 `{ granted, denied }`；能力 `permissions`；`initialize.optionalPermissions`。索引条目增加可选字段 `optionalPermissions`。SDK：Node `plugin.permissions.request` / `has`，PowerShell `Request-FocusdPermission`，模拟宿主支持。见 [可选权限](README.md#可选权限第-2-版)。
- 插件设置页新增「调用记录」：最近 200 次请求的方法名和结果，不含数据。插件不需要改动。见 [调用记录](README.md#调用记录)。

## 页面与快捷键

- `view.patch` 除了 `items`（按 id 替换），还接受 `remove: [id]`（删除）和 `add: [{ item, before?, group? }]`（插在 `before` 那一项前面，否则加到第 `group` 组末尾，否则加到列表末尾）。三项至少给一项；`add` 的 id 已经在页面里时返回状态 400。SDK：Node `views.patch(viewId, { items, remove, add })`（仍然可以直接传条目数组），PowerShell `Update-FocusdViewItems -Remove ... -Add ...`；模拟宿主同样支持。
- 用户可以在 设置 → 快捷键 → 插件快捷键 里改插件命令的快捷键、关闭它，或者给没有快捷键的命令设一个；清单里的 `keybinding` 只是默认值。插件不需要做任何改动。

## 链接
- 激活事件 `onUri` 和通知 `uri { uri, path, query }`：打开 `focusd://plugin/<id>/...` 链接时发给插件。第一次之前岛上询问用户，答案和敏感权限放在一起，可以撤销。SDK：Node `plugin.onUri`；模拟宿主 `openUri()`。见 [链接](README.md#链接第-2-版)。

## 自定义界面（P8）

- `contributes.views[].template: "webview"`，配 `entry`（插件文件夹里的 .html）和 `height`：插件自己的网页显示在岛上。页面在单独的 WebView2 里，不能联网，也没有岛屿的接口，只能通过 `acquireFocusdApi()` 和插件进程收发消息。
- 方法 `webview.postMessage`，通知 `webview.message`，能力 `webview`。SDK：Node `plugin.views.postMessage` / `views.onMessage`，PowerShell `Send-FocusdWebviewMessage`；模拟宿主 `webviewMessage()`、`openWebviews`、`webviewMessages`。
- 新示例 `dev.focusd.todo-ring`（待办进度环）。市场给这类插件加"自定义界面"标签（索引字段 `webview`）。

## 市场（P11）

- 插件 API 没有变化；改的是上架和分发。
- `plugins/market/<id>.json` 写发布者、仓库、分类和预发布标记，`pnpm plugins:index` 把它们写进索引。市场页可以搜索、按分类筛选、展开详情。
- 非官方发布者的插件第一次安装时要信任发布者；信任列表可在设置里管理。
- `plugins/revoked.json` 下架有问题的版本：岛屿刷新市场时停止并禁用（或删除）它们。
- 允许第三方插件时岛屿每 6 小时在后台检查更新；可选自动更新（只限可信发布者、不加权限的版本）。
- 索引签名文件可以包含多个签名。见 [提交插件](README.md#提交插件)。

## 开发者工具（P10）

- 清单 `experimentalApis`：申请还在设计中的 API，只在开发模式下可用；`initialize.experimentalApis` 列出岛屿提供的那些（目前没有）。不是开发模式加载的插件写了这个字段时无法使用。
- 开发模式：设置 → 插件扩展 → 开发者，从任意文件夹加载插件，查看 JSON-RPC 收发记录，手动发送事件。本地 API 增加 `POST /v1/dev/plugins`、`POST /v1/dev/plugins/{id}/reload`、`DELETE /v1/dev/plugins/{id}`、`GET /v1/dev/plugins/{id}/log?after=<序号>`，只在开发模式打开时可用。
- 工具：npm 包 `fly-island-plugin`（SDK、命令行 `validate` / `pack` / `dev` / `test` / `publish`、模拟宿主 `fly-island-plugin/test`）、脚手架 `create-fly-island-plugin`、PowerShell 模块 `FlyIsland.Plugin`。见 [快速开始](quickstart.md)。

## 按需启动（P9）

- 清单 `activationEvents`：`onStartup`、`onStartupFinished`、`onCommand:<id>`、`onView:<id>`、`onEvent:<名称>`、`onSchedule:<分钟>`。命令和页面自动带上对应的事件；不写这个字段的插件仍随岛屿常驻。
- `initialize.activationEvent`；方法 `host.keepAlive`。
- 按需启动的插件空闲 60 秒后停止；插件进程树随插件结束；内存超过 512 MB 时插件被停止。

## 岛上界面（P7）

- 清单 `contributes.views`（`list`、`detail`、`form`、`status` 模板）和 `contributes.statusItems`。
- 方法 `view.update`、`view.patch`、`status.update`；通知 `view.visible`、`view.action`、`view.submit`、`view.search`。
- 能力 `views`、`status`。

## 数据（P6）

- 敏感权限 `clipboard:read`、`messages:read`、`media:read`、`shelf:read`、`shelf:write`（第一次使用时在岛上确认），普通权限 `media:control`。
- 方法 `clipboard.history`、`messages.list`、`media.nowPlaying` / `playPause` / `next` / `previous`、`shelf.list` / `add` / `remove`；事件 `clipboard.changed`、`messages.received`、`media.changed`。
- 待办由岛屿直接读写（不再经过窗口），插件和本地 API 的待办请求不再受主窗口卡顿影响。

## API 第 2 版（P5）

- 清单 `apiVersion: 2`、`contributes.commands[].keybinding` / `when`、`contributes.menus["todo/context"]`。
- `initialize.capabilities`；方法 `events.subscribe` / `unsubscribe`、`island.notify`、`storage.*`、`secrets.*`；通知 `event`、`notification.action`，`command` 的 `args`。
- 权限 `agent-status:read`、`island:notify`、`secrets`。
- 第 1 版的插件行为不变。
