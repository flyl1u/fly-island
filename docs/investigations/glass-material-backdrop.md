# 玻璃材质的真实背景模糊与收起掉帧（v3.2.6，issue #74）

> **壁纸方案已被否决并删除（2026-11-18）**，现在的实时背景模糊见 [glass-live-backdrop.md](glass-live-backdrop.md)。本文的 atrium 摘要和「收起掉帧的处理」仍然有效。

## 问题

- 「液态玻璃 / 磨砂玻璃」在 3.3 之前只是半透明底色加高光：透明窗口上 `backdrop-filter` 没有可采样的内容，后面的桌面清清楚楚（#74）。
- 部分用户反馈玻璃质感收起时掉帧。收起 380ms 内每帧重排岛的宽高圆角，并重绘：外投影（0 18px 46px）、5 层 inset 阴影（其中一层 16px 模糊）、整块噪点、贴顶时的 `mask-image`；收起瞬间 `background` / `box-shadow` 还会直接切换（不在过渡列表里）。

## atrium-desktop 的做法（参考）

读的是 `native/core/render/` 的 `capture.*`、`desktop_backdrop.*`、`glass_renderer.*`、`glass_panel.*`、`shaders/glass.hlsl`、`continuous_corners.h` 与 `native/core/motion.h`、`docs/DESIGN.md`。

- **背景来源**：首选 DXGI Desktop Duplication，用 `WCA_EXCLUDED_FROM_DDA` 只把自己从这一路采集中排除；回退 Windows.Graphics.Capture，此时要给自己的窗口设 `WDA_EXCLUDEFROMCAPTURE`（自己会从所有截图、录屏里消失）。桌面小组件不采屏幕，而是采 Explorer 的桌面窗口（Progman）或者按 `IDesktopWallpaper` 的布局（填充 / 适应 / 拉伸 / 平铺 / 居中 / 跨屏 + 背景色）自己合成壁纸；远程控制模式也只用壁纸。
- **模糊 / 折射 / 高光**：每个表面把窗口下方一块带边距的 ROI 拷进纹理并生成 mip，着色器按 `BlurLod` 取 mip 再做 5 点小核，`BlurMix` 在清晰与模糊之间混合；形状是连续圆角的有符号距离场，边缘 `Edge` 宽的一圈按圆形透镜截面做位移折射（`Refract`）和 RGB 色散（`Dispersion`）；之后做 vibrancy（饱和度、亮度略升）、混入色调、沿边一条朝向光源的镜面高光线、内侧柔光、顶部微光，以及形状外的柔和投影。Liquid / Frosted 只是同一着色器的两组参数（模糊 0.5 / 1.0、折射 30 / 6 等）。
- **只在背景变化时重绘**：ROI 与上次呈现时的 ROI 在 GPU 上比较（不阻塞地读回），没有变化就不画；桌面捕获按每帧的脏矩形判断变化是否落在小组件下方；壁纸模式每隔几秒才检查一次。
- **动画**：位移、缩放用闭式解的弹簧（`response` / `damping`，迟到的帧也落在正确位置）与 ease-out；弹出、收起的缩放和淡入淡出交给 DirectComposition 视觉由 DWM 播放，不依赖自己的帧率。

## 在 Tauri / WebView2 里的可选方案

| 方案 | 结论 |
|---|---|
| DWM 系统背景（Acrylic / Mica / `ACCENT_ENABLE_ACRYLICBLURBEHIND`）+ `SetWindowRgn` 裁成岛的形状 | 不选。主窗口是 820×460 的透明舞台，模糊盖满整个 HWND；窗口区域没有抗锯齿（连续圆角会出锯齿），且要在 380 / 560ms 的弹簧动画里逐帧从 Rust 改区域，必然和 CSS 的形状错帧；区域还会把岛外的阴影一起裁掉。旧注释也记录过它裁不干净。 |
| 屏幕捕获（DXGI 复制 / WGC）后把画面送进页面 | 不选。WGC 要求设 `WDA_EXCLUDEFROMCAPTURE`，岛会从用户的截图和录屏里消失；`WCA_EXCLUDED_FROM_DDA` 是未公开接口；每帧把位图经 IPC 送进 WebView 再解码，开销远大于收益，也违背「不常驻耗资源」。 |
| 另开一个原生模糊窗口垫在岛下方 | 不选。两个窗口的几何要逐帧同步，动画中必然错位。 |
| **采样桌面壁纸，在 Rust 里一次性模糊，作为页面里的静止图层** | **选用**。与 atrium 小组件 / 远程模式同源；不读屏幕、不影响截图录屏；壁纸很少变，模糊只在壁纸、显示器或强度变化时做一次。 |

