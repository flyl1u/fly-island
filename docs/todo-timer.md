# 待办倒计时 / Todo countdown

对应 GitHub issue #52。纯前端实现，沿用原有单个进行中待办、开始后收起岛屿、完成与删除逻辑，没有新增依赖或原生命令。

## 使用

1. 点待办“开始”，在行内选择 **15 分钟 / 30 分钟 / 1 小时 / 自定义 / 不限时**。预设直接开始；自定义填写 **1–240 的整数分钟**，再点开始。Esc 或取消关闭选择器。
2. 上次选项会高亮。开始后岛屿收起；限时任务在列表按钮与折叠文字位置显示 `mm:ss`，超过一小时仍按分钟显示（如 `240:00`）。限时期间暂停待办轮播。不限时保留原来的进行中标题，不显示正计时。
3. 时间到响一次短提示音，任务保持未完成。可见岛屿打开今日待办，显示 **时间到 / 完成 / 再来一轮**。完成勾选任务；再来一轮按本轮时长重新开始。也可以用原有结束按钮取消本轮。
4. 结束、完成、删除或开始另一项都会取消旧倒计时。用户不操作也不会一直响。时长选择和到时操作随内容增高，到面板高度上限后在列表内滚动。

| 到时时的窗口状态 | 表现 |
|---|---|
| 折叠 | 播放一次提示音，展开今日待办 |
| 展开 | 播放一次提示音，切到今日待办，显示时间到及操作 |
| 贴边收起 | 播放一次提示音，露出并展开今日待办 |
| 托盘隐藏 | 播放一次提示音，保持原生窗口隐藏；恢复后仍显示时间到 |
| 游戏勿扰 | 声音仍播放一次，暂不自动展开 |

## 恢复与存储

- `focusd-island-todo-timer`：`{ todoId, endsAt, durationMinutes, notified }`。结束时间是 Unix 毫秒时间，按当前时间计算，睡眠或重启后不从完整时长重来。若关闭期间已过期，恢复为时间到并补一次提醒；已经提醒过的轮次重启不重复响。
- `focusd-island-todo-duration`：上次时长，1–240 的整数分钟；JSON `null` 为不限时，缺失或无效时按不限时。
- 已有待办、进行中 ID、归档和日期 key 的格式不变。损坏或与当前未完成待办不匹配的倒计时会安全丢弃；存储不可用时本轮仍在内存中运行，无法保证关闭后的恢复。
- 跨日归档保留正在计时或待处理时间到的任务及其 ID（即使关闭“结转未完成待办”）；其他任务仍遵循原有结转设置。完成或结束后恢复普通归档行为。
- 声音复用 `src/assets/sounds/thumb-piano/complete.wav` 和现有 HTMLAudio 播放方式，不受 AI Agent 声音开关控制，没有循环播放。折叠文字隐藏设置和消息预览照旧生效。

契约与位置见 [contracts.md](architecture/contracts.md)、[data-storage.md](architecture/data-storage.md)。

## English

Start opens inline choices: **15 min / 30 min / 1 hour / Custom / No limit**. Presets start immediately. Custom accepts whole minutes from **1 to 240**, then Start confirms. The previous choice is highlighted; Escape or Cancel closes the picker.

Starting keeps the existing single active todo and collapses the island. A timed task shows a single `mm:ss` clock in its row and in the collapsed text slot. Minutes may exceed 59. Todo rotation pauses for a timed round. No limit keeps the original active-task title, without adding an elapsed-time clock.

At expiry the task remains incomplete, a short built-in sound plays once, and the visible island opens today’s tasks with **Time’s up / Complete / Another round**. Another round starts the same duration again. A tucked island reveals and opens; a tray-hidden island stays hidden and only sounds once. Game mode suppresses automatic opening. Expired actions remain available when the user returns. Stopping, completing, deleting, or starting another todo cancels the previous round.

`focusd-island-todo-timer` stores `{ todoId, endsAt, durationMinutes, notified }`; `endsAt` is an absolute Unix timestamp in milliseconds. Restart and wake restore the remaining time. An unannounced round missed while closed triggers one reminder; an announced round stays expired without ringing again. `focusd-island-todo-duration` stores the last whole-minute choice or JSON `null` for No limit. Existing todo and active-ID formats are unchanged. Invalid records are ignored; unavailable storage falls back to the current session in memory.

A pending timed task keeps its ID across the daily archive rollover, including when ordinary incomplete-task carry-over is disabled. Other tasks follow the existing preference. Audio reuses the bundled `complete.wav` and HTMLAudio playback, independent of the AI Agent sound switch.

## 验证与桌面验收 / Verification

- 纯函数与存储：`node --test tests/unit/todo-timer.test.mjs`。
- 完整项目：`pnpm check`、`pnpm build`、`pnpm test:regression`。
- 回归页：`/tests/regression/todo-timer.html`，用真实 IslandApp、假时间、原生可见性与音频 mock 检查完整流程、一次性提醒、跨日恢复；另测 `?scale=0.85` 与 `?scale=1.2`。`?view=running` / `?view=expired` 可停在计时或到时状态供查看。
- 桌面端需人工确认：WebView2 实际音量、托盘隐藏时的声音、睡眠唤醒、全屏游戏勿扰，以及贴边恢复和多显示器定位。浏览器中的原生 API 与音频 mock 不能代替这些检查。

Desktop checks still needed: actual WebView2 audio, sound while hidden to the tray, wake from sleep, game-mode behavior, and native edge/multi-monitor positioning. Browser mocks verify the flow, not these native effects.

## 改动文件 / Changed files

- `src/features/todos/`：`timer.ts`、`useTodoTimer.ts`、`storage.ts`、`useTodoList.ts`、`useTodos.ts`、`useTodoRollover.ts`；`TodoListItem.tsx`、`TodoNotebook.tsx`、`TodoNotebookTasks.tsx`、`useTodoListHeight.ts`；`TodoCountdown.tsx` / `.css`、`TodoDurationPicker.tsx` / `.css`、`TodoTimerActions.tsx` / `.css`。
- `src/windows/island/`：`useIslandTodos.ts`、`useCollapsedTodo.ts`、`IslandApp.tsx`、`IslandShell.tsx`、`IslandCollapsedBar.tsx`、`expandedHeight.ts`、`api.ts`。
- 文案：`src/i18n/sections/todo.ts`。
- 测试：`tests/unit/todo-timer.test.mjs`、`tests/regression/todo-timer.html`、`tests/regression/todo-timer.tsx`、`scripts/run-regression.mjs`。
- 文档：本文件、`docs/architecture/contracts.md`、`docs/architecture/data-storage.md`、`docs/design/todos.md`、`docs/design/island.md`。
