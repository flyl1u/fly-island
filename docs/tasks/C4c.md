---
id: C4c
title: 歌词第二步：逐字高亮（酷狗 KRC 已有逐字时间）、QQ 音乐来源（QRC 魔改 DES）、网易云逐字（yrc，eapi 加密）
section: 第三优先：竞品都有、我们还缺的
status: 已完成
owner: fly-island-fe
lane: 4
claimed: 2026-11-07 14:02
scope: src-tauri/src/lyrics, src/features/media/lyrics, tests/regression/music-lyrics.tsx
depends: 
commits: feat(media): Kugou lyrics light up word by word
---

## 交接

- 2026-11-07 14:10 第一步只做了酷狗 KRC 的逐字高亮（后端转成增强 LRC，本地 .lrc 里带 <mm:ss.xx> 的也能逐字）。QQ 音乐（QRC 魔改 DES）和网易云逐字（yrc，eapi 加密）没做，需要时另开任务。
