# 开发规范 / Development specification

> **先看[插件开发规范](README.md)。** 本文是小岛内部已有的「外部数据接入」机制（把其他 AI 工具的额度、会话、消息接进 Agent 页，外部进程 + JSON-RPC）的技术说明，**不是插件的定义**。插件是对小岛源码的改造，只有当你的插件需要接入外部数据源时才需要参考本文。
>
> **Read the [plugin guide](README.md) first.** This page documents the island's existing external data adapter mechanism (an external process over JSON-RPC that feeds quota, sessions and messages into the Agent page). It is **not the definition of a plugin**: plugins change the island's source. Refer to it only if your plugin needs an external data source.

[总览 / Overview](README.md) · [快速开始 / Quickstart](quickstart.md) · [协议 / Protocol](api.md) · [设计 / Design](design.md) · [提交 / Contributing](contributing.md)

## 目录与构建 / Layout and build

```text
plugins/
├── Cargo.toml                   # 插件独立 workspace / separate plugin workspace
├── Cargo.lock                   # 共享依赖锁 / shared dependency lock
├── sdk/                         # stdio 与凭据工具 / stdio and credential helpers
└── my-plugin/
    ├── Cargo.toml               # 依赖 ../sdk / depends on ../sdk
    ├── fly-island-plugin.json   # 清单 / manifest
    ├── src/main.rs              # 独立进程入口 / executable entry
    └── tests/                   # 按需：脱敏离线用例 / optional sanitized offline fixtures

<loaded-directory-or-zip-root>/
├── fly-island-plugin.json
├── my-plugin.exe                # runtime.command 对应文件 / matching executable
├── LICENSE
└── THIRD_PARTY_NOTICES.md
```

插件 crate 加入 `plugins/Cargo.toml` 的 members，共用 `plugins/Cargo.lock`，不加入 `src-tauri` 的依赖，不给单个插件另加 `[workspace]`。复制示例后同步修改 Cargo 包名、清单 id、exe 名与中英文名称。发布脚本目前构建 Windows x86_64 包，只复制清单、exe 与许可文件；需要额外运行时资源或其他架构时先与维护者讨论打包支持。运行时工作目录是插件加载目录，不保证可写；不要往安装目录保存用户数据。

Add the crate to `plugins/Cargo.toml` members and share `plugins/Cargo.lock`. Do not add it as a host dependency or create an individual `[workspace]`. Rename the Cargo package, manifest ID, executable and localized names together. The release script currently builds Windows x86_64 packages containing the manifest, executable and license notices. Discuss extra runtime assets or architectures with the maintainer first. The working directory is the loaded plugin directory and is not guaranteed writable; do not store user data there.

## Manifest 完整字段 / Complete manifest schema

根文件名固定为 `fly-island-plugin.json`，UTF-8 JSON，最大 **65,536 字节**。所有对象（含本地化对象、runtime、设置与动作）拒绝未知字段；不要加入 `author`、`homepage`、`domains`、`minAppVersion`、图标或任意自定义字段。作者、联系方式与域名写在 PR；`minAppVersion` 属于分发索引。

Use UTF-8 JSON in `fly-island-plugin.json`, at most **65,536 bytes**. Every manifest object rejects unknown fields. Do not add `author`, `homepage`, `domains`, `minAppVersion`, icons or custom metadata. Put authors, contacts and domains in the PR; `minAppVersion` belongs to the distribution index.

