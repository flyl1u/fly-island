<div align="center">
  <img src="src-tauri/icons/mark.svg" alt="Fly Island logo" width="96" height="96">

  <h1>fly-island</h1>

  <p>Windows 上超轻量的灵动岛：微信、QQ、邮箱消息，多会话 AI Agent 与额度环，音乐播放器、待办、剪贴板、文件中转等常用功能，需要时展开，用完收起。</p>

  <p>
    <a href="https://island.flyliu.org/">在线预览</a>
    ·
    <a href="https://github.com/flyl1u/fly-island/releases/latest">下载 Release</a>
    ·
    <a href="https://github.com/flyl1u/fly-island/issues">反馈 Issue</a>
    ·
    <a href="#用户交流群">用户交流群</a>
    ·
    <a href="README.en.md">English</a> · 中文
  </p>

  <p>
    <img alt="Version" src="https://img.shields.io/github/v/release/flyl1u/fly-island?label=version">
    <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-0078D4">
    <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24C8DB">
    <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB">
    <img alt="License" src="https://img.shields.io/badge/license-GPL--3.0-blue">
  </p>

  <a href="https://island.flyliu.org/">
    <img src="docs/assets/promo-preview.webp" alt="fly-island 宣传片：微信消息弹到岛上、在岛上批准 Claude Code 权限、查看 Claude 与 Codex 额度、文件中转、待办、音乐与翻译" width="860">
  </a>

  <p><sub>点击画面打开在线预览，不用安装就能试</sub></p>

  <p>如果它帮你少切了几次窗口，欢迎点个 ⭐ <b>Star</b>，让更多人看到它。</p>
</div>

## 这是什么

fly-island 是一款 Windows 优先的灵动岛。微信、QQ 和邮箱消息直接弹到岛上；Claude Code、Codex、DSH 等 Agent 跑到哪、要不要你审批，一眼就知道；同步歌词、文件中转、剪贴板历史、快捷翻译和待办，也都收在屏幕顶部这座小岛里。

它是一个极轻量、无边框、始终置顶的悬浮岛，内存占用约 0.2%~0.5%，需要时展开，用完收起。

