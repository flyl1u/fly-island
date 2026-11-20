# P2 协议调研：ATK DONGLE-PAW 与 MCHOSE V9

调研日期：2026-11-04。工作树基线：`8abdbcd2bb5306a1369b197ba45dffcea6436567`。
本次只新增本文，没有实现协议、运行设备探针或访问 HID 硬件。

## 1. 结论与实现顺序

“可直接实现”表示公开证据足以编写限定设备的读取器，不表示本项目已通过实机验收。
“有实机确认”均指来源作者/用户的公开记录；本次没有独立复测。

| 设备/身份 | 结论 | 依据与可信度 | 建议顺序 |
|---|---|---|---|
| ATK A9 / A9 Pro，`373B:10F0`，`ATK 1K DONGLE-PAW` | **需要用户抓包**；本次未查到对应身份和集合的公开电量协议 | 本地 #26 fixture 只有枚举；OpenMouse 的两种 ATK 驱动分别要求 `FF02:0002`、`FF05:0001`，均不匹配此设备。不能把其他 A9 的成功外推到它。[S1]、[S2]、[S3] | 2；先取一位用户的完整样本，再由另两位验证相同描述符/固件 |
| MCHOSE V9 PRO，`291D:385D` | **可直接实现**，限定 `FF90:0001`、64 字节输入/输出；充电时隐藏百分比 | 有实机确认：独立 Windows 项目的 20% 报文，以及 Device-Battery-Info 的多电量、充电、满电、关机和最终应用验收记录。[S8]、[S9]、[S10] | 1 |
| MCHOSE V9 Turbo+，`3837:600A` | **需要用户抓包**；`55 65` 只能作为待验证线索 | 同样有 `FF90:0001`，社区将其识别为 C-Media 音频设备，但未找到把该 PID 与电量请求/响应绑定的公开实测。直接套 V9 PRO 是推测。[S11]、[S12] | 3 |
| 产品字符串 `V9 Turbo`，`3837:6008` | **电量协议未查到；需要用户抓包确认角色**，暂不增加电量读取器 | 有实机确认的是 Turbo+ 系统内的 WCH 灯控通道，不是电量字段。它和 `600A` 可同时出现，不能据字符串认定有两副耳机。[S11]、[S12] | 与 `600A` 一起调查；若证实只负责灯控，不做电量支持 |

这里的“未查到”仅覆盖下文列出的公开资料和搜索边界，不等于证明全网不存在资料。
普通 V9 Turbo 的零售型号与 `6008` 的一一对应关系也未建立；应先确认实物、连接方式和 USB 拓扑。

## 2. 证据口径、网络与本地边界

- **有实机确认**：来源提供目标 VID/PID、请求/响应和物理状态对照；仅支持它实际测试过的设备/状态。
- **只有代码**：可检查匹配、帧构造和解析，但不据此声称目标硬件成功。
- **推测**：共享厂商、型号前缀、芯片或 usage page 的类比，不能作为启用写入的依据。
- **未知**：缺失的 report id、长度、字段、校验等明确保留为空，不套用邻近型号。

联网成功：通过 Web 搜索/读取工具访问了 GitHub 原始源码、issue/PR 和厂商支持页。
本机 PowerShell/curl HTTPS 出现 TLS 凭据错误，Node 直连被环境拒绝；因此没有用本地下载结果充当证据。
GitHub 目录/API 和 issue 查询 URL 部分不可访问，但原始文件和具体 issue/PR 可读。
厂商 JS 的两条已知历史地址也未能读取（见第 6 节）。这是**部分来源不可访问**，不是整体无法联网。
没有安装工具、克隆仓库、保存下载包或创建其他文件。

源码链接的 `main` 是可变引用，本文记录的是本次在线读取内容；没有取得所有上游的提交哈希，不能声称它们组成同一固定版本快照。
本地证据以当前工作树为准：

