<div align="center">
  <img src="src-tauri/icons/mark.svg" alt="Fly Island logo" width="96" height="96">

  <h1>Fly Island</h1>

  <p><a href="README.en.md">English</a> · 中文</p>

  <p>一款 Windows 桌面效率工具，在屏幕顶部集中管理待办、剪贴板、音乐、AI 状态、快捷翻译和消息提醒。</p>

  <p>
    <a href="https://island.flyliu.org/">在线预览</a>
    ·
    <a href="https://github.com/flyl1u/fly-island/releases/latest">下载 Release</a>
    ·
    <a href="https://github.com/flyl1u/fly-island/issues">反馈 Issue</a>
    ·
    <a href="#用户交流群">用户交流群</a>
  </p>

  <p>
    <img alt="Version" src="https://img.shields.io/github/v/release/flyl1u/fly-island?label=version">
    <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-0078D4">
    <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24C8DB">
    <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB">
  </p>
</div>

## 这是什么

一款 Windows 优先的灵动岛：微信、QQ 和邮箱消息直接弹到岛上，Claude Code / Codex 跑到哪、要不要你审批一眼就知道，再加上同步歌词、文件中转、剪贴板历史、快捷翻译和待办，都收在屏幕顶部的一座小岛里。

fly-island 以轻量、无边框、始终置顶的悬浮岛形式运行，它会在需要时展开，用完后回到紧凑状态，减少为了获取一条信息而切换窗口的次数。

