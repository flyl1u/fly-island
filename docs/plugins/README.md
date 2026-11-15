# 插件 / Plugins

插件是按需安装的 Windows 进程。主程序不编译、捆绑任何插件。所有画面由岛屿原生 React 组件呈现，插件没有 HTML、CSS 或 Webview 接口。

- [API v1](api.md)：manifest、JSON-RPC、扩展点、限制。
- [开发入门](quickstart.md)：构建示例、本地索引、提 PR。
- [宿主架构](../architecture/plugins.md)。

设置 → 插件：安装后默认停用；启用后额度进入 Agent 顶部，会话进入原会话列表，消息进入插件分页和折叠态预览。停用清空内存数据并结束进程，卸载同时删除插件设置和凭据。开发目录卸载只解除注册，保留源码。

权限标签是审核声明，不是操作系统沙箱。安装源限维护者发布索引；本地索引和目录加载只用于显式开发模式。插件以当前用户权限运行。第三方源码必须经作者 review 后才能随 Release 分发。

Plugins are optional native processes, rendered exclusively by host components. Permissions describe reviewed behavior; they are not an OS sandbox. Credentials remain on this machine. See the protocol and quickstart for integration and review requirements.
