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
| `compact.wav` | 上下文快满（开始压缩上下文） |
| `idle.wav` | 闲置等你（完成 5 分钟后还没看） |
| `quotaLow.wav` | 额度快用完 |
| `quotaReset.wav` | 额度已刷新 |

后四个是 2026-11-07 用同样的方法补的：基音是正弦波，加一个约 5.4 倍频、35 毫秒内消失的泛音和一点二次谐波，回声延迟 130 毫秒，峰值统一到 0.40。音符分别是：`compact` C6→G5→E5 快速下行，`idle` E5→A4 两个慢音，`quotaLow` F5 两下再降到 D5，`quotaReset` C5→E5→G5→C6 上行琶音。

用户导入的音效包不放在这里，而是复制到应用数据目录的 `sound-packs/`。
