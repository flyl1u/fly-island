# Antigravity 会话与额度 / Antigravity sessions and quota

在「设置 → 插件」安装 Antigravity（作者 [lilipeng0615-cyber](https://github.com/lilipeng0615-cyber)），在「AI Agent → 会话来源」控制是否显示，在「额度环」勾选是否显示按模型的剩余额度。

仅当此来源安装且启用时才会读取：
- `~/.gemini/antigravity`、`antigravity-cli`、`antigravity-ide` 下的 `conversation_summaries.db`（只读，不创建锁文件，不执行 checkpoint；Antigravity 正在写入时可能看不到最新内容）和各会话 `transcript.jsonl` 的末尾部分。
- 额度：读取 `~/.gemini/antigravity/daemon/hub_*.json` 的连接信息，向 `127.0.0.1` 上的 Antigravity 语言服务器请求 `GetUserStatus`。端口必须确认由 Antigravity 进程监听，请求不走代理、不跟随重定向、最长 3 秒，失败时静默。

不会写文件、安装钩子，会话标题与回复也不会写入诊断日志。点击会话会切到已打开的 Antigravity 窗口；没有打开时不启动它。

In **Settings → Plugins**, install Antigravity by [lilipeng0615-cyber](https://github.com/lilipeng0615-cyber). Fly Island reads Antigravity's local conversation store read-only and, for quota, asks its language server on `127.0.0.1` only after confirming that the port belongs to an Antigravity process (no proxy, no redirects, 3-second limit, silent on failure). Nothing is read or requested while the plugin is not installed and enabled.
