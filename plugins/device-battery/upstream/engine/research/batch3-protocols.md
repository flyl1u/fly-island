# 协议调研 3/4：新品牌设备

调研日期：2026-11-04。当前 worktree 基线：`978b3c79afb3cd778a720a3f7a8ffa58a5c11079`。
原始调研只新增本文；未实现协议、安装驱动、操作 HID、修改设备设置或固件。

2026-11-05 补充：VGN HUB 官方设备表与维护者实机记录已明确覆盖 VGN 的 `320F:5088` 键盘接收器，详见 §4.5。此前“不要对 `5088` 发 `1A 06`”的结论因缺少该 ID 证据而设，现由此限定实现取代；同 ID 的 Rainy75（#23）仍未验证，不把 VGN 的证据推广给它。

## 1. 结论与建议顺序

“可实现”表示公开证据足以开始限定设备的读取器实现，**不表示本项目已通过实机验收**。
“实机确认”指来源作者或 issue 用户的记录；本次没有独立硬件复测。
“只有代码”包括公开源码、静态配置和厂商文档；“推测”不得成为向设备发送命令的依据。
下列模块是原始调研的下一阶段建议；VGN 接收器的后续实现与证据边界另见 §4.5。

| 设备 / 精确身份 | 结论 | 证据和主要限制 | 建议顺序 |
|---|---|---|---|
| #33 MCHOSE V9 PRO，`291D:385D` | **可实现** | `FF90:0001`、64 字节输入/输出、`55 65 01`；上游有多电量和充电/关机实测。接电时百分比冻结，应隐藏。[H1][H2] | 1；复用已调研的耳机方案 |
| G3M PRO，`320F:706E` | **可实现百分比读取** | 精确型号的 MIT 源码与 Windows 项目实测声明；`FF1C:0092`、report `04`、64 字节、`1A 06`。充电字段仍未核实。[G1][G2][G3] | 2 |
| VGN 2.4G 键盘接收器，`320F:5088`（2026-11-05 补充） | **维护者单次实机读数，已限定接入** | VGN HUB 官方表对应 S99 / V98 PRO / VXE75 V2；`FF1C:0092`、report `04`、收发64字节，只读 `04 00 00 1A 06`。93% 对照官方94%，充电未知，休眠仅部分观察；Rainy75 不在官方表中，未验证。[VK1] | 独立 provider，不复用 G3M 请求 |
| #33 前行者 S9 候选，`089D:062F` | **可实现，响应身份须为 `M156`** | HaloBattery PR #352 有 70%/69% 实测声明及读取器；PR 尚未合并，实际代码的匹配条件比说明宽，不能直接照搬。[E1][E2] | 3 |
| 飞智 APEX5，`37D7:2501` | **可实现分档电量** | 社区源码明确覆盖有线及接收器，有无线原始响应；`FFA0:0001`，输出 `03`、输入 `04`、32 字节。电量是 0..5 档，不是 1% 精度。[F1][F2][F3] | 4 |
| 英菲克 IN9 Pro，`1D57:FA60` | **需要用户提供信息** | 同 ID 社区协议存在两种状态帧；尚无 IN9 Pro 的型号字节、刻度与充电对照。[A1][A2][A3][O4] | 5；先官方网页，再被动输入样本 |
| 钛度 TSG608，`1D57:FA60` | **需要用户提供信息** | #10 用户已报告官方软件显示 70%，但不能据同 ID 套 Attack Shark 的字段。[I10][A1][A2] | 与 IN9 分开验证 |
| Dragonfly 3 SE，`391D:1A01` | **需要用户提供信息** | 已确认 VGN HUB 入口；公开 OpenMouse 的 VGN F2 驱动是另一 VID/PID 和集合，不能迁移。[V1][V2][V3] | 6；优先取得官方网页准确型号/JS |
| Rainy75，`320F:5088` | **需要用户提供信息** | VIA JSON 精确包含该 ID，但 `BATTERY STATUS` 是按键定义。VGN 的同 ID 读取现有官方与实机证据，仍不能证明 Rainy75 兼容；WOB 分析对应 `5055`。[R1][R2][R3][VK1] | 7 |
| 狼途键盘，`1A2C:7FFF` | **需要用户提供信息** | 缺少零售型号；VID 厂商名成立，电量协议未查到。[U1][L1] | 8；先确认型号和官方驱动 |
| 机械师 M7，`062A:4180` | **需要用户提供信息** | MosArt 厂商名成立，但没有与该 PID 绑定的电量协议；须补完整型号和 `F1F2:F1F2` 的描述符。[U2][M1][B1] | 9；先核对官方客户端与硬件版本 |
| Ace 68 Air-III，`41E4:2132` | **需要用户提供信息，先确认是否有电池** | 官方 Ace 68/Air 系列文档明确仅有线；尚未把该硬件修订/PID 与具体 SKU 一一核对。[C1] | 先做身份核对，不排电量开发 |
| #33 Ace68-II，`41E4:2116` | **需要用户提供信息，先确认是否有电池** | 同上；不能从 K87 的 `41E4:2001` 扩展到同 VID 所有键盘。[C1][E1] | 同上 |
| #33 `36B6:C001`，`HIDI2C Device` | **无公开电量协议资料（本次范围内）** | fixture 只给出 I2C HID 名称和集合，没有证据它是此次投诉的无线外设；不建立电量读取器 | 不排实现；需用户确认实物角色 |

缺失协议的“无公开资料”均只表示本次列明的检索边界内未定位，不是证明全网不存在。
不能把“未取得电量的设备”枚举表当作“每个设备都有电池”的清单。

## 2. 边界、样例与来源可用性

