# Antigravity 会话与额度 / Antigravity sessions and quota

在「设置 → 插件」安装 Antigravity（作者 [lilipeng0615-cyber](https://github.com/lilipeng0615-cyber)），在「AI Agent → 会话来源」控制是否显示，在「额度环」勾选是否显示按模型的剩余额度。

仅当此来源安装且启用时才会读取：
- `~/.gemini/antigravity`、`antigravity-cli`、`antigravity-ide` 下的 `conversation_summaries.db` 和各会话 `transcript.jsonl` 的末尾部分（读法见下一节）。
- 额度：读取 `~/.gemini/antigravity/daemon/hub_*.json` 的连接信息，向 `127.0.0.1` 上的 Antigravity 语言服务器请求 `GetUserStatus`。端口必须确认由 Antigravity 进程监听，请求不走代理、不跟随重定向、最长 3 秒，失败时静默。


## 读取方式与延迟

- Antigravity 用 WAL 模式持续写 `conversation_summaries.db`：新状态先进 `conversation_summaries.db-wal`，默认累积约 4 MB（1000 页）才合并进主库。3.3.0 之前用 `immutable=1` 打开主库会忽略 WAL，实测夹具里要连续提交 1000 次后才第一次看到变化，表现为任务早已结束岛上才更新。
- 现在把主库和 `-wal` 复制到系统临时目录下我们自己新建的文件夹（`fly-island-sqlite-<进程号>-…`），读副本，读完立即删除。`-shm` 只是索引，SQLite 会按 WAL 重建，所以不复制。原文件只以读方式打开，不阻止 Antigravity 写入、改名和删除；不在它的目录里创建任何文件，不加 SQLite 锁，不执行 checkpoint。仍然拒绝重解析点（链接 / junction），只读 Antigravity 自己的目录；主库或 WAL 超过 64 MB 时不读。
- 复制期间主库发生变化（正在 checkpoint）就重试，最多 3 次；这次读不出时沿用上一次的结果，下一次轮询再试。
- 增量：主库和 WAL 的大小、修改时间都没变时不复制、不查询；`transcript.jsonl` 大小和修改时间没变时不重新解析。
- 延迟预期：岛每秒读一次会话（此来源不再另加 2 秒缓存），复制并读出一次约十几毫秒，所以 Antigravity 写下新状态后约 1–2 秒内反映到岛上。Antigravity 自己何时写下状态不在岛的控制之内。

不会写 Antigravity 的文件、安装钩子，会话标题与回复也不会写入诊断日志。点击会话会切到已打开的 Antigravity 窗口；没有打开时不启动它。

In **Settings → Plugins**, install Antigravity by [lilipeng0615-cyber](https://github.com/lilipeng0615-cyber). Fly Island reads Antigravity's local conversation store read-only and, for quota, asks its language server on `127.0.0.1` only after confirming that the port belongs to an Antigravity process (no proxy, no redirects, 3-second limit, silent on failure). Nothing is read or requested while the plugin is not installed and enabled.
