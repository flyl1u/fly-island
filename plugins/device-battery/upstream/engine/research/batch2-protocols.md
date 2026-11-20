# 协议调研 2：G87 V2、Kick75、G98 V3、MagDock

调研日期：2026-11-04（Asia/Shanghai）。任务基线：`a8ec6babb1d495f5fd8b015b4906053a211ebef7`。

本次只检查公开资料、厂商 JS 和任务样例，没有访问 HID、执行厂商脚本、发送设备命令或修改实现。以下「可实现」指有足够的代码证据编写一个严格匹配的候选适配，不代表已在本项目或用户设备上验证。报告描述符、实际 USB 包和状态变化仍须验收。

## 结论与顺序

| 顺序 | 设备 | 结论 | 后续方向 | 可信度 |
| --- | --- | --- | --- | --- |
| 1 | G98 V3 `3837:1015` | **可实现** | 新模块 `engine/providers/mchose_qhw_keyboard.py`；`FF80:0001`、output report `4D`、命令 `0904` | 只有代码：官方精确型号映射与完整读命令；未实测 |
| 2 | G87 V2 `3837:3033` | **可实现** | 新模块 `engine/providers/mchose_glw_keyboard.py`；官方选择的是 `0001:0000`，通过配置读取取得电量 | 只有代码：官方精确型号映射与字段解析；未实测 |
| 3 | NuPhy Kick75 接收器 `19F5:3247` | **需要用户抓包** | 先确认版本、接收器描述符和官方软件的无线电量能力 | 只有代码／推测边界：已找到的 IO 有线代码不能外推到此接收器 |
| 4 | MagDock `3837:1012` | **无公开资料**，限于「底座自身读取所连鼠标电量」 | 当前不安排电量 provider；必要时先确认官方是否提供此功能 | 只有代码：官方普通状态读取和 OpenMouse 都只提供灯光等状态 |

顺序依据：G98 V3 有独立电量读命令；G87 V2 需读取配置且产品共用 PID；Kick75 缺目标连接的协议；MagDock 尚未证明需要独立电量适配。上述模块仅为拟用名称，本次没有新增它们。

## 证据口径与可复核来源

- **实机确认**：仅指给定用户诊断，或明确标注为上游作者的硬件记录；不是本次实机测试。
- **只有代码**：从成功取得的源代码、厂商发布的 JS 中确认调用、常量、设备映射或解析方式。
- **推测**：尚未由目标设备数据验证的兼容性、回复校验或状态行为。负面检索只覆盖下列文件／版本，不代表全网不存在资料。
- 所有偏移从 **0** 开始。`P[i]` 指不含 report ID 的 WebHID payload；`D[i]` 指去掉协议头后的数据。hidapi/Windows 缓冲如带 report ID，偏移还需加 1。API 数组长度、逻辑报文长度、HID 描述符容量、USB 实际传输长度分别记录，不能互相替代。

