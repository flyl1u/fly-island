# 随安装包附带的网易云进度插件 / Bundled NetEase progress plugin

岛屿“一键启用”网易云精准进度时，直接使用这里的文件，不再联网下载。文件原样取自上游发布，
大小和 SHA256 与 `src-tauri/src/media_plugins/manifest.rs` 中的清单一致，安装前会再次校验。
它们与岛屿只是放在同一个安装包里分发，岛屿本身不链接这些代码。

| 文件 | 上游 | 版本 | 许可证 | 源代码 |
|---|---|---|---|---|
| `BetterNCMII.dll`（x64）、`BetterNCMII86.dll`（x86） | BetterNCM（现名 chromatic） | 1.3.4 | GPL-3.0 | https://github.com/std-microblock/chromatic/tree/1.3.4 |
| `InfLink-rs.plugin` | InfLink-rs | v3.4.0 | GPL-3.0 | https://github.com/apoint123/inflink-rs/tree/v3.4.0 |

许可证全文见 `LICENSE-GPL-3.0.txt`。

These files are shipped unmodified from the upstream releases above and are verified against the
pinned sizes and SHA-256 hashes before installation. They are distributed alongside the island
(mere aggregation); the island does not link them. Source code is available at the links above;
the full license text is in `LICENSE-GPL-3.0.txt`.
