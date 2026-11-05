# AI Agent 会话标题（设计）

> 状态：**已实施，后经调整**（2026-11-04）。用户确认：小岛显示"Agent 图标 + 会话标题"。
>
> **调整（同日，用户确认：统一数据来源）**：Agent 页上线后，标题改为与会话列表同源，直接读 Claude Code / Codex 的会话记录（`list_agent_sessions`），不再依赖 hook 转存的提问。第 5 节的 `capture` 转存与 `agent-*-hook-input.json` 已移除（安装/修复时删除旧文件，旧安装传入的 `capture` 参数被脚本忽略），`get_agent_status` 也不再带 `title`。下文第 4–8 节记录的是最初的实现，标题后备顺序与读取限制在 `sessions.rs`、`session_scan.rs` 中沿用。现在唯一转存的 hook 输入是 Claude Code `Notification`（等待授权），见 [agent-status-hooks.md](../agent-status-hooks.md)。
> 相关文档：现有状态灯协议见 [agent-status-hooks.md](../agent-status-hooks.md)，模块位置见 [overview.md](overview.md)。

## 1. 目标与非目标

**目标**

- Codex / Claude Code 运行时，折叠的小岛显示该会话的图标和标题，让用户不用切回终端就知道是哪个任务在跑。
- 标题优先使用 Agent 自己生成的标题，没有时自动退回，不出现空白。
- 不拖慢 Agent：hook 的耗时与现在相当（Codex 的 `UserPromptSubmit` 超时只有 1 秒）。
- 兼容已安装用户：旧的 `agent-status.json`、旧 hook 配置都能继续工作，只是没有标题。

**非目标（本期不做）**

- 列出全部会话、显示当前工具活动、在岛上审批权限（Vibe Island / Claude Island 有，岛屿只有一行空间）。
- 点击标题跳转到对应终端。
- 保存提问全文或对话内容。

## 2. 调研：同类项目怎么做

> 2026-11-04 整理。网页搜索不可用，只看了下列两个项目和本机的实际数据。

| 项目 | 显示方式 | 标题来源 |
|---|---|---|
| **Claude Island**（开源，macOS 刘海） | 每个会话一行标题，展开后可看对话 | hook 脚本只转发 `session_id`、`cwd`、事件名、工具名，不读 `prompt`；应用自己解析会话记录：`displayTitle = summary ?? firstUserMessage ?? projectName`。第一句提问跳过 `<command-name>`、`<local-command`、`Caveat:` 开头的系统文字，截到 50 字符；`projectName` 为 `cwd` 的最后一级目录 |
| **Vibe Island**（付费，macOS 刘海） | `fix auth bug · Claude · iTerm · 27m`：短标题 · Agent · 终端 · 已运行时长；完成后显示"Done — click to jump" | 未公开 |

**本机数据（实测）**

- Claude Code 在会话记录（hook 输入中的 `transcript_path`）里反复追加自动生成的标题：

  ```json
  {"type":"ai-title","aiTitle":"设置界面完善思路","sessionId":"bbeba090-…"}
  ```

  最近两周 17 个会话中 10 个有该记录，通常在第一轮对话结束后（记录第 30 行左右）出现；同一会话会写多次，以最后一条为准。记录文件可能有数千行。
- Codex 在 `~/.codex/session_index.jsonl` 中按会话 id 保存标题：

  ```json
  {"id":"01a14e2c-…","thread_name":"恢复 Windows 发布机环境","updated_at":"2026-10-18T08:41:36Z"}
  ```

**结论**：不在 hook 里生成标题；hook 只交出会话信息，由应用读取 Agent 已有的标题，再逐级后备。以上两种格式都不是公开约定，解析失败时必须安静地后备。

## 3. 显示规则

```text
[蓝灯]  <Claude Code 图标> 设置界面完善思路
[蓝灯]  <Codex 图标> 恢复 Windows 发布机环境
```

- 图标：Claude Code、Codex 品牌小图标，与 QQ / 微信图标同尺寸，放在 `src/assets/brands/`。标题单行，超长省略号截断，不撑宽小岛（宽度沿用待办标题的计算）。
- 显示时机：`running` 时显示；`completed` 后保留 3 秒再退回待办；`failed` / `stale` 时显示标题并配黄灯，直到状态被清除或下一次运行。
- 优先级：消息预览 > Agent 标题 > 当前待办 / 剩余待办数。
- 多个 Agent 同时运行时只显示最近有动静（`updatedAt` 最大）的一个。同一 Agent 的多个会话以最近一次提问的会话为准。
- "AI Agent"设置页新增开关"运行时在小岛显示会话标题"，默认开启；AI Agent 功能总开关关闭时一并不显示。

