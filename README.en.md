<div align="center">
  <img src="src-tauri/icons/mark.svg" alt="Fly Island logo" width="96" height="96">

  <h1>fly-island</h1>

  <p>An ultra-lightweight Dynamic Island for Windows: WeChat, QQ and mail messages, multi-session AI agents with quota rings, a music player, to-dos, clipboard history, a file shelf and more. It expands when needed and tucks away when done.</p>

  <p>
    <a href="https://island.flyliu.org/">Live Preview</a>
    ·
    <a href="https://github.com/flyl1u/fly-island/releases/latest">Download Release</a>
    ·
    <a href="https://github.com/flyl1u/fly-island/issues">Report an Issue</a>
    ·
    <a href="#community">Community</a>
    ·
    English · <a href="README.md">中文</a>
  </p>

  <p>
    <img alt="Version" src="https://img.shields.io/github/v/release/flyl1u/fly-island?label=version">
    <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-0078D4">
    <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24C8DB">
    <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB">
    <img alt="License" src="https://img.shields.io/badge/license-GPL--3.0-blue">
  </p>

  <a href="https://island.flyliu.org/">
    <img src="docs/assets/promo-preview.webp" alt="fly-island promo: WeChat messages on the island, approving a Claude Code permission request, Claude and Codex usage, the file shelf, tasks, music and translation" width="860">
  </a>

  <p><sub>Click to open the live preview and try it without installing (video captions are in Chinese)</sub></p>

  <p>If it saves you a few window switches, a ⭐ <b>Star</b> helps more people find it.</p>
</div>

## What is this?

fly-island is a Windows-first Dynamic Island. WeChat, QQ and mail messages pop up right on the island. You can see at a glance what Claude Code, Codex or DSH is doing and whether it needs your approval. Synced lyrics, a file shelf, clipboard history, quick translation and to-dos all live in the same small island at the top of the screen.

It is an ultra-light, frameless, always-on-top island using about 0.2–0.5% of memory. It expands when you need it and tucks away when you are done.

