<div align="center">
  <img src="src-tauri/icons/mark.svg" alt="Fly Island logo" width="96" height="96">

  <h1>Fly Island</h1>

  <p><a href="README.en.md">English</a> · 中文</p>

  <p>Windows 上的桌面灵动岛：待办、剪贴板、消息、翻译、音乐和 AI 状态，都在屏幕顶部的一座小岛上。</p>

  <p>
    <a href="https://github.com/flyl1u/fly-island/releases/latest">下载</a>
    ·
    <a href="https://github.com/flyl1u/fly-island/issues">反馈问题</a>
    ·
    <a href="#用户交流群">用户交流群</a>
  </p>

  <p>
    <img alt="Version" src="https://img.shields.io/github/v/release/flyl1u/fly-island?label=version">
    <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-0078D4">
    <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24C8DB">
  </p>
</div>

## 这是什么

Fly Island 是一座轻量、无边框、始终置顶的悬浮岛。平时收在屏幕顶部，需要时展开，用完自动收回。常用的东西都放在岛上，不用为了看一眼信息来回切窗口。

## 功能

- **待办与笔记**：每天的任务、当前专注的事项、每日笔记和历史归档。
- **剪贴板与文件中转**：图文剪贴板历史；把文件先拖到岛上暂存，再拖去别的程序。
- **消息**：QQ、微信提醒和多个邮箱，邮件可以直接在岛上阅读和回复。
- **快捷翻译**：一个快捷键打开，支持多家大模型翻译服务。
- **AI Agent**：显示 Claude Code 和 Codex 会话的运行状态，点一下切到对应窗口。
- **音乐**：控制正在播放的媒体，显示音频波形。
- **插件**：从插件市场安装插件来扩展岛屿，敏感数据需要你单独授权。

岛屿的外观、大小、收起方式、快捷键和每个功能都可以在设置窗口里调整，支持应用内自动更新。数据都保存在本机。

## 占用

收起、闲着、不放音乐时（默认设置，不装插件）：CPU 约占单核的 10%（20 核电脑上约占总量的 0.5%），内存约 330 MB，其中大部分是 Windows 自带的 WebView2（Edge 内核）。Agent 页每秒刷新一次会话列表，实测只占单核的 0.1%。每装一个 PowerShell 插件约多 60 MB。测量方法和数据见 [idle-usage.md](docs/investigations/idle-usage.md)。

## 上手

1. 从 [Releases](https://github.com/flyl1u/fly-island/releases/latest) 下载安装包并安装（安装包没有代码签名，SmartScreen 提示时点「更多信息 → 仍要运行」）。
2. 鼠标移到屏幕顶部的岛上即可展开，点齿轮或托盘图标打开设置。
3. 邮箱、翻译和 AI Agent 需要先在设置里配置一次，具体见各自的说明：[邮箱](docs/mail.md)、[AI Agent](docs/agent-status-hooks.md)、[QQ 通知](docs/qq-notification-compatibility.md)、[微信提醒](docs/wechat-reminder-compatibility.md)。

想自己写插件，见 [插件文档](docs/plugins/README.md)。

## 项目起源

以下是作者 [flyl1u](https://github.com/flyl1u) 写下的初衷：

> 日常工作或学习过程中，我经常需要在某软件写下 Todo List，为了隔绝噪音，我会打开音乐软件并把音量调到合适的临界点，工作和学习又经常需要借助翻译网站，同时还会反复复制和粘贴代码，与此同时难以避免的是接收不同群聊、好友发送的消息
>
> 在这些界面之间来回切换，不仅会降低效率，也容易让人分心，因此我开始思考：能不能把这些高频功能集成到一个足够轻量的地方？
>
> 我想到了iPhone的灵动岛，它把消息通知、计时器、媒体控制等信息集中到一个小岛上，缩短了我们获取信息的路程。于是，FocuSD 诞生了。这个名字寓意 **Focu Study and DeepWork**，专注学习和深度工作，项目使用更轻量的 Tauri 架构开发，不过目前已改名为fly-island

## 用户交流群

欢迎加入 **fly-island 用户交流群**，交流使用体验、反馈问题和分享建议。使用微信扫描下方二维码即可入群。

<p align="center">
  <img src="docs/assets/wechat-community.jpg" alt="fly-island 微信用户交流群二维码" width="360">
</p>

二维码有有效期，当前图片标注为 **11 月 11 日前有效**；若已失效，可通过 [Issue](https://github.com/flyl1u/fly-island/issues) 反馈以便更新。

## 从源码构建

需要 Windows 10/11、Node.js、pnpm、Rust、Visual Studio C++ Build Tools 和 WebView2 Runtime。

```powershell
git clone https://github.com/flyl1u/fly-island.git
cd fly-island
pnpm install
pnpm tauri dev      # 开发模式
pnpm tauri build    # 打包安装程序
```

技术栈：Tauri 2、React 19 + TypeScript、Rust。发布与应用内更新见 [docs/updater.md](docs/updater.md)。

## 开源协议

[MIT](LICENSE)。第三方依赖和内置资源遵循各自的许可证，内置字体见[字体说明](src/assets/fonts/README.md)。