取舍：模糊的是**壁纸**，不包括岛后面的其他窗口——岛常驻屏幕顶部，绝大多数时候后面是壁纸或最大化窗口的标题栏；设置里的说明文字写明了这一点（「模糊的是岛屿后面的桌面壁纸（不含其他窗口）」）。

## 实现

- `src-tauri/src/win32/wallpaper.rs`：`IDesktopWallpaper` 读每块显示器的壁纸路径、物理像素矩形、填充方式和背景色（`unsafe` 只在这里）。
- `src-tauri/src/island/backdrop.rs`：命令 `get_island_backdrop({ blur, knownKey })`。取主窗口中心所在的显示器，按 Windows 的填充方式把壁纸合成到 1/4 分辨率的画布（解码结果按路径 + 修改时间缓存，长边最多 1600px），`fast_blur`（强度 0–100 → σ 0–10 画布像素，约 0–40 屏幕像素），饱和度 ×1.2（vibrancy），编码成约几十 KB 的 JPEG data URL。返回 `key`；前端带着上次的 key 来问时，没变化就不再生成图片。
- `src/windows/island/useGlassBackdrop.ts`：玻璃材质开启时请求一次；窗口移动（拖动、贴边滑动、跟随换屏）只改 CSS 变量的偏移，停稳 400ms 后再问一次（换屏时 key 变）；DPI 变化同理；每 20 秒检查一次壁纸是否更换（页面隐藏时跳过）。变量直接写在 `document.documentElement` 上，不经过 React 状态，窗口逐帧移动时不触发渲染。图片就绪前没有 `data-glass-backdrop`，玻璃保持旧的纯色调外观（失败时也一样）。
- `IslandGlass.css` `.island__glass-backdrop`：铺满整个舞台、相对舞台静止（`left: calc(50% - 50vw)`，50% 是岛当前的半宽），叠放「磨砂白雾 → 色调 → 模糊壁纸」三层背景和噪点，`will-change: transform` 自成合成层；岛变形时只是被父级圆角裁切，不重绘。色调改用更淡的 `glassBackdropTintAlpha`（液态 0.34−0.2×强度，磨砂 0.62−0.16×强度）。
- 多显示器 / DPI：Rust 以物理像素返回显示器矩形，前端用窗口自己的缩放比换算；跨 DPI 移屏后 `onScaleChanged` 重算。贴边（露边 / 隐藏）时窗口上移，偏移随 `onMoved` 更新，壁纸仍对齐。跨屏（span）壁纸按所有显示器的外接矩形合成后截取本屏。

## 收起掉帧的处理

原则同 `expansion-performance-investigation.md`：每帧只让外形本身排版，贵的东西不跟着变形重绘。

- **投影**移到 `.island__glass-shadow`：一个展开尺寸的固定盒子，收起时用 `transform: scale(sx, sy)` 缩到收起条的大小。缩放与宽高用同一条曲线和时长，二者都是同一缓动进度的线性函数，所以每一帧都严格对齐；合成器播放，46px 模糊只在展开高度变化时栅格化一次。盒阴影只画在盒子外面，不会压暗玻璃里透出的内容。
- **壁纸与噪点**在静止图层上（见上），不再每帧重绘整块噪点。
- **边缘**去掉 16px 模糊的 inset 光晕，改成两层渐变（透镜边缘聚光、顶部光带）；其余 inset 线都是 0–1.5px 的小模糊。
- **收起不再切背景**：收起态和展开态用同一套玻璃底，删除收起态单独的 `background` / `box-shadow`。
- 未改动：贴顶描边的 `mask-image`（只在贴顶的展开态，且为小面积）、液态玻璃的文字光晕（文字在不重绘的面板合成层里）。

## 观感

- 液态玻璃：几乎无色的薄色调 + 模糊壁纸（默认 60%）+ 亮边与指针高光 + 透镜边缘的聚光渐变。CSS 无法逐像素位移采样，所以没有 atrium 那种边缘折射与色散。
- 磨砂玻璃：更重的乳白 / 烟色色调与白雾叠在模糊壁纸上，细噪点，不发光。
- 新设置「外观 → 主题 → 背景模糊」（`glassBlur`，0–100，默认 60），仅玻璃材质显示，松手后生效（每次变化 Rust 重新模糊一次）。

## 待人工验收

见提交说明与汇报中的手测清单：单屏 / 多屏不同壁纸、不同 DPI、填充方式、纯色壁纸、幻灯片壁纸、拖动 / 贴边 / 换屏时壁纸是否对齐，收起 / 展开是否顺滑（可用 `node scripts/measure-island-motion.mjs --frames` 对比）。