不想安装也可以先玩一下：[在线预览](https://island.flyliu.org/)里是真实的岛屿界面配上演示数据，可以直接点。

## 为什么做它

工作和学习时，我常常要在一个软件里写待办，开着音乐隔绝噪音，查翻译，反复复制粘贴代码，还得时不时看群聊和好友消息。在这些窗口之间来回切换，既慢又分心。

iPhone 的灵动岛把通知、计时、媒体控制收在一个小岛上，缩短了获取信息的路。于是我想：能不能把这些高频功能也收进 Windows 上一个足够轻的地方？fly-island 就这样诞生了。

## 功能一览

### 💬 消息
- **微信、QQ**：新消息直接弹到岛上，显示来源、联系人、时间和内容；开启「自适应通知」后长消息会把岛撑大，在岛上读完，文字可以选中复制。微信免打扰的会话只在有人 @你 时提示。
- **邮箱**：支持多个 IMAP 邮箱（QQ、163、126 等），邮件可以在岛上直接阅读、选中复制。

### 🤖 AI Agent
- Claude Code / Claude 桌面端、Codex、DeepSeek Harness 的会话实时显示在岛上，后台任务也算在内。
- Agent 要运行命令、改文件时，直接在岛上允许或拒绝；做完、等你回答时轻声提示，点会话跳到对应窗口。
- 显示 Claude / Codex 额度环和 DSH 余额环。详见 [AI Agent 状态灯说明](docs/agent-status-hooks.md)、[DSH 接入说明](docs/deepseek-harness.md)。

### 🎵 音乐与歌词
- 通过 Windows 媒体会话控制播放，显示封面、波形、进度和同步歌词，收起时也能显示当前一句。
- 多个播放器可以排优先级、归档不常用的。网易云可一键安装进度插件获得精准进度（插件随安装包附带）。

### 📋 效率工具
- **待办、笔记与日历**：当天任务、拖动排序、安排到以后某天；每日笔记、历史和日历视图；可选倒计时与结束前提醒；保存为 Markdown。
- **剪贴板历史**：记录文字、图片和文件，按类型筛选、搜索、收藏、备注，一键复制回去；可以在岛上打开，也可以用独立窗口。
- **文件中转**：把文件拖到岛上暂存，换个窗口再拖出去、复制或打开；只记路径，不复制文件。详见[文件中转说明](docs/file-shelf.md)。
- **快捷翻译**：全局快捷键唤出，自动判断中英方向；有免密钥的 Google 翻译和 MyMemory，也支持 DeepSeek、通义千问、Kimi、OpenAI 等大模型接口。

### 🎨 外观与行为
- 经典、液态玻璃、磨砂玻璃三种质感，玻璃会实时模糊岛屿身后的画面；深色 / 浅色 / 跟随系统。
- 大小、圆角、颜色、字体、收起时显示什么都能调，整套外观可以存成预设。
- 闲置时贴边隐藏、游戏模式（全屏游戏时不打扰）、锁定位置、开机自启，中英文界面。
- **自动更新**：后台检查和下载，小岛闲置时自动安装；也可以在「设置 → 关于」手动检查。

## 快速上手

1. 从 [Releases](https://github.com/flyl1u/fly-island/releases/latest) 下载安装包（`fly-island_版本号_x64-setup.exe`），装好后小岛出现在屏幕顶部，鼠标移上去即可展开。
2. 按需打开这些功能（都在「设置」里）：

| 功能 | 怎么开 |
| --- | --- |
| QQ 提醒 | 需要 Windows 通知访问权限，且 QQ 已登录、开启系统通知。见 [QQ 通知说明](docs/qq-notification-compatibility.md) |
| 微信提醒 | 电脑版微信保持登录、能发出任务栏提醒即可。见[微信提醒说明](docs/wechat-reminder-compatibility.md) |
| 邮箱 | 在邮箱网页开启 IMAP 并生成授权码，到「设置 → 邮箱」填写（授权码不是登录密码）。见[邮箱接入说明](docs/mail.md) |
| AI 状态灯 | 「设置 → Agent」安装 / 修复钩子，然后重启 Codex 或 Claude Code 所在终端 |
| 快捷翻译 | 默认 `Ctrl+Shift+F`；用免密钥服务开箱即用，用大模型服务时在「设置 → 翻译」填 API 密钥 |

### 隐私

待办、剪贴板和设置都保存在本机。QQ 通知和微信摘要只留在本次运行的内存里；邮箱后台只同步邮件头，正文按需读取、只放在内存，不会改变已读状态。密钥和授权码保存在 Windows 凭据管理器。

## 用户交流群

欢迎加入 **fly-island 用户交流群**，交流使用体验、反馈问题、分享建议。用微信扫描下方二维码入群，也可以在应用「设置 → 关于」里打开二维码。

<p align="center">
  <img src="docs/assets/wechat-community.jpg" alt="fly-island 微信用户交流群二维码" width="360">
</p>

二维码有有效期（当前标注 **11 月 23 日前有效**），失效了请在 [Issue](https://github.com/flyl1u/fly-island/issues) 里说一声。

## 参与开发

### 从源码运行

需要 Windows 10/11、Node.js、pnpm、Rust、Visual Studio C++ Build Tools 和 WebView2 Runtime。

```powershell
git clone https://github.com/flyl1u/fly-island.git
cd fly-island
pnpm install
pnpm tauri dev
```

提交前运行 `pnpm check`；打安装包用 `pnpm tauri build`（产物在 `src-tauri/target/release/bundle/`）。仓库规则见 [AGENTS.md](AGENTS.md)，应用内更新与发布流程见 [docs/updater.md](docs/updater.md)。

### 开发插件

插件是基于小岛源码做出来的功能：可以改造原有功能（比如让每日笔记支持 Markdown），也可以做全新的功能，装上后就是小岛的一部分，默认不安装、用户按需下载。插件功能即将上线，现在就可以按[插件开发规范](docs/plugins/README.md)开发并提交 PR（附使用演示录屏、作者、联系方式和 GitHub 链接），flyl1u 审核适配后上线。

## 致谢

感谢 [@TixXin](https://github.com/TixXin) 在 [PR #36](https://github.com/flyl1u/fly-island/pull/36) 中提出的模块化架构方案与实现，本地重构适配并复用了其中部分代码，来源与验证记录见[改造说明](docs/architecture/refactor-plan.md)。

## 开源协议

本项目采用 [GPL-3.0](LICENSE)：可以自由使用、修改和再分发；分发修改后的版本时，需要同样以 GPL-3.0 开源并提供源代码。3.0.8 及以前的版本以 MIT 协议发布，已发布版本仍可按 MIT 使用。

Copyright (C) 2026 flyl1u and contributors。第三方依赖和内置资源遵循各自的许可证：内置字体见[字体说明](src/assets/fonts/README.md)；随安装包附带的网易云进度插件 BetterNCM 与 InfLink-rs 采用 GPL-3.0，见[插件说明](src-tauri/resources/media-plugins/README.md)。

## Star History

觉得 fly-island 好用的话，[点个 Star](https://github.com/flyl1u/fly-island/stargazers) 就是对作者最大的鼓励。

<a href="https://www.star-history.com/?repos=flyl1u%2Ffly-island&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=light&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=light&legend=top-left" />
  </picture>
</a>
