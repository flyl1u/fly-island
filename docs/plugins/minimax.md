# MiniMax Code

作者 / Author [YTC0408](https://github.com/YTC0408) · [Fly Island #110](https://github.com/flyl1u/fly-island/pull/110)

插件市场中显示「开发中」，暂未开放安装。启用后，AI 会话页显示 MiniMax Code 最近会话与可用额度。默认读取本机 MiniMax CLI 的登录信息，亦可在插件设置填写 Token Plan 密钥。额度查询只发送到 MiniMax 官方的 HTTPS 域名。会话库以只读方式打开，任务进度只读取相应会话目录的近期记录。

在插件设置选择「把审批提醒接入 MiniMax Code」才会注册提醒。标记按会话清理，等待 30 分钟后过期。可在设置中解除接入，卸载也会清理插件登记的钩子。审批动作仍由 MiniMax Code 执行。

Listed as In development in the plugin market; installation is unavailable. When enabled, the plugin shows recent sessions and Token Plan allowance. The optional key overrides local MiniMax CLI sign-in; credentials go only to MiniMax's official HTTPS endpoints. Approval notifications require explicitly connecting the hooks in plugin settings. Each session has its own pending mark, which expires after 30 minutes. Approvals are completed in MiniMax Code.
