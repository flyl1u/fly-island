# 设备电量与音频插件

源码、构建与使用说明见 [plugins/device-battery/README.md](../plugins/device-battery/README.md)。插件默认关闭，提供独立本地插件包，源项目保留不变。

## 集成边界

- 设置 → 设备：独立页面提供本地目录、启用开关、音频绑定 / 切换和电量列表；原插件页移除设备配置，已有配置原样保留。
- 岛上 → 设备（耳机图标）：参考 MyFinder 双列设备卡片，显示大号电量 / 进度条、音源切换及设备设置入口；支持页面排序、记忆上次页面与 Ctrl + 滚轮切页。离开或收起该页即卸载查询。
- 音乐页：只在启用时挂载紧凑控制条，电量详情为浮层，避免挤占歌词。
- 电量扫描逐步显示已有读数。`device_battery_read(directory, progress?)` 支持查询过程中推送结果，返回值仍是最终快照；多个窗口同时查询同一插件目录时共用一轮扫描，后来加入的窗口立即收到最新进度，不再因已有扫描而失败。最近 10 分钟的结果也会在新扫描期间先显示为缓存读数，避免岛上已有鼠标读数而设置页空白。音频使用 `device_battery_audio(directory, speakerId, headsetId, target)`。
- 音频绑定改变后立即查询，保留已有列表；原生音频查询等待上一条限时调用完成。电量与音频各自管理生命周期，改选绑定不会重查电量。音频每 5 秒及窗口获焦时更新，电量每 60 秒更新，关闭页面后不再接收结果；已开始的共享扫描会继续，并向仍打开的窗口返回结果。
- 领域实现和 UI 可整体移除，接入点只有设备页 / 设置分类、音乐面板、Rust 组装和 i18n 汇总。

## 自测记录

万灵 Mini Pro 8K（`36A7:A868`）和 HyperX Cloud III S Wireless（`03F0:06BE`）接收器已连接但无有效电量回复时，保留带明确未知提示的卡片。读取问题与显示行为见 [排查记录](investigations/wlmouse-a868.md)。

后续实机复测已从无线接收器取得鼠标 92%；改为逐步显示后约 1 秒收到读数，蓝牙超时仍单独报告。Cloud III S 接收器有连接状态回复，但尚无电量回复，不能视为电量读取成功。详见 [分批读取与耳机排查](investigations/device-battery-streaming.md)。

2026-11-20，Windows x64：

| 验证 | 结果 |
| --- | --- |
| `pnpm plugin:device-battery` | .NET 桥接编译、便携 Python / hidapi 构建成功，SHA-256 与 Python Windows 签名校验通过 |
| `powershell.exe -NoProfile -File plugins/device-battery/test.ps1` | 固定快照中的 978 项离线设备协议测试通过（使用插件自己的便携 Python） |
| `pnpm check` | 类型、回归页类型、ESLint、文件行数和 460 项单元测试通过 |
| `pnpm build` | 前端生产构建成功；保留原有大分块提示 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 468 通过，15 个环境依赖测试按声明忽略；测试前已构建 example-hello |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 本次改动后 475 通过，17 个环境依赖测试按声明忽略 |
| `cargo test --manifest-path src-tauri/Cargo.toml local_overlapping_battery_windows_receive_same_progress_and_result -- --ignored --nocapture` | 本机实际插件目录与硬件验证通过；两个窗口消费者收到同一进度快照和最终扫描结果 |
| `cargo test --manifest-path src-tauri/Cargo.toml device_battery::tests::local -- --ignored` | 配置 `FLY_ISLAND_DEVICE_BATTERY_TEST_DIR` 后，3 个本地测试通过：音频只读、隔离进程运行库探测、两条重叠音频查询依次成功；不修改实际音源 |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | 通过 |
| `pnpm tauri build --no-bundle` | 桌面 release 构建成功 |
| `pnpm test:regression` | 岛上设备页本轮全套 51/63 通过；11 个全览用例依赖旧的预览按钮数，已同步；另有一个原待办动画固定时间用例间歇失败 |
| `pnpm test:regression island-tour device-battery` | 更新入口计数后，14 页全部通过，覆盖两种玻璃、字号 / 缩放、页面导航与设备卡片 |
| `pnpm test:regression device-battery settings.html settings-sidebar plugins-settings music-lyrics todo-reorder` | 最终相关 13 页全部通过，含待办动画单独复测；覆盖反复选择后自动更新、不重启电量轮询、保留绑定、岛上入口 / 卡片和切换 |

另以无头 Edge 查看深色中文、浅色英文、300px 英文的音乐页、电量详情和岛上设备卡片，确认内容完整、无横向溢出；设备设置的输出分段按钮也已检查 300px 深浅色与中英文布局。真实只读探测成功枚举音频输出并读到一台无线鼠标电量；本机耳机电量没有成功读出，蓝牙读取存在 timeout，界面保留未知 / 错误，不算该硬件验证通过。没有自动切换用户当前音源，也没有录制或上传真实小岛演示。

硬件逐型号兼容性、真实音源往返切换、完整小岛录屏和正式市场分发需另行验收。本实现没有创建上游 PR，也没有变更任何发布开关或版本号。
