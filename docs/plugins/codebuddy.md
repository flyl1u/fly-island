# CodeBuddy 会话 / CodeBuddy sessions

在「设置 → 插件」安装 CodeBuddy（作者 [yiumanlenong](https://github.com/yiumanlenong)、[flyliu](https://github.com/flyl1u)），在「AI Agent → 会话来源」控制是否显示。打开 CodeBuddy CLI 发出一条指令后，Fly Island 的 Agent 页会显示会话标题、模型、上下文与当前工具。点击仍在运行的会话，会尝试聚焦其终端；没有对应窗口时不会启动程序。

仅当此来源安装且启用时，Fly Island 才扫描 `~/.codebuddy/projects` 和 `~/.codebuddy/sessions`，最多两秒一次。不会安装钩子、写入文件、查询额度或管理审批。目录不存在时不显示会话。

In **Settings → Plugins**, install CodeBuddy by [yiumanlenong](https://github.com/yiumanlenong). Its switch appears under **AI Agent → Session sources**. Run a prompt in the CodeBuddy CLI to see the session, model, context, and current tool. Clicking an open session attempts to focus its terminal. Fly Island only reads the local CodeBuddy folders while the source is active; it never writes files, installs hooks, or makes a network request for CodeBuddy.
