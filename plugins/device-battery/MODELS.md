# 支持的设备型号 / Supported devices

> 设备电量插件的型号清单。这里只列**鼠标**（含 2.4G 接收器、有线、蓝牙）；耳机、键盘、手柄见 [上游完整清单](upstream/engine/upstream-devices.md)。
>
> 本插件复用固定提交的上游读取器，型号和验证等级与上游一致；**不保证全品牌全系列**。协议已接入 ≠ 已在本项目实机验证。

## 验证等级

| 等级 | 含义 |
|---|---|
| **A** | 本项目 / 用户实机读到过电量 |
| **C** | 协议已接入，尚未在本项目按该确切型号实机验证 |
| **D** | 已发现设备，但未取得可用电量（当前不支持） |

---

## 一、本项目实机验证 / A 级

| 品牌 | 型号 | 连接 | 备注 |
|---|---|---|---|
| ATK | **A9 Air+**（及用户验证的接收器变体，`373B:1278`） | 2.4G 接收器 | 原生读取器；可读取既有 DPI 档位 |
| WLmouse | **Beast X Max**（`36A7:A880`） | 8K 接收器 | 上游实机确认；Beast X / Mini Pro 为同协议 C 级 |

> 你当前在用的 **WLmouse Beast X Mini Pro**（`36A7:A868`）属于同一读取器，协议已接入、等级 C；界面上显示的 80% 来自该读取器。

## 二、协议已接入 / C 级（按品牌）

### WLmouse
- Beast X（`36A7:A887`）
- Beast X Mini Pro（`36A7:A868`）
- Beast X Max（`36A7:A880`）
- 8K / 1K 接收器或 USB 有线

### Razer（限代码内既有匹配表）
- Viper V3 Pro SE（`1532:00DE / 00DF`）
- Basilisk V3 Pro / Basilisk Ultimate
- DeathAdder V4 Pro
- 其他 OpenRazer 已列明无线鼠标（同系列推定）
- 2.4G 接收器或 USB 有线

### MCHOSE
- M7 Ultra（`5253:1020`，上游实机）
- A5 V2 Ultra（`3837:100C`，严格只读候选）
- A7 V3 Pro / Ultra+（`3837:1018 / 1014`）
- A7 V2 Ultra（`3837:100B`）
- G7（`A8A5:2255`，YJX-CHIP）
- L7 / L7 Pro / L7 Ultra、M7、A7、K7（同协议族）
- 2.4G 接收器或 USB 有线

### Logitech（HID++）
- G PRO X 2 LIGHTSPEED
- G502 LIGHTSPEED / G502 X PLUS
- G Pro Wireless（`C539/C53A/C53D/C53F/C541/C545/C547/C54D`）
- 其他 HID++ 2.0 鼠标（同系列推定）
- Lightspeed / Unifying / Bolt 接收器

### SteelSeries
- Rival 3 Wireless 及同系列
- Aerox 3 Wireless（含 CS2 Dragon Lore 版）
- 2.4G dongle

### ASUS ROG / TUF
- ROG Gladius III Aimpoint（`1A72/1A70`）
- ROG Gladius III Wireless（`197F/197D`）
- ROG Gladius III Eva 2（`1B0C/1B0A`）
- ROG Chakram X（`1A1A/1A18`）
- ROG Harpe Ace Aim Lab（`1A94/1A92`）
- ROG Keris Wireless Aimpoint（`1A68/1A66`）
- ROG Spatha X（`1979/1977`）
- ROG OMNI 接收器（`0B05:1ACE`，仅鼠标）
- 2.4G 接收器或 USB 有线

### G-Wolves
- HSK Pro ACE（接收器 `33E4:3854`）
- HTS Plus / HTS Plus Pro、HTXU、Lycan
- Fenrir Pro / Asym、HTX Mini、WARG、HTM Plus
- 自带接收器或 USB 有线

### Pulsar / ATK / VXE / VGN / Scyrox / Hitscan
- Pulsar X2 V2 Mini / X2 CrazyLight Mini
- Pulsar Link 8K（`3710:5501`）
- ATK VXE R1 SE+ / R1 Pro Max
- VGN Dragonfly 4K Receiver（`3554:F505`，本项目维护者实机确认）
- VGN F2 Master+（`3554:FB56`）、F1 Moba（`3554:F503`）、F1 Pro
- VXE R1 SE 1K（`3554:F58E`）、Scyrox（`3554:F517`）
- ATK / VXE NANO（`373B:1216`）
- Hitscan Hyperlight
- 2.4G dongle 或 USB 有线

### Corsair
- Dark Core RGB Pro SE（`1B1C:1B7F`）
- 其他代码内已列明无线鼠标
- 2.4G dongle

### 其他品牌与通用读取器
| 品牌 / 读取器 | 型号 |
|---|---|
| Keychron | M5（`3434:D048`）、Ultra-Link 8K 接收器（`3434:D028`） |
| Dareu | EM901（`260D:1074`） |
| LAMZU | Maya X（`373E:001E` 接收器 / `001C` 有线） |
| Angry Miao | AM Infinity 8K（`3151:5007`） |
| NZXT | Lift Elite Wireless（`1E71:2101`） |
| Ninjutso | Sora V2 旧款接收器（`1915:AE1C`） |
| VGN | 蜻蜓 Dragonfly3 SE（`391D:1A01`） |
| HECATE | G3M PRO（`320F:706E`） |
| Lingbao | M1 Pro（`088D:052F`） |
| 前行者 EWEADN | S9（`089D:062F`）、S9 PRO 8K（`372E:1026`） |
| Rapoo | VT nrf54L 系列 69 个已列明 PID（VT3S `1411`、VT3 `1412` 等） |
| 1D57 通用 | FA60 / FA65 被动接收 2.4G 鼠标（部分 AULA / SC650 变体） |
| 蓝牙 | Windows 已提供电量属性的蓝牙鼠标 |
| 标准 HID | 描述符声明了标准电量 Feature 字段的鼠标（通用） |

## 三、已发现但不支持 / D 级

| 品牌 | 型号 | 说明 |
|---|---|---|
| Rapoo | VT9 PRO（`24AE:1601`） | 用户报告，未取得可用电量 |
| 其他 | 见上游 `observedUnsupported` | 以读取器诊断为准 |

---

## 常见问题

- **型号不在表里 / 电量不对**：先看 [上游添加设备说明](upstream/README.md)。本项目不修改上游协议实现。
- **「已检测到接收器，尚未读到电量」**：接收器出现了但没有电量回复，常见于耳机未开机或 dongle 需要重新插拔。
- **等级 C 是什么意思**：协议是从上游工具的代码接入的，尚未在这台机器上按该确切型号确认过读数；界面会标注「待确认」。

> 完整协议来源与逐型号细节见 [upstream-protocols.md](upstream/engine/upstream-protocols.md) 与 [compatibility.json](upstream/engine/compatibility.json)。

## English

This plugin reuses the pinned upstream readers. The mouse list above mirrors upstream support: **A** = a level was actually observed on real hardware; **C** = protocol implemented but not verified on this exact model here; **D** = device detected but no level obtained. Headsets, keyboards and gamepads are listed in the [upstream device table](upstream/engine/upstream-devices.md).
