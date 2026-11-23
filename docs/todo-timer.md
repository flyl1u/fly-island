# 待办倒计时 / Todo countdown

对应 GitHub issue #52。每项待办可以独立倒计时，计时状态随待办保存在本地。

## 使用

先在“设置 → 待办”开启“番茄钟”（`todoTimerEnabled`，默认关闭）。关闭会取消所有正在计时的轮次，各项待办的时长仍会记住。设置跨窗口立即生效。

1. 开启后，待办的“开始”按钮左边多一个怀表图标。直接点“开始”只开始任务，不倒计时。点怀表在它上方弹出一个小的时间设置：−/+ 每次 5 分钟，也可以直接输入 **1–240 的整数分钟**，右边的圆形 ▶ 或回车才开始倒计时。时长按待办分别记住：每项待办第一次都是 15 分钟，在任务一里改成 25 分钟不会影响任务二。改过的时长马上记住，按 Esc、点别处或滚动列表关闭后，下次打开这一项的怀表仍是新时长。
2. 可对多项待办分别开启倒计时。每行显示自己的停止图标和 `mm:ss`，超过一小时仍按分钟显示，如 `240:00`。轮换关闭时，开始后岛屿收起并显示最近开始的待办及倒计时。开启轮换时，开始后保持展开，折叠岛依次显示各项。
3. 时间到响一次短提示音，任务保持未完成。可见岛屿打开今日待办，显示 **时间到 / 完成 / 再来一轮**。完成勾选任务；再来一轮按本轮时长重新开始。也可以用原有结束按钮取消本轮。
4. 结束、完成和删除只取消对应的一轮。每轮只提醒一次。到时操作随内容增高，到面板高度上限后在列表内滚动。

| 到时时的窗口状态 | 表现 |
|---|---|
| 折叠 | 播放一次提示音，展开今日待办 |
| 展开 | 播放一次提示音，切到今日待办，显示时间到及操作 |
| 贴边收起 | 播放一次提示音，露出并展开今日待办 |
| 托盘隐藏 | 播放一次提示音，保持原生窗口隐藏；恢复后仍显示时间到 |
| 游戏勿扰 | 声音仍播放一次，暂不自动展开 |

## 恢复与存储

- `fly-island-todo-timers` 保存所有轮次，`fly-island-todo-timer` 兼容旧版主任务计时。每轮 `endsAt` 是 Unix 毫秒时间，睡眠或重启后按当前时间计算剩余时间。若关闭期间已过期，恢复为时间到并补一次提醒。已经提醒过的轮次重启后保持到时状态。
- `fly-island-todo-durations`：各项待办的时长，`{ 待办 id: 1–240 的整数分钟 }`。没有记录或数值无效的待办按 15 分钟；写入时顺带丢掉已删除待办的记录。旧版所有待办共用的 `fly-island-todo-duration` 不再读取。
- 已有待办、进行中 ID、归档和日期 key 的格式不变。损坏或与当前未完成待办不匹配的倒计时会安全丢弃；存储不可用时本轮仍在内存中运行，无法保证关闭后的恢复。
- 跨日归档保留正在计时或待处理时间到的任务及其 ID（即使关闭“结转未完成待办”）；其他任务仍遵循原有结转设置。完成或结束后恢复普通归档行为。
- 声音复用 `src/assets/sounds/thumb-piano/complete.wav` 和现有 HTMLAudio 播放方式，不受 AI Agent 声音开关控制，没有循环播放。折叠文字隐藏设置和消息预览照旧生效。

契约与位置见 [contracts.md](architecture/contracts.md)、[data-storage.md](architecture/data-storage.md)。

## English

Enable **Focus timer** in **Settings → Todos**, then use the watch button beside each todo to set and start its timer. Each todo remembers its own duration from 1 to 240 minutes, starting at 15. Multiple countdowns can run at the same time. When rotation is off, the island collapses and shows the most recently started task. With rotation on, starting a timer keeps the panel open and the collapsed display cycles through active tasks.

Each timer displays its remaining time in the todo list. At expiry, the visible island opens today’s todos with **Time’s up / Complete / Another round**. The chime plays once, including while the island is hidden. Game mode skips automatic opening. Stopping, completing, deleting or repeating a round affects its own todo.

Timers and their notification flags are saved in `fly-island-todo-timers`. Absolute deadlines carry across restarts and daily rollover. Turning off Focus timer cancels all rounds and keeps each todo’s duration.

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
