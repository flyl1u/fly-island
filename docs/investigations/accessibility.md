# 无障碍检查（roadmap D2，2026-11-07）

检查范围：键盘能不能用、读屏能不能读到控件名字、减少动效。方法都能复现，脚本思路写在每节里。

## 控件名字（读屏）

用 TypeScript 编译器扫 `src/**/*.tsx`，列出没有 `aria-label` / `aria-labelledby` / `title`、内容里也没有文字（只有图标）的 `<button>`，以及带 `onClick` 的 `div` / `span` / `li`。

结果只有 7 处，全是有意的写法，不用改：

| 位置 | 为什么不用改 |
|---|---|
| `NumberControl` 的加减按钮 | `aria-hidden` 且不进 Tab 顺序；键盘用方向键加减 |
| `SelectControl` 的选项 `li` | 键盘操作在触发按钮上（`aria-activedescendant`），选项只接鼠标 |
| 文件中转列表、邮件正文、插件详情的 `div` | 点空白处取消选择，或在 HTML 正文里代理链接点击 |
| 收起条 `island__collapsed` | 点空白处打开，旁边的 `island__open-button` 才是给键盘和读屏用的 |

在设置窗口回归页（`tests/regression/settings.html`）逐页按 Tab，读每个停留点的名字（`aria-label`、`aria-labelledby`、关联的 `<label>`）：17 页共 162 个停留点，全部有名字。

## 键盘焦点可见

同样在设置窗口逐页按 Tab，查停留点在 `:focus-visible` 时有没有描边、阴影或边框变化，再截图确认。缺焦点样式的两处已补：

- 外观页的 11 个滑块（`SliderControl`）：滑块圆点加描边。
- 待办「保存」路径按钮（`.save-path-button`）。

下拉框（1px 蓝边）、通用页的滑块（圆点描边）、插件市场搜索框（边框变色）本来就有，只是不在 `outline` / `box-shadow` 上。

岛屿本体的回归页只渲染局部，没有逐个按 Tab；岛本身主要靠鼠标和快捷键，键盘可达性以后按需要再查。

## 减少动效

Windows「设置 → 辅助功能 → 视觉效果 → 动画效果」关掉，或性能选项选择「最佳性能」后，WebView2 报告 `prefers-reduced-motion: reduce`。

- `base.css`：这时默认把 `transition` 时长归零，岛屿展开、收起相关动效是下述局部例外；待办、消息卡片、设置页等仍遵守减少动效。
- **岛屿展开、收起例外（老板确认于 2026-11-13）**：很多用户关闭系统动画效果只是为了性能，并不是对动效敏感，因此所有用户的岛屿展开、收起一律完整播放，不随系统减少动画设置取消。包括外形的宽、高、圆角（展开 560ms / 收起 380ms）、折叠条与展开面板进出、翻页淡入，以及贴边收起与滑出的位置动画。`IslandShell.css` 只对外形和两层面板的时长、延迟局部覆盖全局 `!important`；`useIslandWindow.ts` 始终请求位置动画，`usePageFadeIn.ts` 保留面板淡入。内部控件、消息与玻璃光晕等减少动效规则不变。
- `animation` 在定义它的文件里处理：转圈、弹一下、岛展开的玻璃光晕直接停掉；文件中转的提示（显示 1.2 秒后消失）改成 `step-end`，照样按时消失，只是不渐隐；刚放进来的文件只是颜色淡出，没有移动，保留。
- `tests/unit/reduced-motion.test.mjs` 检查每个会动的 `animation` 都有对应的减少动效规则，新加动画时漏了会失败。
- 回归运行器用 `REGRESSION_REDUCED_MOTION=reduce pnpm test:regression` 模拟系统减少动画（PowerShell 先设 `$env:REGRESSION_REDUCED_MOTION='reduce'` 再运行命令）；`island-tour` 在该模式下仍检查外形过渡属性、非零时长、面板淡入与位置动画请求。
