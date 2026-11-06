# 插件 API 参考

> 由 `pnpm sdk:build` 根据 [`plugins/schema/rpc.json`](../../plugins/schema/rpc.json) 生成，不要手改。说明和示例见 [README.md](README.md)，上手见 [快速开始](quickstart.md)。

插件和岛屿通过 stdin / stdout 交换 JSON-RPC 2.0 消息，每行一条。“版本”是引入该项的插件 API 版本（清单 `apiVersion`）；岛屿支持第 1–2 版。

## 能力（`initialize.capabilities`）

| 能力 | 版本 | 含义 |
|---|---|---|
| `events` | 2 | events.subscribe / events.unsubscribe and the 'event' notification. |
| `notifications` | 2 | island.notify and the 'notification.action' notification. |
| `storage` | 2 | storage.get / set / delete / keys. |
| `secrets` | 2 | secrets.get / set / delete. |
| `views` | 2 | contributes.views drawn on the island; view.update / view.patch and the view.action / view.submit / view.search / view.visible notifications. |
| `status` | 2 | contributes.statusItems on the collapsed bar; status.update. |
| `webview` | 2 | contributes.views with template 'webview' (the plugin's own HTML page); webview.postMessage and the 'webview.message' notification. |
| `permissions` | 2 | manifest optionalPermissions and permissions.request; initialize.optionalPermissions. |
| `openView` | 2 | island.openView: a plugin opens its own page right after the user used it. |

## 权限

敏感权限第一次使用时要用户在岛上确认，拒绝时返回 `-32001`。

| 权限 | 版本 | 敏感 |
|---|---|---|
| `todos:read` | 1 |  |
| `todos:write` | 1 |  |
| `notes:read` | 1 |  |
| `notes:write` | 1 |  |
| `agent-status:read` | 2 |  |
| `agent-status:write` | 1 |  |
| `island:notify` | 2 |  |
| `secrets` | 2 |  |
| `clipboard:read` | 2 | 是 |
| `messages:read` | 2 | 是 |
| `media:read` | 2 | 是 |
| `media:control` | 2 |  |
| `shelf:read` | 2 | 是 |
| `shelf:write` | 2 | 是 |

## 插件调用的方法

| 方法 | 权限 | 版本 | 参数 | 结果 |
|---|---|---|---|---|
| `host.info` | 无 | 1 | 无 | Same as the initialize params. |
| `settings.get` | 无 | 1 | 无 | Every declared setting with its current value (defaults filled in). |
| `ui.setInfo` | 无 | 1 | `items`：[{ label: LocalizedText, value: string (max 500 chars), copy?: boolean, secret?: boolean }] (max 10; empty clears) | {} |
| `events.subscribe` | 无 | 2 | `events`：[string] (max 16; each needs the event's permission; all are checked before any is applied) | { events }: every event the plugin is subscribed to, sorted |
| `events.unsubscribe` | 无 | 2 | `events`：[string] (max 16) | { events } |
| `view.update` | 无 | 2 | `viewId`：one of the plugin's contributes.views<br>`model`：object for the view's template (see docs/plugins/README.md); max 256 KB as JSON, else status 413 | {}. The island shows at most 10 changes a second per view (later ones are merged) and only while the page is on screen. |
| `webview.postMessage` | 无 | 2 | `viewId`：one of the plugin's views with template webview<br>`message`：any JSON value; max 256 KB | { shown }: false when the page is not on screen (the message is dropped). Messages sent before the page's script runs are lost too, so wait for the page to post that it is ready. |
| `view.patch` | 无 | 2 | `viewId`：string<br>`items?`：[{ id, ... }]: replace the items with these ids in model.items and model.groups[].items<br>`remove?`：[id]: delete the items with these ids<br>`add?`：[{ item: { id, ... }, before?: id, group?: number }]: insert before the item `before`, else at the end of model.groups[group].items, else at the end of model.items; an id already in the view is status 400 | { missing: [id] }: ids not found (an add whose `before` is missing goes at the end). At least one of items, remove and add. Status 409 before the first view.update. |
| `status.update` | 无 | 2 | `itemId`：one of the plugin's contributes.statusItems<br>`text`：string, max 24 characters; empty clears the item<br>`tooltip?`：string, max 200<br>`tone?`：neutral \| accent \| warning \| danger | {} |
| `storage.get` | 无 | 2 | `key`：string (1-128 chars) | { value }: null when the key is not set |
| `storage.set` | 无 | 2 | `key`：string (1-128 chars)<br>`value`：any JSON (max 64 KB as JSON; the plugin's whole storage max 1 MB, else status 413) | {} |
| `storage.delete` | 无 | 2 | `key`：string | { deleted } |
| `storage.keys` | 无 | 2 | 无 | { keys } |
| `permissions.request` | 无 | 2 | `permissions`：[name]: 1-14 names from the manifest's optionalPermissions (or permissions) | { granted: [name], denied: [name] }. The island asks the user about each optional permission not answered yet (allow, allow once, deny; at most 30 s each, no answer is a denial that is asked again next time). A remembered deny is not asked again until the user revokes it in the plugin's settings. A name the manifest does not list is status 400. |
| `host.keepAlive` | 无 | 2 | `reason`：string (1-100 chars) shown on the plugin page; null lets the plugin stop when idle again | {}. Only matters for on-demand plugins (activationEvents), which otherwise stop after 60 s with nothing to do. |
| `island.openView` | 无 | 2 | `viewId`：one of the plugin's contributes.views | {}. Shows the island and opens that page. Only within 15 s of the user using the plugin (a command or its shortcut, an island.notify button, a focusd:// link, an action, form or webview message on one of its pages), else status 403; a view the plugin does not declare is status 404. |
| `todos.list` | `todos:read` | 1 | `date?`：YYYY-MM-DD (since 2); missing means today | { date, todos, scheduled, activeTodoId }. A past date reads that day's archive ({ ..., archived: true }; status 404 when nothing was archived for it); a later date gives the todos scheduled for it in 'scheduled'. |
| `todos.days` | `todos:read` | 2 | `from`：YYYY-MM-DD<br>`to`：YYYY-MM-DD | { days: [{ date, total, completed, hasNote, archived }] }: today and every archived day from 'from' to 'to' (inclusive), oldest first. |
| `todos.add` | `todos:write` | 1 | `title`：string<br>`date?`：YYYY-MM-DD; later than today goes to the 'later' list | The new todo. |
| `todos.update` | `todos:write` | 1 | `id`：string<br>`title?`：string<br>`completed?`：boolean | The changed todo. |
| `todos.remove` | `todos:write` | 1 | `id`：string | { id } |
| `note.get` | `notes:read` | 1 | `date?`：YYYY-MM-DD (since 2); missing means today | { date, note }. A past date reads that day's archived note ({ ..., archived: true }; status 404 when nothing was archived); a later date is status 400. |
| `note.set` | `notes:write` | 1 | `note | append`：string | { date, note } |
| `agentStatus.report` | `agent-status:write` | 1 | `source`：string<br>`phase`：string<br>`name?`：string<br>`title?`：string<br>`taskId?`：string | The saved status; id is '<plugin id>/<source>'. |
| `agentStatus.clear` | `agent-status:write` | 1 | `source?`：string; omitted clears every source of the plugin | { cleared } |
| `island.notify` | `island:notify` | 2 | `title`：string (1-80 chars)<br>`body?`：string (max 200)<br>`durationMs?`：number, clamped to 2000-15000, default 5000<br>`actions?`：[{ id: [A-Za-z0-9-]{1,32}, title: string (max 16) }] (max 2) | { muted }: true when the user turned this plugin's messages off (nothing is shown). At most 6 per minute per plugin, else -32000 with status 429. |
| `secrets.get` | `secrets` | 2 | `key`：letters, digits, '.', '_', '-' (1-64 chars) | { value }: null when not set |
| `secrets.set` | `secrets` | 2 | `key`：as above<br>`value`：string (max 1024 chars); at most 32 secrets per plugin (status 413) | {} |
| `secrets.delete` | `secrets` | 2 | `key`：as above | { deleted } |
| `clipboard.history` | `clipboard:read` | 2 | `limit?`：1-50, default 20 | { items: [{ id, text (max 4000 chars), truncated, copiedAt, favorite }] }: text items only, newest first. Status 409 while clipboard history is off. |
| `messages.list` | `messages:read` | 2 | 无 | { items: [{ source: qq \| wechat \| qqMail, id, sender, preview, receivedAt, unread? }] }, newest first, from the sources the user switched on. WeChat entries have sender and preview null (only the tray flash is known); qqMail preview is the subject, never the body. |
| `media.nowPlaying` | `media:read` | 2 | 无 | { available, status, title, artist, album, sourceApp, positionMs, durationMs, canSeek, canNext, canPrevious, shuffle (true \| false \| null), repeat ('none' \| 'track' \| 'list' \| 'unknown'), volume (system volume 0-1, or null) }. No cover image: see media.cover. |
| `media.cover` | `media:read` | 2 | 无 | { cover }: the cover of what plays as a data: URL, or null (none, or larger than 1 MB). |
| `media.playPause` | `media:control` | 2 | 无 | Same as media.nowPlaying, after the command. |
| `media.next` | `media:control` | 2 | 无 | Same as media.nowPlaying, after the command. |
| `media.previous` | `media:control` | 2 | 无 | Same as media.nowPlaying, after the command. |
| `media.seek` | `media:control` | 2 | `positionMs`：whole number from 0 | Same as media.nowPlaying, after the command. Fails when the player cannot seek (canSeek false). |
| `media.setVolume` | `media:control` | 2 | `level`：0-1 | Same as media.nowPlaying. Sets the system volume of the default output, like the island's own slider. |
| `media.toggleShuffle` | `media:control` | 2 | 无 | Same as media.nowPlaying, after the command. |
| `media.cycleRepeat` | `media:control` | 2 | 无 | Same as media.nowPlaying: none, then list, then track. |
| `shelf.list` | `shelf:read` | 2 | 无 | { items: [{ id, path, name, isDir, size, addedAt, pinned, missing, unreachable }] }: paths only, never file contents. |
| `shelf.add` | `shelf:write` | 2 | `paths`：[string] (1-20 absolute paths of existing files or folders; others are skipped) | Same as shelf.list, afterwards. |
| `shelf.remove` | `shelf:write` | 2 | `ids`：[string] (1-20); only takes entries off the shelf, never deletes files | Same as shelf.list, afterwards. |

## 事件（`events.subscribe`）

| 事件 | 权限 | 版本 | 载荷 |
|---|---|---|---|
| `todos.changed` | `todos:read` | 2 | { date }; call todos.list for the todos |
| `note.changed` | `notes:read` | 2 | { date }; call note.get for the text |
| `agentStatus.changed` | `agent-status:read` | 2 | { agents: [{ id, name, phase, title? }] } |
| `island.expanded` | 无 | 2 | {} |
| `island.collapsed` | 无 | 2 | {} |
| `app.locale.changed` | 无 | 2 | { locale } |
| `clipboard.changed` | `clipboard:read` | 2 | {}; call clipboard.history. Only while clipboard history is on. |
| `messages.received` | `messages:read` | 2 | One entry as in messages.list: { source, id, sender, preview, receivedAt, unread? } |
| `media.changed` | `media:read` | 2 | Same as media.nowPlaying; sent when the track, player or play state changes (checked every 2 s while subscribed), not for the position. |
| `shelf.changed` | `shelf:read` | 2 | { count }: the file shelf changed (by the user or a plugin); call shelf.list for the entries. |
| `system.locked` | 无 | 2 | {}: the user locked the session (Win+L, or away). |
| `system.unlocked` | 无 | 2 | {}: the session was unlocked. |
| `system.suspended` | 无 | 2 | {}: the computer is going to sleep; there is little time left to save. |
| `system.resumed` | 无 | 2 | {}: the computer woke up. |
| `system.idle` | 无 | 2 | { idleSeconds }: no keyboard or mouse input for 5 minutes (checked every 5 s); sent once until input comes back. |
| `system.active` | 无 | 2 | {}: input again after system.idle. |

## 岛屿发给插件的通知

| 通知 | 版本 | 参数 |
|---|---|---|
| `initialize` | 1 | { apiVersion, capabilities (since 2), activationEvent (since 2: onStartup, onCommand:<id>, onView:<id>, onEvent:<name>, onSchedule:<minutes>, onStartupFinished or onUri), appVersion, pluginId, dataDir, permissions (those usable now: the manifest's permissions plus the optional ones the user allowed), optionalPermissions (since 2), settings, experimentalApis (only for a development-mode plugin whose manifest lists experimentalApis: those the island has) } |
| `command` | 1 | { id, args? }: a button on the plugin page or the command's keybinding (since 2) sends { id }; an entry of the todo right-click menu (contributes.menus "todo/context", since 2) sends { id, args: { todoId } } |
| `settings.changed` | 1 | { settings } |
| `event` | 2 | { name, payload }; at most one per event name every 200 ms, carrying the latest payload, except messages.received, which delivers every message (up to 50 per 200 ms). Subscriptions end when the process exits, and events that need a sensitive permission stop as soon as the user revokes it. |
| `notification.action` | 2 | { id }: the user clicked that button of an island.notify message |
| `uri` | 2 | { uri, path, query }: a focusd://plugin/<id>/<path>?<query> link was opened (only with activationEvents onUri, after the user allowed it on the island; query is still percent-encoded) |
| `view.visible` | 2 | { viewId, visible }: the page was opened or closed; send updates while it is visible |
| `view.action` | 2 | { viewId, actionId, itemId?, checked? }: the user clicked an action or an item, or a check box (checked) |
| `view.submit` | 2 | { viewId, values }: the user submitted the form |
| `view.search` | 2 | { viewId, query }: the user typed in the list's search box (only if the model asks for searchMode remote) |
| `webview.message` | 2 | { viewId, message }: the plugin's webview page called acquireFocusdApi().postMessage(message) (max 256 KB) |
| `shutdown` | 1 | {} |

## 插件发给岛屿的通知

| 通知 | 版本 | 参数 |
|---|---|---|
| `log` | 1 | { message } |

## 错误码

| 代码 | 含义 |
|---|---|
| `-32700` | Not valid JSON. |
| `-32600` | Not a valid JSON-RPC 2.0 message. |
| `-32601` | Unknown method. |
| `-32001` | The plugin was not given the permission the method needs. |
| `-32000` | The island answered with an error; data.status is 400 bad params, 404 not found, 413 too large, 409 the feature is switched off, 429 too many requests, 500 the host could not do it (e.g. a file or the Credential Manager failed), 504 no answer in time. |
