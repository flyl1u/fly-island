# 网易云一键安装进度插件：可行性调研（C0）

调研日期：2026-11-12。结论：**可行**，按下面的清单实现一键安装 / 卸载。

## 背景

网易云 3.x 自带的 SMTC 不提供时间线（3.1.34 起有原生 SMTC，但没有进度），岛屿只能用本地秒表估算，用户在网易云里拖进度后歌词就会错位。InfLink-rs 是 BetterNCM 插件，会接管网易云的 SMTC，每秒推送一次进度（精度 10 ms）。

## 本机实测（开发者机器）

| 项 | 结果 |
|---|---|
| 网易云版本 | `3.1.41.205564`（`cloudmusic.exe` 文件版本） |
| 架构 | x64（PE Machine `0x8664`） |
| 安装目录来源 | `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\cloudmusic.exe` 默认值 → `D:\应用\CloudMusic\cloudmusic.exe`；卸载项 `InstallLocation` 为空，不能依赖，`UninstallString` 所在目录可作后备 |
| 安装目录可写 | 是（不在 Program Files 下，不需要 UAC）；装在 Program Files 时需要提权 |
| 已有 `msimg32.dll` | 无 |
| QQ 音乐 | `20.39`，低于 21.10.2962，没有时间线，诊断卡片应提示升级 |

## 选定组件（固定版本，写死到常量）

| 组件 | 版本 | 下载 URL | SHA256 | 大小 | 许可证 |
|---|---|---|---|---|---|
| BetterNCM 加载器（x64） | 1.3.4 | `https://github.com/std-microblock/chromatic/releases/download/1.3.4/BetterNCMII.dll` | `a7c77af418d7940e63faa58ea036fba1f4baad497947109ea52ed78c8e86608f` | 1204224 | GPL-3.0 |
| BetterNCM 加载器（x86，网易云 2.x 32 位） | 1.3.4 | `https://github.com/std-microblock/chromatic/releases/download/1.3.4/BetterNCMII86.dll` | `b7be606f353c5ca36235ff1f4dfccde62dc459a4b07a506698d663a1953864f2` | 912896 | GPL-3.0 |
| InfLink-rs | v3.4.0（2026-10-11） | `https://github.com/apoint123/inflink-rs/releases/download/v3.4.0/InfLink-rs.plugin` | `7d0b7b863b072a99b88eb614c788099315e690920889aaca22685d3663661468`（与 GitHub release digest 一致） | 1637976 | GPL-3.0 |

依据：
- BetterNCM 1.3.1 起“适配网易云 3.0.x”；1.3.4 是 BetterNCM 名下最后一版（仓库已改名 chromatic，2.0.0-pre 没有资产，不用）。
- InfLink-rs README 列出的测试范围：V3 `3.1.20`–`3.1.41`，V2 只测了 `2.10.13`。插件 manifest：`"ncm3-compatible": true`，`"betterncm_version": ">=1.0.0"`，`"native_plugin": "backend.dll"`，对 `>=3.1.21` 会 hijack 掉网易云原生 SMTC。
- 官方安装器（BetterNCM-Installer 1.2.0）的做法：读 App Paths 找到安装目录，按 x86/x64 下载对应 dll，复制为安装目录下的 `msimg32.dll`（hijack.cpp 转发 AlphaBlend / GradientFill / TransparentBlt 到系统 msimg32）。它的版本清单托管在 gitcode.net，现已无法访问（返回 418），所以我们自己固定版本，不依赖它。

## 磁盘布局

- 加载器：`<cloudmusic.exe 所在目录>\msimg32.dll`。
- 数据目录：环境变量 `BETTERNCM_PROFILE`，未设置时为 `C:\betterncm`（dllmain.cpp，“不再向前兼容”）。加载器会自己创建 `plugins\` 并下载插件商店插件。
- 插件：`<数据目录>\plugins\InfLink-rs.plugin`（zip，含 backend.dll、index.js、manifest.json）。

## 安装步骤（一键）

1. 读取 App Paths 得到 `cloudmusic.exe`，取文件版本与 PE 架构；版本不在支持范围时不提供安装（支持范围：`>=3.0.0`，并提示 3.1.20–3.1.41 以外“未经测试”；2.x 只支持 2.10.13 的 x86）。
2. 网易云在运行时：安装目录里还没有 `msimg32.dll` 就直接安装（加载器只在网易云启动时载入，运行中的网易云不占用要写的文件），装完提供“立即重启网易云”；已有加载器时它可能占着插件目录，才要求先关闭，并提供“关闭网易云并继续”。都只在用户点击后才结束进程。（2026-11-12 更新）
3. 优先使用随安装包附带的文件（`src-tauri/resources/media-plugins/`，打包到安装目录的 `media-plugins/`，附 GPL-3.0 全文和源码链接），大小和 SHA256 校验通过就不联网（2026-11-12 起）。附带文件缺失或被改动时才下载到 app data 临时目录并校验 SHA256，依次尝试 `ghfast.top`、`gh-proxy.com` 两个加速镜像（与应用更新相同），最后直连 GitHub；每个来源单独超时，大小或 SHA256 不符就丢弃换下一个。
4. 已有 `msimg32.dll`：哈希等于我们的 → 跳过；不等 → 视为用户已装其他版本 BetterNCM，不覆盖，只放插件。
5. 已有 `plugins\InfLink.plugin`（旧版 InfLink）→ 提示冲突（Lyricify 文档说两者同装会出问题），不自动删除，让用户确认后再装。
6. 复制 dll 为 `msimg32.dll`（目录不可写时提权子进程复制）；创建数据目录并复制插件。
7. 写安装记录（文件路径 + 哈希），提示重启网易云。

## 卸载

删除我们放的 `msimg32.dll` 和 `InfLink-rs.plugin`（哈希仍匹配时才删）。`C:\betterncm` 里加载器自己生成的其他文件不删，只在界面上说明可以手动删除。删掉 `msimg32.dll` 后网易云恢复原样。

## 风险

- BetterNCM 已停更：网易云大版本更新后可能无法加载，或被更新覆盖；诊断卡片检测到“装了但没有时间线”时提示可能不兼容。
- dll 劫持方式可能被杀软误报。
- 网易云更新时安装目录可能被重写，导致 `msimg32.dll` 丢失，到时重新出现安装卡片即可。
- 本机尚未实测“装上后网易云能正常启动并推送时间线”，放进人工验收清单。

## 待人工验收

- [ ] 装前：网易云播放，在网易云里拖进度，岛屿歌词不跟随
- [ ] 岛屿里一键安装 → 重启网易云 → 网易云正常启动
- [ ] 在网易云里拖进度，岛屿歌词 1 秒内跟上；暂停/继续正确
- [ ] 一键卸载 → 文件已清理 → 网易云正常启动
