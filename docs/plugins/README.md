# 插件 / Plugins

插件是按需安装的 Windows 进程。主程序不编译、捆绑任何插件。所有画面由岛屿原生 React 组件呈现，插件没有 HTML、CSS 或 Webview 接口。

- [API v1](api.md)：manifest、JSON-RPC、扩展点、限制。
- [开发入门](quickstart.md)：构建示例、本地索引、提 PR。
- [宿主架构](../architecture/plugins.md)。

## 官方插件目录 / Official Plugins

本仓库维护以下按需下载插件（位于 `plugins/<id>/`）：
- `kimi`: Kimi Code 额度与本地会话
- `grok-bot`: Grok Bot 周额度（本地解密与用量接口）
- `gemini`: Gemini Code Assist 额度与 CLI 会话（通过 OAuth 凭据，不接管 Chrome 调试端口）
- `zcode`: 智谱 ZCode 编程套餐与体验额度
- `doubao`: 字节豆包会员额度（支持本地凭据与私有浏览器登录）
- `hermes`: Nous Research Hermes Agent 本地会话（Hermes 为 BYOK 模式，提供会话列表）
- `office-im`: 企业微信、飞书、钉钉后台闪动提醒与前台唤起（E3）

设置 → 插件：安装后默认停用；启用后额度进入 Agent 顶部，会话进入原会话列表，消息进入插件分页和折叠态预览。停用清空内存数据并结束进程，卸载同时删除插件设置和凭据。开发目录卸载只解除注册，保留源码。

权限标签是审核声明，不是操作系统沙箱。安装源限维护者发布索引；本地索引和目录加载只用于显式开发模式。插件以当前用户权限运行。第三方源码必须经作者 review 后才能随 Release 分发。

Plugins are optional native processes, rendered exclusively by host components. Permissions describe reviewed behavior; they are not an OS sandbox. Credentials remain on this machine. See the protocol and quickstart for integration and review requirements.
