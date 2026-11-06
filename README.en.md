<div align="center">
  <img src="src-tauri/icons/mark.svg" alt="Fly Island logo" width="96" height="96">

  <h1>Fly Island</h1>

  <p>English · <a href="README.md">中文</a></p>

  <p>A desktop island for Windows: tasks, clipboard, messages, translation, music and AI status on one small island at the top of your screen.</p>

  <p>
    <a href="https://github.com/TixXin/fly-island/releases/latest">Download</a>
    ·
    <a href="https://github.com/TixXin/fly-island/issues">Report an issue</a>
  </p>

  <p>
    <img alt="Version" src="https://img.shields.io/github/v/release/TixXin/fly-island?label=version">
    <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-0078D4">
    <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24C8DB">
  </p>
</div>

> [!NOTE]
> This repository is an independently maintained version of [flyl1u/fly-island](https://github.com/flyl1u/fly-island). It branched from upstream 0.2.14 and has its own release line and update channel from 0.3.0 on. You can install it over the upstream version; your data and settings are kept.

## What is this?

Fly Island is a lightweight, borderless, always-on-top floating island. It sits at the top of the screen, expands when you need it and tucks away when you are done, so the things you use all day are one glance away instead of one window switch away.

## Features

- **Tasks and notes**: today's tasks, the one you are focused on, a daily note and past archives.
- **Clipboard and file shelf**: text and image clipboard history; drop files on the island and drag them into another app later.
- **Messages**: QQ and WeChat alerts and several mailboxes, with mail you can read and answer on the island.
- **Quick translation**: one shortcut away, with a choice of LLM translation services.
- **AI agents**: the state of your Claude Code and Codex sessions; click one to jump to its window.
- **Music**: control what is playing, with a live audio waveform.
- **Plugins**: extend the island from the plugin market; sensitive data needs your permission.

The look, size, tucking, shortcuts and every feature can be adjusted in the Settings window, and the app updates itself. Your data stays on your computer.

## Getting started

1. Download and install from [Releases](https://github.com/TixXin/fly-island/releases/latest). The installers are not code-signed; if SmartScreen warns, choose "More info → Run anyway".
2. Move the pointer onto the island at the top of the screen to expand it; the gear button or the tray icon opens Settings.
3. Mail, translation and AI agents need a one-time setup in Settings. See [mail](docs/mail.md), [AI agents](docs/agent-status-hooks.md), [QQ](docs/qq-notification-compatibility.md) and [WeChat](docs/wechat-reminder-compatibility.md) (in Chinese).

To write your own plugin, see the [plugin docs](docs/plugins/README.md).

## Origins

In the words of the upstream author, [flyl1u](https://github.com/flyl1u):

> During everyday work and study, I often write Todo Lists in Obsidian, open music to block out noise, use translation websites, and copy or paste code, passwords, and document snippets.
>
> Switching between all those windows reduces efficiency and makes it easier to lose focus. I wanted to bring these frequent actions into one lightweight place.
>
> Apple's Dynamic Island was an inspiration: it gathers delivery updates, timers, media controls, and other information into one small surface. FocuSD follows the same idea for focused study and deep work. The name stands for **Focu Study and DeepWork**, and the app is built with the lightweight Tauri framework.

## Build from source

You need Windows 10/11, Node.js, pnpm, Rust, Visual Studio C++ Build Tools and WebView2 Runtime.

```powershell
git clone https://github.com/TixXin/fly-island.git
cd fly-island
pnpm install
pnpm tauri dev      # development
pnpm tauri build    # installers
```

Built with Tauri 2, React 19 + TypeScript and Rust. Releases and in-app updates are described in [docs/updater.md](docs/updater.md) (in Chinese).

## License

[MIT](LICENSE), based on [flyl1u/fly-island](https://github.com/flyl1u/fly-island) and keeping the upstream copyright notice. Third-party dependencies and bundled assets keep their own licenses; see the [font notices](src/assets/fonts/README.md) for bundled fonts.
