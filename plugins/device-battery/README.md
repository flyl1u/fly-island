# 设备电量与音频 / Device Battery & Audio

作者 / Author [Anobod1119](https://github.com/Anobod1119) · [Fly Island #106](https://github.com/flyl1u/fly-island/pull/106)

插件市场中显示「开发中」，暂未开放安装。启用后，展开岛屿打开设备页，在设置 → 设备中选择扬声器和耳机。切换后会读取实际输出，保留通讯设备和麦克风设置。低电量提醒使用当前且已确认的读数。支持范围见 [设备型号](MODELS.md)。

Listed as In development in the Fly Island plugin market; installation is unavailable. When enabled, open Devices on the expanded island and bind speakers and headphones in Settings → Devices. Output switches are verified against the current default and preserve the communications and recording defaults. The collapsed island uses current, confirmed battery readings for low-battery alerts.

## 组成 / Layout

| 包内文件 / File | 内容 / Contents |
|---|---|
| `device-battery-bridge.exe` | 音频读取与切换，ATK、HyperX 原生读取（.NET Framework，系统自带）/ audio, native ATK and HyperX readers |
| `engine/runtime/python.exe` | **Rust 读取引擎，不是 Python** / the Rust reader engine, **not Python** |
| `engine/server.py` | 一行注释的占位文件 / a one-line placeholder |
| `LICENSE`、`THIRD_PARTY_NOTICES.md`、`licenses/`、`SOURCE.md` | 许可与来源 / licenses and sources |

后两个路径是 Fly Island 宿主固定查找并启动的路径（3.3.0 起），保留它们，新插件包才能在现有版本上运行。宿主传入的 `-I -B <server.py>` 参数会被引擎忽略。

The host (3.3.0 and later) requires and starts those two paths, so the package keeps them. The engine ignores the interpreter arguments `-I -B <server.py>`.

## 读取引擎 / Reader engine

0.2.0 起，读取引擎从内嵌 CPython 的 Python 代码改为 Rust（源码在 [engine/](engine/)）。它移植自 [MyFinder Device Battery 提交 73d99e2](https://github.com/wushuai0802/myfinder-device-battery/tree/73d99e2087dd70ae8eef4199854e0c495a66f0bc) 的 `engine/`：注册表中的 47 个读取器和标准 HID 读取器，共 48 个，一个不少。安装包从约 12.8 MB 降到 1 MB 以内。

- 只发各读取器协议里记录的查询指令；读不到时显示「未知」，不猜数值。
- 蓝牙改为原生读取（SetupAPI 设备属性 + WinRT），不再启动 PowerShell。
- 只在本机查询，不联网。输出里没有设备路径、序列号或蓝牙地址。

命令行：`--package-smoke`（不访问硬件，只检查 48 个读取器能否初始化）、`--once`（读一次并打印）；不带 `--once` 时从标准输入逐行读取 `poll` / `ready` / `exit` 命令，输出 schema 2 JSON。

与 Python 版的差别。宿主每次读取都新起一个进程，下列功能在 Fly Island 里原本就用不到或不生效：

- 不读写 DPI（`dpi` 恒为 `null`，`set_dpi` 返回错误）；不支持 `--device-pack`。
- 不保留跨轮状态：没有缓存、失败退避、设备睡眠后沿用旧电量；定向查询按整轮查询回答。
- 不输出读取器诊断文本；`health` 只给状态和错误代码。

单次读取内的行为差别：

- JBL 在本次读取内最多监听 5 秒。
- 超出 0–100 的电量记为未知，不做截断（Arctis 7 系列仍按驱动文档封顶）；Audeze 读到 0% 记为未知，也不再提示重新插拔接收器。
- 充电状态查询没有回应时标记为「充电状态未知」。

Since 0.2.0 the reader engine is written in Rust instead of Python on an embedded CPython. It is ported from `engine/` of MyFinder Device Battery at commit 73d99e2: all 48 readers (the 47 registry providers and the standard HID reader). The package shrank from about 12.8 MB to under 1 MB. It only sends the queries documented by each reader and reports unknown rather than guessing. Bluetooth is read natively. DPI access, device packs, state kept between polls and reader diagnostic text are not ported; the host starts a new process for every read. All rewritten readers are unverified on hardware until tested again.

## Source and licensing

The corresponding source for the bridge, the reader engine, packaging scripts and integration is in the [Fly Island source repository](https://github.com/flyl1u/fly-island/tree/main/plugins/device-battery). The package is distributed under AGPL-3.0-only. It is a modified version of the [MyFinder Device Battery source at commit 73d99e2](https://github.com/wushuai0802/myfinder-device-battery/tree/73d99e2087dd70ae8eef4199854e0c495a66f0bc) (reader engine rewritten in Rust, 2026-11). Notices for the HaloBattery-derived portions and the Rust crates are in `THIRD_PARTY_NOTICES.md` and `licenses/`. Fly Island runs the bridge and the engine as separate processes.

The package builder downloads the upstream source archive at that commit and verifies its SHA-256, because the bridge compiles three upstream C# files. No upstream file other than those compiled into the bridge is part of the package. It then builds the Rust engine with `cargo build --locked --release` and runs its package check.

## 开发 / Development

```powershell
cargo test --manifest-path plugins/Cargo.toml -p device-battery-engine
```

打包（需要能访问 GitHub 以下载固定版本的上游源码）：

```powershell
pnpm release:plugins --no-upload
```

引擎目录：`engine/src/providers/` 每个读取器一个模块（协议常量、纯解析函数、单元测试），`engine/src/engine/` 是调度和快照，`engine/src/hid/` 是 HID 访问与拓扑，`unsafe` 只在 `engine/src/win32/`。
