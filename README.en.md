<div align="center">
  <img src="src-tauri/icons/mark.svg" alt="Fly Island logo" width="96" height="96">

  <h1>Fly Island</h1>

  <p>English · <a href="README.md">中文</a></p>

  <p>A Windows desktop productivity app that brings tasks, clipboard history, music, AI status, quick translation, and notifications to the top of your screen.</p>

  <p>
    <a href="https://island.flyliu.org/">Live Preview</a>
    ·
    <a href="https://github.com/flyl1u/fly-island/releases/latest">Download Release</a>
    ·
    <a href="https://github.com/flyl1u/fly-island/issues">Report an Issue</a>
    ·
    <a href="#community">Community</a>
  </p>

  <p>
    <img alt="Version" src="https://img.shields.io/github/v/release/flyl1u/fly-island?label=version">
    <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-0078D4">
    <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24C8DB">
    <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB">
  </p>
</div>

## What is this?

FocuSD Island is a Windows desktop productivity app. Its floating island brings together tasks and daily notes, clipboard history, music controls, AI coding assistant status, quick translation, and message notifications.

It runs as a lightweight, borderless, always-on-top floating island. Expand it when you need information, then return to the compact state and keep working.

## Why I built this

During everyday work and study, I often write Todo Lists in Obsidian, open music to block out noise, use translation websites, and copy or paste code, passwords, and document snippets.

Switching between all those windows reduces efficiency and makes it easier to lose focus. I wanted to bring these frequent actions into one lightweight place.

I thought of the iPhone's Dynamic Island, which gathers notifications, timers, media controls, and other information into a small island, shortening the path for us to get information. Thus, fly-island was born.

## Features

FocuSD brings frequent actions from separate windows into one compact island:

- **Tasks, daily notes, and archives**: manage today's tasks, mark them complete, set the active task, write a daily note, and browse saved days as cards or a timeline. Optionally carry unfinished tasks forward and save a day as Markdown.
- **Text and image clipboard history**: search copied content and notes, favorite common items, add notes, remove entries, and copy an item back to the clipboard. Configure image capture, history size, and the global shortcut.
- **Music and system audio**: control the Windows media session with previous, play/pause, and next actions; a live waveform reflects audio activity.
- **AI status light**: lifecycle hooks show whether Codex or Claude Code is running, complete, or needs attention. Install or repair the hooks from Settings.
- **DeepSeek quick translation**: open a separate translation window with a global shortcut, auto-detect Chinese/English or choose a direction, paste the latest clipboard text, and copy the result.
- **QQ, WeChat, and QQ Mail**: switch between QQ, WeChat, and Mail from one row of brand tabs, with source actions alongside them. Review the latest 20 QQ notifications or emails, and open email bodies inside the island before returning to the list.
- **Island appearance and startup**: choose classic or liquid-glass styling and system or pixel fonts; adjust size, opacity, colors, and top spacing; save up to six custom style presets, hide the island title, or enable launch at startup.

Tasks, clipboard history, and app preferences stay on the device. WeChat reminders do not read chat text, sender names, or exact unread counts. QQ notifications stay in memory for the current run; QQ Mail syncs only headers in the background and reads bodies on demand into memory. It does not download attachments, load remote images, or change read status.

## Getting started

Expand the island to switch between tasks, music, clipboard, and messages. The settings button opens a separate window with category navigation. New installations use classic appearance, hide the island title, and display task text in white.

### Feature setup

- **QQ and WeChat reminders** are enabled by default. QQ needs Windows notification access, and QQ must be signed in with system notifications enabled. WeChat must be running and issue a taskbar-attention request. Pause either source in **Settings → Notifications** or from the message panel. See the [QQ notification guide (Chinese)](docs/qq-notification-compatibility.md) and [WeChat reminder guide (Chinese)](docs/wechat-reminder-compatibility.md).

- **QQ Mail** connects from the message panel. Enable IMAP in QQ Mail settings, generate an authorization code, then enter your `@qq.com` address and that code (not your QQ login password). The code is stored in Windows Credential Manager. You can refresh, pause receiving, or disconnect to delete the code. Initial sync does not replay old mail. See the [QQ Mail setup guide (Chinese)](docs/qq-mail.md).

- **Quick translation** opens with **Alt+C** by default. Add a DeepSeek API key in the translator settings; it is stored in Windows Credential Manager. Text is sent to the DeepSeek API when you request a translation. Choose automatic detection or a direction, and press **Tab** in the input to paste the latest clipboard text.

- **AI status light**: open **Settings → AI Agent 状态灯** and choose **安装/修复**. Restart Codex and any terminal running Claude Code; trust the new Codex hooks when prompted. See the [AI Agent status guide (Chinese)](docs/agent-status-hooks.md).

- **Clipboard history** captures text and, when enabled, images. Search, favorite, annotate, and copy entries from the clipboard panel. Configure capture settings, history limit, and global shortcut in Settings.

### Tech stack

- Tauri 2 for the Windows desktop shell and native capabilities
- React 19 + TypeScript for the interface and interactions
- Rust for windows, shortcuts, clipboard, media, and file capabilities
- pnpm for dependency management and project scripts

## Community

Join the **fly-island user group on WeChat** to discuss the app, report problems, and share suggestions. Scan the QR code below with WeChat to join.

<p align="center">
  <img src="docs/assets/wechat-community.jpg" alt="QR code for the fly-island WeChat user group" width="360">
</p>

The QR code expires; the current image says it is **valid before November 11**. If it has expired, please [open an issue](https://github.com/flyl1u/fly-island/issues) to request an update.

## Development and build

### Build from source

You need Windows 10/11, Node.js, pnpm, Rust, Visual Studio C++ Build Tools, and WebView2 Runtime.

```powershell
git clone https://github.com/flyl1u/fly-island.git
cd fly-island
pnpm install
pnpm tauri dev
```

Run the unified checks:

```powershell
pnpm check
```

### Build a release

```powershell
pnpm tauri build
```

The generated installers are placed in:

- `src-tauri/target/release/bundle/nsis/fly-island_VERSION_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/fly-island_VERSION_x64_en-US.msi`

You can also download the latest Windows x64 installers from [GitHub Releases](https://github.com/flyl1u/fly-island/releases/latest).

## Contributors

Thanks to [@TixXin](https://github.com/TixXin) for the modular architecture and implementation in [PR #36](https://github.com/flyl1u/fly-island/pull/36). The local refactor adapts and reuses parts of that work on the current main branch; see the [provenance and validation notes](docs/architecture/local-refactor.md).

## License

This project is licensed under the [MIT License](LICENSE).

Third-party dependencies and bundled assets retain their respective licenses. See the [font notices](src/assets/fonts/README.md) for bundled fonts.

## Star History

<a href="https://www.star-history.com/?repos=flyl1u%2Ffly-island&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=light&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=light&legend=top-left" />
  </picture>
</a>
