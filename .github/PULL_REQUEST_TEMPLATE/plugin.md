---
name: 插件贡献 / Plugin contribution
about: 基于小岛源码改造功能，附使用演示 / Upgrade an island feature from its source, with a demo
---

请先阅读[插件开发规范](../../docs/plugins/README.md)。**带「必填」的项目缺一项就不会审核。** 不要提交账号、密钥或私人数据。
Read the [plugin guide](../../docs/plugins/README.md). **PRs missing a required field are not reviewed.** Never include accounts, secrets or private data.

## 使用演示录屏链接（必填）/ Demo recording URL (required)

<!-- 公开链接（B 站、YouTube、网盘均可）。在真实小岛里录：改造前的样子 → 改造后怎么用 → 主要功能逐一演示。截图或单独程序的演示不能代替。遮住私人消息和账号。
A public link. Record inside the real island: before → how to use it after → each main feature. Screenshots or a standalone demo are not enough. Redact private messages and accounts. -->

## 作者（必填）/ Author (required)

<!-- 署名与 GitHub 用户名，多人逐一列出 / Credit name and GitHub handle for every author -->

## 联系方式（必填）/ Contact (required)

<!-- 一个公开、能联系到你的渠道 / A public channel where you can be reached -->

## GitHub 链接（必填）/ GitHub links (required)

<!-- 你的 GitHub 主页 + 插件代码所在仓库或分支 / Your GitHub profile + the repository or branch with the plugin -->

## 插件简介（必填）/ Plugin description (required)

<!-- 名字；一句话介绍；改造了小岛的哪个功能；装上后用户能感受到什么变化。会显示在插件列表里，请写得通俗。
Name; one-line pitch; which island feature it upgrades; what users notice once it is installed. Shown in the plugin list, so keep it plain. -->

## 改动说明（必填）/ What changed (required)

<!-- 改了哪些文件；哪几处是接入原功能的地方（适配成可选安装时要用）；是否新增存储 key、Tauri 命令、联网（列出域名）、读写文件（列出路径）。
Files changed; the hook points into the original feature (needed for the optional-install adaptation); any new storage keys, Tauri commands, network domains or file paths. -->

## 自测结果（必填）/ Self-test results (required)

<!-- pnpm check / pnpm build / pnpm test:regression（改了 Rust 再加 cargo test）的结果；手动测过的场景。
Results of pnpm check / pnpm build / pnpm test:regression (plus cargo test for Rust changes) and the scenarios you tried by hand. -->

## 截图与已知问题（可选）/ Screenshots and known issues (optional)

## 自检 / Checklist

- [ ] 改造的是小岛原有功能（或像原生功能一样融入的新能力），不是另开窗口或外挂界面。/ Upgrades an island feature (or adds one that fits in natively); no separate windows or bolted-on UI.
- [ ] 新逻辑尽量收拢在独立文件里，接入点已在上面列出；没装插件时原功能不受影响。/ New logic kept in its own files with hook points listed; the island is unchanged without the plugin.
- [ ] 没有改已保存数据的 key / 格式、Tauri 命令名、窗口名。/ No changes to saved data keys/formats, Tauri command names or window labels.
- [ ] 界面用小岛自己的组件和样式；深色 / 浅色、液态 / 磨砂玻璃、窄窗口都看过。/ Island components and styles only; checked dark/light, both glasses and narrow widths.
- [ ] 所有用户可见文字中英双语。/ Every visible string is in Chinese and English.
- [ ] 联网和读写文件都已声明；没有隐藏的采集、遥测或自动更新。/ Network and file access declared; no hidden collection, telemetry or self-updating.
- [ ] 没有提交可执行文件、构建产物、账号数据；没有改应用版本号。/ No binaries, build output or account data; app version unchanged.

由 flyl1u 审核并适配成可选安装后随版本上线；提交不保证合并或立即上线。
flyl1u reviews it and adapts it into an optional install before it ships; submission does not guarantee a merge or immediate release.