- 编辑前已按 `project:myfinder-atk-battery` 标签调用 memory MCP `memory_search`。记忆仅用于范围和已知陷阱背景，任务书优先。
- 读取了 `.ai/tasks/fixtures/` 下的八份样例：`issue18-body.txt`、`issue20-body.txt`、`issue23-body.txt`、`issue25-body.txt`、`issue30-body.txt`、`issue31-body.txt`、`issue32-body.txt`、`issue33-body.txt`；#10 没有本地 fixture，另行在线核对了公开 issue。[I10]
- 联网检索工具可以读取 GitHub 源码、issue、PR、厂商支持页。命令行 `curl`/PowerShell HTTPS 在本环境报 TLS 凭据/SSL 错误；没有绕过 TLS 验证或更改代理。整体联网可用，部分来源读取受限。
- 未克隆上游、下载软件包、创建临时脚本或保存其他文件。上游源码均在线阅读。
- 除 S9 已核对到提交 `c9c75371e00e42d5714416718b40992e4a6ac7e7` 外，链接中的 `main`/`master` 是可变引用，不能视为统一的固定版本快照。
- **原始调研的厂商 JS 直接读取未完成**：当时能读到社区对厂商 JS 的分析与实现，但相关 SPA 页面为空文本、超时或不可访问，未取得当前完整 JS 包。2026-11-05 VGN 补充使用任务提供的官方 `assets/index-ZngoA_qG.js` 读取记录与维护者原始帧，见 §4.5；其他设备的原始证据范围不变。