## 4. 标题来源与后备顺序

| 顺序 | Claude Code | Codex |
|---|---|---|
| 1 | `transcript_path` 中最后一条 `ai-title` 的 `aiTitle` | `~/.codex/session_index.jsonl` 中 `id == session_id` 的最后一条 `thread_name` |
| 2 | 会话记录中第一句真正的用户提问（规则同 Claude Island） | 本次运行中岛屿记录到的该会话第一句 `prompt`（只在内存中） |
| 3 | `cwd` 的最后一级目录名 | 同左 |

- 截断：去掉首尾空白，换行替换为空格，按字符（非字节）截到 40 个字符，超出加 `…`。岛上显示时再由 CSS 截断。
- 读取 Claude Code 记录时只读文件末尾（最多 256 KiB）找 `ai-title`；第一句提问从开头逐行完整解析，最多扫描 4 MiB（实施后调整：带截图的首条消息一行就有 360–655 KiB，原先只读开头 256 KiB 会漏掉）。第一句提问找到后按会话缓存，不再重复扫描；扫满 4 MiB 仍没有时也记住这一结论。找不到就进入下一级。
- 以带参数的斜杠命令开头的会话（如 `/goal …`）取 `<command-args>` 的内容；不带参数的命令（如 `/model`）跳过。提问开头的 Markdown 标题符号 `#` 去掉。本机 19 个会话记录在去掉 `ai-title` 后全部能取到第一句提问。
- 只接受 `transcript_path` 位于 `~/.claude/projects/` 下、Codex 索引位于 `~/.codex/` 下的文件，避免 hook 输入被用来读任意路径。

## 5. 数据流

```text
Agent hook（UserPromptSubmit）
  └─ focusd-agent-running.cmd <provider> capture
       ├─ 写运行标记 agent-<provider>-running.flag（不变）
       └─ 把 stdin 原样写入 agent-<provider>-hook-input.json（新增，只转存不解析）

岛屿每 200ms 调用 get_agent_status
  └─ agent_status::title 读取 hook-input → 按第 4 节解析标题
       └─ 缓存键：(hook-input 修改时间, 记录文件路径 + 大小 + 修改时间)；不变则直接用缓存
  └─ 返回的每个 AgentTaskStatus 带上可选 title
```

- 只有 `UserPromptSubmit` 转存输入。Claude Code 的 `PreToolUse` 仍只写标记：它的输入含工具参数（如整个待写文件），可能很大，且不带新信息。为此运行脚本增加第二个参数 `capture`，没有该参数时行为与现在完全相同，所以未重新安装 hook 的用户不受影响。
- 同一 Agent 多个会话共用一个 hook-input 文件，后提问的覆盖先提问的，与"显示最近有动静的会话"一致。
- `Stop` / `StopFailure` 走的 `focusd-agent-status.ps1` 不改。

## 6. 契约变化

| 项 | 变化 | 兼容 |
|---|---|---|
| 新命令 `get_agent_hooks_state`（实施后补充：用户更新后不知道要重装 hook） | 返回 `{ codex, claudeCode: "notInstalled" \| "outdated" \| "current", scriptsOutdated }`，只读文件；设置页据此提示点"安装/修复" | 新增命令，不影响旧命令 |
| `get_agent_status` 返回值 | `codex`、`claudeCode` 各新增可选字段 `title?: string` | 只增不改；前端缺字段时不显示标题 |
| `agent-status.json` | 不变 | — |
| 应用数据目录 | 新增 `agent-codex-hook-input.json`、`agent-claudeCode-hook-input.json` | 新文件；"清除状态"时一并删除 |
| `focusd-agent-running.cmd` | 新增可选第二参数 `capture` | 旧调用方式行为不变 |
| hook 受管区块 | `UserPromptSubmit` 的命令多一个 `capture` 参数；标记、签名前缀不变 | 用户点"安装/修复"后生效，旧配置继续只亮灯 |
| `localStorage` | `focusd-island-settings` 新增布尔字段 `agentTitleEnabled`（缺省为 `true`） | 按现有 normalize 规则补默认值 |

