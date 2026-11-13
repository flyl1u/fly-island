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
    <img alt="License" src="https://img.shields.io/badge/license-GPL--3.0-blue">
  </p>
</div>

## What is this?

FocuSD Island is a Windows-first Dynamic Island for your desktop. WeChat, QQ and mail messages pop up right on the island, and you can see at a glance what Claude Code / Codex is doing and whether it needs your approval. Synced lyrics, a file shelf, clipboard history, quick translation and tasks join them in one small island at the top of the screen.

It runs as a lightweight, borderless, always-on-top floating island. Expand it when you need information, then return to the compact state and keep working.

To see it first, open the [live preview](https://island.flyliu.org/): the real island interface running on demo data.

## Why I built this

During everyday work and study, I often write Todo Lists in Obsidian, open music to block out noise, use translation websites, and copy or paste code, passwords, and document snippets.

Switching between all those windows reduces efficiency and makes it easier to lose focus. I wanted to bring these frequent actions into one lightweight place.

I thought of the iPhone's Dynamic Island, which gathers notifications, timers, media controls, and other information into a small island, shortening the path for us to get information. Thus, fly-island was born.

## Features

FocuSD brings frequent actions from separate windows into one compact island:

- **WeChat, QQ, and mail**: new WeChat and QQ messages pop up right on the island as one card each, with source, contact, time, and text, so you don't have to switch over. Muted WeChat chats only notify when someone mentions you, and conversation names with message previews can be turned on (experimental). Connect several IMAP mailboxes (QQ, 163, 126 and others) and read mail right on the island.
- **AI agents**: live sessions from Claude Code / Claude desktop, Codex and DeepSeek Harness (DSH, including DataElement / anywhere-labs community desktops) show on the island. When an agent wants to run a command or edit files, allow or deny it right there; a soft chime tells you when a task is done or needs an answer, and clicking a session jumps to its window. Shows Claude/Codex quota rings and a DSH balance ring. See the [AI Agent status guide (Chinese)](docs/agent-status-hooks.md) and [DSH integration and limitations](docs/deepseek-harness.md).
- **Music and lyrics**: control playback through the Windows media session, with cover art, a waveform, a progress bar, and synced lyrics, including the current line on the collapsed island. Reorder player priority. When a player reports no progress, the bar is marked as estimated and clicking a lyric line recalibrates it.
  Enable precise NetEase progress from the tip card on the island or Settings → Music → Player compatibility, with one-click installation and removal of InfLink-rs and BetterNCM. The GPL-3.0 components ship with the app and are verified against pinned fingerprints, so nothing is downloaded. You can install while NetEase is running and restart it with one click. Supports 3.x x64 and 2.10.13 x86; some 3.x versions are untested.
- **File shelf**: drop files on the island, switch windows, then drag them out, copy, or open them; only paths are stored, files are never copied. See the [file shelf guide (Chinese)](docs/file-shelf.md).
- **Text and image clipboard history**: search copied content and notes, favorite common items, add notes, and copy an item back to the clipboard. Configure image capture, history size, and the global shortcut.
- **Quick translation**: open it with a global shortcut, on the island or in its own window. Works with DeepSeek, Volcano Ark, Qwen (DashScope), Kimi, SiliconFlow, OpenAI, or a custom OpenAI-compatible endpoint; detects Chinese/English automatically or uses a chosen direction.
- **Tasks, notes, and calendar**: manage today's tasks, set the active task, and drag to reorder, with a progress bar at the top; schedule tasks for a later day. Switch between Tasks, Daily note, History, and Calendar from the top-left; the calendar marks days that have tasks. Optionally carry unfinished tasks forward and save tasks and notes as Markdown.
- **Task countdown (off by default)**: turn it on in Settings → Todos to give each task its own countdown; the island opens and rings when time is up. See the [task countdown guide (Chinese)](docs/todo-timer.md).
- **Appearance and behavior**: classic or liquid-glass styling, default or pixel font, size, opacity, colors, and position; page buttons as icons or capsules, and drag to choose what the collapsed island shows and in which order. Lock the position, tuck to the screen edge when idle, game mode, launch at startup, and a Chinese or English interface.
- **Automatic updates**: checks at startup and downloads new versions in the background; a restart button appears in the task list. Settings → About shows the changelog for every version.

Tasks, clipboard history, and app preferences stay on the device. WeChat can show conversation names and recent message previews (experimental) when enabled in Settings; previews and QQ notifications stay in memory for the current run. Mail syncs only headers in the background and reads bodies on demand into memory, without changing read status.

## Getting started

Expand the island and use the page buttons at the top to switch between tasks, music, clipboard, file shelf, translation, messages, and AI agents. Settings opens as a page of the island with category navigation; switch it to a separate window in Settings → General → Separate settings window.

### Feature setup

- **QQ and WeChat reminders** are enabled by default. QQ needs Windows notification access, and QQ must be signed in with system notifications enabled. WeChat must be running and issue a taskbar-attention request. Pause either source in **Settings → Messages** or from the message panel. See the [QQ notification guide (Chinese)](docs/qq-notification-compatibility.md) and [WeChat reminder guide (Chinese)](docs/wechat-reminder-compatibility.md).

- **AI status light**: install or repair the Codex / Claude Code hooks in **Settings → Connection**, then restart Codex and any terminal running Claude Code; trust the new Codex hooks when prompted. See the [AI Agent status guide (Chinese)](docs/agent-status-hooks.md).

- **Mail**: enable IMAP in your mailbox's web settings and generate an authorization code, then enter the address and that code (not your login password) in **Settings → Mail**. The code is stored in Windows Credential Manager. You can refresh, pause receiving, or disconnect; initial sync does not replay old mail. See the [mail setup guide (Chinese)](docs/mail.md).

- **Quick translation** opens with **Ctrl+Shift+F** by default. Pick a service and add its API key in **Settings → Translation**; keys are stored in Windows Credential Manager, and text is sent to the chosen service when you translate.

- **Clipboard and file shelf**: configure capture, images, history size, and the shortcut in **Settings → Clipboard & files**. History is stored in the app data folder on this PC.

### Tech stack

- Tauri 2 for the Windows desktop shell and native capabilities
- React 19 + TypeScript for the interface and interactions
- Rust for windows, shortcuts, clipboard, media, and file capabilities
- pnpm for dependency management and project scripts

## Community

Join the **fly-island user group on WeChat** to discuss the app, report problems, and share suggestions. Scan the QR code below with WeChat to join, or open it from Settings → About in the app.

<p align="center">
  <img src="docs/assets/wechat-community.jpg" alt="QR code for the fly-island WeChat user group" width="360">
</p>

The QR code expires; the current image says it is **valid before November 18**. If it has expired, please [open an issue](https://github.com/flyl1u/fly-island/issues) to request an update.

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

Thanks to [@TixXin](https://github.com/TixXin) for the modular architecture and implementation in [PR #36](https://github.com/flyl1u/fly-island/pull/36). The local refactor adapts and reuses parts of that work on the current main branch; see the [provenance and validation notes](docs/architecture/refactor-plan.md).

## License

This project is licensed under the [GNU General Public License v3.0 (GPL-3.0)](LICENSE). You are free to use, modify, and redistribute it; if you distribute a modified version, it must also be released under GPL-3.0 with its source code.

Copyright (C) 2026 flyl1u and contributors. Versions 3.0.8 and earlier were released under the MIT License and remain available under it.

Third-party dependencies and bundled assets retain their respective licenses. See the [font notices](src/assets/fonts/README.md) for bundled fonts. The NetEase progress plugins shipped with the installer, BetterNCM and InfLink-rs, are GPL-3.0 and included unmodified; see the [plugin notice](src-tauri/resources/media-plugins/README.md) for licenses and source links.

## Star History

<a href="https://www.star-history.com/?repos=flyl1u%2Ffly-island&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=light&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=light&legend=top-left" />
  </picture>
</a>
