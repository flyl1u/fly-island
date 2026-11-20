# 第二波反馈：12 个设备的电量协议调研

调研日期：2026-11-04。工作树基线：`7d136efdcd62852916d838f9cbf4b6a5111808c4`，分支 `codex/protocol-research-4`。
仅调研；没有运行设备探测、发送 HID 命令或修改实现。样例来自 `.ai/tasks/fixtures/issue<编号>-body.txt`；卓威的补充资料另外读取了公开 issue 评论。

## 1. 结论与证据口径

**本批没有达到“可直接实现、具有唯一协议匹配规则”的设备。** 已找到雷柏、达尔优、AJAZZ、G7 等邻近协议，但尚不能证明适用于本批精确硬件。不能把这些候选报文作为用户的探测命令清单。

“无公开资料”在本文特指：**在本次列出的公开资料和检索范围内，未找到目标电量协议**，不表示全网不存在，亦不表示设备绝对不支持主机读取。
“实机确认”均注明是谁、哪款设备的实测；本次执行者没有接触目标实机。静态代码与厂商产品说明分别标作“只有代码”“只有文档”，向其他 PID 外推均为“推测”。

| 设备 / issue | 精确 ID | 本次结论 | 决定性缺口 |
|---|---|---|---|
| 雷柏 VT9 Pro [#36](https://github.com/wushuai0802/myfinder-device-battery/issues/36) | `24AE:1601` | 需要用户提供信息 | OpenMouse 实测为 `1205/4405`；目标 report ID、长度和协议代际未知 |
| 雷柏 VT0 [#54](https://github.com/wushuai0802/myfinder-device-battery/issues/54) | `24AE:14A1` | 需要用户提供信息 | `FF00:000E` 不能区分旧 `BA/BB` 与新 `06/07/08` 协议 |
| 卓威 EC2-DW [#37][Z1] | `04A5:800A` | 无公开电量协议资料 | 有方向与 caps 长度，没有 report ID、命令、字段 |
| 迈从 V9 Pro 2 [#39](https://github.com/wushuai0802/myfinder-device-battery/issues/39) | `3837:6011` | 需要用户提供信息 | `FF07:0222` 与旧 V9 PRO 的 `FF90:0001` 不同 |
| 达尔优 A955 [#40](https://github.com/wushuai0802/myfinder-device-battery/issues/40) | `260D:1074` | 需要用户提供信息 | 公开 Jm 实现是 A950 PRO Mg `1114/1117`，目标映射未证实 |
| 前行者 S9 Max [#46](https://github.com/wushuai0802/myfinder-device-battery/issues/46) | `372E:1026` | 需要用户提供信息 | 与旧 `089D:062F / FF01:0010 / M156` 身份和集合均不同 |
| 英菲克鼠标接收器 [#48](https://github.com/wushuai0802/myfinder-device-battery/issues/48) | `249A:5C2F` | 需要用户提供信息 | 型号未知；相同接收器 ID 也用于 AJAZZ，不能唯一匹配 |
| ERAZER GK501 [#48](https://github.com/wushuai0802/myfinder-device-battery/issues/48) | `3151:6000` | 无公开电量协议资料 | 只有 `FF00:000E` 枚举；未定位目标厂商读电量代码 |
| 北通鲲鹏 20 精英版 [#52](https://github.com/wushuai0802/myfinder-device-battery/issues/52) | `20BC:5191` | 需要用户提供信息 | 优先验证 Windows 电量 API；目标是否返回有效电量尚未知 |
| 西伯利亚 K03S [#56](https://github.com/wushuai0802/myfinder-device-battery/issues/56) | `36F9:F016` | 需要用户提供信息 | 同 `FF90` 不证明兼容 V9 PRO；版本、报告和电量字段未知 |
| VGN V87 V2 [#35](https://github.com/wushuai0802/myfinder-device-battery/issues/35) | `258A:027B` | 需要用户提供信息 | 两个同名 `FF00:0001` 集合，尚不能定位电量通道 |
| 前行者 E9 [#34](https://github.com/wushuai0802/myfinder-device-battery/issues/34) | `A8A5:2255` | 需要用户提供信息 | 当前 G7 匹配条件已覆盖它，但协议兼容性未证实 |

字节约定：`body[n]` 为去掉 report ID 后的零基偏移；`frame[n]` 为明确注明的完整帧零基偏移。Windows `HidP_GetCaps` 长度包含 report-ID 槽位，hidapi 的无编号输出也需要前置 `00`；`read(64)` 只是读取容量，不证明描述符固定长度是 64。未知项均保留未知，不拿解析器最低长度冒充设备报告长度。

## 2. 雷柏 VT9 Pro：24AE:1601

样例厂商集合：`FF00:0002` 两个、`FF00:000E` 一个；产品字符串为 `HID KEYBOARD DEVICE`，型号来自用户陈述。

| 目标项目 | 已确认 / 未确认 |
|---|---|
| 电量集合 | `FF00:000E` 只是候选；两个 `0002` 集合的作用未定 |
| report ID、类型、输入/输出/Feature 长度 | 均未知，fixture 只有顶层 usage |
| 查询命令、电量、充电字段、校验 | 目标均未知；下表仅为其他身份的线索 |

OpenMouse 的 [Rapoo codec][R1] 和 [驱动][R2] 明确限定 `24AE:1205`（接收器）、`24AE:4405`（有线），作者声明 VT9 Pro 实机捕获；**没有覆盖本批 `1601`**。其三种读取路径不可混为一种：

| 邻近路径，非目标已确认协议 | 集合、类型、报告形状 | 命令 / 字段 / 校验 |
|---|---|---|
| 旧代查询 | `FF00:000E`；Output `BA`，body 31 字节（Windows 完整 32）；回复是 `GET_REPORT(Input)`，不是普通 interrupt-IN 等待 | body `A5 AA` 后补零至 31（接收器）；响应去掉可选 `BA` 后，body[1] 为 1/2、body[2] 为百分比，2 表充电。源码无 checksum 算法；用形状、标记和范围校验。寄存器 busy→OK 规则不可机械套到电量查询 |
| 旧代被动通知 | Input `BB`；已知 body 至少 6 字节，完整描述符长度需另取 | 无查询；body 头 `B0 51`，body[5] 为百分比；充电未知，body[4] 仅是连接线索；无已知 checksum |
| 旧代 Feature 状态 | `FF0B:0104`，Feature `2A`；源码最低要求 body 9 字节，不等于完整长度 | 接收 Feature，body[8] 为百分比；充电未知；无已知 checksum。**本批 fixture 没有这个集合** |

可信度与许可证：R1/R2 为 AGPL-3.0，具有**其他 PID 的作者实机证据**；套到 `1601` 是推测。Linux [hid-rapoo.c][K1] 处理侧键，不提供该鼠标的电量协议。

结论：需要用户提供接收器型号（原装/另购及 1K/4K/8K）、鼠标和接收器固件、完整 descriptor/caps。优先在 [RAPOO HUB][R5] 确认原有固件能否识别 `1601` 并显示电量，提供实际子页面、公开 JS 地址、匹配条目和一组电量读取/推送报文；不要为调研先刷固件。网页不支持时，再取官方桌面驱动版本及一次电量读取的 USB 交互。不能仅给 OpenMouse 的 PID 集合加 `1601`。

## 3. 雷柏 VT0：24AE:14A1

样例厂商集合：`FF00:0001 / FF00:0002 / FF00:000E`，产品字符串 `Rapoo Gaming Device`。

| 目标项目 | 已确认 / 未确认 |
|---|---|
| 电量集合 | `FF00` 下三个集合均未完成通道归属 |
| report ID、类型与长度 | 未知；不能从共同的 `FF00:000E` 认定为第 2 节旧协议 |
| 命令、电量、充电、校验 | 目标全部未知 |

[ClickSync README][R3] 将实测范围写为雷柏二代 54L15/3950 系列，而识别条件较宽，没有 `14A1` 的实机清单。其 [Rapoo JS][R4] 的电量是被动 Input `07`（代码还接收 ID 0），body 长度至少 8、body[0] 为 `20`、body[7] 为电量；充电和 checksum 未解析。最低 8 字节不是固定报告长度。
它与 OpenMouse 的 `BB / B0 51` 通知明显不同。`requestBattery()` 只是转发缓存，但 `open()` 另会发送 report `06` 的解锁消息；因此**不能把启动该第三方驱动等同于纯被动监听**，也不能继承其轮试长度及 Output/Feature 的回退方式。

可信度与许可证：R3/R4 为 GPL-2.0；本次只把其代码作为协议分代证据，未确认目标适用，也不建议直接移植到本项目 AGPL-3.0-only 代码。没有额外许可时不能假定 GPL-2.0-only 与本项目兼容。

结论：需要用户提供 VT0 的完整版本名称、固件、接收器及所有 `FF00` 集合的 report 项。优先 [官方 HUB][R5] 识别与 JS；比较目标实际推送的 report ID、帧头和电量对照，确定属于哪一代。不能同时注册两代、读不到就换协议；证据充分后必须由精确 PID 加 descriptor 指纹选择唯一协议。

## 4. 卓威 EC2-DW：04A5:800A

[Z1] 用户补充了 `bcdDevice=0200` 和 Windows caps：

| 集合 | InputReportByteLength | OutputReportByteLength | FeatureReportByteLength |
|---|---:|---:|---:|
| `MI_00 / 0001:0002` | 7 | 0 | 0 |
| `MI_01 COL01 / FF03:0000` | 0 | 16 | 0 |
| `MI_01 COL02 / FF04:0000` | 16 | 0 | 0 |

这是**用户实机描述符汇总**，不是已经读到电量。不能从 caps=16 推成“report ID 加 16 字节载荷”；没有原始 report descriptor / ValueCaps，report ID 和实际载荷长度仍未知。已知 Feature 长度为零，不能安排 Feature 查询。

| 项目 | 结论 |
|---|---|
| 候选收发集合 | 同一物理设备、同一接口下 `FF03:0000` 输出与 `FF04:0000` 输入；是否承载电量仍未知 |
| report ID / 命令 | 未知；没有可给用户安全下发的已知电量命令 |
| 电量 / 充电 / 校验 | 均未知；不能把任何 0–100 的随机字节当百分比 |

[ZOWIE 官方 FAQ][Z2] 指向机身 LED 查看电量，没有提供主机读取 API；它也不能证明私有主机通道一定没有电量。Z1 中“PID 被多款鼠标共用”是用户陈述，未取得完整产品表，不能硬编码所有 `800A` 的显示名为 EC2-DW。

结论：本次无公开电量协议资料。来源许可：用户报告未核实独立授权，官网为厂商版权。下一步先补原始 descriptor、基站/有线两种身份与是否存在能显示电量的官方工具；若无该工具，取**无需发未知命令的被动输入**并标注机身电量档位、充电、开关机状态。没有已知查询动作时，不要求用户“抓官方电量查询”，也不以遍历命令码代替证据。

## 5. 迈从 V9 Pro 2：3837:6011

样例集合：`000B:0005`、两个 `000C:0001`、`FF07:0222`。

| 项目 | 目标结论 |
|---|---|
| 电量集合 | `FF07:0222` 是候选，尚未确认用途 |
| report 类型、ID、收发长度 | 全部未知 |
| 命令、电量、充电、校验 | 全部未知 |

[PyFlat 的 MchoseProtocol.cs][H1] 仅列 `291D:385D / FF90:0001`：完整 64 字节 Input/Output、report `55`、查询 `55 65 01`，完整响应 frame[2] 电量、frame[3] 状态；`02` 为电池供电，`00/03` 接外电且百分比冻结，`1A` 关机。代码无 checksum；帧头和状态检查不是 checksum。该 MIT 代码是**旧 V9 的证据**，不是 V9 Pro 2 的证据。本仓 [旧耳机读取器](../providers/mchose_headset.py) 同样严格限定旧身份。

结论：需要用户提供准确 SKU/固件、接收器 PC 模式、`FF07:0222` descriptor/caps。优先在 [官方 M HUB][H3] 确认 V9 Pro 2 的实际子页面、读数和公开 JS，定位 `3837:6011` 的设备表及电量请求/推送解析；无网页支持再提供官方桌面驱动版本及电量操作报文。不可因 `3837` 与迈从鼠标相同而发送鼠标 `11/12` Feature 命令，也不可把旧耳机的冻结语义套过来。
可信度：目标只有用户枚举；协议复用属于推测。H1 为 MIT，官方页面未见开放源码许可。

## 6. 达尔优 A955：260D:1074

样例厂商集合：`FF01:0000 / FF02:0002 / FF03:0000 / FF04:0002`。

| 项目 | 目标结论 |
|---|---|
| 电量集合 | 未确定，`FF02:0002` 只能作为候选 |
| report 类型、ID、长度 | 未知，不能默认 report `08`、17 字节 |
| 命令、电量、充电、校验 | 目标均未知 |

[OpenMouse Jm codec][D1] 来自厂商 `jmdevice.v_1.3.24.js`，对应 **A950 PRO Mg** `260D:1114/1117`；[驱动][D2] 还要求 `FF05:0000` 服务集合，以及 `FF02:0002` 的 Input/Output `08`、各 16 字节 body。本批 `1074` 未在产品表，fixture 也未列 `FF05:0000`。
这条邻近协议的电量命令为 `04`，完整查询 frame=`08 04`、中间补零、末字节 `49`（总长 17），使逐字节和模 256 为 `55`；回复 body[5] 电量、body[6] 状态。驱动解释状态 1/2 充电、0 放电或满电，其余未知；电量解码本身检查长度/命令/范围，并未验证回复 checksum。

可信度与许可：D1/D2 为 AGPL-3.0，接收器 `1114` 有上游实机声明，`1117` 未实测；用于 A955 是推测。[达尔优官方驱动表][D3] 列出 A955，但本次没有取得将 `1074` 绑定到 Jm 电量命令的厂商 JS。

结论：需要用户提供完整 caps、A955 具体版本和官方软件显示值。优先从 [达尔优网页入口][D4] 确认是否支持该代 A955，给出精确子页、JS/设备表；若官网仅提供桌面包，就提供实际使用的包版本及一次官方电量读取，不要求用 A950 页面试命令。

## 7. 前行者 S9 Max：372E:1026

样例厂商集合为 `FF00:0001 / FF06:0001`，产品字符串只有 `EWEADN S9`，Max 来自用户描述。

| 项目 | 目标结论 |
|---|---|
| 电量集合 | 两个厂商集合用途未定 |
| report 类型、ID、长度 | 均未知 |
| 命令、电量、充电、校验 | 均未知；不能迁移旧 S9 的 `30 / M156` 格式 |

[HaloBattery 社区固定提交][E1] 解析的是 `089D:062F / FF01:0010`：hidapi Output 33 字节、ID 槽 `00`、命令 `30`；末字节为输出 frame[5:32] 的和模 256；Input 的最低解析长度 15、`read(33)` 是容量，返回 frame[4:8] 为 `M156`、frame[12] 为充电候选、frame[13] 电量、frame[14] 连接状态。作者记录了旧 S9 的 70% 回复；没有本批 `372E:1026` 的验证。本仓 [eweadn.py](../providers/eweadn.py) 也只登记旧 ID，充电/回复校验仍保守处理。

[前行者官方下载页][E2] 明确区分 S9 Pro/Ultra/Max 与 SE/Standard 的驱动，还提供 E HUB 3.0；因此“名称都为 S9”不足以共用协议。
结论：需要用户补 Max 的鼠标/接收器版本、是否为原装 8K 接收器、两条厂商集合的 descriptor/caps。优先 [E HUB 3.0][E3] 的目标识别、实际子页面、公开 JS 和数值电量显示；特别要定位精确 `372E:1026` 的 handler，不能引用旧 `pq.json` 的 `089D:062F` 条目代替。网页不可用时再收官方桌面驱动及最小电量交互。
许可/可信度：E1 MIT，只有代码及**旧 ID 的作者实机片段**；目标兼容性未知。官方资源为厂商版权。

## 8. 英菲克接收器：249A:5C2F

样例只给 `Wireless-Receiver`、`0001:0000 / 0001:0002 / 0001:0006 / 000C:0001`，没有鼠标型号。

| 项目 | 目标结论 |
|---|---|
| 电量集合 | 未定位；没有 `FFxx` 顶层集合不等于没有电量输入字段 |
| report 类型、ID、长度 | 未知，需要完整 report 项而非顶层集合列表 |
| 命令、电量、充电、校验 | 英菲克目标全部未知 |

[Ajazzy 调研][I1] 实测 **AJ179 V2 MAX，dev_id=N625** 也使用 `249A:5C2F`；[aj179-linux][I2] 亦列出该接收器 ID。这证明仅凭 VID/PID 无法认定英菲克型号或协议。
I1 的邻近协议为 32 字节线缆报文，设备信息命令 `10` 回复第 13 字节是电量；`20` 电量查询可能陈旧或没有数据，作者明确不推荐。其 `C0` 被动推送也携带百分比，通用命令帧末字节是 byte[4..30] 的和模 256。该文的推送字段文字对 flag 的位置描述不够统一，本次不将其充电偏移作为可移植结论；更不能映射成英菲克目标字段。

结论：需要用户先给鼠标底部型号、硬件修订、供电方式及对应接收器，再补完整 descriptor/caps。若型号在 [英菲克官方驱动表][I3] 的网页名单中，优先 [官方 HUB][I4] 的精确设备识别、JS 和电量值；否则记录实际官方软件版本和显示。先核对标准 Battery Strength/电池页字段或被动输入，再考虑官方查询抓包。**不发送 AJAZZ `10` 去猜 dev_id**，也不直接加入其接收器白名单。
许可/可信度：I1 GPL-3.0、作者 AJAZZ 实机与逆向说明；I2 MIT、AJ179 实机声明；目标仅枚举、兼容性为推测。I3/I4 厂商版权。

## 9. ERAZER GK501：3151:6000

样例有 `FF00:000E`，以及标准鼠标、键盘、系统和 Consumer 集合。同行 `5566:0008 / ERAZER GK502` 是另一个设备，不能合并其信息。

| 项目 | 目标结论 |
|---|---|
| 电量集合 | `FF00:000E` 候选，作用未知 |
| report 类型、ID、收发长度 | 均未知 |
| 命令、电量、充电、校验 | 均未知 |

[联想官方商品页][G1] 可核实 GK501 产品名称，未给 HID 电量协议。[OpenMouse GearHub 驱动][G2] 虽使用 VID `3151`，却是鼠标 `FFFF:0002`、无编号 64 字节 Feature、带设备模型识别与接收器转发的路径，不能用于本键盘。`FF00:000E` 与雷柏相同也没有跨 VID 协议意义。

结论：本次无公开电量协议资料。可信度仅用户枚举及产品文档；邻近 GearHub 为 AGPL-3.0 代码，G1 为厂商版权。后续需键盘底部完整 SKU、固件、是否有官方驱动电量显示、`FF00:000E` 的完整描述符与报告样本；如厂商提供网页版，优先实际链接和 JS。未找到该型号官方网页驱动，不能把联想通用 PC 驱动页或 GK502 驱动当作证据。

## 10. 北通鲲鹏 20 精英版：20BC:5191

样例产品名 `BTP-KP20EB XINPUT DONGLE`，集合为 `0001:0002 / 0001:0006 / 00FF:0003`。注意 `00FF` 不是 `FF00`。

| 项目 | 目标结论 |
|---|---|
| 原始 HID 电量集合 | `00FF:0003` 候选，尚未证实电量用途 |
| 原始 report 类型、ID、长度、命令 | 全部未知 |
| 原始电量、充电、校验 | 全部未知 |
| 可优先验证的系统接口 | `RawGameController.TryGetBatteryReport()` 或 `XInputGetBatteryInformation(index, BATTERY_DEVTYPE_GAMEPAD)`；不需要猜 HID 报文，report ID/长度/校验在该接口层不适用 |

[HaloBattery 说明][B1] 使用 Windows.Gaming.Input，并以 XInput 分档回退；没有该北通精英版的实机证明。[Microsoft API][B2]、[返回结构][B3] 证实 XInput 提供 BatteryType 和 EMPTY/LOW/MEDIUM/FULL 四档，**不是精确百分比，也没有独立充电布尔字段**；WIRED 不能自动解释成目标正在充电，UNKNOWN/DISCONNECTED 不能显示 0%。
[PadKey][B4] 的 `20BC:5127` KP40D 有 `00FF:0003`、64 字节状态流，但研究的是背键和订阅命令，不是 `5191` 电量；不能向目标移植 hello/订阅/控制模式切换。

结论：需要用户提供当前接收器模式下系统电量 API 的原始返回（返回码、BatteryType/Level；WGI 的 VID/PID、容量与状态可空值），并与北通助手电量对照，至少包含放电和插线两种状态。还需确认 XInput 槽位与 `20BC:5191` 物理设备的对应，不能拿同机另一只手柄的电量冒充。若 API 无有效数据，再索取北通助手准确版本、是否有数值电量和最小 USB 交互；本次未确认目标官方 WebHID 页面。
许可/可信度：B1 MIT、只有其他手柄的文档/代码经验；B2/B3 为微软 API 文档（本文未核实页面的独立再分发许可）；B4 项目许可未核实，只引用 KP40D 作者实机说明。目标系统 API 支持仍属推测。

## 11. 西伯利亚 K03S：36F9:F016

样例集合 `000B:0001 / 000C:0001 / FF82:0001 / FF90:0001`。

| 项目 | 目标结论 |
|---|---|
| 电量集合 | `FF90:0001` 只是候选，`FF82:0001` 用途亦未定 |
| report 类型、ID、长度 | 均未知；不能因 `FF90` 就填 report `55`、64 字节 |
| 查询、电量、充电、校验 | 均未知；旧 V9 的 `55 65 01` 未证实适用 |

第 5 节 H1 的设备表只有 `291D:385D`。同样的 usage page 不足以把 K03S 归入该协议。
[西伯利亚官方驱动页][X1] 的搜索索引区分 K03S 7.1 Wireless 与其他款式，[另一官方页][X2] 又列 K03S 超竞版；本次页面读取分别出现 502/超时，未取得其 JS 或设备表。[Linux K03S 音频修复][X3] 对应 `36F9:C009`，只是音频接口 reset/delay quirk，不是 `F016` 的 HID 电量实现。

结论：需要用户提供 K03S 完整版本（标准/7.1/Pro/超竞等）、固件、PC/其他接收器模式、耳机屏幕电量及官方软件是否显示同值；补 `FF82`、`FF90` 全部 report 项。若该版本有官方网页，先提供实际子页和 JS；若仅桌面驱动支持，取得一次官方读电量交互及充电前后对照。耳机本地数显不证明存在主机查询。
可信度/许可：目标只有用户枚举；官网为厂商版权且读取受限；X3 是 Linux 源码/提交，不能作为目标兼容证据；H1 为 MIT 的旧耳机代码，跨设备套用是推测。

## 12. VGN V87 V2：258A:027B

样例产品字符串 `VGN V87 V2 2.4G Dongle`，有两个 `FF00:0001` 集合，另有标准鼠标/键盘/System/Consumer 集合。

| 项目 | 目标结论 |
|---|---|
| 电量集合 | 尚未从两个同 usage 的集合中唯一定位 |
| report 类型、ID、长度 | 全部未知 |
| 命令、电量、充电、校验 | 全部未知 |

[官方 V87 V2 手册][V1] 指向 V HUB 提供配置功能，但没有公布电量命令。[OpenMouse VGN 驱动][V2] 是 F2 鼠标 `3554:FB56/FB57`、`FF02`、report `08`、16 字节 body，不能用于该键盘。`258A` 是共享 VID 的线索，也不能据此套用 libratbag 的 SinoWealth 鼠标路径。

结论：需要用户在 [VGN HUB][V3] 确认 **2.4G** 下是否识别 V87 V2 并显示数值电量，提供最终子页面、公开 JS/设备配置表、固件，以及两个 `FF00:0001` 集合各自的接口号、report ID、类型和长度。若网页只支持有线配置，应分别记录，不把有线支持当接收器电量支持。键盘本地按键电量灯或蓝牙电量也不能证明 `027B` 的 2.4G 协议。
可信度/许可：目标用户枚举及厂商文档；V2 为 AGPL-3.0 的其他设备代码；官方页面未见开放源码许可，目标协议未知。

## 13. 前行者 E9：A8A5:2255

样例厂商集合 `FF01:0010 / FF03:0000 / FFAB:0000`，产品字符串 `EWEADN E9`。

**当前 G7 路径会把此 VID/PID、FF01 集合纳入候选；这不等于 E9 读取已成立。** 本仓 [mchose.py](../providers/mchose.py) 的 `poll()` 仅按 G7 VID/PID 和 usage page `FF01` 筛选，没有以 G7 产品名排除 E9；`server.py` 也登记了 `A8A5`。#34 只证明该次运行没有卡片，不能证明执行过哪条命令、打开成功、设备醒着或一定协议不兼容。

| 项目 | 已有 G7 证据与 E9 边界 |
|---|---|
| 集合 | G7 为 `FF01:0010`；E9 有同集合，但兄弟集合不同（G7 注释为 `FFA5:0088 / FF05:0088`） |
| 类型 / ID / 长度 | G7：hidapi Output 完整 65 字节，前置无编号 ID 槽 `00`；Input 读取容量 64，解析至少 10 字节。E9 的 descriptor 长度和 Input report ID 未知，不能把数据头 `AA` 认作已确认 report ID |
| 命令 | G7 完整输出以 `00 55 30 A5 0B 2E 01 01 01` 开始、补零到 65；E9 是否同命令未知 |
| 电量 / 充电 | G7 接收到的数组以 `AA 30` 开头，零基 [8] 为百分比、[9] 非零表充电；E9 未验证 |
| 校验 | G7 当前只检查最低长度、`AA 30` 和百分比范围，没有已知 checksum 算法；不能把固定字节 `2E` 标为校验和 |

[HaloBattery G7 说明][B1] 有作者 G7 在接收器和有线上的 46% 对照，许可 MIT。Linux [固定提交 337cf8a][E4] 进一步明确 `A8A5:2255` 被 E9 等多款 EWEADN 共用；但该补丁只是鼠标输入 `ALWAYS_POLL` 修复，没有电量命令，也不能把 Linux 输入问题认作本次 Windows 失败原因。

结论：**尚不能确认 G7 读取适用于 E9，不应只改显示名或扩大白名单。** 需要用户提供完整 caps、鼠标/接收器固件、现有读取器诊断（打开/写入错误、原始响应或超时、醒着时官方读数）。[EWEADN 官方页][E2] 已列 E9，优先通过 E HUB 3.0 的 `A8A5:2255 + E9` 型号映射和实际读取 JS 核对。如果与 G7 相同，才验证充电/放电、休眠、官方软件关闭后的独立读取；如果不同，应由 descriptor/可靠型号标识区分两者，信息不足时不轮流尝试协议。
可信度：G7 有他人实机确认，当前选路是本次静态代码确认，E9 协议兼容性仍未知。产品字符串可辅助排除，但不能独自充当永久唯一协议指纹。

## 14. 资料覆盖、限制与建议顺序

| 资料类别 | 本次实际检查 | 能支持的范围 |
|---|---|---|
| OpenMouse | 本地 registry、MCHOSE 文档；网页读取独立 `mouse-protocol` 的 Rapoo、Dareu、VGN、GearHub codec/driver 及 LICENSE | 找到明确的邻近身份、帧形状与校验；没有用品牌支持表代替精确 PID 证据 |
| HeyOkay/HaloBattery | 在线 protocols、LICENSE、G7 与 Windows 手柄说明；S9 的固定社区提交及许可；对目标品牌/型号的限定检索 | G7 与旧 S9 有线索；所读在线文档未检出 Rapoo、V9、Dareu、Zowie、V87，不能扩大为全仓/所有 PR 不支持 |
| libratbag | README、设备目录说明、`meson.build` 驱动清单及限定站内检索 [L1][L2] | 未定位本批可直接迁移的目标电量实现；没有完整克隆设备目录，不作穷尽否定。构建声明 MIT/Expat |
| Linux HID | `hid-rapoo.c`、`hid-input.c` 的 Battery Strength/电池页处理、EWEADN 固定补丁；另核对 K03S 音频补丁 | 标准字段必须读 descriptor 的具体 report/offset/range；侧键、输入轮询、音频 quirk 均不等于电量支持 |
| 厂商网页驱动公开 JS | 实际打开 RAPOO、EWEADN、MCHOSE、VGN、Dareu、Inphic HUB；结合官方产品/驱动入口及开源作者对厂商 JS 的解析 | HUB 页面能访问，但网页读取返回空 SPA/单图片，**没有取得本批目标的可分析 JS 资源**；不能宣称已逆向当前官网。西伯利亚网页另有 502/超时 |
| 社区逆向 | ClickSync、Ajazzy、aj179-linux、PyFlat、PadKey | 识别代际、共享 PID 和语义差异；只对原项目指定硬件保留实测等级 |

检索包括表中 12 个精确 ID、完整型号，以及 `battery / protocol / driver / 电量 / 网页驱动`，并限定搜索过 GitHub、HaloBattery、libratbag。数字 ID 搜索大量返回无关结果，未将其当证据。网页读取/搜索持续有成功结果，个别 URL 失败并非整体断网；没有使用命令行联网。

官方 JS 是本次最大的剩余缺口：请补**公共资源的完整 URL、型号匹配条目、收发函数及其依赖文件**，或在设备实际可用的官方页面保存相应公开脚本；无需提供账号、Cookie 或会话令牌。协议证据应标明固件/接收器版本及数据含不含 report ID。公开可读不等于开放源码许可；代码移植需遵守来源许可，本文没有复制厂商实现。

建议按下列顺序补证并排期；这是**通过门槛后的实现顺序**，不是现在就启用这些协议：

1. **北通系统 API、E9 现有路径**：前者可先无私有写入地核验返回与物理身份；后者先确认既有匹配为何没有读数，避免重复实现或继续混用共享 PID。
2. **VT9 Pro、VT0**：先用 descriptor/官方数据区分旧代和新代；若被动通知即可证实，优先只读被动路径，充电未解出就保留未知。两台分别验收。
3. **S9 Max、V9 Pro 2、V87 V2**：已有明确官方 HUB 方向，取得精确设备表和 JS 后单独实现，不扩展旧 S9/旧 V9/鼠标协议的 VID 范围。
4. **A955**：确认厂商协议是否 Jm 以及 `1074` 的实际 report 形状；不能依赖 A950 PRO Mg 的实测。
5. **英菲克、K03S**：先补实物版本/模式，再判断是否存在对应官方电量通路；先解决身份问题。
6. **卓威、GK501**：当前缺乏电量命令/字段；保留调研，不编写猜测性读取器。卓威优先被动输入，GK501 优先官方型号资料和完整 descriptor。

晋级“可实现”的最低门槛：精确硬件/模式、唯一集合与 report 形状、单一已知读取流程、回复关联与范围/校验、充电未知的表达方式；共享 ID 还需可靠的协议区别依据。实机验收至少对照两个电量点、充电/拔线、休眠/唤醒、接收器重插，并验证同 ID/同品牌邻近设备不误命中。不能用官方 UI 的缓存值或单次范围内数字证明协议。

本次文件验证只涉及文档路径、引用和格式；未运行程序/硬件测试。任务明确只允许新增本文件，未修改 provider、测试、许可证或 Git 元数据，也未暂存/提交。

## 15. 来源链接与许可索引

分支链接按 2026-11-04 本次读取结果引用，并非不可变快照；实现时应固定实际采用的提交。固定提交的来源已在 URL 中明确。下列许可仅作用于对应项目材料，不自动覆盖厂商软件、固件或用户附件。

| 引用 | 资料 / 许可 / 可信度 |
|---|---|
| R1/R2 | [Rapoo codec][R1]、[transport][R2]；[AGPL-3.0][OL]；其他 PID 作者实机说明与代码 |
| R3/R4 | [ClickSync 支持边界][R3]、[Rapoo JS][R4]；[GPL-2.0][CL]；代码及系列级实测声明，目标未确认 |
| R5 | [RAPOO HUB][R5]；厂商版权；空 SPA，目标 JS 未取得 |
| Z1/Z2 | [目标 issue 描述符评论][Z1]、[ZOWIE 电量 FAQ][Z2]；报告独立许可未核实/厂商版权；实机枚举与厂商文档 |
| H1/H3 | [旧 V9 C# 协议][H1]、[M HUB][H3]；H1 [MIT][HL]，H3 厂商版权；旧设备代码/目标 SPA 未取得 JS |
| D1/D2 | [Dareu codec][D1]、[transport][D2]；[AGPL-3.0][OL]；A950 PRO Mg 实机声明，非 A955 |
| D3/D4 | [A955 官方驱动入口][D3]、[网页驱动][D4]；厂商版权；文档/页面，目标 JS 未取得 |
| E1 | [旧 S9 固定提交][E1]；[同提交 MIT][EL]；代码及旧 ID 作者实机片段 |
| E2/E3 | [EWEADN 下载与型号表][E2]、[E HUB 3.0][E3]；厂商版权；文档/空 SPA |
| E4 | [Linux EWEADN 共享接收器补丁][E4]；所查 [hid-ids.h](https://github.com/torvalds/linux/blob/337cf8a2df1edd95007ce3f6dfad2564c2820e58/drivers/hid/hid-ids.h) 的 SPDX 为 GPL-2.0-or-later；只有输入修复代码/作者设备说明 |
| I1/I2 | [Ajazzy 协议研究][I1]（[GPL-3.0][IL]）、[aj179-linux][I2]（仓库标 MIT）；AJAZZ 作者实机，不是英菲克 |
| I3/I4 | [Inphic 驱动表][I3]、[HUB][I4]；厂商版权；型号表/空 SPA |
| G1/G2 | [GK501 官方商品页][G1]（厂商版权）、[GearHub 鼠标实现][G2]（AGPL-3.0）；文档/其他设备代码 |
| B1 | [HaloBattery 协议说明][B1]；[MIT][BL]；G7 实机说明、其他手柄读取经验 |
| B2/B3 | [XInputGetBatteryInformation][B2]、[返回结构][B3]；微软文档，独立再分发许可未核实；API 契约，不是目标硬件支持证明 |
| B4 | [PadKey KP40D 研究][B4]；许可未核实；其他 PID 作者实机说明 |
| X1/X2/X3 | [K03S 官方驱动索引][X1]、[新版支持页][X2]（厂商版权；本次全文读取失败，只有索引线索）、[Linux 音频补丁][X3]（所查 `sound/usb/quirks.c` 的 SPDX 为 GPL-2.0-or-later）；非目标 HID 电量证据 |
| V1/V2/V3 | [V87 V2 官方手册][V1]（厂商版权）、[VGN F2 transport][V2]（AGPL-3.0）、[VGN HUB][V3]（厂商版权）；目标文档/其他鼠标代码/空 SPA |
| K1/K2 | [Linux Rapoo 驱动][K1]（文件 SPDX GPL-2.0）、[标准 HID 电池处理][K2]（文件 SPDX GPL-2.0-or-later）；只有代码 |
| L1/L2 | [libratbag 构建清单][L1]、[设备目录规则][L2]；构建声明 MIT/Expat；只有代码/文档，非全仓穷尽检索 |

[R1]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/rapoo/index.ts
[R2]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/drivers/rapoo/hid.ts
[R3]: https://github.com/Nuitfanee/ClickSync/blob/main/README.md
[R4]: https://github.com/Nuitfanee/ClickSync/blob/main/src/protocols/protocol_api_rapoo.js
[R5]: https://hub.rapoo.cn/
[Z1]: https://github.com/wushuai0802/myfinder-device-battery/issues/37
[Z2]: https://zowie.benq.com/en-us/support/faq/product/application/zowiegear-faq-kn-00019.html
[H1]: https://github.com/PyFlat/Device-Battery-Info/blob/main/src/DeviceBatteryInfo/Sources/Mchose/MchoseProtocol.cs
[H3]: https://www.mchose.com.cn/
[D1]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/dareu/index.ts
[D2]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/drivers/dareu/hid.ts
[D3]: https://dareu.com/pages/driver
[D4]: https://dr.dareu.com/
[E1]: https://github.com/Rum-right/HaloBattery/blob/c9c75371e00e42d5714416718b40992e4a6ac7e7/providers/eweadn.py
[E2]: https://www.eweadn.com/pages/driver-download
[E3]: https://new-hub.eweadn.cn/
[E4]: https://github.com/torvalds/linux/commit/337cf8a2df1edd95007ce3f6dfad2564c2820e58
[I1]: https://github.com/Geovane2dd/Ajazzy/blob/main/docs/reverse-engineering.md
[I2]: https://github.com/Rockeyxx/aj179-linux
[I3]: https://www.inphic.com/pages/drivers-manuals
[I4]: https://hub.inphic.cn/
[G1]: https://item.lenovo.com.cn/product/1034237.html
[G2]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/drivers/gearhub/hid.ts
[B1]: https://github.com/HeyOkay/HaloBattery/blob/main/docs/protocols.md
[B2]: https://learn.microsoft.com/en-us/windows/win32/api/xinput/nf-xinput-xinputgetbatteryinformation
[B3]: https://learn.microsoft.com/en-us/windows/win32/api/xinput/ns-xinput-xinput_battery_information
[B4]: https://github.com/thesnowmangit/PadKey/blob/main/README.md
[X1]: https://xiberia.net/en/h-col-164.html
[X2]: https://xiberia.net/h-col-181.html
[X3]: https://git.zx2c4.com/linux-rng/commit/sound/usb?id=15c0f794acc900cc71b5a54b35c864c88e4ec8bc
[V1]: https://vgnlab.com/blogs/guides/user-manual-for-vgn-v87-v2-wireless-mechanical-keyboard
[V2]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/src/drivers/vgn/hid.ts
[V3]: https://hub.vgnlab.com/
[K1]: https://github.com/torvalds/linux/blob/master/drivers/hid/hid-rapoo.c
[K2]: https://github.com/torvalds/linux/blob/master/drivers/hid/hid-input.c
[L1]: https://github.com/libratbag/libratbag/blob/master/meson.build
[L2]: https://github.com/libratbag/libratbag/blob/master/data/devices/README.md
[OL]: https://github.com/OpenMouse-Project/mouse-protocol/blob/main/LICENSE
[CL]: https://github.com/Nuitfanee/ClickSync/blob/main/LICENSE
[HL]: https://github.com/PyFlat/Device-Battery-Info/blob/main/LICENSE
[EL]: https://github.com/Rum-right/HaloBattery/blob/c9c75371e00e42d5714416718b40992e4a6ac7e7/LICENSE
[IL]: https://github.com/Geovane2dd/Ajazzy/blob/main/LICENSE
[BL]: https://github.com/HeyOkay/HaloBattery/blob/main/LICENSE