| 样例 | 本次核对的身份/集合 | 样例不能证明的内容 |
|---|---|---|
| [#23](../../.ai/tasks/fixtures/issue23-body.txt) | `320F:5088` / `FF1C:0092` | report id、长度、命令、是否支持当前 VIA/WOB 版本 |
| [#32](../../.ai/tasks/fixtures/issue32-body.txt) | `320F:706E` / `FF1C:0092` | 与 Rainy75 协议相同 |
| [#31](../../.ai/tasks/fixtures/issue31-body.txt) | `1A2C:7FFF` / `FF01:0001`、`FF01:FF01` | 狼途具体型号、哪个集合负责电量 |
| [#18](../../.ai/tasks/fixtures/issue18-body.txt) | `062A:4180`，标准集合外还有 `F1F2:F1F2` | 此非标准 usage 的用途与读写格式 |
| [#25](../../.ai/tasks/fixtures/issue25-body.txt)、[#10][I10] | `1D57:FA60`；包含 `000A:0000`、`000B:0000` | 标准集合一定没有私有状态报告；两款鼠标刻度相同 |
| [#20](../../.ai/tasks/fixtures/issue20-body.txt) | `391D:1A01` / `FF01:0010`、`FF05:0002`；`41E4:2132` 没有 `FFxx` 集合 | 可用 VGN F2、ATK、MCHOSE 鼠标协议 |
| [#30](../../.ai/tasks/fixtures/issue30-body.txt) | `37D7:2501` / `FFA0:0001`、`FFEE:0001` | 两个厂商集合可互换 |
| [#33](../../.ai/tasks/fixtures/issue33-body.txt) | `089D:062F` / `FF00:0000`、`FF01:0010`；`291D:385D` / `FF90:0001` 等；`41E4:2116`；`36B6:C001` | `Wireless-Receiver` 的实物身份已通过响应验证；I2C 设备有电池 |

M7 样例的 `F1F2` 不在通常 `FF00..FFFF` 的厂商自定义 usage-page 范围内；任务表“无厂商集合”不能被解释为“没有任何非标准通道”。本文保留这条枚举事实，未据此认定电量通道或发送命令。

## 3. 快速模型线索核实

| 原线索 | 核实结果 | 可信度、许可证与来源 |
|---|---|---|
| `320F` 可能为 HFD；可用 Wobkey/VIA | HFD 公司/方案归属未核实；**把 `320F` 当作通用 HFD 电量协议的线索不成立。** Rainy75 社区分析称其为 Evision 平台；WOB 记录区分三种协议，甚至同品牌也不统一。VIA 线索对 `5088` 的身份成立，但未提供 Rainy75 的 host 电量命令；新增 VGN 证据只适用于 §4.5 的边界 | 只有代码/分析；[R1][R2] Apache-2.0；[R3] JSON 未核实独立开源许可。不能将社区平台名当作每台设备芯片的实测 |
| `1A2C` 为华润微 / China Resources Semico | USB ID Repository 名称为 China Resource Semico Co., Ltd，厂商归属线索成立；它不提供 `7FFF` 电量协议 | 只有数据库资料；[U1] 页面未标明独立代码许可 |
| `062A` 为 MosArt；libratbag 可能有同族设备 | MosArt 厂商名成立；**“因此能复用 libratbag 电量协议”线索不成立。** 已读取构建驱动列表和 SinoWealth 驱动，未定位 `4180` 的电量实现。SinoWealth 与 MosArt 不能混同 | 只有代码/数据库；[U2] 页面未标明独立代码许可；[B1][B2] MIT/Expat |
| `391D` 为 VGN/VXE；`hub.vgnlab.com` | VGN 产品与 HUB 线索成立；未核实“整个 391D 都是 VXE 同一方案”。本目标的协议仍未知 | 只有厂商文档与代码；[V1] 厂商版权；[V2][V3] AGPL-3.0 |
| `37D7` 为飞智；飞智空间站 | 成立。APEX5 社区以 Space Station 4.2.0.9 为协议参考，并给出硬件验证边界 | 上游实机确认 + 只有代码；[F1] CC0-1.0、[F2][F3] MIT，按项目分文件许可 [F6]；厂商软件本身不因分析项目开源而成为 MIT |

## 4. 可限定实现的协议

以下字节偏移均为零起点。G3M、APEX5、V9 的 `r` **包含非零 report id**；S9 的 `r` 是 `hid.read()` 返回的未编号输入数据，**不人为插入 report-id 0**。读缓冲区容量不等于描述符中的精确 report 长度。

### 4.1 G3M PRO `320F:706E`

来源：[G1] 的 `open_receiver`、`build_packet`、`transact`、`read_snapshot_open`，与 [G2][G3] 交叉核对。
BoBppy 源码精确列出该 VID/PID；BlueEve04 的 Windows README 声明电量读取已真机验证，并列出相同集合、收发长度和命令。可信度：**只有代码；另有 Windows 作者实机成功声明，本文未取得其完整原始对照日志**。

| 项目 | 已知内容 |
|---|---|
| 集合 | `FF1C:0092`。macOS 实现还限定 interface 1，并有标准键盘集合回退；Windows 新实现不采用该回退 |
| 类型、ID、长度 | Output → Input；report id `04`；完整帧 64 字节，ID 后 63 字节。不是 Feature |
| 请求布局 | `r[0]=04`；`r[1..2]` 小端和；`r[3]=命令`；`r[4]=长度/参数`；`r[5..6]=偏移`；`r[8..]` 数据 |
| 电量查询 | `04 20 00 1A 06` 后补 59 个 `00`，总长 64；源调用为 `transact(..., 0x1A, 6, 0, NULL, ...)` |
| 电量字段 | 匹配回答 `r[0]=04`、`r[3]=1A`；`r[8]` 为 0..100 百分比 |
| 失败过滤 | 不接受短于 64 字节、命令不匹配、命令 `FF`、或 `r[7]` 为 `FE/FF` 的回答；大于 100 表示无有效电量 |
| 校验 | 请求 `u16le(r[1..2]) = sum(r[3..63]) & FFFF`。引用的 `transact` **没有验证响应校验和**，响应是否同算法未核实 |
| 在线与会话 | 上游有 `AA` 在线查询，要求其响应 `r[8]=FF`。macOS 完整快照包在 `01/02` 配置会话中；Windows README 明确描述另一个句柄可以独立轮询电量。不能为了只读电量照搬配置快照或提交流程 |
| 充电 | Windows README 称支持充电，但本次读取到的协议实现仅明确 `r[8]` 电量；充电字节和值域**未知** |

拟用模块：`engine/providers/g3m.py`，首次只支持百分比，`charging_known=False`。
唯一选择规则：`(VID,PID,usage_page,usage)=(320F,706E,FF1C,0092)`，并核对该路径支持 report `04` 的 64 字节收发；只选择这一集合。响应再按上述签名、错误码和范围验证。
不要登记整个 `320F`，G3M provider 仍不处理 `5088`，也不要以 “G3M PRO” 字符串替代 USB/集合身份。此前对 `5088` 的一概禁发结论已由 §4.5 的 VGN 官方证据限定修订；VGN 请求的 `r[1]` 为 `00`，G3M 为 `20`，两者分开实现。

验收仍需 #32 用户对照两个放电电量、休眠/唤醒、官方驱动关闭时的独立轮询，以及未来单独的插拔充电对照。公开证据足以写百分比读取器，但不能宣称所有固件或充电状态已验证。

### 4.2 前行者 S9 `089D:062F`（#33）

[E1] 是上游 PR，状态为 **Open**；[E2] 是已核对的固定提交源码，MIT。
作者报告目标接收器实测 70% 和 69%，源码注释给出 `M156` 响应片段。可信度：**实机确认（来源作者），解析/未验证字段为只有代码**。
PR 提到的独立 `VERIFICATION.md`、`docs/protocols-sections.md` 本次读取为 404，不能声称已核对其中完整记录。

| 项目 | 已知内容 |
|---|---|
| 集合 | `FF01:0010`；fixture 另一个 `FF00:0000` 不作为候选 |
| 类型、ID、请求长度 | Output → Input；未编号报告。hidapi 写入 33 字节：首字节 `00` 为 API report-id 占位，后面为 32 字节 payload |
| 请求 | `00 30` 后补 31 个 `00`；设备信息命令 `30` |
| 输入长度 | 引用代码调用 `read(33)`，解析要求至少 15 字节；**33 是读取上限，精确 Input caps/完整原始响应长度尚未取得**，不能声称有描述符证明输入也是 33 字节 |
| 输入字段 | `r[0]=30`、`r[1]=00` 成功；`r[3]` 长度；`r[4..7]` ASCII 型号 `M156`；`r[12]` 充电标记；`r[13]` 电量 0..100；`r[14]` 连接状态 |
| 休眠 | `30 02` 且无有效 payload；不解释成 0%。移动鼠标后可以恢复回答 |
| 校验 | 输出缓冲区 `q[32]=sum(q[5..31]) & FF`，此只读请求为 0；不把命令字节 `30` 加进去。源码没有验证响应 checksum，响应校验未知 |
| 被动报告 | 注释提到 `D1 01 <level> ...`；未取得完整长度、身份和状态验证，首版不依赖这一旁路 |
| 充电可信度 | 注释为 `1` 充电，但代码实际用 `bool(r[12])`；PR 的电量成功记录不等于充电状态完成对照，首版建议未知，或仅在额外实测后接受已知值 |

拟用模块：`engine/providers/eweadn.py`。
唯一选择规则：精确 `(089D,062F,FF01,0010)`，核对未编号 Output 的 32 字节 payload 能力；成功回答还须 `r[4..7] == b"M156"`、命令/状态匹配且百分比合法。
输入 caps 在用户验收时补齐；有矛盾时停止，不靠对别的集合轮流试写来解决。

必须收紧上游代码：[E2] 实际枚举仅检查 page，未检查 usage；还包含更宽的有线 `088D:062E` 分支及 `M302`，并按整个品牌共用一个 key。本任务后续实现仅限 S9 接收器，不复制这些扩展；多设备按物理身份分组。
官方网页入口来自 [E3]，当前指向 `new-hub.eweadn.cn`；PR 的历史 `hub.eweadn.cn/pq/web/` 不能当作已取得的当前 JS。

### 4.3 APEX5 `37D7:2501`

[F1] 协议文档主要记载有线验证；[F2] transport 明确说有线及 dongle 均验证，`motion.py` 另有接收器固件 `7.0.4.5` 的原始片段：
`04 5A A5 01 01 00 80 02 00 00 00 00 05 ...`。[F3]
因此“只能找到有线证据”并不成立，但跨固件和 Windows 本项目验收仍未完成。

| 项目 | 已知内容 |
|---|---|
| 集合 | `FFA0` 厂商通道；本地 fixture 为 `FFA0:0001`。`FFEE:0001` 不参与 |
| 类型、ID、长度 | Output `03`、Input `04`，完整帧 32 字节，payload 31 字节；社区有线 descriptor 记录支持这一形状，transport 注明接收器相同 |
| 最小读取命令 | GET_INFO `01`；`03 5A A5 01 02 03` 后补 26 个 `00`，共 32 字节；对应 `read_info`，不启用 IMU、第三方控制或切换模式 |
| 请求校验 | `q[5]=sum(q[3..4]) & FF=03`。长度 `02` 包含命令/长度两字节。此处是累加和，不是真正 CRC |
| 响应签名 | `r[0]=04`、`r[1..2]=5A A5`、`r[3]=01`；已见单片 `r[4..5]=01 00`；`r[6]=80` 为已实测 APEX5，`r[7]=02` 为接收器 |
| 电量/充电字段 | `r[12] & 0F` 为档位 0..5；高半字节等于 1 时为充电。厂商将充电转成值 6，6 不是 120% |
| 展示 | 非充电时可以用 0/20/40/60/80/100 对应档位，必须标为分档估算；充电时建议仅显示状态，不臆测精确百分比 |
| 响应校验/分片 | `parse_info` 未校验响应 checksum，不能从输出规则推导输入也相同。协议文档提到多片；首版只解析已观察的单片结构，其余保留未知，不能从后续片固定取第 12 字节 |

拟用模块：`engine/providers/flydigi.py`，`kind="gamepad"`。
唯一选择规则：精确 `(37D7,2501,FFA0,0001)`，确认上述 report ID/能力；响应再确认 `80` 型号、单片结构和合法档位。不能只匹配 VID 或厂商 page，社区已经记录过同 VID 的充电底座误匹配。[F2]
不能照搬源码对异常档位的 `min(...,6)` 截断；低半字节超过 5 且未明确充电时应拒绝，不把坏数据变成正常充电。

SDL 的 Flydigi 驱动存在相同 V2 `03 / 5A A5 / GET_INFO=01` 常量和 APEX5 无线支持记录，[F4] 为 zlib 许可；它的游戏控制初始化不是电量读取的必要步骤，不能整体复制其控制接管流程。
HaloBattery 文档的 WGI/XInput 路径明确提到的是 Vader/G7 Pro 等，不能据此宣布 APEX5 能通过 WGI 返回精确百分比。[P1]

### 4.4 MCHOSE V9 PRO `291D:385D`（#33）

本地 [P2 调研](p2-protocols.md) 已有该设备；本次重新核对 [H1] 源码、[H2] issue 原始帧与状态对照，结论一致。源码 MIT；可信度：**实机确认（上游用户）**。

| 项目 | 已知内容 |
|---|---|
| 集合/类型 | `FF90:0001`，Output → Input，非 Feature |
| ID/长度 | report `55`，完整帧收发各 64 字节，payload 63 字节 |
| 请求 | `55 65 01` 后补 61 个 `00` |
| 响应 | `r[0..1]=55 65`，`r[2]` 百分比，`r[3]` 状态。`55 11` 为其他事件，不接受为电量 |
| 放电 | 状态 `02`，只接受 0..100；上游观察到 10% 步进，不宣称 1% 精度 |
| 接电 | 状态 `00`（查询）或 `03`（主动上报）；百分比可能冻结，输出 `level=None`，不能根据冻结值判断充满 |
| 关机 | 状态 `1A`；不把 `55 65 00 1A` 当作 0%。单次超时也不直接等于关机 |
| 校验 | 公开帧及代码未使用额外应用层 checksum；长度、签名、状态、范围必须检查。不添加邻近鼠标协议校验 |

拟用 `engine/providers/mchose_headset.py`；唯一规则 `(291D,385D,FF90,0001)`，确认 64 字节输入/输出能力。
与现有鼠标 `mchose.py` 分开；不因 `FF90:0001` 相同就加入 V9 Turbo+，也不把同机的灯控 ID 当第二副耳机。

### 4.5 VGN 2.4G 键盘接收器 `320F:5088`（2026-11-05 补充）

来源：VGN HUB 官方网页驱动 [VK1]（`assets/index-ZngoA_qG.js`，2026-11-05 获取）的设备表与 `weisheng` 实现，以及本项目维护者同日的原始收发记录。设备表将 `320F:5088 / FF1C:0092`、report `4`、`receiver:true` 关联到 VGN S99 / V98 PRO / VXE75 V2 2.4G Dongle。`getElectricQuantity()` 调用 `sendReport(4, [00,00,1A,06,00,00,00])`；回调数据不含 ID，`data[2]==1A` 时取 `data[7]`。

本项目独立实现 `engine/providers/vgn_keyboard.py`，仅按精确 ID/集合匹配；描述符须以字节数组确认输入、输出 report `4` 各64字节（含 ID），未知长度或同一物理接收器集合不唯一不发送。唯一请求是 `04 00 00 1A 06` 加59个零，不套用 G3M 的 `20` 校验字节。响应要求 `len(r)==64`、`r[0]==04`、`r[3]==1A`、`r[4]==06`，`r[8]` 在0..100；请求回显与格式不符的回复不产生读数。

维护者实机：休眠时15次收到 `04 00 00 FF 06 00…`，按键唤醒后收到 `04 00 00 1A 06 00 00 00 5D…`，即93%，VGN HUB 同时显示94%。证据为 A（本项目历史实机验证），只表示这次读数在1个百分点内一致。`FF` 表示休眠/离线、本次无新读数，不记为错误；引擎按原有无回复逻辑保留变灰的历史读数。充电未知（`charging_known=False`），不猜测响应校验或充电字段。独立冷启动、多个电量、所有固件与完整充电/休眠转换仍待实机验证。

Rainy75（#23）虽同为 `320F:5088` 且产品串同为 `Wireless Gaming Keyboard`，却不在 VGN 官方设备表中；仅凭这些信息不能区分，读取器可能对同 ID/集合/描述符发送这条只读查询。Rainy75 未验证、不宣称兼容，回复不符合上述格式不显示读数。也不将有线 `320F:5055` 等邻近 ID 加入匹配。

## 5. 仍需信息的设备

### 5.1 Rainy75 `320F:5088`

[R3] 的 VIA JSON 精确列出 `320F:5088`，但 `BATTERY STATUS / BATT_SHOW` 位于 `customKeycodes`，它证明有该按键功能，**不证明 VIA 提供读取电量百分比的 host 命令**。
[R1][R2] 的硬件/厂商 JS 分析对应 `320F:5055`：VIA 为 `FF60:0061`，WOB 私有协议为 `FF1C:0092`、report `04`。#23 仅枚举到后者，不能假定缺失的 VIA 集合存在。

| 目标所需项 | Rainy75 `5088` 当前结论 |
|---|---|
| 集合 | 已枚举 `FF1C:0092`，电量用途尚未确认 |
| report 类型、ID、长度 | Rainy75 仍未知；§4.5 的 VGN report `04`/64字节证据不能作为它的实测 |
| 电量命令、字段、充电、校验 | Rainy75 仍未知；VGN 已独立实现只读 `1A 06`，但同 ID 不等于 Rainy75 验证；不迁移 G3M 请求或 Rainy98/RT 的 `BE…ED` 帧 |

结论：需要用户提供具体版本（Lite/Standard/Pro、RGB、固件）、接收器/有线两种枚举和完整 caps。
先让用户从 WOB 官方支持入口打开其设备实际可用的 WOB/VIA 页面，确认 **2.4G 模式下网页是否显示数值电量**，提供准确网址、版本、设备识别信息及对应 JS 地址/公开资源。如果只亮键盘数字灯，应记录为本地电量指示，不能伪称网页读数。
网页资料仍不足时，再考虑官方读取动作的 USB 报文；无需先换固件或刷 ZMK。[R1] 的 ZMK 分支不支持原装 2.4G，不能作为本任务的电量解决方案。

### 5.2 狼途 `1A2C:7FFF`

VID 归属有 [U1]；型号未知是首要缺口。不能把狼途 M8 鼠标、T87 键盘等其他型号的网页协议移植给这个泛化产品字符串。
本次访问 [L1] 官方站为 SPA 空文本、公开配置入口不可读；OpenMouse/HaloBattery 检索未定位这个精确 ID 的电量实现。

目标集合候选为 `FF01:0001` 与 `FF01:FF01`；**report 类型、ID、收发长度、命令、字段、充电、校验全部未知**。
结论：需要用户提供键盘底部型号、硬件修订、接收器身份和官方驱动入口。若该型号有官方网页，优先确认网页在 2.4G 下能否看到电量及其匹配条件/JS；否则提供已在使用的官方客户端名称版本和显示值，最后才安排针对一次电量读取的抓包。
未来模块候选 `langtu.py`；在型号和协议未定前，不登记整个 `1A2C`，不对两个集合顺序试命令。

### 5.3 Ace 68 Air-III `41E4:2132` 与 Ace68-II `41E4:2116`

[C1] 官方说明明确 Ace 68/Air 系列仅支持有线连接。因此应先核实这两个产品字符串是否只是同机的有线磁轴键盘，而用户投诉实际指 #20 的 VGN、#33 的耳机/鼠标。
此处“没有需要读取的电池”对具体 PID 仍是**推测**：官方页未提供 `2132/2116` 到 SKU/硬件版本的映射，不能仅凭同系列名称最终排除。

两份 fixture 都没有厂商 `FFxx` 集合；电量集合、report 类型/ID/长度、命令、字段、校验均未知或不适用，必须在确认是否有电池后决定，不能伪填为 0。
结论：需要用户提供准确 SKU、连接方式、是否能脱离线缆工作、官方 M HUB 识别页及是否显示电量。若确认仅有线无电池，不实现电量读取器；若实物确为无线变体，重新取得完整描述符和对应官方 JS。
**不使用** HaloBattery K87 的 `13 4A 01`，因为其已确认身份是 `41E4:2001 / FF02`，与本目标不符。[E1]

### 5.4 机械师 M7 `062A:4180`

MosArt 名称已核实，但“机械师 M7”不是足够的固件身份。官方有 M7 双模精英版的专用驱动说明，[M1] 并没有把该驱动与 `4180` 的电量格式绑定。
[B1] 的 libratbag 构建驱动列表没有提供目标 MosArt 电量路径；[B2] 的 SinoWealth 配置命令不是目标证据。

集合：已见标准集合和 `F1F2:F1F2`；哪条路径能读电量未知。**report 类型、ID、长度、命令、字段、充电、校验全部未知**。
结论：需要用户提供底部完整型号/版本、官方驱动名称及下载链接、驱动是否在接收器连接时显示电量、完整 descriptor/caps（特别是 `F1F2`）。若官方提供该型号网页，优先网页身份和 JS；当前只核实到桌面驱动入口，不能编造通用 MosArt WebHID 入口。最后才抓取官方读取电量的最小交互。

### 5.5 IN9 Pro 与 TSG608：共享 `1D57:FA60` 不等于共享电量协议

这组值得继续：#10 用户明确报告 TSG608 的官方驱动显示 70%、未充电。[I10]
HaloBattery #69 先前也因没有厂商集合而判断无法读取，后续通过被动监听在 **Attack Shark R1** 上读到 90%，用户确认成功。[A1]
因此“只有标准集合，所以绝对无法读电量”这一推断不成立。不能再据顶层 usage 列表否定私有输入数据。

下面只是其他鼠标的**候选协议**，不是 IN9/TSG608 的已确认格式：

| 来源与对应设备 | 集合/类型/长度 | 状态格式与限制 |
|---|---|---|
| OpenMouse Attack Shark/R1/X11 系列 [A2] | `000A` 状态集合，Input report `03`，完整消息 5 字节；某 Windows 桥因 Constant 项丢失会将 report 标成 0，`03` 仍在数据中 | `03 model event p1 p2`；电量事件 `40`、`p1=01`；`p2` 可能是百分比或十分之一档位，必须按已验证型号表选择；无写入查询 |
| Attack-Shark-X3 研究 [A3] | `000A` 输入集合，5 字节状态报告；配置在另一 `000B` Feature 集合 | 与上述事件帧不同；例如 `03 10 03 00 FF` 是占位。作者明确承认“第 2 字节是电压还是百分比”仍未解决，不能采用其推测的电压曲线给本设备算百分比 |
| HaloBattery #69 [A1] | Windows 被动输入、R1 实机 | 新一代状态格式成功读到 90%，10% 步进；该样机没有充电信息。不能把 R1 名称或步进外推给 IN9/TSG608 |

校验：上述状态解码没有给出可用于目标的 checksum 规则；**IN9 与 TSG608 的 report id、精确长度、帧类型、字段、刻度和校验仍需各自确认**。不得把配置 Feature 写入作为唤醒/电量查询。

用户信息优先级：

1. IN9 Pro：旧款/新款/V2、底部型号、固件、官方驱动显示值。官方 [O4] 同时列出多个 IN9PRO 桌面包和 `hub.inphic.cn`；先确认当前这台接收器是否被网页识别，不为让网页识别而升级固件。
2. TSG608：记录 #10 所用官方软件的准确版本/链接，在同一连接上记录不同电量、未充电/充电显示。不能假定它有蓝牙或英菲克网页兼容性。
3. 两台设备分别补完整 descriptor/caps，尤其 `000A:0000` 的输入和 `000B:0000` 的 Feature 能力；如网页不能提供协议证据，先取**纯被动**输入报告及当时官方数值，覆盖唤醒、两个电量、插拔充电、休眠。无需预先向未知集合发命令。
4. 只有被动报告与官方网页都不足以定位时，才抓取官方软件电量读取的 USB 交互。

未来若证据成立，可设计共享状态帧解析器，但两种产品须各自有描述符/型号字段白名单和实测刻度；`1D57:FA60` 单独不能构成唯一设备匹配。

### 5.6 Dragonfly 3 SE `391D:1A01`

[V1] 确认 VGN HUB；`hub.vgnlab.com` 本次可访问但未返回可读 JS/文本。
[V2] 的 OpenMouse VGN 驱动只接受 `3554:FB56/FB57`、`FF02`、report `08` 的 16 字节 payload，[V3] 才在该身份上定义 `04` 电量和 `sum=55` 校验。目标 `391D:1A01` 枚举 `FF01:0010 / FF05:0002`，不满足其匹配条件。
OpenMouse GearHub 分支又是 `3151 / FFFF:0002` 的 Feature/relay 协议，同样不是目标。[V4]

目标电量集合未确定；**report 类型、ID、长度、命令、字段、充电、校验全部未知**。
结论：需要用户在官方 VGN HUB 选择确切的 Dragonfly 3 SE，记录实际跳转的子页面地址、版本、固件、2.4G 电量显示，以及该页加载的公开 JS/设备表；补齐两个厂商集合的描述符。优先用网页匹配与查询代码建立协议，抓包放最后。
未来候选模块 `vgn_dragonfly3.py`，仅在证实精确 PID、集合和报告形状后启用；不能把 SE 当作 Master+，也不能直接并入现有 Pulsar/ATK 的 17 字节路径。

### 5.7 #33 的 `36B6:C001`

fixture 为 `HIDI2C Device`，包含 `0001:0002`、`FF01:0001/0002/0003`。只有枚举，缺少实物、供电方式、标准电池 usage 或任何电量代码。
结论：本次未找到公开电量协议；report 类型/ID/长度、命令、字段、校验全部未知，不列入实现。
若用户确实投诉这个设备，先用系统设备名称/位置确认它对应的硬件；不要将内置 I2C 指针设备与外接无线鼠标接收器合并。当前“可能是内置触控设备”仅为推测。

## 6. 六类资料的检索覆盖与剩余缺口

| 资料类别 | 本次实际检查 | 能支持的结论与边界 |
|---|---|---|
| 厂商网页驱动的公开 JS | WOB `wobwxe.com` 超时；VGN、Inphic、EWEADN 新 HUB 空文本；EWEADN 历史 `/pq/web/`、`pq.json` 和狼途配置 API 不可访问。读取了 [R2][E2] 对厂商 JS 的公开分析/实现，并核实厂商支持入口 [E3][O4][V1][G4][C1][M1] | **没有取得当前完整 JS 包**；不能把空 SPA 当作无支持。Rainy/VGN/狼途/IN9 的 JS 路径是明确待补项 |
| OpenMouse | 当前独立协议仓库的 registry、VGN codec/driver、GearHub driver、Attack Shark driver 与 LICENSE [P2][V2][V3][V4][A2] | VGN F2 与目标不匹配；`FA60` 有被动状态帧但需型号判别。registry 未列出的品牌不等于全仓没有待合并支持；未进行完整仓库镜像检索 |
| HeyOkay/HaloBattery | 支持表、协议说明、公开 PR #352 及固定提交、issue #69 [P1][P3][E1][E2][A1] | S9 候选明确；R1 状态路径可为 `FA60` 后续调查提供方向；Vader 的 WGI 经验不能当 APEX5 证据。开放 PR/社区 fork 不等于 main 已支持 |
| libratbag | README、`meson.build`、`driver-sinowealth.c`、COPYING；按本批品牌/ID 的站内索引检索 [B1][B2][B3] | 未定位本批目标的可直接迁移电量驱动。`data/devices` 目录读取受限，未对全设备目录作穷尽否定 |
| Linux HID | `hid-input.c` 的标准 Battery Strength/电池页处理；固定 `v6.12` 的 `hid-ids.h`；另检查 Flydigi 内核路径 [K1][K2] | 标准电池解析依赖 descriptor 中具体字段，不能从顶层集合列表推出支持/不支持。当前 `hid-flydigi.c` 读取为 404；索引有 Vader 5 Pro 补丁，未把它当 APEX5 已合入内核的支持 |
| 社区逆向 | G3M 两项目、Rainy75 分析、OpenFlydigi、MCHOSE V9 项目与 issue、Attack-Shark-X3 研究 | 足以细化四个实现候选，并揭示型号/连接/刻度差异；其他设备保持未知，不用邻近协议补齐空项 |

搜索词包含本批精确 VID/PID、完整型号，以及 `battery/protocol/driver/电量/网页驱动`；对 `site:github.com/libratbag/libratbag` 和 `site:github.com/HeyOkay/HaloBattery` 进行了限定搜索。结果未命中不构成支持不存在的证明。
Linux 的标准读取路径 [K1] 使用描述符里的 report id、type、bit offset 和 logical range；IN9/TSG608 即使没有 `FFxx` 集合也不能被简单排除。此处只是代码层面的机制证据，不代表目标已经暴露标准电池字段。

## 7. 实现与验收交接

先做 V9 PRO、G3M、S9、APEX5 四个精确白名单读取器；分别保留“充电冻结”“充电未知”“休眠”“分档”的语义，不把未知状态强转成未充电/0%。
其中 V9 PRO 已有本仓 P2 调研，应由主管协调到同一个耳机模块，避免两个批次重复注册。
`DeviceStatus` 已有 `kind`、可空 `level`、`charging_known`，可以表达这些限制；本次未改它或 provider 注册表。

目标用户验收需要：官方软件关闭时独立读取、两档以上电量对照、接电与拔线、休眠/唤醒、拔接收器、同 VID 其他设备不误命中；只在证据不足的设备上补描述符/网页资料，最后才抓包。
引用源码中的宽泛 VID 匹配、键盘集合回退、品牌共用 key、无界 drain、配置提交和控制模式切换，不应作为只读电量实现的一部分直接继承。
本次未运行程序测试，因为只有调研文档；完成时仅检查新增路径、Markdown 引用、格式及 Git 无暂存/分支变化。

## 8. 来源与许可证索引

许可证针对所引用材料，不自动扩展到其分析的厂商软件、固件或 issue 附件。标注“未核实”时不建议直接复制代码；可以保留协议事实及来源，后续明确授权再移植实现。

| 引用 | 来源 / 许可证 / 本次证据等级 |
|---|---|
| G1 | [G3M C HID bridge][G1]；[MIT 许可][G5]；只有代码，精确 `320F:706E` |
| G2 | [g3mpro-macos README][G2]；MIT；只有代码/作者协议说明 |
| G3 | [Windows G3M Controller README][G3]；README 声明 MIT，未取得单独 LICENSE 文件；作者实机成功声明，原始电量日志未取得 |
| G4 | [HECATE 官方 G3M 支持][G4]；厂商版权，未见开放代码许可；只有文档 |
| VK1 | [VGN HUB 官方 JS][VK1]，`assets/index-ZngoA_qG.js`，2026-11-05 获取记录；厂商版权，未见开放代码许可；只采用设备表及协议事实、独立实现；维护者原始帧为93%对照官方94%，未推广至同 ID Rainy75 |
| E1 | [HaloBattery PR #352][E1]；代码 MIT，讨论/附件无另行核实许可；作者实机声明 |
| E2 | [S9 固定提交源码][E2]；[fork MIT 许可][E4]；只有代码，含上游实机片段 |
| E3 | [前行者官方下载入口][E3]；厂商版权，未见开放代码许可；只有文档 |
| F1/F5/F6 | [OpenFlydigi 协议][F1] 为 CC0-1.0、[设备设置/电量说明][F5] 为 MIT；已核对[分文件许可清单][F6]，不能把整个仓库统称 MIT；实机/静态分析由原文区分 |
| F2 | [OpenFlydigi transport][F2]；文件 SPDX MIT；有线及接收器实机声明 |
| F3 | [OpenFlydigi battery parser][F3]；文件 SPDX MIT；代码及接收器实机响应片段 |
| F4 | [SDL Flydigi][F4]；文件头 zlib 许可；只有代码/作者硬件注释 |
| H1 | [MchoseProtocol.cs][H1]；[MIT 许可][H3]；只有代码 |
| H2 | [V9 Pro 实测 issue #24][H2]；讨论/附件许可未单独核实；多状态实机对照 |
| R1 | [Rainy75 项目说明][R1]；作者声明源码与文档 Apache-2.0；部分实机，目标 `5055` |
| R2 | [WOB 网页 JS 分析][R2]；Apache-2.0 分析文档，厂商 JS 仍为专有；只有分析，非本次当前 JS 读取 |
| R3 | [Rainy75 2.4G VIA JSON][R3]；独立许可未核实；只有配置，精确 `5088` |
| U1/U2 | [China Resource Semico][U1]、[MosArt][U2] USB ID Repository；页面未显示独立代码许可；只有数据库身份资料 |
| L1 | [狼途官网][L1]；厂商版权；本次 SPA 无可读内容，不能提供协议证据 |
| C1 | [MCHOSE Ace68/Air 官方快速指南][C1]；厂商版权；仅有线的文档证据，未给目标 PID |
| M1 | [机械师 M7 官方驱动说明][M1]；厂商版权；只有驱动入口/版本身份线索 |
| O4 | [Inphic 官方驱动表][O4]；厂商版权；多版本及网页入口文档 |
| A1 | [HaloBattery R1 issue #69][A1]；讨论/附件许可未单独核实；R1 实机，不是 IN9/TSG608 |
| A2 | [OpenMouse Attack Shark driver][A2]；[AGPL-3.0][P4]；只有代码及作者硬件注释，不等于目标实测 |
| A3 | [Attack-Shark-X3 findings][A3]；[MIT][A4]；部分实机，电量刻度仍有明确推测 |
| V1 | [VGN HUB 官方说明][V1]；厂商版权；只有文档 |
| V2/V3/V4 | [VGN transport][V2]、[VGN codec][V3]、[GearHub transport][V4]；AGPL-3.0；只有代码，均不能直接匹配 `391D:1A01` |
| P1/P3 | [HaloBattery 协议说明][P1]、[设备支持表][P3]；[MIT][P5]；只有文档，具体实机范围以原文为准 |
| P2 | [OpenMouse registry][P2]；AGPL-3.0；只证明该版本注册表的内容 |
| B1/B2/B3 | [libratbag 构建驱动表][B1]、[SinoWealth 源码][B2]、[COPYING][B3]；MIT/Expat；只有代码，不是 `4180` 实测 |
| K1/K2 | [Linux 标准 HID 电池处理][K1]、[v6.12 HID IDs][K2]；文件 SPDX GPL-2.0-or-later；只有代码，ID 名称不能替代协议 |
| I10 | [本项目 TSG608 issue #10][I10]；用户报告许可未另行核实；实机枚举/官方显示 70% 的用户陈述，不是本项目电量成功 |

[G1]: https://github.com/BoBppy/g3mpro-macos/blob/main/Sources/CHIDBridge/CHIDBridge.c
[G2]: https://github.com/BoBppy/g3mpro-macos/blob/main/README.md
[G3]: https://github.com/BlueEve04/G3M-PRO-Controller/blob/main/README.md
[G4]: https://hecategaming.com/pages/g3mpro-product-support
[G5]: https://github.com/BoBppy/g3mpro-macos/blob/main/LICENSE
[VK1]: https://drive.vgnlab.com.cn/assets/index-ZngoA_qG.js
[E1]: https://github.com/HeyOkay/HaloBattery/pull/352
[E2]: https://github.com/Rum-right/HaloBattery/blob/c9c75371e00e42d5714416718b40992e4a6ac7e7/providers/eweadn.py
[E3]: https://www.eweadn.cn/drive/index.html
[E4]: https://github.com/Rum-right/HaloBattery/blob/add-three-2.4g-devices/LICENSE
[F1]: https://github.com/mkaliaha/openflydigi/blob/main/PROTOCOL.md
[F2]: https://github.com/mkaliaha/openflydigi/blob/main/flydigi/device.py
[F3]: https://github.com/mkaliaha/openflydigi/blob/main/flydigi/motion.py
[F4]: https://github.com/libsdl-org/SDL/blob/main/src/joystick/hidapi/SDL_hidapi_flydigi.c
[F5]: https://github.com/mkaliaha/openflydigi/blob/main/docs/device-settings.md
[F6]: https://github.com/mkaliaha/openflydigi/blob/main/LICENSE
[H1]: https://github.com/PyFlat/Device-Battery-Info/blob/main/src/DeviceBatteryInfo/Sources/Mchose/MchoseProtocol.cs
[H2]: https://github.com/PyFlat/Device-Battery-Info/issues/24
[H3]: https://github.com/PyFlat/Device-Battery-Info/blob/main/LICENSE
[R1]: https://github.com/scholzri/rainy75-zmk/blob/main/README.md
[R2]: https://github.com/scholzri/rainy75-zmk/blob/main/docs/wob-driver-analysis.md
[R3]: https://github.com/trkw/rainy75-v2-json/blob/main/RGB-2.4G-Rainy-75-2.4G-v2.json
[U1]: https://usb-ids.gowdy.us/read/UD/1a2c
[U2]: https://usb-ids.gowdy.us/read/UD/062a
[L1]: https://langtucn.com/
[C1]: https://support.mchose.store/hc/en-us/articles/51066559302292-Quick-Start-Guide-Ace-68-68-Air-Setup-Guide-Getting-Started-with-Your-Keyboard
[M1]: https://www.machenike.com/showInfo/365.html
[O4]: https://www.inphic.com/pages/drivers-manuals
[A1]: https://github.com/HeyOkay/HaloBattery/issues/69
[A2]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/drivers/attackshark/hid.ts
[A3]: https://github.com/prodmutant/Attack-Shark-X3/blob/main/docs/FINDINGS.md
[A4]: https://github.com/prodmutant/Attack-Shark-X3/blob/main/LICENSE
[V1]: https://vgnlab.com/pages/vgn-hub
[V2]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/drivers/vgn/hid.ts
[V3]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/vgn/index.ts
[V4]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/drivers/gearhub/hid.ts
[P1]: https://github.com/HeyOkay/HaloBattery/blob/main/docs/protocols.md
[P2]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/drivers/registry.ts
[P3]: https://github.com/HeyOkay/HaloBattery/blob/main/docs/devices.md
[P4]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/LICENSE
[P5]: https://github.com/HeyOkay/HaloBattery/blob/main/LICENSE
[B1]: https://github.com/libratbag/libratbag/blob/master/meson.build
[B2]: https://github.com/libratbag/libratbag/blob/master/src/driver-sinowealth.c
[B3]: https://github.com/libratbag/libratbag/blob/master/COPYING
[K1]: https://github.com/torvalds/linux/blob/master/drivers/hid/hid-input.c
[K2]: https://github.com/torvalds/linux/blob/v6.12/drivers/hid/hid-ids.h
[I10]: https://github.com/wushuai0802/myfinder-device-battery/issues/10
