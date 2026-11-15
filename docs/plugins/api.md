# 插件 API v1

## Manifest

插件根目录固定为 `fly-island-plugin.json`。未知字段拒绝加载。完整最小例子见 [example-hello](../../plugins/example-hello/fly-island-plugin.json)。

| 字段 | 类型与约束 |
| --- | --- |
| id | 小写字母开头，后续小写字母、数字、`.`、`-`，最多 100 字节；禁止路径、Windows 设备名 |
| name / description | `{ "zh-CN": "…", "en": "…" }` |
| version | SemVer |
| apiVersion | 固定 `1` |
| runtime.command | 插件目录内相对 `.exe` 路径，`/` 分隔；无参数，不经过 shell |
| permissions | `network`、`read-home-files`、`notifications`、`quota`、`sessions`、`desktop-windows`、`private-browser` |
| contributes | `quota`、`sessions`、`notifications` 的数组，必须同时声明对应权限 |
| settings | `{key,label,type,default,options?}[]`，key 唯一；type 为 toggle / text / secret / select |
| actions | 可选 `{id,label}[]`，在详情中显示原生动作按钮，支持「登录」等动作 |

`label` 和 select 的 option label 均为中英文对象。toggle 默认值是布尔；text / secret / select 是字符串；secret 默认必须为空。select options 为 `{value,label}[]`。文本最长 8192 字节。秘密存 Windows 凭据管理器，不返回前端，不写注册文件。

## 传输与生命周期

stdin / stdout：UTF-8、每行一个 JSON-RPC 2.0 对象，无 BOM，输出后 flush。stdout 只能写协议；诊断写 stderr（禁止凭据、Cookie、token、请求头或响应正文）。宿主每行最大 256 KiB，manifest 最大 64 KiB。宿主不接受插件发起的宿主方法调用。

宿主首条请求：

```json
{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"apiVersion":1,"settings":{"interval":"30"}}}
```

插件须在 10 秒内返回 `{"jsonrpc":"2.0","id":0,"result":{"apiVersion":1}}`，随后才能 publish。settings 已包含默认值和凭据。设置变动会重启插件，以完整新 settings 再次初始化。不要把设置复制到日志。

宿主点击动作：`{"jsonrpc":"2.0","id":1,"method":"action","params":{"id":"open-session-123"}}`。动作只允许 manifest 声明的 id 或最近 publish 的 session / notification action。插件返回同 id 的 result，失败返回 error；宿主等待 15 秒。点击动作由插件自行执行，其参数由插件记录映射，宿主不解释 shell 命令或执行任意 URL。没有 action 的会话仍可显示，但不能跳转。

启用拉起进程，Windows 使用 CREATE_NO_WINDOW。初始化超时、协议错误、进程退出触发重启；最多重试 6 次，等待 1、2、4、8、16、32 秒；耗尽显示失败，重新开关可重试。停用、卸载和应用退出结束进程。进程 stdin 关闭时插件必须自行退出；宿主也会 kill / wait。stderr 单文件约 1 MiB，已知 secret 替换为 `[redacted]`，插件仍须自行保证日志不含本地读取的秘密。

## 扩展点

插件用 notification `publish` 发送完整快照，所有数组默认空，**会替换上次全部数据**：

```json
{"jsonrpc":"2.0","method":"publish","params":{"quota":[],"sessions":[],"notifications":[]}}
```

所有时间为 Unix 毫秒；所有 id 在各自数组内应唯一。每个文本字段最多 4096 字节。只发送用户可见摘要，禁止发送凭据或完整的会话记录。

| 扩展点 | 每条字段 | 上限 |
| --- | --- | --- |
| quota | `id,label,remainingPercent,secondaryPercent,balance,resetsAt,updatedAt` | 32 |
| sessions | `id,title,cwd,status,updatedAt,action` | 200 |
| notifications | `id,sourceId,appName,icon,title,body,receivedAt,action` | 100 |

quota：两个百分比是 **剩余** 0–100，可 null；balance 是格式化金额 / 积分字符串或 null；resetsAt 可 null。宿主使用原生同心环和 hover card；金额优先显示。重置时间显示为本地时间。插件应每 30–60 秒更新额度，不要模拟数据或把读取失败表示为 0。

sessions：cwd、action 可 null；status 只接受 running / waiting / completed。宿主以 `插件id/会话id` 隔离会话身份，复用排序、归档、已读、列表/卡片/紧凑模式和折叠态计数。更新时间用于现有会话时间窗口筛选。

notifications：icon 为 `plugin`、`wework`、`dingtalk`、`feishu`（其他值回退 Puzzle）。三家企业 IM 使用字母色块，不附带未经授权的品牌资产。title / body 纯文本。sourceId 标识插件内来源，appName 是应用名。receivedAt 只在真正收到新通知时改变，轮询不能重写旧通知时间；折叠预览与其他来源共用 latestMessagePreview 仲裁，8 秒过期。

## 分发

索引是 JSON 数组，每条包含 `id,version,name,description,apiVersion,url,sha256,size,minAppVersion`；名字和描述为中英文对象。只允许按索引 id 安装，不接受前端提供下载 URL。HTTPS 默认；开发模式或 `FOCUSD_PLUGINS_INDEX` 允许 file URL 和本机 HTTP。zip 最大 100 MiB，展开最大 200 MiB、256 文件，拒绝穿越、符号链接、重复文件、ADS，清单 id / version 必须匹配索引。下载校验后暂存解压、停旧进程、替换目录，失败回滚。

索引和 zip 作为 GitHub Release 资产，与 latest.json 并列；不改变应用更新协议。SHA-256 验证完整性，信任根是维护者发布索引及 GitHub HTTPS，不应把哈希称为数字签名。
