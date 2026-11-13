# 待办倒计时 / Todo countdown

对应 GitHub issue #52。纯前端实现，沿用原有单个进行中待办、开始后收起岛屿、完成与删除逻辑，没有新增依赖或原生命令。

## 使用

先在“设置 → 待办”开启“番茄钟”（`todoTimerEnabled`，默认关闭）。关闭时开始/停止直接生效，不显示时长选择、倒计时或时间到操作，也不播放提示音；折叠岛显示原有任务标题。运行中关闭会清除 `focusd-island-todo-timer`，保留任务进行中状态和各项时长；重新开启不会恢复已取消的轮次。设置通过现有跨窗口 storage 同步立即生效。旧设置缺字段或字段不是 boolean 时按关闭处理。

English: Focus timer is off by default in Settings → Todos. When disabled, Start/Stop works immediately with no picker, countdown, expiry actions or sound. Turning it off cancels the round while keeping the active todo and previous duration; turning it on does not restore the cancelled round.

1. 开启后，待办的“开始”按钮左边多一个怀表图标。直接点“开始”只开始任务，不倒计时。点怀表在它上方弹出一个小的时间设置：−/+ 每次 5 分钟，也可以直接输入 **1–240 的整数分钟**，右边的圆形 ▶ 或回车才开始倒计时。时长按待办分别记住：每项待办第一次都是 15 分钟，在任务一里改成 25 分钟不会影响任务二。改过的时长马上记住，按 Esc、点别处或滚动列表关闭后，下次打开这一项的怀表仍是新时长。
2. 开始后岛屿收起；折叠岛显示任务标题，后面跟一个小胶囊里的 `mm:ss` 倒计时，超过一小时仍按分钟显示（如 `240:00`）；列表里的开始按钮变成停止图标加 `mm:ss`。限时期间暂停待办轮播。
3. 时间到响一次短提示音，任务保持未完成。可见岛屿打开今日待办，显示 **时间到 / 完成 / 再来一轮**。完成勾选任务；再来一轮按本轮时长重新开始。也可以用原有结束按钮取消本轮。
4. 结束、完成、删除或开始另一项都会取消旧倒计时。用户不操作也不会一直响。到时操作随内容增高，到面板高度上限后在列表内滚动。

| 到时时的窗口状态 | 表现 |
|---|---|
| 折叠 | 播放一次提示音，展开今日待办 |
| 展开 | 播放一次提示音，切到今日待办，显示时间到及操作 |
| 贴边收起 | 播放一次提示音，露出并展开今日待办 |
| 托盘隐藏 | 播放一次提示音，保持原生窗口隐藏；恢复后仍显示时间到 |
| 游戏勿扰 | 声音仍播放一次，暂不自动展开 |

## 恢复与存储

- `focusd-island-todo-timer`：`{ todoId, endsAt, durationMinutes, notified }`。结束时间是 Unix 毫秒时间，按当前时间计算，睡眠或重启后不从完整时长重来。若关闭期间已过期，恢复为时间到并补一次提醒；已经提醒过的轮次重启不重复响。
- `focusd-island-todo-durations`：各项待办的时长，`{ 待办 id: 1–240 的整数分钟 }`。没有记录或数值无效的待办按 15 分钟；写入时顺带丢掉已删除待办的记录。旧版所有待办共用的 `focusd-island-todo-duration` 不再读取。
- 已有待办、进行中 ID、归档和日期 key 的格式不变。损坏或与当前未完成待办不匹配的倒计时会安全丢弃；存储不可用时本轮仍在内存中运行，无法保证关闭后的恢复。
- 跨日归档保留正在计时或待处理时间到的任务及其 ID（即使关闭“结转未完成待办”）；其他任务仍遵循原有结转设置。完成或结束后恢复普通归档行为。
- 声音复用 `src/assets/sounds/thumb-piano/complete.wav` 和现有 HTMLAudio 播放方式，不受 AI Agent 声音开关控制，没有循环播放。折叠文字隐藏设置和消息预览照旧生效。

契约与位置见 [contracts.md](architecture/contracts.md)、[data-storage.md](architecture/data-storage.md)。

## English

With the timer on, a watch icon sits left of Start. Start counts down the current duration at once (15 min the first time). The watch opens a small setter above it: −/+ in steps of 5, typed whole minutes 1–240, and a round ▶ (or Enter) to start now. Changes are kept at once, so closing it with Escape, an outside click or a list scroll and then pressing Start uses the new time.

Starting keeps the existing single active todo and collapses the island. The collapsed island shows the task title followed by a small pill with the `mm:ss` countdown; the row shows a stop icon and the same clock. Minutes may exceed 59. Todo rotation pauses for a timed round.

At expiry the task remains incomplete, a short built-in sound plays once, and the visible island opens today’s tasks with **Time’s up / Complete / Another round**. Another round starts the same duration again. A tucked island reveals and opens; a tray-hidden island stays hidden and only sounds once. Game mode suppresses automatic opening. Expired actions remain available when the user returns. Stopping, completing, deleting, or starting another todo cancels the previous round.

`focusd-island-todo-timer` stores `{ todoId, endsAt, durationMinutes, notified }`; `endsAt` is an absolute Unix timestamp in milliseconds. Restart and wake restore the remaining time. An unannounced round missed while closed triggers one reminder; an announced round stays expired without ringing again. `focusd-island-todo-duration` stores the last whole-minute choice; missing, invalid or an old JSON `null` (the former No limit) reads as 15. Existing todo and active-ID formats are unchanged. Invalid records are ignored; unavailable storage falls back to the current session in memory.

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
