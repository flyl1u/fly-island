# 岛屿外形与设置预览验收（2026-11-13）

## 3. 可选贴边圆角

- 字段完整经过 types/defaults/limits/normalize，默认关闭、大小 4–20px（默认 10），恢复外观包含两项。中文/英文设置使用原有开关和缩进滑块。
- `IslandTopEdge.css` 使用不可点击的 `.island__shoulders`，左右边界直接跟随父元素实时宽度，半径与父元素使用相同的开合曲线，避免单独排程产生错位。保留热区伪元素和顶部描边淡出；所有贴边隐藏样式及浮起均隐藏肩膀。
- 经典背景继承完整高度，半透明不叠加覆盖；暂停开放的玻璃样式共用顶部底色与模糊，装饰折射在下方淡入。没有重新开放玻璃选项。
- 820px 舞台足够容纳当前设置上限：展开 720px、折叠 728px。肩膀不扩大原生点击范围。
- 更新 settings、collapsed-message mock；全览覆盖 edge/line/hidden、肩膀开关、浮起/重新贴顶和两档缩放边界。

`pnpm check`（336 单测）、`pnpm build`、`pnpm test:regression`（25 页）均通过。没有新增 Rust 改动。未在真实桌面/暂停开放的玻璃界面做像素截图验收。

## 1. 细线贴顶

- `IslandTuckStyle.css` 去掉细线的 translateY，描边改为内描边，线和隐藏热区从 top: 0 开始。
- `geometry.rs` 对 line/hidden 的 tucked offset 返回 0；已贴顶的窗口开合时位置完全相同。浮起的窗口仍须移到工作区上沿，露出时恢复原位置；edge 的滑动、托盘隐藏和多屏跟随入口不变。
- `passthrough.rs` 热区以窗口顶部为基准，区域外仍点穿透。玻璃仍只在 CSS 绘制，没有 HWND 大矩形材质阻碍。
- Rust 单测覆盖三种样式、缩放/DPI、负坐标屏幕、顶部任务栏和浮起位置恢复；浏览器覆盖开合、手动最小化、悬停露出/展开、消息露出后收回。

测量：`islandTourTuck.ts` 在实际 class 切换前记录第一帧，此后用 requestAnimationFrame 连续采样至少 620ms 的 getBoundingClientRect().top，断言相邻 y 不减少（容差 0.01px）且至少三帧。line 和 hidden 的全览回归均通过，CSS 无纵向 transform；贴顶原生起终点相同。

验证：

- `pnpm check`：通过（330 个单测）。
- `pnpm build`：通过；Vite 保留既有大包体积提示。
- `pnpm test:regression`：25 页全部通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：331 通过、8 项既有忽略。
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`：通过。
- `pnpm tauri build --no-bundle`：通过。

Ego 实际打开全览页并截图；可见浏览器在贴边测试前的既有圆角检查处失败，原样输出：

```text
FAIL Error: 展开后的圆角比收起时更大
```

之后读取的圆角已为最终值 35.7px，推测与可见页面帧调度有关。规定的无头回归全部通过，未删改该断言。后续手动测量时 Ego 返回：

```text
Error: task space not found: 3
```

没有创建替代空间绕过。真实桌面的多屏切换、顶部任务栏、托盘隐藏、游戏全屏仍需实机截图验收；已验证对应计算与回归路径，不能等同于已完成实机验收。

## 2. 默认细线与迁移

- `tuckLineMigration.ts` 为无 DOM/React 的迁移决策，存储回调由 `storage.ts` 提供；先写设置，再写完成标记。没有存档只标记；失败不标记，下次加载重试；已完成后保留用户新选择。
- 修复 `autoTuck` 缺字段时被当作 false；连带的旧版 `autoCollapseSeconds` 回退因此由 0 恢复到默认 30 秒。明确保存的 false 仍保留。
- 迁移单测覆盖三种样式、新用户、两步写入的失败重试、完整存储加载及后续手动选择。颜色测试补上贴边迁移完成标记，隔离其“只写颜色标记”的断言；idle 测试同步缺字段的新预期，没有改 idlePlan。
- 回归 mock 明确保存所选的 tuckStyle 和完成标记；设置回归改为断言默认选中细线。

初次 `pnpm check` 有两项旧预期失败（颜色测试未隔离新迁移、idle 缺字段旧预期），修正后 335 个单测通过。初次 `pnpm test:regression` 的设置页仍断言默认 edge，修正后重跑全量。`pnpm build` 通过。

设置页初次失败原样：

```text
✗ settings.html?test=1  failed, 10 checks, 0.5s
    FAIL Error: general: the tucked look offers edge, line and hidden, edge by default
