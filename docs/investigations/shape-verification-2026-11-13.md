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

没有创建替代空间绕过。真实桌面的多屏切换、顶部任务栏、托盘隐藏、游戏全屏仍需实机截图验收；已验证对应计算与回归路径，不能等同于已完成实机验收。

## 2. 默认细线与迁移

- `tuckLineMigration.ts` 为无 DOM/React 的迁移决策，存储回调由 `storage.ts` 提供；先写设置，再写完成标记。没有存档只标记；失败不标记，下次加载重试；已完成后保留用户新选择。
- 修复 `autoTuck` 缺字段时被当作 false；连带的旧版 `autoCollapseSeconds` 回退因此由 0 恢复到默认 30 秒。明确保存的 false 仍保留。
- 迁移单测覆盖三种样式、新用户、两步写入的失败重试、完整存储加载及后续手动选择。颜色测试补上贴边迁移完成标记，隔离其“只写颜色标记”的断言；idle 测试同步缺字段的新预期，没有改 idlePlan。
- 回归 mock 明确保存所选的 tuckStyle 和完成标记；设置回归改为断言默认选中细线。

初次 `pnpm check` 有两项旧预期失败（颜色测试未隔离新迁移、idle 缺字段旧预期），修正后 335 个单测通过。初次 `pnpm test:regression` 的设置页仍断言默认 edge，修正后重跑全量。`pnpm build` 通过。

## 4. 设置里实时预览（Codex 额度用完后由 Claude 接手完成）

- 预览请求 `focusd-island-panel-preview` 新增 `tucked`；旧的 `{ mode, requestedAt }` 格式照常可读，2 秒前的请求忽略（`windows/settings/panelPreview.ts`）。
- 岛内（`usePanelPreview.ts` + `panelPreviewPlan.ts`）记住预览前的状态，2.5 秒内没有新请求就恢复；预览期间暂停空闲计时和贴边 peek 收回，结束后从头计时。鼠标进入岛、点击或按键、游戏勿扰、消息预览出现时，交给正常逻辑，不再恢复。
- 接上预览的设置：贴边样式（选哪个都立刻按该样式贴边）；外观页的收起态相关项（缩放、尺寸、布局、贴边圆角、颜色、透明度等）预览收起态，展开态相关项（展开缩放、字体、字号、页面按钮、外观风格）预览展开态（`appearancePreview.ts`）；恢复默认外观预览收起态。
- `tests/regression/panel-preview` 覆盖：三种预览、恢复、悬停接管、点击接管、游戏勿扰阻止与中途取消、消息接管后正常收回。
