# 插件 PR：MiniMax Code（额度、会话、审批提醒）

> 按 [.github/PULL_REQUEST_TEMPLATE/plugin.md](../../.github/PULL_REQUEST_TEMPLATE/plugin.md) 起草，**尚未提交 PR**。
> 分支：`feat/minimax-plugin`。标注「待补」的两项必须由作者本人填写：**演示录屏链接**、**联系方式**。

---

## 使用演示录屏链接（必填）

待补。录屏按下面「演示脚本」走。

## 作者（必填）

YTC（GitHub：[@YTC0408](https://github.com/YTC0408)）

## 联系方式（必填）

待补

## GitHub 链接（必填）

- 主页：<https://github.com/YTC0408>
- 代码：`YTC0408/fly-island` 的 `feat/minimax-plugin` 分支

## 插件简介（必填）

**MiniMax Code**

把 MiniMax Code 接进小岛的 AI 会话页：

- **额度**：Token Plan 的 5 小时窗口（外环）和周窗口（内环）剩余比例，悬停看重置时间
- **会话**：正在跑、等待中、刚结束的会话，标题带上「x/y 项任务」进度（有 `todowrite` 时）
- **点会话回到 MiniMax Code**：点一行，把 MiniMax Code 窗口提到前台
- **等待审批提醒**：MiniMax Code 弹出权限确认时，岛上显示「等待审批：工具名」并推一条消息
- 设置里两个按钮，一键把审批提醒**接入**或**移除**（只动 `~/.minimax/hooks.json` 里我们自己的条目）
- 插件市场里有一张卡片，装好后从「设置 → 插件」进

这是**新增功能**（新的 Agent 数据来源 + 市场卡片），不是改造原有功能，也不是独立窗口。

## 改动说明（必填）

**外部数据接入插件（独立进程，JSON-RPC）**

| 文件 | 作用 |
| --- | --- |
| `plugins/minimax/fly-island-plugin.json` | 清单：id `minimax`、权限（quota / sessions / notifications / network / read-home-files / desktop-windows）、两个设置项、两个动作 |
| `plugins/minimax/src/main.rs` | 读会话库与额度、发布快照；`open` 动作切前台；`install-hooks` / `remove-hooks` 读写 MiniMax 的 hooks.json |
| `plugins/minimax/hooks/approval-marker.ps1` | 审批标记脚本，编译进 exe，安装 Hook 时写到本地目录 |
| `plugins/Cargo.toml`、`Cargo.lock` | 把 `minimax` 加进插件 workspace |

**市场卡片（改前端源码，3 处接入）**

1. `src/features/plugins/native/catalog.ts`：新增 `minimaxCode` 条目（Agent 类，强调色 `#0f9ef0`）
2. `src/features/plugins/native/NativePluginIcon.tsx`：映射官方图标 `src/assets/brands/minimax-code.png`
3. `src/i18n/sections/settings/plugins.ts`：中英文卡片文案

**新增存储**：没有新 localStorage key。本机文件读写（插件自己负责，不经过宿主）：
- `%LOCALAPPDATA%\fly-island-minimax\approvals.json`：等待审批的标记（24 小时内的会话）
- `%LOCALAPPDATA%\fly-island-minimax\approval-marker.ps1`：点「接入审批提醒」时写出
- `%USERPROFILE%\.minimax\hooks.json`：点按钮时加/删 `PermissionRequest` 与 `PostToolUse` / `Stop` / `UserPromptSubmit` 两组（只动名字以「小岛 · 」开头的条目）

**联网**：`api.minimaxi.com`（或 global 的 `api.minimax.io`）的 `/v1/token_plan/remains`，用本机 `~/.mmx/config.json` 里已有的 Token Plan 凭据，只取额度数值，不发其他数据。

**新增 Tauri 命令**：无（走插件协议，不新增宿主命令）。

## 自测结果（必填）

- `cargo build` / `cargo test` / `cargo clippy -D warnings`（`plugins/minimax`）：7 个用例通过，0 告警
- `pnpm check`：456 个用例通过（含同步更新的插件数量断言）
- `pnpm build`、`pnpm lint`、`pnpm check:size` 通过
- `pnpm test:regression plugins`：4 个页面 16 项检查通过
- 真机验证（Windows 11）：额度读到 5 小时 91% / 周 100%；会话列表显示运行中与已结束；点会话能切回 MiniMax Code；安装 Hook 后 `hooks.json` 多出 4 个条目且用户原有的 6 个钩子一条不少，移除后 JSON 语义完全还原；重复点安装是幂等的

手动确认过：插件加载/启用/停用、重启后自动恢复、展开与收起时的 Agent 页、通知出现与消失、10/15 秒刷新间隔。

## 演示脚本（录屏按这个走）

1. **改造前**：Agent 页只有 Claude Code / Codex / Kimi 这些，没有 MiniMax Code
2. 设置 → 插件 → 插件市场，指出新增的 **MiniMax Code** 卡片和官方图标
3. 开发者模式 → 填本地插件目录 → 加载 → 启用；Agent 页顶部出现额度环（说明外环 5 小时、内环周窗口，悬停看重置时间）
4. 会话列表出现运行中的会话；点一行，MiniMax Code 窗口被提到前台
5. 设置 → 插件 → 已安装 → 点「把审批提醒接入 MiniMax Code」；打开 `C:\Users\<你>\.minimax\hooks.json` 展示新增的两组条目，强调原有钩子没被动
6. 在 MiniMax Code 里触发一次需要确认的工具调用：岛上出现「等待审批：工具名」和一条消息
7. 回到设置点「移除审批提醒」，`hooks.json` 回到原样
8. 设置里把刷新间隔改成 10 秒，展示额度环跟着刷新

## 已知问题（可选）

1. **审批只能在岛上看到，不能在这里点**。插件协议 v1 没有审批交互，只在岛上提醒，批准仍需回到 MiniMax Code。要做成「岛上点允许/拒绝」，得给宿主审批端点加 MiniMax 路由并配 `PermissionRequest` Hook，那是另一期的事。
2. **CPU 温度类数据不涉及**，但会话进度依赖 `todowrite`；本机 82 个会话里该调用为 0 次，所以进度后缀多数时候不出现，只显示状态。
3. 点会话切前台按窗口标题包含「MiniMax Code」匹配，窗口标题被改过时可能找不到。
4. 会话读取是 24 小时窗口内的本机 SQLite（只读打开），库被独占锁时这一轮返回空，不会卡住。

## 自检

- [x] 用小岛已有的 Agent 页、消息页和插件市场卡片，没有另做一套界面
- [x] 新逻辑收拢在 `plugins/minimax/` 与 3 个前端接入点；没装插件时小岛原样
- [x] 没有改已有数据的 key / 格式、Tauri 命令名、窗口名
- [x] 用户可见文字中英双语
- [x] 联网与文件读写都已声明；无遥测；不收集会话内容之外的任何东西（标题、cwd、状态）
- [x] 没有提交可执行文件或构建产物，未改版本号；`release-features.json` 已恢复为 `false`