1 of 25 regression pages did not pass.
```

First check failure output:

```text
✖ failing tests:



test at tests\unit\color-refresh.test.mjs:56:1

✖ old users already using the new defaults only get the marker, including mixed-case colors (1.5937ms)

  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  + actual - expected



  + '{"topEdgeLayoutVersion":1,"appearanceMode":"classic","fontFamily":"system","islandFontPercent":100,"pageButtonStyle":"icon","glassIntensity":72,"opacity":75,"collapsedScale":1,"collapsedAutoWidth":true,"collapsedWidth":340,"collapsedHeight":38,"expandedScale":1,"marginY":0,"positionLocked":false,"islandMonitor":"primary","islandCornerRadius":42,"islandCornerShape":"squircle","maxPanelHeight":490,"clipboardVisibleRows":4,"agentVisibleRows":2,"agentHostDisplay":"icon","agentSessionView":"list","agentSessionSort":"recent","agentSessionGroup":"computer","agentArchiveMotion":"slide","agentCardEffects":"off","agentSessionHours":2,"agentShowClaudeCode":true,"agentShowCodex":true,"agentShowDsh":true,"agentShowWorkbuddy":true,"agentHideFinished":false,"agentShowElapsed":false,"agentShowModel":true,"agentShowActivity":true,"agentShowUsage":true,"agentQuotaSources":["claudeCode","codex","dsh","workbuddy"],"agentAlertCompleted":true,"agentAlertFailed":true,"agentAlertWaiting":true,"agentAlertStarted":"off","agentAlertSeconds":5,"agentRemindSeconds":0,"agentQuotaAlertPercent":80,"taskTextColor":"#FFFFFF","pulseColor":"#3AE489","pulseBrightness":100,"islandBackgroundColor":"#2F2F37","todoBackgroundColor":"#ffffff","showTitle":false,"showCollapsedText":true,"showIdleTodoCount":true,"carryOverIncompleteTodos":true,"enableTodoReorder":true,"todoReorderVersion":1,"todoTimerEnabled":false,"rotateTodos":false,"todoRotationSeconds":5,"autoTuck":true,"tuckStyle":"line","tuckDelaySeconds":30,"autoCollapseSeconds":30,"autoTuckRetract":true,"autoTuckRetractDelayMs":500,"revealOnMessage":true,"expandTrigger":"click","hoverExpandDelayMs":0,"hoverCollapseDelayMs":0,"minimizeAction":"tuck","tuckedHoverAction":"reveal","todoEnabled":true,"musicEnabled":true,"agentStatusEnabled":true,"agentTitleEnabled":true,"collapsedPriority":["agent","lyrics","todo"],"collapsedShowCover":true,"collapsedLayout":["text","mail","shelf","music","agents"],"pageOrder":["todo","music","clipboard","shelf","translation"],"shelfEnabled":true,"translationEnabled":true,"translationTarget":"island","shelfExpandOnDrop":true,"shelfAutoCleanupDays":0,"shelfRemoveMissing":true,"shelfRemoveAfterDragOut":false,"shelfMaxItems":100,"shelfDoubleClick":"open","shelfShowCount":true,"lyricsFolder":"","lyricsOnline":true,"lyricsChinese":true,"lyricsOffsetMs":0,"mailEnabled":true,"gameDoNotDisturb":true,"gameAutoTuck":false}'

  - '{"islandBackgroundColor":"#2F2F37","taskTextColor":"#FFFFFF","pulseColor":"#3AE489","opacity":75}'



      at file:///D:/FocuSD/.worktrees/shape/tests/unit/color-refresh.test.mjs:63:14

      at withStorage (file:///D:/FocuSD/.worktrees/shape/tests/unit/color-refresh.test.mjs:21:9)

      at TestContext.<anonymous> (file:///D:/FocuSD/.worktrees/shape/tests/unit/color-refresh.test.mjs:59:5)

      at Test.runInAsyncScope (node:async_hooks:227:14)

      at Test.run (node:internal/test_runner/test:1402:25)

      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)

      at Test.postRun (node:internal/test_runner/test:1542:19)

      at Test.run (node:internal/test_runner/test:1467:12)

      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {

    generatedMessage: true,

    code: 'ERR_ASSERTION',

    actual: '{"topEdgeLayoutVersion":1,"appearanceMode":"classic","fontFamily":"system","islandFontPercent":100,"pageButtonStyle":"icon","glassIntensity":72,"opacity":75,"collapsedScale":1,"collapsedAutoWidth":true,"collapsedWidth":340,"collapsedHeight":38,"expandedScale":1,"marginY":0,"positionLocked":false,"islandMonitor":"primary","islandCornerRadius":42,"islandCornerShape":"squircle","maxPanelHeight":490,"clipboardVisibleRows":4,"agentVisibleRows":2,"agentHostDisplay":"icon","agentSessionView":"list","agentSessionSort":"recent","agentSessionGroup":"computer","agentArchiveMotion":"slide","agentCardEffects":"off","agentSessionHours":2,"agentShowClaudeCode":true,"agentShowCodex":true,"agentShowDsh":true,"agentShowWorkbuddy":true,"agentHideFinished":false,"agentShowElapsed":false,"agentShowModel":true,"agentShowActivity":true,"agentShowUsage":true,"agentQuotaSources":["claudeCode","codex","dsh","workbuddy"],"agentAlertCompleted":true,"agentAlertFailed":true,"agentAlertWaiting":true,"agentAlertStarted":"off","agentAlertSeconds":5,"agentRemindSeconds":0,"agentQuotaAlertPercent":80,"taskTextColor":"#FFFFFF","pulseColor":"#3AE489","pulseBrightness":100,"islandBackgroundColor":"#2F2F37","todoBackgroundColor":"#ffffff","showTitle":false,"showCollapsedText":true,"showIdleTodoCount":true,"carryOverIncompleteTodos":true,"enableTodoReorder":true,"todoReorderVersion":1,"todoTimerEnabled":false,"rotateTodos":false,"todoRotationSeconds":5,"autoTuck":true,"tuckStyle":"line","tuckDelaySeconds":30,"autoCollapseSeconds":30,"autoTuckRetract":true,"autoTuckRetractDelayMs":500,"revealOnMessage":true,"expandTrigger":"click","hoverExpandDelayMs":0,"hoverCollapseDelayMs":0,"minimizeAction":"tuck","tuckedHoverAction":"reveal","todoEnabled":true,"musicEnabled":true,"agentStatusEnabled":true,"agentTitleEnabled":true,"collapsedPriority":["agent","lyrics","todo"],"collapsedShowCover":true,"collapsedLayout":["text","mail","shelf","music","agents"],"pageOrder":["todo","music","clipboard","shelf","translation"],"shelfEnabled":true,"translationEnabled":true,"translationTarget":"island","shelfExpandOnDrop":true,"shelfAutoCleanupDays":0,"shelfRemoveMissing":true,"shelfRemoveAfterDragOut":false,"shelfMaxItems":100,"shelfDoubleClick":"open","shelfShowCount":true,"lyricsFolder":"","lyricsOnline":true,"lyricsChinese":true,"lyricsOffsetMs":0,"mailEnabled":true,"gameDoNotDisturb":true,"gameAutoTuck":false}',

    expected: '{"islandBackgroundColor":"#2F2F37","taskTextColor":"#FFFFFF","pulseColor":"#3AE489","opacity":75}',

    operator: 'strictEqual',

    diff: 'simple'

  }



test at tests\unit\idle-collapse.test.mjs:36:1

✖ typed-in delays are rounded and kept in range, and older settings keep what they did (3.7409ms)

  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:



  30 !== 0



      at TestContext.<anonymous> (file:///D:/FocuSD/.worktrees/shape/tests/unit/idle-collapse.test.mjs:46:10)

      at Test.runInAsyncScope (node:async_hooks:227:14)

      at Test.run (node:internal/test_runner/test:1402:25)

      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)

      at Test.postRun (node:internal/test_runner/test:1542:19)

      at Test.run (node:internal/test_runner/test:1467:12)

      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {

    generatedMessage: true,

    code: 'ERR_ASSERTION',

    actual: 30,

    expected: 0,

    operator: 'strictEqual',

    diff: 'simple'

  }

 ELIFECYCLE  Test failed. See above for more details.

 ELIFECYCLE  Command failed with exit code 1.
```
