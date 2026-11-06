---
id: B3b
title: 卡片显示「正在压缩上下文」
section: 第二优先：Agent 页体验
status: 已完成
owner: fly-island-c6
lane: 6
claimed: 2026-11-07
scope: 
depends: 
commits: feat(agent-status): say when a session is compacting its context
---

卡片显示「正在压缩上下文」

**备注**：会话记录里要等压缩完才有记录，只能靠 `PreCompact` / `PostCompact` 钩子；适合和 B6 的钩子通道一起做

**实现**：「安装/修复」新增 Claude Code 的 `PreCompact` / `PostCompact` 钩子，复用保存输入的 notification 调用（不输出任何内容，不影响压缩摘要）。岛屿记下开始和结束，期间会话算运行中，状态写「正在压缩上下文」；没收到 `PostCompact` 时 10 分钟后不再算。已安装的钩子在修复前显示为旧版本。Codex 没有对应钩子。