| 字段 / Field | 必填 / Required | 类型、校验与用途 / Type, validation and purpose |
| --- | --- | --- |
| `id` | 是 / Yes | 1–100 字节，小写 ASCII 字母开头，后续 `[a-z0-9.-]`；不能以 `.`/`-` 结尾、含 `..` 或为 Windows 设备名。稳定且全仓唯一。/ 1–100 bytes, initial lowercase ASCII letter followed by `[a-z0-9.-]`; no trailing dot/hyphen, `..` or Windows device name. Stable and repository-unique. |
| `name` | 是 / Yes | `Localized`；两种名称均非空。/ `Localized`; both names must be nonempty. |
| `description` | 是 / Yes | `Localized`；审核要求两种语言均有准确的简短功能说明。/ `Localized`; review requires accurate short descriptions in both languages. |
| `version` | 是 / Yes | SemVer 字符串，如 `0.1.0`。/ SemVer string such as `0.1.0`. |
| `apiVersion` | 是 / Yes | 整数 `1`；其他版本拒绝加载。/ Integer `1`; other versions are rejected. |
| `panel` | 否 / No | 声明 panel 贡献时必需：`{icon: string}`，仅接受宿主预置图标 / Required when contributing panel: host icon selection only |
| `runtime` | 是 / Yes | 仅含 `command: string`。/ Object containing only `command: string`. |
| `runtime.command` | 是 / Yes | 包内相对路径，以小写 `.exe` 结尾，子目录用 `/`；无参数、不经 shell。规范化后必须在插件目录内。/ Relative packaged path ending in lowercase `.exe`; use `/` for subdirectories. No arguments or shell; resolved executable must remain inside the plugin directory. |
| `permissions` | 是 / Yes | 下表允许值的字符串数组；不需要权限时也写 `[]`。/ String array of allowed values below; use `[]` if none. |
| `contributes` | 是 / Yes | `quota`、`sessions`、`notifications`、`panel` 的数组；每项必须同时存在于 permissions。/ Array of `quota`, `sessions`, `notifications`, `panel`; each requires the matching permission. |
| `settings` | 否 / No | `Setting[]`，缺省 `[]`。/ `Setting[]`, default `[]`. |
| `actions` | 否 / No | `Action[]`，缺省 `[]`。/ `Action[]`, default `[]`. |

`Localized` **仅有** `{"zh-CN":"中文","en":"English"}`，两个字符串字段都必填，无自动翻译或缺省语言。`command` 的每段拒绝空段、`.`、`..`、反斜杠、绝对路径、尾随空格/点、控制字符、`<>:"/\|?*` 与 Windows 设备名（包括 `CON.txt`、`COM1.exe` 等）。

`Localized` has **exactly** the required string fields `zh-CN` and `en`, without automatic translation or fallback. Each command path component rejects empty/dot/parent components, backslashes, absolute paths, trailing spaces/dots, control characters, Windows-invalid characters and device names, including names with extensions such as `CON.txt` or `COM1.exe`.

### 设置与动作 / Settings and actions

| 对象 / Object | 全字段 / All fields | 规则 / Rules |
| --- | --- | --- |
| `Setting` | `key: string`, `label: Localized`, `type: string`, `default: JSON`, `options?: SettingOption[]` | 前四项必填；options 缺省 `[]`。/ First four required; options defaults to `[]`. |
| `SettingOption` | `value: string`, `label: Localized` | 两项必填，供 select 使用。/ Both required, used by select. |
| `Action` | `id: string`, `label: Localized` | 两项必填，显示为原生按钮。/ Both required; rendered as a host button. |

设置 key 和清单动作 id：1–100 字节，小写 ASCII 字母开头，后续 `[a-z0-9._-]`；分别在 settings / actions 数组中唯一。不要用变更 key 来清除秘密或静默重置选择。

Setting keys and manifest action IDs are 1–100 bytes, start with a lowercase ASCII letter, then use `[a-z0-9._-]`. They must be unique within their respective arrays. Do not rename keys to clear secrets or silently reset choices.

| `type` | `default` 与保存值 / Default and saved value | 宿主表现 / Host presentation |
| --- | --- | --- |
| `toggle` | 布尔 / Boolean | 开关行 / Toggle row |
| `text` | 字符串，≤8192 UTF-8 字节 / String, ≤8192 UTF-8 bytes | 输入框和保存按钮 / Input and save button |
| `secret` | 默认必须 `""`；保存值同上 / Default must be `""`; same saved-string limit | 密码输入框，保存后清空草稿；不回显旧值 / Password input clears after saving; old value is never returned |
| `number` | 范围内整数字符串，必填整数 min / max / Integer string within required integer min/max bounds | 整数输入，自动保存 / Integer input, auto-save |
| `select` | 字符串，必须匹配 options 中的一个 value / String matching an option value | 原生选择控件 / Host select control |

`options` 的 value 应唯一、文案非空是审核要求；目前不是额外的自动校验。只有 text/secret 强制 8192 字节上限。设置保存成功后，正在启用的插件会停止并重新 initialize，收到所有设置的完整有效值；没有逐字段 change 通知。

Unique option values and nonempty labels are review requirements, not additional automatic validation. Only text/secret have the 8192-byte check. Saving a setting restarts an enabled plugin with the complete effective settings object; there is no per-field change notification.