| 标识 | 来源及固定版本 | 许可证／使用边界 |
| --- | --- | --- |
| M1 | [M HUB 当前入口](https://www.mchose.com.cn/)、[应用 JS](https://www.mchose.com.cn/assets/main-ChPQDflP.js) | 厂商公开 JS；未查到协议实现的开源复用许可证。只提取协议事实 |
| M2 | [CZ SDK manifest](https://www.mchose.com.cn/cizhou/CZ_SHARED_DATA/asset-manifest.json?v=1)、[SDK 主文件](https://www.mchose.com.cn/cizhou/CZ_SHARED_DATA/main.b1d3fb6f68d495cc5961.js)、[lodash 依赖](https://www.mchose.com.cn/cizhou/CZ_SHARED_DATA/lodash.1e0153938fbb9c24d9c7.js) | 厂商 SDK 未查到开源许可证；第三方依赖的许可不等于厂商协议代码许可 |
| N1 | [NuPhy IO](https://www.nuphy.io/)、[官方驱动 JS](https://drive.nuphyio.com/static/js/main.ba072d08.js)、[官方 FAQ](https://www.nuphy.io/en-US/commonProblem) | 厂商公开内容；未查到协议代码的开源复用许可证 |
| O1 | [OpenMouse registry](https://github.com/OpenMouse-Project/mouse-protocol/blob/30d6ad37d0ecc9fff53f86d5058d67a88e07150d/src/drivers/registry.ts)、[迈从协议说明](https://github.com/OpenMouse-Project/mouse-protocol/blob/30d6ad37d0ecc9fff53f86d5058d67a88e07150d/docs/mchose-protocol.md) | [package.json](https://github.com/OpenMouse-Project/mouse-protocol/blob/30d6ad37d0ecc9fff53f86d5058d67a88e07150d/package.json) 明确 `AGPL-3.0-or-later`；[许可证正文](https://github.com/OpenMouse-Project/mouse-protocol/blob/30d6ad37d0ecc9fff53f86d5058d67a88e07150d/LICENSE) |
| O2 | 同一 OpenMouse 提交的 [dock.ts](https://github.com/OpenMouse-Project/mouse-protocol/blob/30d6ad37d0ecc9fff53f86d5058d67a88e07150d/src/mchose/dock.ts)、[dock-hid.ts](https://github.com/OpenMouse-Project/mouse-protocol/blob/30d6ad37d0ecc9fff53f86d5058d67a88e07150d/src/drivers/mchose/dock-hid.ts) | 同 O1：AGPL-3.0-or-later |
| H1 | HaloBattery `2251f0534a8e886c9692ead42056059b4f69d8c0`：[设备表](https://github.com/HeyOkay/HaloBattery/blob/2251f0534a8e886c9692ead42056059b4f69d8c0/docs/devices.md)、[provider 注册](https://github.com/HeyOkay/HaloBattery/blob/2251f0534a8e886c9692ead42056059b4f69d8c0/providers/__init__.py)、[mchose.py](https://github.com/HeyOkay/HaloBattery/blob/2251f0534a8e886c9692ead42056059b4f69d8c0/providers/mchose.py) | [MIT](https://github.com/HeyOkay/HaloBattery/blob/2251f0534a8e886c9692ead42056059b4f69d8c0/LICENSE) |
| C1 | [arutkowski00/mchose-hid-bridge](https://github.com/arutkowski00/mchose-hid-bridge#wire-protocol-k99-v3-confirmed) | 所查根目录／README 未找到明确许可证；不能按可复用开源代码处理 |
| C2 | Tensyd/mchose-battery `4b45f9c52bc5b6bf3270d5340bd453c4bb044514`：[兼容性记录](https://github.com/Tensyd/mchose-battery/blob/4b45f9c52bc5b6bf3270d5340bd453c4bb044514/docs/compatibility.md)、[协议代码](https://github.com/Tensyd/mchose-battery/blob/4b45f9c52bc5b6bf3270d5340bd453c4bb044514/src/device/protocol.rs) | [README](https://github.com/Tensyd/mchose-battery/blob/4b45f9c52bc5b6bf3270d5340bd453c4bb044514/README.md) 声明 MIT，但该版本树没有 LICENSE，许可证正文未核实 |
| C3 | [marsuyone/mchose-battery-tray](https://github.com/marsuyone/mchose-battery-tray#协议) | 所查根目录／README 未找到明确许可证 |
| C4 | [DX-Cloud/MchoseG98V2AutoLight](https://github.com/DX-Cloud/MchoseG98V2AutoLight#工作原理hid-信号分析过程) | [MIT](https://github.com/DX-Cloud/MchoseG98V2AutoLight/blob/main/LICENSE) |
| C5 | Pixelmoss/codex-kick75-status-lights `e32648ee86a8a729734060ac09bd7f8a1213876f`：[协议记录](https://github.com/Pixelmoss/codex-kick75-status-lights/blob/e32648ee86a8a729734060ac09bd7f8a1213876f/docs/PROTOCOL.md) | [MIT](https://github.com/Pixelmoss/codex-kick75-status-lights/blob/e32648ee86a8a729734060ac09bd7f8a1213876f/LICENSE) |
| C6 | Erimaru11/kick75-companion-public `d55fcaa18885bef28bea7570dccf8578ecd13380`：[README](https://github.com/Erimaru11/kick75-companion-public/blob/d55fcaa18885bef28bea7570dccf8578ecd13380/README.md) | [GPL-2.0](https://github.com/Erimaru11/kick75-companion-public/blob/d55fcaa18885bef28bea7570dccf8578ecd13380/LICENSE) |

厂商资源本次成功联网取得，仅在内存分析。M1 入口当时引用 `assets/main-Bm-EbtX_.js`，再引入上表应用 JS；`cizhou/CZ_SHARED_DATA/loader.js?v=4` 通过 manifest 选择 M2。上游旧文档引用的 `purify.es-DfJclCKp.js` 本次返回 404，未把旧文件当成当前事实。精确 SHA256（响应文本按 UTF-8 编码）：

```text
M1 main-ChPQDflP.js
3ade42a0c11303b1e6aad24264793b23b461c8fa0797f61c4098f49fd288ce0d
M2 main.b1d3fb6f68d495cc5961.js
e609efee813b6cc59275595ef09d09cbc67f42195746d3eb274b0d0f9cb572c4
M2 lodash.1e0153938fbb9c24d9c7.js
b7540815648a207bef60e4b0b5b7caa342bf09a13da45f47cd91e9701ace1648
N1 main.ba072d08.js
df67fad34982ebdbcc9b74dec4912cc5079f4ce782a1166974ddb8d06f0fba32
```

下文厂商文件位置为上述版本 `response.text()` 的 JavaScript 字符串偏移，便于在压缩文件里定位；它们不是 UTF-8 字节偏移，也不是硬件抓包位置。

## 1. G87 V2：可实现，使用 GLW 键盘协议

### 身份与证据

用户样例 [issue24-body.txt](../../.ai/tasks/fixtures/issue24-body.txt) 实机诊断为 `3837:3033 "MCHOSE G87 V2 2.4G"`，同时有 `0001:0000` 和 `FF31:0074`，没有报告长度或电量报文。可信度：**实机确认（仅枚举）**；资料为用户提供，未附复用许可证。

M2 约 `107800–109250` 的 G87 V2(8K) 设备表给出无线分支 `14391:12339` 和精确产品名 `MCHOSE G87 V2 2.4G`；继承普通模式 `hidFilters: [{usagePage:1, usage:0}, ...boot...]`。`getDeviceManufacturer`（约 `145472`）默认 `glw`，SDK 工厂（约 `214357`）选择 GLW 类。M1 约 `920300` 和 `1989800` 的连接筛选也选择该 PID 的 `0001:0000`。来源 M1/M2，许可证见来源表，可信度：**只有代码**。

因此不能仅因存在 `FF31:0074` 就在这个集合发送查询，也不能由它推断与 Kick75 同协议。`3837:3033` 还被 K99 V3、K87S、G75 V2 无线分支共用；产品名是匹配的一部分。来源 M2 的四处 `productId:12339` 映射，可信度：**只有代码**。

### 拟用读取路径

以下均来自 M2 的 `getFuncConfig`、`getPerformanceInfo`、解析函数 `Ie`、GLW 命令队列和通用 `sendReport`（约 `320177`、`325100`、`355300–357950`、`442450–445150`、`479707`、`537100–537650`）；许可证未声明，可信度：**只有代码，未实测**。

| 参数 | 已知事实／边界 |
| --- | --- |
| 集合 | `0001:0000`；不是 `FF31:0074` |
| 类型 | `sendReport` 输出，`inputreport` 回复；不是 feature |
| Report ID | 发送 ID `0`，即无编号报告的 API 表示；所查 GLW 接收代码未单独校验事件 report ID，实际 input 描述符需确认 |
| 长度 | 官方固定发送 64 字节 payload；Windows/hidapi 发送缓冲预期为前导 `00` 加 payload，共 65 字节，须由现场 caps 核对。配置读取分 56 和 8 字节两段，每段都有 8 字节协议头；不能把第二段的有效长度 16 当成整个 HID report 长度 |
| 请求头 | `P[0]=55, P[1]=命令, P[2]=00, P[3]=sum(P[4..63]) & FF, P[4]=请求数据长度, P[5..6]=offset LE, P[7]=00`，其余零填充 |
| 电量读取 | `getFuncConfig(profile)` 使用命令 `05`，从 `64*profile` 读取 64 字节配置；官方分段为 offset=`64*profile`、length=`0x38`，以及 offset=`64*profile+56`、length=`0x08`（offset 算式中的 64 和 56 为十进制） |
| 回复匹配 | `P[0]=AA`、命令回显、请求 offset 回显；源码还检查回复声明长度不超过请求长度，随后从 `P[8]` 起取数据 |
| 电量／充电 | 合并配置 `D[32] & 7F` 是百分比，`(D[32] >> 7) & 1` 是充电位。第一段从配置起点读取时即 `P[40]`，若缓冲前面保留 report ID 则为 raw[41] |
| 校验 | 请求的加和已追到 lodash `36119 → 17721 + 83488`，确认是普通累加取低 8 位。所查接收路径没有验证回复校验字节；**回复是否采用同一算法尚未确认**，不能把推测当成已知 CRC |

以 profile=0 为例，两个 output payload 的前八字节分别是 `55 05 00 38 38 00 00 00`、`55 05 00 40 08 38 00 00`，各补零到 64 字节。它们是根据代码推导的请求，**不是实机抓包**。

需要跟随当前板载配置时，可先用 `getBase` 的只读命令 `04`、offset=0、length=`38`（`55 04 00 38 38 00 00 00` + 零填充）读取配置索引。M2 约 `546637` 的 `Be` 按 4 个槽位解析：数据[2..5] 构成 0..3 排列时，活动槽位为该排列[data[0]]；旧格式则直接用有效的 data[0]。必须拒绝异常索引。**不要移植 SDK 高层 `getBase()` 的自动修复分支**：约 `472776` 起的包装器遇异常会调用 `setBase()`，这不属于电量读取。直接复刻只读请求和必要解析即可。上述仍是代码证据。

### 唯一匹配与验收

拟用 `mchose_glw_keyboard.py`；同时满足：

1. VID=`3837`、PID=`3033`、产品名精确为 `MCHOSE G87 V2 2.4G`。
2. 顶层集合 `0001:0000`；排除标准键盘、鼠标、消费类集合及 `FF31:0074`。
3. 描述符确认无编号 output report 容量为 64 字节 payload，并有容纳完整响应的 input report；记录实际 input ID/长度后只接受该报告。长度未知、存在多个无法区分的候选或描述符不符则拒绝，不试其他协议。

匹配方案是根据 M1/M2 的**推测／设计建议**，并非已验证设备规则。响应需验证长度、命令、offset、完整数据和 0..100 范围；读取异常不解释为 0%。通用 channel `setup`（约 `431826`）只是注册监听与本地锁，没有在这段初始化中发送握手；独立读取在实机是否还需要其他前序动作仍待验证。

特别需要排除的近似资料：C2 的已实测 **G87 V2 是 `3837:201B + FF02:0002`**，使用 `13 4A ...` 的 20 字节 output，与本任务身份不同；C3 的 G87 是 `41E4:2001 + FF04`、feature `06`，也不同。C1 的 `3837:3033` K99 V3 记录 `55 03 ...`、百分比在回复 byte8，而当前官方 GLW `03/getInfo` 是身份／固件读取，电量来自 `05` 的配置字段；不能混用两份布局。这些是**上游实机记录，仅对各自设备／固件成立**，相关许可证分别见 C1/C2/C3。

待实机验收：描述符与 65 字节 Windows 缓冲、活动配置切换后的字段一致性、放电／充电／满电、回复校验字节、休眠／关闭时是否陈旧；暂无目标设备原始电量样本。

## 2. NuPhy Kick75 接收器：需要用户抓包

用户样例 [issue30-body.txt](../../.ai/tasks/fixtures/issue30-body.txt) 是 `19F5:3247 "NuPhy Kick75 Dongle"`，厂商集合 `FF31:0074`。可信度：**实机确认（仅枚举）**；用户资料未附许可证。

| 目标参数 | 本次能确认的结果 |
| --- | --- |
| 集合 | `FF31:0074` 存在，但尚未证明它承担电量读取 |
| Report ID、报文长度 | 未知 |
| output / feature / 主动 input | 未知 |
| 查询命令、电量字段、充电字段 | 未知 |
| 校验方式、会话握手 | 未知 |

上述未知是下列有限检索的结论，不能用其他连接的参数填空：

- **N1，只有代码，厂商许可证未声明**：官方 IO JS 中 Kick75/Kick75High 为 `19F5:1026` / `19F5:1027`，集合 `0001:0000`；其通用 `write()` 使用 report 0、64 字节 output 和 inputreport。设备表未找到目标 PID 的十进制 `12871`。模块 `85130` 的 `isSupportBatteryShow()` 只允许 `WH80`、`WH80ByDongle`，未包含 Kick75。该文件不能证明目标接收器有电量命令，也不能证明它没有。
- **C5，实机确认仅限作者的有线 IO 灯光，MIT**：对象是 `19F5:1026`、`0001:0000`，report 0、64 字节 output/input，`55/AA` 方向头、`payload[3] = sum(payload[4..63]) & 0xFF`，`EE` 建立 XOR 会话、`D5/D6` 读写灯光。它没有提供本目标的电量命令，不能套用。
- **C6，只有代码／作者说明，GPL-2.0**：实时电量依赖作者自定义 QMK 固件并通过有线 USB。没有证据证明本次原厂接收器同源，因此不借用该命令，也不建议为本任务刷固件。VIA/Vial 的通用 Raw HID 集合形状同样不是固件同源证据。
- **O1/H1，只有代码，分别 AGPL-3.0-or-later / MIT**：所查注册表、设备表未找到 NuPhy/Kick75 电量实现。这是固定版本内的负面结果。

请用户提供：

1. Kick75 的 IO 或 QMK/VIA 版本、键盘与接收器固件版本；分别导出接收器和有线键盘的完整 HID report descriptor（含接口编号、集合、各 report ID/类型/长度），保留产品名，脱敏序列号和路径。
2. 先确认官方软件能否在**仅 2.4 GHz 接收器**模式显示电量；若能，USBPcap/Wireshark 从打开状态页前开始录约 20 秒，同时记录官方百分比和充电标志。不要改键位、灯光或固件。
3. 在同一个接收器上分别记录清醒放电、外部供电充电、停止充电、关闭键盘；避免把新增有线 USB 设备的回复误认成 `3247` 接收器回复。
4. 若官方不显示无线电量，先只观察接收器在唤醒、休眠、关机及手册电量查看操作时的 input 数据，不枚举未知 output/feature 命令。

当前不指定可执行命令或实现模块。以后仍须按精确 VID/PID、产品身份、集合与描述符选择唯一协议，不能因为与 G87 V2 共用 `FF31:0074` 就复用其命令。

## 3. G98 V3：可实现，使用 QHW 键盘协议

用户样例 [issue21-body.txt](../../.ai/tasks/fixtures/issue21-body.txt) 是 `3837:1015 "MCHOSE G98 V3 2.4G"`，厂商集合 `FF70:0071`、`FF80:0001`、`FF81:0001`。可信度：**实机确认（仅枚举）**；用户资料未附许可证。

M2 约 `109250–110900` 精确映射该 VID/PID/产品名到 `manufacturer:"qhw"` 的 G98_V3，继承 `FF80:0001`；M1 的连接筛选也为 `14391:4117 + 65408:1`。不向 FF70 或 FF81 发送查询。来源 M1/M2，厂商许可证未声明，可信度：**只有代码**。

### 电量请求和回复

证据为 M2 模块 `70040` 的 `getBattery`（约 `391897`）、`toChargingStatus`（约 `383712`）、QHW 队列 `Ue`（约 `422686–426300`）、通用 `sendReport`（约 `444700`）。均为**只有代码，未实测**。

| 参数 | 已知事实／边界 |
| --- | --- |
| 类型、report ID | output `sendReport(4D, payload)`，回复来自 inputreport；不使用 feature |
| 命令 | `getBattery()` → `_simpleGet(2308, [])`，即 `0904`（命令采用 little-endian） |
| 请求 payload | `01 03 00 04 09 00 ss cc`；version=1、flags=3、data length=0、cmd=0904、bizCode=0、sequence=`ss` |
| 序列号 | 取当前计数器低 8 位后递增，源码为 `255 & SEQUENCE_ID++`，初值 0；每次请求记录其值，回复匹配同一值 |
| 请求校验 | `cc = XOR(P[1..6]) = 0E XOR ss`；排除 version 字节 P[0]，也排除独立传入的 report ID |
| 请求长度 | 官方 API 传入 **8 字节 payload**；含 report ID 的逻辑内容为 9 字节。`NORMAL_MAX_PACKET_LENGTH=31` 只是代码上限，不是已测得的描述符容量或 USB 传输长度 |
| 回复有效结构 | 预期 `01 03 02 04 09 00 ss charge level checkCode`，有效 payload 至少 10 字节；头中 length=2 才对应当前两字段布局。固定 HID 长度及补零仍未知 |
| 电量 | 去头后的 `D[1]`，即 `P[8]`；包含 ID 的 raw[9]。百分比范围应为 0..100 |
| 充电 | `D[0]`，即 `P[7]`／包含 ID 的 raw[8]：0=未充电，1=充电，2=满电，其他=未知；2 不应直接映射为 charging=true |
| 回复关联 | 官方比较 version、flags、command、bizCode、sequence，仅排除 length。解析器构造的 start 来自请求 ID，不等于验证了实际 inputreport ID |
| 回复校验 | `parseInputBytes` 只提取末尾 checkCode，未验证其算法。**回复使用相同 XOR 只是推测**，不得宣称已确认，也不得未经抓包就凭该算法拒绝所有回复 |

独立候选实现应显式检查收到的 report ID 为 `4D`、声明数据长度为 2、上述头字段与请求一致、字段范围有效；较长布局先拒绝，待证据说明后扩展。Windows 补零和缓冲区总长度必须从实际描述符/caps 取得，不能直接把 8 字节 payload 或「上限31+ID」当成固定 Windows 写入长度。

QhwSDK `setup`（约 `599971`）→基类 `setup`（约 `552847`）→channel `setup`（约 `431826`）只涉及本地锁和事件监听；此调用链及 `getBattery` 中未见必要 HID 握手。SDK 另有占用声明、心跳和设置写入，不能一起移植。是否仍依赖厂商页面此前的设备动作，需要真实冷启动验证。

### 唯一匹配与剩余验收

拟用 `mchose_qhw_keyboard.py`：`VID=3837 && PID=1015 && productName=="MCHOSE G98 V3 2.4G" && usagePage=FF80 && usage=0001`，且描述符确实存在 ID=`4D` 的 output/input，payload 容量分别至少可容纳 8/10 字节；按各自实际容量处理 Windows 缓冲。未知长度、缺少报告、多个无法区分的候选均拒绝，不回退到其他集合或迈从鼠标协议。这是**基于代码的设计建议，未实机确认**。

未确认：固定报告长度、回复 checkCode、Windows 补零、冷启动独立查询、充满状态、关闭／休眠时是否继续回缓存。用户应按第 5 节提供数据。C4 的 G98 V2 是 `41E4:2203` 有线、feature ID9 的不同方案；其 MIT 代码和作者硬件验证不能迁移为 G98 V3 的证据。O1/H1 中的迈从鼠标实现也不是这套键盘协议。

## 4. MagDock：未找到底座转报鼠标电量的公开协议

用户样例 [issue23-body.txt](../../.ai/tasks/fixtures/issue23-body.txt) 已有 A7 V2 Ultra+ `3837:100B` 的当前电量 88%；`3837:1012 "MCHOSE MagDock"` 只是另一项枚举结果。原反馈实际问的是 Rainy75。可信度：**实机确认（用户诊断）**，不能据此认定鼠标电量失败或底座应新增电池卡片；用户资料未附许可证。

M1 约 `953600–962600` 的完整 MagDock 模块，以及 O2，提供如下结果（M1 厂商许可证未声明，O2 为 AGPL-3.0-or-later）：

| 项目 | 证据及可信度 |
| --- | --- |
| 身份 | `3837:1012`、产品名 MagDock，优先选择 `FF00` 且有 output ID0 的集合；O2 精确为 `FF00:0001`。只有代码 |
| 普通状态命令 | `getGlobalInfo` 为 `07`；output ID0，63 字节 payload：`AA 07 00 00 00 00` + 零填充。AA 是 payload 标记，不是 report ID。只有代码 |
| 回复 | M1 `sendReportOnceSync` 检查 inputreport ID同为0及命令前缀。协议头 `AA cmd type seq total len`，字段从 payload[6] 开始；实际 input 固定总长度未取得。只有代码 |
| 状态字段 | switchVal、mode、modeNum、speed、brightness、lightSyncStatus、baseColor、sleepSwitch、sleepTime、version、direction；没有电量、充电或关联鼠标电量字段。lightSyncStatus 是灯光同步，不能当充电位。只有代码 |
| 校验 | 普通状态／灯光报文构建没有追加 checksum；不外推到其他命令。只有代码 |
| 电量实现 | O2 `readStatus()` 明确返回 batteryPercent=null、batteryState=Unknown，说明为灯光底座。只有代码 |
| 上游实机记录 | O1 的 MagDock 章节确认灯光读写与读回；并未确认鼠标电量转报。实机确认仅限上游灯光 |

63 字节 payload 对应 hidapi 发送缓冲 `00 + payload` 共64字节，仍应核对实机 caps。以上仅为证明这是另一种设备协议，**不是建议本任务发送灯光查询**。

当前官方 JS 还补足了上游旧文档的未知命令：十进制42（`2A`）是 `setReset`，43（`2B`）是 `setUpdate`；`74/75` 属于固件写入／完成，CRC8（右移、多项式 `8C`）只出现在固件块路径。不能拿这些命令试探电量，也不能把固件 CRC 当作普通电量校验。来源 M1，可信度：**只有代码**。

结论仅为「在已检查的官方 MagDock 模块、OpenMouse、HaloBattery 中，没有找到底座读取鼠标电量的公开方式」。**无法证明硬件绝对不支持未公开接口**。电量查询 report ID、命令、长度、字段及校验均未确认，不指定电量模块；保留已经工作的 `3837:100B` 通道。

若用户确实需要底座电量来源，请先比较「只有底座」「底座+鼠标离座」「放座充电」三种状态的官方设备页。只有官方底座页面显示鼠标百分比时，再录制状态页会话，并按 `3837:1012` 与 `3837:100B` 分离 USB 流量。若数值来自100B，不能算作1012底座提供电量。仅因底座出现在“未取得电量”列表，无需为它构造假电池。

## 5. 实现前后的具体取证与范围检查

G98 V3、G87 V2 可以先按上述官方代码写候选模块，但进入「支持／实测」列表前应取得以下证据；本调研不执行这些动作：

1. 用户导出接收器完整设备／接口／HID report descriptor，尤其 G87 的 `0001:0000` 和 G98 的 `FF80:0001`，记录 input/output/feature 的 ID与长度、产品全名、键盘与接收器固件版本。
2. USBPcap/Wireshark 从官方状态页连接之前开始捕获约20秒，覆盖第一次读取和一次刷新；只停留在状态页，同时记录百分比／充电图标。保留控制传输和 interrupt IN/OUT，以区分 output 与 feature；避免记录实际文字输入。
3. 在非满电时，分别记录清醒放电、外部供电充电、拔掉充电线、关闭／唤醒。充电最好用仅供电接口，保持目标接收器身份不变；若不得不接数据线，单独记录新增有线设备，不合并成同一连接的样本。
4. 至少两个不同百分比和一个充电变化；满电单样本不足以区分固定常量、版本字段、百分比或缓存。检查回复校验字节随字段变化的关系后，才确定验证算法。
5. 退出官方应用后，验证候选查询在全新连接上能独立读取；不复制恢复配置、抢占设备、升级或自动修复流程。关机／休眠无新数据不应变成0%。

本次已核对 `engine/upstream-protocols.md` 和 `engine/providers/mchose.py`：现有 M7/A7 反码 feature、G7 output、A5 feature 分别属于鼠标协议，没有上述两个键盘实现。以后接入时应由精确匹配决定唯一读取器，避免同一设备继续落入宽泛 VID 的鼠标试探路径；这是实现建议，本次不改调度或 provider。

本次验证仅覆盖：四个任务样例身份、厂商公开资源哈希、读命令到字段的静态调用链、公开项目适用范围与许可证证据、报文长度／校验的算术复核。没有运行设备测试或整套应用测试；只新增本文件，不改代码、索引、分支或提交。
