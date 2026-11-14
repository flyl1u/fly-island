# DSH 余额慢、查不到、显示没有会话：排查记录（2026-11-14）

反馈：部分用户的 DSH 余额查询慢、查不到，或 Agent 页显示没有 DSH 会话。作者本机（DataElement DSH Desktop 0.12.1，同时有 `%APPDATA%/dsh-desktop/harness` 和 `~/.dsh`）复现不了。下面按「读代码 + 本机数据只读核对」得出结论；本机只统计了检查点的版本号和字段类型，没有读取会话正文或凭据值。

## 已确认的问题（代码路径可以直接推出）

1. **余额只认两个固定目录。** 旧 `dsh_sessions::data_root` 只看 `%APPDATA%/dsh-desktop/harness`（目录存在就选它）和 `~/.dsh`。会话读取早已支持 `~/.dsh-beta`、DSH NEXT 的 `desktop-next-location.json` 和 anywhere 版保存的自定义数据目录（`data-directory/state.json`），余额却不读这些位置。
   - 用 Beta、NEXT、自定义数据目录的用户：会话能显示，余额永远没有。
   - 装过 DataElement 版、后来改用官方或 anywhere 版的用户：`%APPDATA%/dsh-desktop/harness` 还在，余额就一直去读这份旧目录里的凭据和会话，读不到新目录里正在用的账户。
2. **投影版本卡得太死，DSH 一升级会话就全部消失。** 旧代码要求 `sessionListMetadata` 的 `ver == 1`、`turnBoundary` 的 `ver == 2`、顶层 `version` 3–7、`formatVersion` 3/4，任何一项不符就跳过整条会话。本机同一台机器上两代检查点的版本号已经各不相同：`contextPressure` 4→5、`contextBreakdown` 4→6、`subagentCatalog` 2→6。只要哪次 DSH 发布把 `turnBoundary` 或 `sessionListMetadata` 升一版，所有会话都会消失，这就是「显示没有会话」。
   - 附带确认：本机两代检查点的 `titleInput` 都已经是 `ver 3`（字段形状没变），旧代码只认 `ver 1`，所以没有标题的会话一直取不到首条提问作标题。
3. **源日志只认 v3 / v4。** 会话只在存在 `session.v3.jsonl.zstd` 或 `session.v4.jsonl.zstd` 时显示。日志一旦升到 v5，所有会话同样会消失。
4. **凭据读取失败是静默的，一行看不懂就整份放弃。** `.credentials.yaml` 里只要有一行没有冒号（YAML 列表项 `- xxx`）、或键名里带冒号的引号键、或文件开头有 BOM，解析器就返回 None，余额不显示，也没有任何提示。
5. **失败时前端一片空白。** `get_dsh_usage` 在所有失败情况下都返回 `Ok(None)`，前端 `.catch(() => null)`，所以「没装 DSH」「凭据读不到」「网络超时」「凭据失效」看起来完全一样：余额环直接不出现。
6. **扫描会话时重复枚举进程。** `list_sessions` 对 `roots()` 里的每个目录（最多 6 个，大多数并不存在）都调用 `exe_for`：每次都完整枚举一遍顶层窗口；DSH 没在运行时，还要对 6 个程序名各做一次进程快照。Agent 页每次刷新会话要多做约 36 次进程快照，这是「慢」的一个实际来源。

## 推测（无法在本机复现，按路径做了防御）

- **网络与代理**：`reqwest` 关闭了默认特性，不读 Windows 系统代理，只认 `HTTP(S)_PROXY` 环境变量。环境变量指向一个已关闭的代理（例如退出了 Clash）时，旧代码要等满 5 秒总超时才失败，且没有重试、没有提示。现在把连接超时（4 秒）和总超时（8 秒）分开，连接失败或超时自动重试一次，失败原因显示在界面上。
- **余额查询是否阻塞界面**：已排除。`get_dsh_usage`、`list_agent_sessions` 都是 async 命令，文件读取在 `spawn_blocking` 里，网络请求在 async 运行时上，都不占 IPC 线程或 UI 线程。界面「慢」更可能来自上面第 6 条和计费来源扫描：旧 `billing_provider` 最多解析 512 个检查点（每个最多 512 KiB），而解析缓存总量上限是 8 MiB，检查点多时缓存反复清空、每次重新解析。
- **账户凭据过期**：账户接口对过期 grant 返回 HTTP 200 加非零 `code`，旧代码把它当格式错误静默丢弃。现在识别为「凭据失效」。

## 修复

| 问题 | 改动 |
|---|---|
| 余额目录 | `dsh_usage::locate`：在 `dsh_desktop::roots()` 的所有有会话的目录里，选「最新带计费来源的检查点」最近的那个目录（也就是正在用的 DSH），读它的路由、凭据。仍然只读官方路由、只发往固定的两个官方地址；不会拿旧目录的密钥去查新账户 |
| 投影版本 | `row()` 接受已知版本及更新版本；需要的字段逐个校验类型，形状变了的行跳过而不是猜（`turnBoundary` 必须有 `lastTurn`，`sessionListMetadata.blank` 必须是布尔）。顶层 `version >= 3`、`formatVersion >= 3` |
| 源日志 | 任意 `session.v<N>.jsonl*` 都算；分片目录每个根只列一次 |
| 凭据解析 | 去 BOM；看不懂的行跳过，看不懂的键仍占一层缩进，其下内容不会被误认成已知记录的字段 |
| 失败原因 | `get_dsh_usage` 返回 `Err("dsh:<code>")`：`noSession` / `customProvider` / `customRoute` / `credential` / `timeout` / `network` / `auth` / `http` / `format`；没装 DSH 仍是 `Ok(None)`，保持安静。前端在余额环的位置显示空环和简短原因，悬停给出处理建议。上次成功的余额在刷新失败时继续显示（按已有规则标记过期） |
| 扫描开销 | 不存在会话目录的根直接跳过；顶层窗口每次扫描只枚举一次；计费来源最多看最新 64 个检查点 |

命令名、参数、事件名都没有变；`get_dsh_usage` 的成功返回结构不变，只是失败时由 `Ok(None)` 改为带原因码的 `Err`。旧前端会把它当作读取失败、不显示余额，和以前的表现一致。

## 测试

- `dsh_sessions_tests.rs`：新版本号但字段形状不变的检查点仍然显示；字段形状变了的跳过；`titleInput` v3 作为标题回退；任意代源日志都算。
- `dsh_usage_tests.rs`：余额跟随正在用的目录；新目录没有凭据时报 `credential`，不借用旧目录的密钥；第三方模型、自定义接口、没有会话各有原因；刷新失败保留上次余额。
- `dsh_credentials.rs`：BOM、列表项、带冒号的引号键不再让整份凭据失效；看不懂的键下面的内容不会被误读。
- 前端：`tests/unit/agent-dsh.test.mjs` 原因码解析；`tests/regression/agent-dsh.tsx` 失败时显示空环和原因。

## 需要实机验收

1. 用 Beta / NEXT / 自定义数据目录的 DSH 账户：余额能显示。
2. 断网或把 `HTTPS_PROXY` 指向一个不存在的端口：几秒内显示「无法连接 / 查询超时」，恢复网络后一分钟内自动恢复。
3. 在 DSH 里退出账户或删掉 API key：显示「未找到凭据」或「凭据失效」。