实施时同步更新 [agent-status-hooks.md](../agent-status-hooks.md)（顺带把其中过时的"运行中为红色"改为蓝色）和 [overview.md](overview.md) 的数据存放位置表。

## 7. 代码位置

| 位置 | 内容 |
|---|---|
| `src-tauri/src/agent_status/hooks/focusd-agent-running.cmd` | `capture` 参数：把 stdin 写入 hook-input 文件 |
| `src-tauri/src/agent_status/claude_hooks.rs`、`codex_hooks.rs` | `UserPromptSubmit` 命令加 `capture` 参数 |
| `src-tauri/src/agent_status/title.rs`（新增） | 纯逻辑：解析 hook 输入、读记录尾部 / 开头、查 Codex 索引、后备与截断、路径校验 |
| `src-tauri/src/agent_status/title_cache.rs`（如需要） | 缓存与 Codex 首句提问的内存记录；全局状态封装在模块内部 |
| `src-tauri/src/agent_status/snapshot.rs`、`mod.rs` | `AgentTaskStatus.title`，在 `read_agent_status` 中填充；清除状态时删除 hook-input |
| `src/features/agent-status/api.ts`、`status.ts` | `title` 类型；选出当前要显示的 Agent 与标题，含完成后 3 秒保留 |
| `src/windows/island/IslandCollapsedBar.tsx/.css` | 图标 + 标题行，优先级在消息预览之后、待办之前 |
| `src/features/agent-status/AgentHooksSettingsSection.tsx` 或 `AgentSettingsPage.tsx` | 显示标题开关 |
| `src/features/appearance/settings.ts`、`types.ts` | `agentTitleEnabled` 默认值与 normalize |
| `src/i18n/types.ts`、`zh-CN.ts`、`en.ts` | 开关文案 |
| `src/assets/brands/` | Claude Code、Codex 图标 |

## 8. 实施步骤

每步一个提交，可单独验证。

1. **hook 转存输入**：修改运行脚本和 hook 安装（含单元测试）。先实测：中文提问转存后为原样 UTF-8、无多余字节；冷启动耗时远小于 1 秒。若 `cmd` 转存不可靠，改为由 Rust 侧提供的极小转存方式，再更新本文。
2. **Rust 解析标题**：`title.rs` + 缓存 + 快照字段。单元测试覆盖：有 / 无 `ai-title`、多条 `ai-title` 取最后一条、斜杠命令等系统文字被跳过、数组形式的 content、中文与 emoji 截断、记录文件不存在 / 损坏 / 超大、路径不在允许目录、Codex 索引缺该会话。
3. **前端显示与开关**：类型、选择逻辑（`node:test` 单测）、小岛渲染、设置开关、中英文文案、`DESIGN.md` 记录显示约定；浏览器回归页检查长标题、中英文、窄窗口。

## 9. 验证

- 第 1、2 步：`cargo test --manifest-path src-tauri/Cargo.toml` + `pnpm tauri build --no-bundle`，并同步桌面快捷方式。
- 第 3 步：`pnpm check` + `pnpm build`。
- 手动：点"安装/修复"后，在 Claude Code 和 Codex 中各发一句中文提问，确认小岛先显示首句提问或文件夹名，Claude Code 生成标题后切换为正式标题；完成后 3 秒退回待办；关闭开关后不再显示。

## 10. 风险

| 风险 | 应对 |
|---|---|
| `ai-title`、`session_index.jsonl` 格式变化 | 解析失败逐级后备，最差显示文件夹名；单测固定当前格式 |
| 会话记录很大，200ms 轮询反复读文件 | 只读首尾各 256 KiB，并按大小与修改时间缓存 |
| `cmd` 转存 stdin 的编码或耗时问题 | 已实测（2026-11-04）：`findstr "^"` 原样保留 UTF-8（含中文、emoji、制表符），整个脚本约 35ms；单行超过约 64 KiB 时截断（`more` 会改制表符、超长时输出为空，不采用）。因此 Rust 端须宽松解析：JSON 解析失败时逐个提取完整的字符串字段（Claude Code 的 `prompt` 排在最后，截断不影响 `session_id`、`transcript_path`、`cwd`） |
| 标题含敏感内容 | 只在内存和岛上显示截断后的标题，不写入 `agent-status.json`；hook-input 仅存于本机应用数据目录，下次提问覆盖，清除状态时删除 |
| 品牌图标的使用 | 只作为来源标识使用小尺寸官方图标，与 QQ / 微信图标做法一致 |
