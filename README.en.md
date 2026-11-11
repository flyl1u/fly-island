<div align="center">
  <img src="src-tauri/icons/mark.svg" alt="Fly Island logo" width="96" height="96">

  <h1>Fly Island</h1>

  <p>English · <a href="README.md">中文</a></p>

  <p>A desktop island for Windows: tasks, clipboard, messages, translation, music and AI status on one small island at the top of your screen.</p>

  <p>
    <a href="https://github.com/flyl1u/fly-island/releases/latest">Download</a>
    ·
    <a href="https://github.com/flyl1u/fly-island/issues">Report an issue</a>
    ·
    <a href="#community">Community</a>
  </p>

  <p>
    <img alt="Version" src="https://img.shields.io/github/v/release/flyl1u/fly-island?label=version">
    <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-0078D4">
    <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24C8DB">
  </p>
</div>

## What is this?

Fly Island is a lightweight, borderless, always-on-top floating island. It sits at the top of the screen, expands when you need it and tucks away when you are done, so the things you use all day are one glance away instead of one window switch away.

## Features

- **Tasks and notes**: today's tasks, the one you are focused on, a daily note and past archives.
- **Clipboard and file shelf**: text and image clipboard history; drop files on the island and drag them into another app later.
- **Messages**: QQ and WeChat alerts and several mailboxes, with mail you can read on the island, attachments and HTML bodies included.
- **Quick translation**: one shortcut away, with a choice of LLM translation services.
- **AI agents**: the state of your Claude Code and Codex sessions; approve their permission requests on the island, or click one to jump to its window.
- **Music**: control what is playing, with a live audio waveform and synced lyrics.

The look, size, tucking, shortcuts and every feature can be adjusted in Settings (opened on the island by default, or in a window of its own), and the app updates itself. Your data stays on your computer.

## Resource use

Collapsed and idle with no music playing (default settings): about 10% of one CPU core (about 0.5% of a 20-core machine in total) and about 330 MB of memory, most of it Windows' own WebView2 (the Edge engine). The Agent page reads the session list once a second, which measured at 0.1% of one core. How it was measured, with the numbers: [idle-usage.md](docs/investigations/idle-usage.md).

## Getting started

1. Download and install from [Releases](https://github.com/flyl1u/fly-island/releases/latest). The installers are not code-signed; if SmartScreen warns, choose "More info → Run anyway".
2. Move the pointer onto the island at the top of the screen to expand it; the gear button or the tray icon opens Settings.
3. Mail, translation and AI agents need a one-time setup in Settings. See [mail](docs/mail.md), [AI agents](docs/agent-status-hooks.md), [QQ](docs/qq-notification-compatibility.md) and [WeChat](docs/wechat-reminder-compatibility.md) (in Chinese).

## Origins

In the words of the author, [flyl1u](https://github.com/flyl1u):

> During everyday work and study, I often write Todo Lists in Obsidian, open music to block out noise, use translation websites, and copy or paste code, passwords, and document snippets.
>
> Switching between all those windows reduces efficiency and makes it easier to lose focus. I wanted to bring these frequent actions into one lightweight place.
>
> Apple's Dynamic Island was an inspiration: it gathers delivery updates, timers, media controls, and other information into one small surface. FocuSD follows the same idea for focused study and deep work. The name stands for **Focu Study and DeepWork**, and the app is built with the lightweight Tauri framework.

## Community

Join the **fly-island user group on WeChat** to discuss the app, report problems, and share suggestions. Scan the QR code below with WeChat to join.

<p align="center">
  <img src="docs/assets/wechat-community.jpg" alt="QR code for the fly-island WeChat user group" width="360">
</p>

The QR code expires; the current image says it is **valid before November 18**. If it has expired, please [open an issue](https://github.com/flyl1u/fly-island/issues) to request an update.

## Build from source

You need Windows 10/11, Node.js, pnpm, Rust, Visual Studio C++ Build Tools and WebView2 Runtime.

```powershell
git clone https://github.com/flyl1u/fly-island.git
cd fly-island
pnpm install
pnpm tauri dev      # development
pnpm tauri build    # installers
```

Built with Tauri 2, React 19 + TypeScript and Rust. Releases and in-app updates are described in [docs/updater.md](docs/updater.md) (in Chinese).

## License

[MIT](LICENSE). Third-party dependencies and bundled assets keep their own licenses; see the [font notices](src/assets/fonts/README.md) for bundled fonts.