```json
{
  "id": "my-plugin",
  "name": { "zh-CN": "我的插件", "en": "My plugin" },
  "description": { "zh-CN": "显示服务额度", "en": "Show service quota" },
  "version": "0.1.0",
  "apiVersion": 1,
  "runtime": { "command": "my-plugin.exe" },
  "permissions": ["network", "quota"],
  "contributes": ["quota"],
  "settings": [
    { "key": "enabled", "label": { "zh-CN": "查询额度", "en": "Fetch quota" }, "type": "toggle", "default": true },
    { "key": "account", "label": { "zh-CN": "账号名称", "en": "Account name" }, "type": "text", "default": "" },
    { "key": "api_key", "label": { "zh-CN": "服务密钥", "en": "Service key" }, "type": "secret", "default": "" },
    { "key": "interval", "label": { "zh-CN": "刷新间隔", "en": "Refresh interval" }, "type": "select", "default": "60", "options": [
      { "value": "60", "label": { "zh-CN": "1 分钟", "en": "1 minute" } },
      { "value": "300", "label": { "zh-CN": "5 分钟", "en": "5 minutes" } }
    ] }
  ],
  "actions": [{ "id": "sign-in", "label": { "zh-CN": "去登录", "en": "Sign in" } }]
}
```

该例仅说明 schema；实际实现必须解释每个设置、动作和权限，不提供空按钮或无效选项。

This illustrates the schema. A real implementation must make every setting, action and permission meaningful; do not ship inert controls.

## 权限与隐私 / Permissions and privacy

| 权限 / Permission | 应声明的行为 / Declare when |
| --- | --- |
| `network` | 请求外部服务或登录 / Requesting external services or sign-in |
| `read-home-files` | 读取本地客户端配置、凭据、会话记录 / Reading local client configuration, credentials or session files |
| `system-devices` | 读取设备并切换音频输出 / Read devices and switch audio output |
| `write-home-files` | 配置用户明确要求连接的本地钩子 / Configure opted-in local hooks |
| `quota` | 发布额度 / Publishing quota |
| `sessions` | 发布会话 / Publishing sessions |
| `notifications` | 发布消息 / Publishing notifications |
| `panel` | 发布小岛原生面板数据 / Publishing native island-panel data |
| `desktop-windows` | 探测窗口或用户点击后前台唤起 / Inspecting windows or activating them after a click |
| `private-browser` | 明确用户操作启动的独立登录浏览器 / Starting an isolated sign-in browser on an explicit user action |

除扩展点声明和数据校验外，普通进程的文件、网络、窗口访问**没有按上述标签进行 OS 级隔离**；域名也不是 manifest 字段。PR 必须列出每个域名（含认证跳转）、用途、接口来源、所发数据、凭据来源与保存方式、读写路径、刷新频率。禁止未声明遥测、远端代码执行、自更新、任意下载执行或上传会话记录/其他服务的秘密。

Beyond contribution declarations and payload validation, these labels **do not OS-isolate** file, network or window access; domains are not manifest fields. List each domain, authentication redirect, purpose, endpoint source, transmitted data, credential source/storage, read/write path and refresh interval in the PR. Undeclared telemetry, remote code execution, self-updating, downloading arbitrary executables, and uploading transcripts or unrelated services' secrets are prohibited.

只读取实现该功能必需的用户数据；第三方客户端配置与数据库只读，不注入、不修改 profile、不接管用户浏览器调试端口。登录必须由用户点击触发，独立 profile 与进程需可清理；只收集目标服务域的必要凭据，不抓取整个浏览器 Cookie 或认证方 Cookie。不绕过用户授权、平台访问限制或系统权限提示。

Read only data necessary for the feature. Third-party profiles and databases are read-only: no injection, profile modification or takeover of the user's browser debugging ports. Sign-in must start on a user click, with a separately managed profile/process and cleanup. Collect only necessary credentials for the intended service, never whole-browser or identity-provider cookies. Do not bypass consent, platform access restrictions or system permission prompts.

### 凭据 / Credentials

宿主将 secret 设置保存在 Windows 凭据管理器：service `com.flyisland.app.plugins`、account `<plugin-id>/<setting-key>`。初始化时秘密只经 stdin 传给插件，不出现在 `get_plugins` 快照或 `plugins-state.json`。保存空 secret 删除条目；卸载清除清单声明的 secret。其他设置明文保存在应用数据目录的 `plugins-state.json`，不应用 text 存 token。