想先看看效果，可以打开[在线预览](https://island.flyliu.org/)，里面是真实的岛屿界面配上演示数据。

## 为什么做它

日常工作或学习过程中，我经常需要在某软件写下 Todo List，为了隔绝噪音，我会打开音乐软件并把音量调到合适的临界点，工作和学习又经常需要借助翻译网站，同时还会反复复制和粘贴代码，与此同时难以避免的是接收不同群聊、好友发送的消息

在这些界面之间来回切换，不仅会降低效率，也容易让人分心，因此我开始思考：能不能把这些高频功能集成到一个足够轻量的地方？

我想到了iPhone的灵动岛，它把消息通知、计时器、媒体控制等信息集中到一个小岛上，缩短了我们获取信息的路程。于是，fly-island 诞生了

## 功能

fly-island 想解决的核心问题，是工作和学习过程中频繁的窗口切换。

fly-island 把分散在不同窗口中的高频操作放到一个可折叠、可展开的悬浮岛里：

- **微信、QQ 与邮箱**：微信和 QQ 的新消息直接弹到岛上，一条一张卡片，显示来源、联系人、时间和内容，不用切过去看；微信免打扰的会话只在有人 @你 时提示，还可以开启会话名与消息摘要（实验性）。支持多个 IMAP 邮箱（QQ、163、126 等），邮件可以在岛上直接阅读。
- **AI Agent**：Claude Code / Claude 桌面端、Codex 和 DeepSeek Harness（DSH，含 DataElement / anywhere-labs 社区桌面端）的会话实时显示在岛上；Agent 要运行命令、改文件时，直接在岛上允许或拒绝，任务做完、等你回答时会轻声提示，点击会话跳到对应窗口。显示 Claude/Codex 额度环及 DSH 余额环。详见 [AI Agent 状态灯说明](docs/agent-status-hooks.md)和 [DSH 接入说明与限制](docs/deepseek-harness.md)。
- **音乐与歌词**：通过 Windows 媒体会话控制播放，显示封面、波形、进度条和同步歌词；收起的岛上也能显示当前一句歌词。可以调整多个播放器的优先顺序。播放器不报告进度时进度条标为“估算”，点一句歌词就能校准。
  网易云精准进度可在岛上的提示卡片或「设置 → 音乐 → 播放器兼容性」一键安装 InfLink-rs 与 BetterNCM，也可一键卸载；插件（GPL-3.0）随安装包附带、按固定指纹校验，不用下载；网易云运行中也能安装，装好后可一键重启网易云生效。支持 3.x x64 和 2.10.13 x86，其他 3.x 版本可能未经测试。
- **文件中转**：把文件拖到岛上暂存，换到别的窗口后再拖出去、复制或打开；只记录路径，不复制文件。详见[文件中转说明](docs/file-shelf.md)。
- **图文剪贴板历史**：记录复制过的文本和图片，搜索内容或备注、收藏常用项、添加备注，并一键复制回剪贴板。历史数量、图片记录和全局唤出快捷键均可设置。
- **快捷翻译**：用全局快捷键打开翻译，可以在岛上打开或使用独立窗口；支持 DeepSeek、火山方舟、通义千问、Kimi、硅基流动、OpenAI 和自定义的 OpenAI 兼容接口，自动判断中英方向或手动指定。
- **待办、笔记与日历**：管理当天任务、设置当前任务、拖动排序，列表顶部显示完成进度；待办可以安排到以后的某一天。左上角切换待办、每日笔记、历史和日历四个视图，日历标出有待办的日子。可选自动结转未完成任务，把任务和笔记保存为 Markdown。
- **待办倒计时（默认关闭）**：在「设置 → 待办」开启后，每项待办可以单独设倒计时，时间到时岛屿展开并提醒。详见[待办倒计时说明](docs/todo-timer.md)。
- **外观与行为**：经典或液态玻璃外观、默认或像素字体，调整大小、透明度、颜色和位置；页面按钮可选图标或胶囊，收起的岛显示什么、按什么顺序都能拖动调整。支持锁定位置、闲置时贴边隐藏、游戏模式、开机自启动，界面可切换中文或英文。
- **自动更新**：启动时自动检查并在后台下载新版本，待办列表里会出现重启更新的按钮；「设置 → 关于」可以查看每个版本的更新日志。

待办、剪贴板和应用设置保存在本机。微信可在设置中开启会话名与最新消息摘要（实验性），摘要和 QQ 通知只保留在本次运行的内存中。邮箱后台仅同步邮件头，正文按需读取且只保留在内存，不会改变邮件已读状态。

## 使用说明

展开岛屿后，用顶部的页面按钮切换待办、音乐、剪贴板、文件中转、翻译、消息和 AI Agent 页面。设置默认作为岛屿的一页打开，带分类侧栏；需要时可在「设置 → 通用 → 独立设置窗口」改为单独窗口。

### 功能设置

- **QQ 和微信提醒**：首次默认开启。QQ 需要 Windows 通知访问权限，且 QQ 已登录并启用系统通知；微信需要电脑版保持登录并发出任务栏提醒。两个来源可分别在「设置 → 消息」或消息页面关闭。参见 [QQ 通知说明](docs/qq-notification-compatibility.md)和[微信提醒说明](docs/wechat-reminder-compatibility.md)。

- **AI 状态灯**：在「设置 → 连接」安装或修复 Codex / Claude Code 钩子，然后重启 Codex 或运行 Claude Code 的终端。Codex 首次使用钩子时按提示信任配置。详见 [AI Agent 状态灯说明](docs/agent-status-hooks.md)。

- **邮箱**：在邮箱网页设置中开启 IMAP 并生成授权码，然后在「设置 → 邮箱」填写邮箱地址和授权码（不是登录密码）。凭据保存在 Windows 凭据管理器。支持手动刷新、暂停接收和断开连接；首次同步不提醒历史邮件。详见[邮箱接入说明](docs/mail.md)。

- **快捷翻译**：默认按 `Ctrl+Shift+F` 打开。首次使用时在「设置 → 翻译」选择服务并填写 API 密钥，密钥保存在 Windows 凭据管理器；提交翻译时，原文会发送到所选服务。

- **剪贴板与文件中转**：在「设置 → 剪贴板与文件」调整是否记录、图片捕获、历史数量和唤出快捷键。历史记录保存在本机应用数据目录。

### 技术栈

- Tauri 2：Windows 桌面应用外壳和原生能力
- React 19 + TypeScript：前端界面和交互
- Rust：窗口、快捷键、剪贴板、媒体和文件等桌面能力
- pnpm：依赖安装与项目脚本

## 用户交流群

欢迎加入 **fly-island 用户交流群**，交流使用体验、反馈问题和分享建议。使用微信扫描下方二维码即可入群，也可以在应用的「设置 → 关于」里打开二维码。

<p align="center">
  <img src="docs/assets/wechat-community.jpg" alt="fly-island 微信用户交流群二维码" width="360">
</p>

二维码有有效期，当前图片标注为 **11 月 18 日前有效**；若已失效，可通过 [Issue](https://github.com/flyl1u/fly-island/issues) 反馈以便更新。

## 开发与构建

### 从源码构建

需要 Windows 10/11、Node.js、pnpm、Rust、Visual Studio C++ Build Tools 和 WebView2 Runtime。

```powershell
git clone https://github.com/flyl1u/fly-island.git
cd fly-island
pnpm install
pnpm tauri dev
```

运行统一检查：

```powershell
pnpm check
```

### 构建 Release

```powershell
pnpm tauri build
```

构建完成后，安装包位于：

- `src-tauri/target/release/bundle/nsis/fly-island_版本号_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/fly-island_版本号_x64_en-US.msi`

也可以直接从 [GitHub Releases](https://github.com/flyl1u/fly-island/releases/latest) 下载 Windows x64 安装包。

应用内更新（检查更新、签名与 `latest.json` 发布流程）见 [docs/updater.md](docs/updater.md)。

## 贡献致谢

感谢 [@TixXin](https://github.com/TixXin) 在 [PR #36](https://github.com/flyl1u/fly-island/pull/36) 中提出的模块化架构方案与实现。本地重构在当前主线上适配并复用了其中部分代码，来源与验证记录见[改造说明](docs/architecture/refactor-plan.md)。

## 开源协议

本项目采用 [MIT 协议](LICENSE)。

第三方依赖和内置资源仍遵循各自的许可证。内置字体的许可信息见[字体说明](src/assets/fonts/README.md)。随安装包附带的网易云进度插件 BetterNCM 与 InfLink-rs 采用 GPL-3.0，原样附带，许可证与源码链接见[插件说明](src-tauri/resources/media-plugins/README.md)。

## Star History

<a href="https://www.star-history.com/?repos=flyl1u%2Ffly-island&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=light&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=light&legend=top-left" />
  </picture>
</a>
