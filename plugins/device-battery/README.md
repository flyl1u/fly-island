# 设备电量与音频 / Device Battery & Audio

作者 / Author [Anobod1119](https://github.com/Anobod1119) · [Fly Island #106](https://github.com/flyl1u/fly-island/pull/106)

从小岛的插件市场安装后，展开岛屿打开设备页。在设置 → 设备中选择扬声器和耳机。切换后会读取实际输出，保留通讯设备和麦克风设置。低电量提醒使用当前且已确认的读数。支持范围见 [设备型号](MODELS.md)。

Install from the Fly Island plugin market and open Devices on the expanded island. Bind speakers and headphones in Settings → Devices. Output switches are verified against the current default and preserve the communications and recording defaults. The collapsed island uses current, confirmed battery readings for low-battery alerts.

## Source and licensing

The corresponding source for the bridge, packaging scripts and integration is in the [Fly Island source repository](https://github.com/flyl1u/fly-island/tree/main/plugins/device-battery). The package uses the [MyFinder Device Battery source at commit 73d99e2](https://github.com/wushuai0802/myfinder-device-battery/tree/73d99e2087dd70ae8eef4199854e0c495a66f0bc). The .NET bridge and MyFinder payload are distributed under AGPL-3.0-only. The bundled HaloBattery-derived source, CPython and hidapi retain the notices under `THIRD_PARTY_NOTICES.md`, `engine/licenses` and `engine/runtime`. Fly Island runs the bridge as a separate process.

The release builder pins and verifies the upstream source archive, uses the upstream lockfile for the Python runtime and hidapi, and checks the engine's package imports. End users install the completed ZIP through Fly Island. Device and audio queries run locally.