The host stores secret settings in Windows Credential Manager with service `com.flyisland.app.plugins`, account `<plugin-id>/<setting-key>`. Secrets reach the process through initialization stdin, not `get_plugins` or `plugins-state.json`. Saving an empty secret deletes it; uninstall removes manifest-declared secrets. Nonsecret settings live in plaintext in the app-data `plugins-state.json`; never use text settings for tokens.

SDK `credentials::load/save(plugin, key, …)` 使用同一命名空间；插件自己保存的凭据也必须使用本插件 id 与已声明 secret key，以便宿主卸载清理。SDK save 不代表宿主设置变更或重启。禁止秘密进入文件、命令行、stdout、stderr、截图、录屏、测试 fixture 或错误响应。宿主日志仅对初始化中已知 secret 做替换，无法替插件遮蔽本地自行读取的秘密。

SDK `credentials::load/save(plugin, key, …)` shares this namespace. Use your own plugin ID and declared secret keys for plugin-saved credentials so host uninstall can remove them. SDK save does not trigger a host settings update or restart. Keep secrets out of files, command arguments, stdout, stderr, screenshots, recordings, fixtures and error replies. Host log redaction covers known initialized secrets only, not secrets independently read by your process.

应用数据目录还包含 `plugins/<id>/` 与 `plugin-logs/<id>.log`（索引诊断为 `plugin-logs/catalog.log`）。快照只在内存，不是历史数据库；不依赖宿主长期保存消息或会话。现有数据位置见[存储约定](../architecture/data-storage.md)。

App data also contains `plugins/<id>/`, `plugin-logs/<id>.log` and index diagnostics in `plugin-logs/catalog.log`. Live snapshots are in memory, not a history database. Do not rely on permanent host retention of messages or sessions. See [storage conventions](../architecture/data-storage.md).

## 资源与退出要求 / Resource and shutdown requirements

以下是**贡献审核要求/建议预算，不是宿主已实现的 CPU、内存限额**。PR 应记录测试机器、插件进程树的空闲/刷新 CPU、常驻/峰值内存、扫描规模与耗时；超出建议时解释并由维护者评估。

These are **review requirements/advisory budgets, not host-enforced CPU or memory quotas**. Report the test machine, process-tree idle/refresh CPU, steady/peak memory, scan size and duration in the PR; explain exceptions for maintainer review.

- 空闲 CPU 以接近 0 为目标（建议平均低于整机 1%），轻量插件常驻内存建议不超过 100 MiB；登录浏览器单独记录，不隐瞒子进程消耗。/ Target near-zero idle CPU (suggested average below 1% of total machine capacity) and ≤100 MiB steady memory for lightweight plugins; measure sign-in browsers and child processes separately.
- 额度查询通常 30–60 秒或更慢；本地会话 2–5 秒或文件事件；窗口提醒优先事件，确需轮询时通常 ≥1 秒。只发变化、缓存结果、限制并发；联网失败指数退避，遵守服务限流。不是每秒重扫整个 home 或重读所有历史。/ Query quota every 30–60 seconds or slower, local sessions every 2–5 seconds or via file events, and window reminders preferably via events (normally ≥1 second if polling). Cache, bound concurrency and back off on network failures; never rescan the whole home/history every second.
- 文件读取、数据库结果、队列、内存、日志与 RPC 必须有界；增量读取会话并保留真实时间。任何 RPC 主循环都不能被网络、登录或大文件扫描长时间阻塞。/ Bound file reads, queries, queues, memory, logs and RPC; scan incrementally and preserve real timestamps. Do not block the RPC loop with long network, sign-in or scan work.
- action 必须及时响应；耗时登录异步启动。收到 shutdown 或 stdin EOF 后取消任务、结束自己创建的浏览器/子进程、关闭文件并退出；正常清理应在宿主 **3 秒**宽限内完成。宿主使用 Windows kill-on-close Job Object 兜底结束进程树，不能把它当作取消逻辑。/ Respond promptly to actions; launch long sign-in work asynchronously. On shutdown or stdin EOF cancel tasks, close files and owned browsers/children, and exit within the host's **3-second** grace period. Windows Job Object cleanup is a fallback, not a cancellation strategy.

硬限制（字节、数量、超时、重试）见 [API](api.md)。示例会周期性制造演示通知，仅用于协议验证；不得原样作为生产提醒策略。

See the [API](api.md) for enforced byte/count limits, timeouts and restart policy. The example deliberately generates periodic demo notifications; this is not an acceptable production notification policy.

## 版本、打包与分发 / Versioning, packaging and distribution