| 本地来源 | 能证明什么 | 不能证明什么 |
|---|---|---|
| [issue26-body.txt](../../.ai/tasks/fixtures/issue26-body.txt)；[公开 #26][I26] | `373B:10F0` 产品字符串与 `FF00/FF10/FF11:0001` 枚举 | HID report id、输入/输出/feature 长度、电量命令或成功读取 |
| [issue20-body.txt](../../.ai/tasks/fixtures/issue20-body.txt)；[公开 #20][I20] | `3837:6008` 的 `FF00:0001`，以及 `3837:600A` 的 `FF21/FF22/FF82/FF90:0001` 同时存在 | 两个 ID 是两个独立耳机，或任一集合能读电量 |
| [issue29-body.txt](../../.ai/tasks/fixtures/issue29-body.txt)；[公开 #29][I29] | `291D:385D` 的 `FF22/FF82/FF90:0001` 枚举 | 本项目已经读到该耳机电量 |
| [HidBattery.cs](../../scripts/HidBattery.cs)、[pulsar.py](../providers/pulsar.py) | 原生路径限定 `373B:1278`；ATK 协议族扩展要求 `FF02:0002` 和已知的 17 字节输出长度 | 可将 `10F0` 加入 ID 表就完成支持 |
| [mchose.py](../providers/mchose.py)、[upstream-protocols.md](../upstream-protocols.md) | 已有 M7/A7、G7、A5 鼠标协议；当前 `3837` 分支会尝试厂商集合 | `3837` 下所有产品共用鼠标命令；V9 系列是耳机 |

fixture 是用户诊断记录，没有本次硬件观测；上表的公开 issue 链接用于定位，枚举内容以已读取的本地 fixture 为依据。
简报称 #26/#27/#28 都是 `10F0`，本次只核对指定的 #26 fixture，未独立核对另外两位的完整描述符。

## 3. ATK `373B:10F0`：必须取得新协议证据

### 3.1 已查到的相邻协议不能迁移为此设备结论

| 来源/通道 | 已知格式（不是 `10F0` 的格式） | 与目标的差异 |
|---|---|---|
| OpenMouse `drivers/atk/hid.ts` 与现有 Pulsar 路径 [S1] | `FF02:0002`；output/input；report id `08`，16 字节 payload，即含 ID 17 字节；电量命令 `04`。现有代码按完整帧读取 `r[6]` 电量、`r[7]` 充电，`r[16]=(55-sum(r[0..15])) & FF` | fixture 没有该集合；不存在已知的 17 字节能力证据 |
| OpenMouse `bitmouse` / `drivers/atk/bitmouse-hid.ts` [S2] | `FF05:0001`；report id `08`，63 字节 payload；`72` 命令族，电量命令 `07`、充电命令 `0F`，请求采用累加校验；不同于上述 17 字节协议 | fixture 也没有 `FF05`；不能仅因 A9/NearLink 名称相近而选它 |
| HaloBattery PR #347 [S4] | `373B:10C9`，作者实测 `FF02:0002`，17 字节 `04` 电量响应 | PID、集合都不同。该记录还展示了同 usage 下 20 字节和 17 字节集合的区别 |
| HaloBattery #291 / PR #350 [S5] | `373B:1216` NK NANO，`FF05:0001`；实测 BITMOUSE 电量与充电 | 同样不是 `10F0`；不能把这份 PR 当作 DONGLE-PAW 已支持 |
| 社区 `noosxe/atk-tool` [S6] | 当前注册表列出 `373B:1115` 和 `373B:10C9`，选择 `FF02/FF04` | 未列出 `10F0`，没有目标集合的实测依据 |

OpenMouse 的 ATK 生成目录注明来自 ATK HUB v3.2.27；在该目录及 `bitmouse/index.ts` 中查找 `0x10f0` 均未命中 [S3]。
这只是限定文件内的负向结果；更关键的证据是两个驱动的集合匹配规则确实不接受 fixture 的形状。
现有 `pulsar.py` 的 17 字节命令和 C# 原生规则应保留，不向 `FF00/FF10/FF11` 逐个试写。

### 3.2 目标字段清单

| 必需信息 | `373B:10F0` 当前结论 | 可信度/依据 |
|---|---|---|
| 电量集合 | 未知；已枚举候选为 `FF00:0001`、`FF10:0001`、`FF11:0001` | 用户 fixture；不是读写验证 |
| report 类型、report id | 未知 | 未找到目标驱动或抓包 |
| 请求/响应长度 | 未知，fixture 未含 HID caps/descriptor | 未验证 |
| 电量命令字节、握手、路由 | 未知 | 未验证 |
| 电量/充电字段及取值 | 未知 | 未验证 |
| 校验方式 | 未知；不能套 `sum=55` 或 BITMOUSE 的累加和 | 推测不足以实现 |

结论：**需要用户抓包**。未来如证实为独立协议，建议单独的 `engine/providers/atk_paw.py`，以精确 `373B:10F0` 加实际确认的集合、report id/长度匹配；这是模块设计建议，不是现有实现。
在集合和帧未知时不提供可运行的猜测请求。

## 4. MCHOSE V9 PRO `291D:385D`：可限定实现

### 4.1 可复核的电量帧

以下偏移均以**含 report id 的完整 HID 缓冲区**为零起点。不能把 63 字节 payload 和 64 字节完整 report 混用。[S8]、[S10]

| 项目 | 结论 | 证据 |
|---|---|---|
| 匹配 | VID `291D`、PID `385D`、usage page `FF90`、usage `0001` | 上游硬件 caps：Input=64、Output=64、Feature=0；`mi_00/col05` 只作为该样机记录，不能硬编码路径 [S8] |
| 传输 | output 写入、input 读取；report id `55` | Windows 实测与实现一致；不是 feature 报文 [S8]、[S10] |
| 长度 | 输入/输出完整 report 均为 64 字节，ID 后 payload 为 63 字节 | [S8]、[S10] |
| 请求 | `55 65 01` 后补 **61 个 `00`**，总长 64；不再在前面加 `00` | [S8]、[S10]，Linux 代码也构造相同 64 字节请求 [S14] |
| 响应 | `r[0]=55`、`r[1]=65`；`r[2]` 为原始百分比；`r[3]` 为状态 | 多电量与开关机对照 [S9]；解析代码 [S10] |
| 校验 | 公开请求/解析未定义应用层 checksum/CRC；检查长度、`55 65`、状态及有效电量范围，不添加猜测校验 | 只有代码层面的“未使用校验”结论；不据此断言所有固件没有其他校验机制 [S10]、[S14] |
| 时序 | 有主动查询，也有状态变化上报；不能只等被动通知 | 独立查询在官方软件关闭时读到 90%；关机时可超时 [S9] |

硬件对照包括 `55 65 14 02 ...`（20%）和 `55 65 5A 02 ...`（90%）。百分比是直接整数；上游用户看到 10% 步进，不能宣传 1% 精度。[S8]、[S9]

### 4.2 充电、满电与离线必须分开处理

| `r[3]` | 上游观察 | 推荐输出 |
|---|---|---|
| `02` | 正常放电；`r[2]` 对应厂商电量 | `0 <= r[2] <= 100` 才接受；放电、当前读数 |
| `00` | 插线时主动查询的响应；充电中与满电仍插线都出现，电量字节冻结 | 充电/接电状态，`level=None`；不能宣称正在充电与已经充满可区分 |
| `03` | 插线充电时接收器主动推送的状态 | 同上，隐藏冻结百分比 |
| `1A` | 关机事件 `55 65 00 1A ...`；后续主动查询可能无响应 | 离线，不显示为 0% |
| 其他 | 意义未知 | 拒绝映射成正常电量或“未充电”，留下诊断 |

来源 [S9]、[S10]；这是**有实机确认的上游行为**，本项目仍未验收。
较早的 [S8] 只记录状态、不解释它；应采用 [S9] 后续跨状态对照，不能从单个 `02` 样本推导充电标志。
上游拔线后曾短暂保留旧值，约 30 秒后手动刷新见到 100%；“自然延迟”是维护者解释，刷新与自动更新时间的因果关系未被独立隔离。
`55 11` 等非电量帧应跳过，不当成 `55 65` 回答，也不为只读电量功能发送 EQ/固件命令。

### 4.3 拟用模块、匹配与验收

建议新建 `engine/providers/mchose_headset.py`，独立于鼠标 `mchose.py`；首批只登记
`(291D,385D,FF90,0001)`，并要求已确认的 input/output 长度各为 64。未知长度或不匹配时不发送请求。
只在这条集合路径上 `write/read`，使用同一设备句柄、有限读取期限和报文过滤；不遍历 `FF22/FF82` 试命令。
以上是下一阶段实现建议，本次不创建模块或改注册表。

当前 `DeviceStatus` 已支持 `level=None`、`kind="headset"`、`charging_known` 等字段，可表达“接电但百分比未知”。
建议 `00/03` 映射接电/充电兼容状态并明确不能辨认满电；`1A` 标记离线；单次超时只表示此次没得到新证据，不自动等同关机。
多副设备使用现有物理分组，不能沿用鼠标按 VID 共用一个 key 的做法。

下一阶段验收应在目标 Windows 实机完成：厂商软件关闭时独立读取；至少两个放电电量；插线、满电仍插线、拔线延迟；关机、开机恢复及接收器拔插。
先做读取器和解析 fixture 检查，再确认最终 UI 的未知电量/充电/离线显示；上游通过并不等于本项目通过。

## 5. V9 Turbo / Turbo+：角色已知，电量协议仍缺证据

### 5.1 `3837:6008` 是已知灯控通道，不是已确认的电量通道

SlumberMin 在 Turbo+ 上实测同一系统出现两个 USB 设备：`6008` 的厂商字符串是 `wch.cn`、产品名 `V9 Turbo`，负责灯控；`600A` 是 C-Media 音频侧 [S11]。
这解释了 #20 的双 ID，但本机 fixture 未含厂商字符串或拓扑，因此其具体角色对应仍需用户确认。

公开灯控资料的关键区别：

- `FF00:0001` 的 usage 来自本地 fixture；上游实测了 `FF00`、input/output caps 各 65 字节。
- 详细协议文档规定 HID report id 为 **`00`**，payload 长 64，首字节 **`AA` 是报文头**。README 曾把 `AA` 叫作 report id，文字有冲突；文档和 `BuildQuery()` 的 65 字节构造支持前一种解释。[S12]、[S13]
- 已知状态查询为 `00 AA 07` 补零至 65；实现无额外校验计算。文档用该响应验证的是 RGB，**没有电量或充电字段定义**。完整帧中 RGB 偏移与 payload 偏移还需区分，不据样例里的 `1E` 等字节猜电量。[S12]、[S13]
- 上游灯控实测区分了 `WriteFile(65)` 与 `HidD_SetOutputReport`，并要求同句柄收取 ACK。这里是对灯控协议证据的记录，不是授权运行其改色探针。[S12]

结论：**电量集合、命令、字段、校验均未知**；已知的是另一个功能的 transport。
不能把 `07` 的 RGB 状态响应当作电池状态，也不能把 `6008` 名称当作型号识别的充分证据。

### 5.2 `3837:600A` 不能只改 V9 PRO 的 VID/PID

| 必需信息 | 当前结论 | 可信度 |
|---|---|---|
| 已枚举集合 | `FF21:0001`、`FF22:0001`、`FF82:0001`、`FF90:0001` | 本地用户 fixture |
| 实际电量集合 | 未知；`FF90:0001` 是因为 V9 PRO 的经验而值得对照的候选 | 推测，不可启用写入 |
| report id/类型/输入输出长度 | 未知；不能从 V9 PRO 的 `55`/64 字节移植 | 未验证 |
| 请求、响应、电量、充电、校验 | 未知；未找到目标 ID 的公开电量抓包/源码映射 | 未验证 |

BatteryOnPC 的公开支持列表提到 Turbo+，但项目明确应用闭源，公开 README 没有对应帧或精确匹配；这只能作为“可能存在可用方案”的线索 [S16]。
厂商官方指南明确 M HUB **网页驱动不支持音频产品，包括 V9 Turbo+**，应抓其桌面驱动流量 [S15]。
因此不将“网页鼠标协议可用于 `3837`”作为耳机支持依据。

现有 `mchose.py` 对 `3837` 的广泛匹配需要下一阶段明确分流，防止为 V9 厂商集合发送鼠标的反码 feature 命令。
OpenMouse 的 MCHOSE 鼠标驱动实际要求 `FF01:0001`，其状态命令 `06`、feature `11/12`、反码格式有 A7/L7/M7 的证据，目标 V9 fixture 不满足这一前提 [S7]、[S17]。
本文只指出集成要求，不改现有读取行为。

## 6. 来源、许可证与可访问性登记

下列编号是上述结论的引用键。许可证描述限于查到的声明；仓库许可证不能自动视作 issue 附件、截图或厂商 bundle 的再分发许可。
本报告仅摘述协议事实和短报文，不复制第三方实现。以后若移植代码，应保留相应版权与许可声明。

| 编号 | 已读取的来源 | 许可证 | 证据等级与覆盖限制 |
|---|---|---|---|
| S1 | OpenMouse [ATK driver][S1]、[ATK codec][OMCODEC] | [package.json][OMPKG] 声明 `AGPL-3.0-or-later`；仓库有 [AGPL v3 正文][OMLICENSE] | 只有代码；证明 `FF02` 格式及匹配，不证明 `10F0` |
| S2 | OpenMouse [BITMOUSE codec][S2]、[driver][OMBITDRIVER] | 同 S1 | 只有代码及上游其他型号的实测注记；不是 `10F0` |
| S3 | OpenMouse [ATK 生成设备目录][S3] | 同 S1；头注注明厂商 bundle 来源，不代表厂商授权已核对 | 只有代码；目录来源 v3.2.27、检索 `0x10f0` 未命中 |
| S4 | HaloBattery [PR #347][S4] | 仓库 [MIT][HALOLICENSE]；讨论未见独立许可 | 有实机确认，但仅 `373B:10C9` |
| S5 | HaloBattery [PR #350][S5]、[issue #291][HALO291] | 同 S4 | 有实机确认，但仅 `373B:1216`；上游主库 PR 当次为 open，不应称已合入 |
| S6 | noosxe/atk-tool [注册表][S6]、[项目页][ATKTOOL] | 项目页声明 MIT | 只有代码；注册表没有 `10F0` |
| S7 | HaloBattery [MCHOSE provider][S7]、[Pulsar provider][HALOPULSAR]、[支持表][HALODEVICES] | MIT | 源码/支持表覆盖相邻鼠标，未见目标 V9/`10F0` 的已合入实现；issue 搜索未穷尽 |
| S8 | rafagfran [README 协议与硬件 caps][S8] | [MIT][RAFLICENSE] | 有实机确认：`291D:385D`、64 字节、`FF90`、20%；不解释充电状态 |
| S9 | Device-Battery-Info [issue #24][S9] | 仓库 MIT；用户讨论/抓包未见单独许可 | 有实机确认：请求、多个电量、充电/满电/关机及最终 Macro Deck 验收；原始 issue 首帖含 AI 辅助草案，采用后续硬件记录而非首帖猜测 |
| S10 | Device-Battery-Info [解析代码][S10]、[已合并 PR #28][PYPR] | [MIT][PYLICENSE] | 只有代码，可与 S9 实测交叉核对；请求不计算 checksum |
| S11 | SlumberMin [项目 README][S11] | [代码 MIT；README/docs 为 CC BY 4.0][SMLICENSE] | 有实机确认：Turbo+ 的双 USB 身份与灯控；不是电量确认 |
| S12 | SlumberMin [详细协议][S12] | CC BY 4.0，作者 RiverSlumber / SlumberMin；本文为归纳并指出与 README 的差异 | 有实机确认：灯控 caps/传输/读回；没有电量字段 |
| S13 | SlumberMin [C# 探针源码][S13] | MIT | 只有代码；`BuildQuery()` 为 `00 AA 07`、65 字节；完整探针会改灯，未运行 |
| S14 | JoaoKSS [Linux HIDService 源码][S14]、[项目页][JOAOREPO] | 本次根目录只见 README 和 Python 文件，未查到 LICENSE；不能据公开可读视作可复制 | 只有代码；同 `291D:385D` 的 `55 65 01`/64 字节旁证；不采用其额外 EQ/feature 操作 |
| S15 | MCHOSE [Turbo+ 官方 M HUB 指南][S15] | 厂商内容，未查到开放源码许可 | 官方支持范围说明；不提供电量 wire protocol |
| S16 | BatteryOnPC [公开 README][S16] | 明确应用闭源；未据此取得实现许可 | 支持声明，不是原始协议或独立实机验收 |
| S17 | OpenMouse [MCHOSE driver][S17]、[codec][OMMCHCODEC]、[协议笔记][OMMCHNOTES]；alexfrih [PROTOCOL.md][MCHLINUX] | OpenMouse 同 S1；alexfrih [MIT][MCHLINUXLICENSE] | A7/L7 鼠标有上游实测；不能外推耳机 |
| S18 | [ATK HUB][ATKHUB] 与其历史 [v3.2.27 JS 地址][ATKJS]；M HUB 历史 [JS 地址][MCHJS] | 厂商 JS 许可未知 | ATK 首页可达但无可读正文；两条 JS 均返回工具不可访问。未检查其字节，不能声称已完成厂商 JS 逆向 |

已进行的定向检索包括：`@openmouse/protocol`、`373b 10f0`、`ATK 1K DONGLE-PAW`、`ATK FF10`、`MCHOSE 600A`、`MCHOSE V9 battery protocol`，以及 HaloBattery 的相关 issue/PR 查询。
具体检查了 OpenMouse 的 ATK/bitmouse/MCHOSE codec 与 driver、HaloBattery 当前 provider/支持表及上述 PR、V9 PRO 和 Turbo+ 社区源码/实测文档。
搜索引擎未命中、目录页不可访问、单个生成目录无条目，都不等价于“上游所有分支不存在实现”。

## 7. 需要用户提供的最小抓包包

以下是后续执行方案；本次没有联系用户、发布 issue、安装 USBPcap 或发送设备命令。

1. **先记录身份。** 型号标签、接收器/耳机/鼠标固件、厂商软件版本、连接方式，以及每条 HID 集合的 VID/PID、usage page/usage、report descriptor、input/output/feature 长度。提供 USB 接口号、端点及父子拓扑，序列号可脱敏。ATK 应明确是原配 `10F0` 接收器；Turbo+ 同时保留 `6008/600A` 的拓扑。
2. **捕获正常读取。** 用 Wireshark + USBPcap 捕获目标设备所在 USB 总线，从打开厂商驱动前开始，进入电量页、正常刷新并保持设备在线约 60 秒。ATK 用能实际识别这只接收器的 ATK HUB/官方驱动；Turbo 系列用 M HUB 桌面驱动。若官方软件也读不到，注明这一点，先不把失败记录当作有效查询样本。
3. **逐状态对照。** 在至少两个不同电量下记录软件显示值与时间；记录插线前、插线后、持续充电、满电仍插线、拔线后立即及 30 秒后；再记录设备关闭、接收器仍插着和重新开启。ATK 增加正常休眠/唤醒；Turbo+ 增加耳机离开/放上充电底座，观察两个 ID 的枚举是否改变。
4. **保留完整交换。** 提供 `.pcapng`、对应截图/时间标记、HID 描述符。需要完整 OUT/IN、SET_REPORT/GET_REPORT 的 setup 包、`wValue/wIndex/wLength`、端点、长度和时间戳，不能只截取几个疑似电量字节。抓包中的无关设备流量、账号和序列号在共享前剔除或脱敏。
5. **限定操作。** 只操作正常电量显示和物理充电/开关，不升级固件、不配对、不改 DPI/EQ/RGB，不用社区的全命令探测/改色脚本。后台轮询器由用户自行暂停，避免把另一个程序的请求误归因给厂商驱动。

对 `10F0`，这些材料应解决三条 vendor 集合中的真实通道、报文类型/长度、请求与响应关联及校验。
对 `600A`，应先验证电量是否确实走 `FF90`，再决定能否复用 V9 PRO 的解析。
对 `6008`，先确认它是不是同一套 Turbo+ 的灯控/底座部分；除非抓到可对照的电量数据，否则不分配第二个耳机电量卡片。
对 `291D:385D` 不再要求先做全面逆向；按第 4 节实现并用本项目做限定实机验收即可，固件行为不同再补抓包。

## 8. 本次验证与未决项

已核对指定 fixture、现有 C#/Python 的通道边界，以及公开请求/解析与上游硬件记录；未执行应用测试，因为只新增研究文档。
未完成：本项目实机验收；ATK `10F0` 的完整协议；Turbo 系列的电量字段；厂商 JS 的直接分析；所有上游分支/历史版本的穷尽搜索。
实现顺序建议为 **V9 PRO 限定读取器 → ATK `10F0` 抓包后实现 → Turbo+ `600A` 抓包后实现**；`6008` 在角色确认前不做电量移植。

[I26]: https://github.com/wushuai0802/myfinder-device-battery/issues/26
[I20]: https://github.com/wushuai0802/myfinder-device-battery/issues/20
[I29]: https://github.com/wushuai0802/myfinder-device-battery/issues/29
[S1]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/drivers/atk/hid.ts
[OMCODEC]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/atk/index.ts
[OMPKG]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/package.json
[OMLICENSE]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/LICENSE
[S2]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/bitmouse/index.ts
[OMBITDRIVER]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/drivers/atk/bitmouse-hid.ts
[S3]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/drivers/atk/device-catalog.generated.ts
[S4]: https://github.com/HeyOkay/HaloBattery/pull/347
[S5]: https://github.com/HeyOkay/HaloBattery/pull/350
[HALO291]: https://github.com/HeyOkay/HaloBattery/issues/291
[HALOLICENSE]: https://github.com/HeyOkay/HaloBattery/blob/main/LICENSE
[S6]: https://github.com/noosxe/atk-tool/blob/main/registry.go
[ATKTOOL]: https://github.com/noosxe/atk-tool
[S7]: https://github.com/HeyOkay/HaloBattery/blob/main/providers/mchose.py
[HALOPULSAR]: https://github.com/HeyOkay/HaloBattery/blob/main/providers/pulsar.py
[HALODEVICES]: https://github.com/HeyOkay/HaloBattery/blob/main/docs/devices.md
[S8]: https://github.com/rafagfran/mchose-v9-pro-battery-tray#protocolo
[RAFLICENSE]: https://github.com/rafagfran/mchose-v9-pro-battery-tray/blob/main/LICENSE
[S9]: https://github.com/PyFlat/Device-Battery-Info/issues/24
[S10]: https://github.com/PyFlat/Device-Battery-Info/blob/main/src/DeviceBatteryInfo/Sources/Mchose/MchoseProtocol.cs
[PYPR]: https://github.com/PyFlat/Device-Battery-Info/pull/28
[PYLICENSE]: https://github.com/PyFlat/Device-Battery-Info/blob/main/LICENSE
[S11]: https://github.com/SlumberMin/mchose-v9-protocol/blob/main/README.md
[S12]: https://github.com/SlumberMin/mchose-v9-protocol/blob/main/docs/PROTOCOL.md
[S13]: https://github.com/SlumberMin/mchose-v9-protocol/blob/main/tools/headset_test.cs
[SMLICENSE]: https://github.com/SlumberMin/mchose-v9-protocol/blob/main/LICENSE
[S14]: https://github.com/JoaoKSS/MCHOSE_v9_PRO_Controller/blob/main/mchose_qt.py
[JOAOREPO]: https://github.com/JoaoKSS/MCHOSE_v9_PRO_Controller
[S15]: https://support.mchose.store/hc/en-us/articles/52490770510228-V9-Turbo-M-HUB-Guide-Desktop-Driver-Web-Driver-Setup
[S16]: https://github.com/Capi005/batteryonpc/blob/main/README.md
[S17]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/drivers/mchose/hid.ts
[OMMCHCODEC]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/mchose/index.ts
[OMMCHNOTES]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/docs/mchose-protocol.md
[MCHLINUX]: https://github.com/alexfrih/mchose-linux/blob/main/PROTOCOL.md
[MCHLINUXLICENSE]: https://github.com/alexfrih/mchose-linux/blob/main/LICENSE
[ATKHUB]: https://hub.atk.pro/
[ATKJS]: https://hub.atk.pro/static/index-F-MYsmWR.js
[MCHJS]: https://www.mchose.com.cn/assets/purify.es-DfJclCKp.js
