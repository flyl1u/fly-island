# 玻璃材质的实时背景模糊（v3.2.6 手测后，2026-11-18）

取代 [glass-material-backdrop.md](glass-material-backdrop.md) 里的壁纸方案。用户手测后否决了壁纸：「把桌面直接做过来，那岂不是在每一个界面里背景都是桌面？丑飞了，这样宁愿不做」。要的是岛屿身后**实时**内容的模糊。壁纸方案的代码（`island/backdrop.rs`、`win32/wallpaper.rs`、`get_island_backdrop`）已全部删除，没有留作回退。

## 做法（参照 atrium-desktop `native/core/render/capture.cpp`）

- **采集**：`win32/desktop_duplication.rs` 在岛屿所在显示器上开 DXGI Desktop Duplication，D3D11 设备建在驱动这块显示器的适配器上。每来一帧（只有鼠标移动的帧 `LastPresentTime == 0` 直接放掉）在 GPU 上把整张桌面 `CopyResource` 到自己的纹理里。这样岛屿移动、展开高度变化时，即使屏幕静止没有新帧，也能从这份副本重新读取区域。
- **只读岛屿身后**：区域取窗口宽度乘以展开后的岛屿高度（物理像素，也包含消息预览的尺寸）。先用 `CopySubresourceRegion` 拷进一张三级 mip 纹理，再用 `GenerateMips` 让 GPU 缩小，把第 2 级（宽高各 1/4）拷到 staging 纹理读回。展开 560×306、150% 缩放时，读回的是 210×115 的 BGRA，约 96 KB。
- **有变化才发帧**：按帧的 move / dirty 矩形判断变化是否落在区域内。区域或模糊强度变了也会重发。最多 30 帧/秒（`FRAME_INTERVAL` 33ms）；`AcquireNextFrame` 每次最多等 50ms，超时就什么都不做。
- **模糊**在 Rust 里做：小图上做三遍盒式模糊（「背景模糊」0–100 对应半径 0–7 像素，按 1/4 尺寸算，约等于屏幕上 0–28px），饱和度 ×1.18（vibrancy），转成不透明的 RGBA。消息格式：24 字节头（相对窗口左上角的矩形 4×i32，像素宽高 2×u32），后接像素；空消息表示暂停。通过 Tauri `Channel` 以原始字节发给页面。
- **页面**：`useGlassCapture.ts` 收到帧后直接 `putImageData` 到 `.island__glass-backdrop` 里的 canvas，位置写进根元素的 CSS 变量，不触发 React 渲染。canvas 相对窗口静止，岛屿变形时只被裁切；浏览器把 1/4 尺寸的图双线性放大，本身也起到柔化作用。色调、磨砂白雾和噪点叠在 canvas 上，位于同一个静止盒子里。
- **排除自身**：开始采集时对主窗口调用 `SetWindowCompositionAttribute(WCA_EXCLUDED_FROM_DDA = 24)`，停止时撤销。被排除的只有 Desktop Duplication，用户用 Win+Shift+S、Windows.Graphics.Capture 录屏（例如 OBS 的窗口 / 显示器采集默认方式）时仍能看到小岛。只有基于 Desktop Duplication 的录屏工具在玻璃开启期间看不到小岛。系统不支持该属性时（Windows 10 1709 之前）不采集，玻璃退回纯色调，以免岛屿模糊到自己。没有使用 `WDA_EXCLUDEFROMCAPTURE`。

## 何时运行

- 只在玻璃材质下由页面开启（`start_glass_capture`），切回经典材质时停止（`stop_glass_capture`），并撤销排除属性。
- 贴边收起时页面传 `region: null` 暂停。窗口不可见（托盘隐藏）或全屏应用占满岛屿所在显示器（`ForegroundFullscreen::covers_island`，不论是否开启游戏模式）时，线程释放 duplication，每秒检查一次。
- 锁屏、UAC 安全桌面、分辨率或显示器变化会让 `AcquireNextFrame` / `DuplicateOutput` 失败：丢掉 duplication，1 秒后重建。换屏时（区域中心离开当前显示器）也会重建。
- 全程只有一个常驻线程 `glass-capture`。没有任务时阻塞在 Condvar 上，不轮询；不会每帧新开线程。

## 实测（本机：Ryzen 9 7940HX，RTX 4060 Laptop + Radeon 610M，2560×1600）

`cargo test --release --manifest-path src-tauri/Cargo.toml capture_cost -- --ignored --nocapture` 在主显示器顶部中央读 840×460 的区域，每种模式跑 10 秒，计时内容为「读回 + 模糊 + 打包」：

| 模式 | 收到的帧 | 读回次数 | 每次读回 + 模糊 | 进程 CPU |
|---|---|---|---|---|
| 只在区域变化时（玻璃的实际做法），桌面基本静止 | 152 | 1 | 1.85 ms | 0.0 ms（低于计时精度 15.6 ms，约 0%） |
| 每 33 ms 强制读回（最坏情况，相当于身后一直在播视频） | 155 | 225（约 22 帧/秒） | 1.16 ms | 31.2 ms / 10 s，约 0.31% 单核 |

- 每帧 96 KB，最坏约 2.2 MB/s 经 IPC 送进页面。
- 页面侧（WebView2 收消息 + `putImageData`）和 GPU 占用**未单独测量**：要运行完整应用，而本机的单实例插件会把新进程交给已安装的小岛。GPU 侧的工作只是一次整屏拷贝加一次小区域 mip 生成，量级远小于桌面合成本身。待人工验收时用任务管理器对比「经典 / 玻璃」两种材质的 CPU 与 GPU。
- 结论：采集端的开销可以接受，所以保留实时模糊，没有退回不模糊的方案。

## 文字清晰度（同批反馈）

- Chromium 只在文字下方是**不透明**背景时才用 LCD 次像素抗锯齿。经典材质的岛底不透明，所以文字是 LCD 抗锯齿。玻璃的底是半透明的，只能用灰度抗锯齿，这一点由透明窗口决定，CSS 改不了。在 150% 以上的缩放下差别很小。
- 真正让玻璃文字发糊的是：液态玻璃给所有文字加的 `text-shadow`（0 1px 2px 的暗晕，已删除）；投影层和旧壁纸层常驻的 `will-change: transform` 让上面的文字被提升到合成层（已删除）。
- 切页时「先糊后清」：`usePageFadeIn` 的 6px 位移让文字落在小数像素偏移的合成层上；`useMotionLayer` 在切页时让面板在独立合成层里停留 640ms，而独立层没有不透明背景，文字只能用灰度抗锯齿。层撤掉后文字重新以 LCD 绘制，于是显得「变清晰」。现在切页只做淡入，不再位移；只有展开 / 收起才临时给面板独立合成层。

## 待人工验收

- 拖动小岛经过不同窗口和视频时，背景是否跟着实时变化，有没有错位；展开、收起、换页时背景是否始终覆盖整个岛屿。
- 多显示器 / 不同 DPI 之间拖动；锁屏解锁后背景是否恢复；玩全屏游戏时是否暂停（任务管理器里 CPU 回到经典材质的水平）。
- 用 Win+Shift+S 截图、用 OBS 录屏时，小岛是否仍可见。
- 任务管理器对比经典 / 液态 / 磨砂三种材质的 CPU 与 GPU（静止桌面、身后播放视频两种情况）。
