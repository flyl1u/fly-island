# P8 技术验证：插件自定义界面（Webview）能否安全地做

> 日期：2026-11-05。环境：Tauri 2.11.5、wry 0.55.1、webview2-com 0.38.2，Windows 11，WebView2 运行时随系统。验证在隔离的应用标识（`com.focusd.island.verification.*`）下用 release 程序进行，脚本通过 WebView2 远程调试端口在岛屿窗口里插入测试页面，没有改动产品代码。计划见 [plugin-platform.md](plugin-platform.md#p8-webview先验证再决定)。

## 结论

**不通过，P8 暂不实现。**三条标准里，内存一条通过；“页面脚本调用不了任何 Tauri 命令”目前做得到，但只是碰巧，不是设计上的保证；“页面加载不了插件包以外的资源”做不到：页面可以把自己导航到外部网址，把数据带出去。模板（P7）继续作为插件界面的唯一方式。

| 标准 | 沙箱 iframe（`sandbox="allow-scripts"` + `srcdoc`） | 单独的 Tauri webview |
|---|---|---|
| 页面脚本调用不了 Tauri 命令 | ⚠️ 目前调用不了，但 IPC 脚本和调用密钥都被注入进了 iframe，只因为来源是 `null` 才被拒绝 | ❌ 本地来源加载的页面能调用全部应用命令 |
| 加载不了包以外的资源 | ❌ 子资源能被 CSP 挡住，但页面能导航到外部网址 | 未测（需要先解决上一行） |
| 额外内存 < 30 MB | ✅ 测不出差别（同一个渲染进程） | 未测 |

## 1. 沙箱 iframe 里的脚本能不能调用 Tauri 命令

测试页面放在岛屿窗口的 `<iframe sandbox="allow-scripts" srcdoc="...">` 中（没有 `allow-same-origin`），脚本内容见附录。结果：

| 检查 | 结果 |
|---|---|
| `self.origin` | `"null"`（不透明来源） |
| 访问 `parent.document`、`parent.__TAURI_INTERNALS__`、`localStorage` | 都被拒绝（`SecurityError`） |
| iframe 自己的 `window.__TAURI_INTERNALS__`、`window.ipc`、`window.chrome.webview` | **都存在** |
| `__TAURI_INTERNALS__.invoke("plugin:app\|version")`、`invoke("get_todos_state")`、`invoke("set_plugin_dev_mode", { enabled: true })` | 被宿主拒绝：`Origin header is not a valid URL`；之后读开发模式状态，确认没有被打开 |
| 不带调用密钥直接 `fetch("http://ipc.localhost/...")` | `missing Tauri-Invoke-Key header` |
| `window.chrome.webview.postMessage(...)` 发送调用 | 没有被执行 |
| 加上 `default-src 'none'` 的 CSP 后再 `invoke` | `fetch` 被 CSP 挡住，退回 `postMessage` 后也没有被执行（超时） |

原因（读 Tauri 和 wry 的源码确认）：

- **Windows 上所有初始化脚本都会注入子框架。**Tauri 把自己的 IPC 脚本标成“只给主框架”，但 wry 的文档写明 Windows 上忽略这个选项（`with_initialization_script_for_main_only` 的 Platform-specific 说明），WebView2 的 `AddScriptToExecuteOnDocumentCreated` 对所有框架都执行。所以 iframe 里有完整的 `__TAURI_INTERNALS__`，包括调用密钥（`invoke` 发出的请求带着密钥，宿主报的错已经是下一步的来源检查）。
- **现在挡住调用的，是 Tauri 对 `Origin` 头的解析**：`ipc/protocol.rs` 用 `Url::parse` 解析 `Origin`，沙箱 iframe 的来源是 `null`，解析失败就拒绝。`postMessage` 那条路径只接收顶层文档的消息，所以也不通。
- 这两点都不是 Tauri 声明过的安全边界。以后的 Tauri 版本如果把 `null` 当作本地来源，或者让子框架的 `postMessage` 也能到达，插件页面就能直接调用岛屿的全部命令。而且**这个应用没有应用级 ACL 清单**（`build.rs` 是默认的 `tauri_build::build()`），`webview/mod.rs` 中对本地来源的应用命令不做任何权限检查，只有插件命令和远程来源才查 capability。也就是说一旦调用能发出去，读写待办、开发模式、通知等所有命令都可用，没有第二道防线。

## 2. 单独开一个 Tauri webview（不加入任何 capability）

没有实际搭建：在一个窗口里嵌入第二个 webview 需要 Tauri 的 `unstable` 特性，单独开子窗口则是另一个 Tauri 窗口。但源码已经说明结论：

- Tauri 创建的 webview 都会注入 IPC 脚本和调用密钥；
- capability 只管插件命令（`plugin:*`）和远程来源；本应用没有应用级 ACL，**本地来源（插件页面通过自定义协议从插件目录加载，就属于本地）调用应用命令时不检查任何 capability**，“label 不加入任何 capability”挡不住它。

要让这条路成立，需要先给整个应用引入应用级 ACL 清单：为 `generate_handler!` 里的约 100 个命令定义权限，并给 `main`、`translation`、`settings` 三个窗口分别授权。这是一次涉及所有窗口的大改动，还要防止漏授权导致功能失效，不应该为了一个可选功能去做。另一种办法是让插件页面走远程来源（例如 `https://` 的自定义域名），但那样资源就不是从插件目录本地加载的了，和第 3 条的要求冲突。

## 3. CSP 能否禁止外部网络

在 `srcdoc` 开头放 `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'none'">`：

| 检查 | 没有 CSP | 有 CSP |
|---|---|---|
| `fetch("https://example.com/")` | 失败（CORS），**但请求已经发出** | 被 CSP 挡住，不发请求 |
| `<img src="https://github.com/favicon.ico">` | **加载成功**（可以借此把数据带出去） | 被挡住 |
| `fetch("http://tauri.localhost/index.html")`（岛屿自己的页面） | 失败 | 失败 |
| `window.open(...)` | 返回 `null`（沙箱没有 `allow-popups`） | 同左 |
| 表单提交到外部网址 | — | 被 `form-action 'none'` 挡住 |
| `location.href = "https://example.com/?leak=..."` | — | **导航成功**：iframe 变成了 `https://example.com/?leak=self-navigation`（从远程调试的目标列表里看到） |
| 点击 `<a href="https://example.com/?leak=link">` | — | **导航成功** |

CSP 不管框架自己的导航（曾经计划的 `navigate-to` 指令没有被浏览器实现）。页面把要外传的数据拼进网址再导航过去，就绕过了“不能访问网络”的限制；导航后的外部页面同样会被注入 Tauri 的 IPC 脚本（见第 1 节）。

能挡住的办法只有在原生层拦截：订阅 WebView2 的 `FrameNavigationStarting`（以及用 `WebResourceRequested` 拦截框架发出的请求），取消所有不是 `about:srcdoc` 的子框架导航。wry 只把主框架的导航事件交给应用，所以要通过 `with_webview` 拿到 `ICoreWebView2` 自己订阅（`unsafe` 代码放在 `win32/` 中）。这可以做，但它和第 1 节的问题一起，意味着插件页面的安全要靠我们自己维护的一层原生拦截，加上 Tauri 碰巧拒绝 `null` 来源。

## 4. 内存

用同一个隔离实例，统计它的全部 `msedgewebview2.exe` 进程的私有内存，插入一个带画布动画的沙箱 `srcdoc` iframe 5 秒前后对比：

| 时刻 | 私有内存合计 | 进程数 |
|---|---|---|
| 插入前 | 292.0 MB | 8 |
| iframe 运行中 | 293.3 MB | 8 |

两次测量各有 ±1 MB 左右的波动，差别在误差范围内。沙箱 `srcdoc` iframe 和岛屿页面在同一个渲染进程里，没有新进程。（iframe 导航到外部网址后会另起一个进程：测量时的 8 个进程里有一个是前面导航测试留下的外部页面，那些 iframe 移除后变成 7 个。）这条满足 < 30 MB 的目标，但“同一个渲染进程”也意味着页面和岛屿之间只有同源策略，没有进程隔离。

## 5. 什么情况下可以重新评估

满足下面任一组条件后，可以重新排期 P8：

1. **iframe 方案**：在原生层加上子框架导航和请求的拦截（`FrameNavigationStarting` / `WebResourceRequested`，只放行 `about:srcdoc` 和插件包内资源的自定义协议），**并且**给应用加上应用级 ACL 清单，让“本地来源调用应用命令”也要经过 capability 检查（这样即使 IPC 脚本被注入进 iframe、Tauri 以后放宽了 `null` 来源，也调用不了命令）。之后用本文的测试脚本重新跑一遍。
2. **Tauri 或 wry 提供官方的隔离手段**：例如 Windows 上真正只注入主框架的初始化脚本，或者按框架 / 来源拒绝 IPC 的配置项。

在此之前，模板能覆盖的需求用模板；模板不够时，优先给模板加新的组件（例如图表），走 P10 的实验 API 通道（`experimentalApis`）先在开发模式里试。

## 附录：测试脚本

脚本放在本机临时目录，不进仓库，要点如下，复现时照此重写即可：

- `p8-probe.mjs`：通过 `http://127.0.0.1:<端口>/json/list` 找到岛屿窗口，用 `Runtime.evaluate` 插入 `sandbox="allow-scripts"` 的 `srcdoc` iframe；iframe 里的脚本做第 1、3 节表格里的检查，用 `parent.postMessage` 把结果发回；之后读取 `get_plugin_dev_state` 确认开发模式没有被 iframe 打开。分别在不加 CSP 和加 `default-src 'none'` 时运行。
- `p8-nav-mem.mjs`：插入三个分别做自身导航、表单提交、点击链接的 iframe，4 秒后用 `Page.getFrameTree` 和 `/json/list` 看框架去了哪里；再用 PowerShell 统计 `msedgewebview2.exe`（命令行里含隔离应用标识的那些）的 `PrivateMemorySize64`，对比插入 iframe 前后。
- 隔离实例启动时设置 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`，使用单独的应用标识和数据目录，不碰真实数据。
