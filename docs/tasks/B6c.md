---
id: B6c
title: 完成 / 出错的弹出卡片显示 AI 最后的回复
section: 已完成（迁移自 roadmap）
status: 已完成
scope: 
depends: 
commits: 
---

完成 / 出错的弹出卡片显示 AI 最后的回复：Rust 读回复时按行去掉 Markdown 符号，上限从 120 字提到 200 字；卡片最多 3 行，岛屿高度按卡片这一行的实际高度。Agent 页列表里结束的会话仍折叠成一行

**提交**：提交 `feat(agent-status): alert cards show the session's last reply`