插件 `version` 与 Cargo 版本保持一致；manifest、initialize 与索引的 apiVersion 均为 1。包内 id/version/apiVersion 必须与索引一致。修改清单后目录插件须卸载注册再加载；宿主不会静默接受清单变化。更新设置保留仍匹配 key/type 的非 secret 值；id 或 secret key 改名无自动凭据迁移，变更前需制定兼容方案。

Keep manifest and Cargo versions aligned. Manifest, initialize and index use API version 1. Package ID/version/API must match the index. Unregister and reload a development directory after changing its manifest; the host rejects silent manifest changes. Updates retain nonsecret values still accepted by the corresponding key/type. ID/secret-key renames have no automatic credential migration and require a compatibility plan.

索引是最多 200 项、下载最多 1 MiB 的 JSON 数组，每项**所有字段必填**：

The index is a JSON array of at most 200 entries, with a 1 MiB download limit. **All fields below are required**:

| 字段 / Field | 类型与意义 / Type and meaning |
| --- | --- |
| `id`, `version`, `apiVersion` | 与清单一致的 id、SemVer、整数 1 / Matching ID, SemVer and integer 1 |
| `name`, `description` | `Localized` |
| `url` | 完整下载 URL，不是相对索引路径 / Absolute package URL, not relative to the index |
| `sha256` | 64 个十六进制字符，下载内容的 SHA-256 / 64 hex characters, SHA-256 of downloaded bytes |
| `size` | ZIP 字节数，1–104857600（最大 100 MiB）/ ZIP byte size, 1–104857600 (maximum 100 MiB) |
| `minAppVersion` | 最低宿主 SemVer；更高于当前宿主的条目隐藏 / Minimum host SemVer; entries requiring a newer host are hidden |

默认源为 `https://github.com/flyl1u/fly-island/releases/latest/download/plugins-index.json`。优先级：`FLY_ISLAND_PLUGINS_INDEX` 环境变量 → 开发者模式中非空的自定义索引 → 默认源。变量/开发索引允许绝对本地路径、file URL 和 localhost/127.0.0.1/[::1] 的 HTTP；通常仅 HTTPS。每次重定向也校验（最多 5 跳），网络 URL 禁止用户名密码。

The default source is the URL above. Priority: `FLY_ISLAND_PLUGINS_INDEX` → nonempty custom index in developer mode → default. The override/local-index path permits absolute filesystem paths, file URLs and loopback HTTP on localhost/127.0.0.1/[::1]; otherwise HTTPS is required. Redirects are checked too (up to five); network URLs cannot contain username/password credentials.

ZIP 根直接放 manifest 与 exe；最大压缩包 100 MiB、展开 200 MiB、256 项，拒绝穿越、符号链接、大小写重复路径、Windows 路径别名与 ADS。校验大小/哈希后暂存解压，停旧进程、替换目录，应用安装事务失败时尝试回滚。SHA-256 是完整性校验，不是数字签名；信任来源是 flyl1u 审核发布的索引和 GitHub HTTPS。

Put the manifest and executable directly at the ZIP root. Limits are 100 MiB compressed, 200 MiB expanded and 256 entries. Traversal, symlinks, case-insensitive duplicate paths, Windows path aliases and ADS are rejected. After size/hash verification, the host extracts to staging, stops the old process and replaces its directory, attempting rollback if applying the install transaction fails. SHA-256 checks integrity, not a digital signature; trust rests on flyl1u's reviewed index and GitHub HTTPS.

维护者合并后用 `scripts/release/build-plugins.ps1` 构建并发布 ZIP 与索引，不改变主程序 latest.json 协议。普通用户只按索引 id 安装；插件不能自行扩展安装源、下载新版本或修改主程序。

After merge, the maintainer builds and publishes ZIPs/index with `scripts/release/build-plugins.ps1`, without changing the application's latest.json protocol. Users install by indexed ID. Plugins must not extend installation sources, self-update or modify the host.

## 本分支新增 schema / Additional schema in this branch

`panel` adds a host-rendered island page. The optional manifest `panel.icon` selects battery / heart-pulse / activity / timer / gauge / puzzle from host lucide icons. A `number` setting requires integer `min` / `max`; defaults and saved values remain bounded integer strings.

`panel` 提供小岛原生页面；清单可用 `panel.icon` 选择上述宿主图标，不传图片或样式。`number` 设置必须声明整数 min / max，默认与保存值为范围内整数字符串；宿主自动保存有效输入，兼容既有存储。