Want to try it first? The [live preview](https://island.flyliu.org/) runs the real island interface with demo data, and you can click around.

## Why I built this

While working or studying I keep a to-do list in one app, music in another to block out noise and a translation site in a third. I copy and paste code all day and still get pulled into group chats. Switching between all of them is slow and distracting.

The iPhone's Dynamic Island gathers notifications, timers and media controls into one small place. I wanted the same for these high-frequency tasks on Windows, in something light enough to keep open all day. That became fly-island.

## Features

### 💬 Messages
- **WeChat and QQ**: new messages pop up on the island with source, contact, time and content. With adaptive previews on, long messages grow the island so you can read them in place, and the text can be selected and copied. Muted WeChat chats only alert you when someone @mentions you.
- **Mail**: multiple IMAP accounts (QQ, 163, 126 and more). Read mail right on the island and select or copy its text.

### 🤖 AI agents
- Claude Code / Claude desktop, Codex and DeepSeek Harness sessions show on the island live, including background tasks.
- Allow or deny an agent's command or file edit right on the island. A soft chime plays when it finishes or needs an answer, and clicking a session jumps to its window.
- Claude / Codex quota rings and the DSH balance ring. See [AI agent status](docs/agent-status-hooks.md) and [DSH integration](docs/deepseek-harness.md).

### 🎵 Music and lyrics
- Control playback through Windows media sessions, with cover art, waveform, progress and synced lyrics. The current line also shows on the collapsed island.
- Rank or archive players. NetEase Cloud Music can get precise progress with a one-click plugin bundled in the installer.

### 📋 Productivity
- **To-dos, notes and calendar**: today's tasks, drag to reorder and schedule tasks for later days. Daily notes, history and calendar views, optional timers with end-of-timer reminders, and saving as Markdown.
- **Clipboard history**: text, images and files. Filter by type, search, favourite, add notes and copy back in one click. Open it on the island or in its own window.
- **File shelf**: drop files on the island, switch windows, then drag them out, copy or open them. Only paths are kept, never copies. See [file shelf](docs/file-shelf.md).
- **Quick translation**: a global shortcut with automatic Chinese / English direction. Key-free Google Translate and MyMemory work out of the box, and DeepSeek, Qwen, Kimi, OpenAI and other LLM APIs are supported.

### 🎨 Look and behaviour
- Classic, Liquid glass and Frosted glass materials; the glass blurs whatever is behind the island, live. Dark, light or follow the system.
- Size, corners, colours, font and what the collapsed island shows are all adjustable, and a whole look can be saved as a preset.
- Tuck to the edge when idle, game mode (stays out of full-screen games), position lock, launch at startup, and a Chinese or English interface.
- **Auto-update**: checks and downloads in the background and installs while the island is idle. You can also check manually in Settings → About.

## Getting started

1. Download the installer (`fly-island_<version>_x64-setup.exe`) from [Releases](https://github.com/flyl1u/fly-island/releases/latest). The island appears at the top of the screen; hover to expand it.
2. Turn on what you need, all in Settings:

| Feature | How |
| --- | --- |
| QQ alerts | Needs Windows notification access, with QQ signed in and system notifications on. See [QQ notifications](docs/qq-notification-compatibility.md) |
| WeChat alerts | Keep desktop WeChat signed in so it can flash the taskbar. See [WeChat reminders](docs/wechat-reminder-compatibility.md) |
| Mail | Enable IMAP in your mail web settings, create an app password and enter it in Settings → Mail (not your sign-in password). See [mail](docs/mail.md) |
| AI status light | Install / repair hooks in Settings → Agents, then restart Codex or the terminal running Claude Code |
| Quick translation | `Ctrl+Shift+F` by default. Key-free services work out of the box; LLM services need an API key in Settings → Translation |

### Privacy

To-dos, clipboard history and settings stay on your computer. QQ notifications and WeChat summaries live only in memory for the current run. Mail syncs headers in the background and reads bodies into memory on demand, without changing read status. Keys and app passwords are stored in Windows Credential Manager.

## Community

Join the **fly-island user group** to share feedback and ideas. Scan the QR code below with WeChat, or open it from Settings → About in the app.

<p align="center">
  <img src="docs/assets/wechat-community.jpg" alt="fly-island WeChat user group QR code" width="360">
</p>

The QR code expires (currently marked **valid until 23 November**). If it has expired, please let us know in an [issue](https://github.com/flyl1u/fly-island/issues).

## Contributing

### Run from source

Requires Windows 10/11, Node.js, pnpm, Rust, Visual Studio C++ Build Tools and the WebView2 Runtime.

```powershell
git clone https://github.com/flyl1u/fly-island.git
cd fly-island
pnpm install
pnpm tauri dev
```

Run `pnpm check` before submitting, and build installers with `pnpm tauri build` (output in `src-tauri/target/release/bundle/`). Repository rules are in [AGENTS.md](AGENTS.md); in-app updates and releasing are in [docs/updater.md](docs/updater.md).

### Build a plugin

A plugin is a feature built from the island's source. It can upgrade an existing feature (for example, Markdown in the daily note) or add a brand-new one, and it becomes part of the island once installed. Plugins are optional and downloaded on demand. They are coming soon: start now with the [plugin guide](docs/plugins/README.md) and open a PR with a demo recording, author, contact and GitHub link. flyl1u reviews it, adapts it and ships it.

## Acknowledgements

Thanks to [@TixXin](https://github.com/TixXin) for the modular architecture proposed and implemented in [PR #36](https://github.com/flyl1u/fly-island/pull/36). The local refactor adapted and reused parts of it, as recorded in the [refactor notes](docs/architecture/refactor-plan.md).

## License

Licensed under [GPL-3.0](LICENSE): you may use, modify and redistribute it, and distributed modified versions must also be GPL-3.0 with source code. Versions 3.0.8 and earlier were released under MIT and remain available under MIT.

Copyright (C) 2026 flyl1u and contributors. Third-party dependencies and bundled assets keep their own licenses. See the [font notes](src/assets/fonts/README.md). The bundled NetEase progress plugins BetterNCM and InfLink-rs are GPL-3.0; see the [plugin notes](src-tauri/resources/media-plugins/README.md).

## Star History

If fly-island is useful to you, a [Star](https://github.com/flyl1u/fly-island/stargazers) is the best encouragement.

<a href="https://www.star-history.com/?repos=flyl1u%2Ffly-island&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=light&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=flyl1u/fly-island&type=date&theme=light&legend=top-left" />
  </picture>
</a>
