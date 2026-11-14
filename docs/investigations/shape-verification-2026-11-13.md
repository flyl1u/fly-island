# 岛屿外形与设置预览验收（2026-11-13）

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
