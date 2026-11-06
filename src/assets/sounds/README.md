# 内置音效

`thumb-piano/` 是岛屿内置的 AI Agent 音效（「拇指琴」），2026-11-06 为 fly-island 用代码合成：圆润的基音、一个很快消失的金属泛音，加一点回声，24 kHz 单声道 WAV。旋律和音色都是原创的，不来自任何其他软件或素材库，随本项目以 MIT 协议发布。

| 文件 | 事件 |
|---|---|
| `start.wav` | 会话开始 |
| `complete.wav` | 任务完成 |
| `error.wav` | 任务出错 |
| `approval.wav` | 需要审批 |
| `question.wav` | 需要回答 |
| `ack.wav` | 发出消息 |

用户导入的音效包不放在这里，而是复制到应用数据目录的 `sound-packs/`。
