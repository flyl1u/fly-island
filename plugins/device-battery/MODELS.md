# 支持的设备型号 / Supported devices

> 设备电量插件的型号清单。这里只列**鼠标**（含 2.4G 接收器、有线、蓝牙）；耳机、键盘、手柄见 [上游完整清单](https://github.com/wushuai0802/myfinder-device-battery/blob/73d99e2087dd70ae8eef4199854e0c495a66f0bc/engine/upstream-devices.md)。
>
> 0.2.0 起读取引擎用 Rust 重写，型号范围与固定提交的上游读取器相同；**不保证全品牌全系列**。协议已接入 ≠ 已在本项目实机验证。
>
> **重写后的读取器全部记为 C 级**：单元测试用的是上游测试样例和协议文档里的字节，没有在真实外设上读过。原先记为 A 级或实机确认的型号标注「Rust 重写后待复验」。

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
| ATK | **A9 Air+**（及用户验证的接收器变体，`373B:1278`） | 2.4G 接收器 | bridge 内的原生读取器，本次重写未改动 |

## 二、协议已接入 / C 级（按品牌）

### WLmouse
- Beast X（`36A7:A887`）
- Beast X Mini Pro（`36A7:A868`）
- Beast X Max（`36A7:A880`；Python 版上游实机确认，**Rust 重写后待复验**）
- 8K / 1K 接收器或 USB 有线

### Razer（限代码内既有匹配表）
- Viper V3 Pro SE（`1532:00DE / 00DF`）
- Basilisk V3 Pro / Basilisk Ultimate
- DeathAdder V4 Pro
- 其他 OpenRazer 已列明无线鼠标（同系列推定）
- 2.4G 接收器或 USB 有线

### MCHOSE
- M7 Ultra（`5253:1020`；Python 版上游实机确认，Rust 重写后待复验）
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
- VGN Dragonfly 4K Receiver（`3554:F505`；Python 版经本项目维护者实机确认，**Rust 重写后待复验**）
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
| 其他 | 见上游 `observedUnsupported` | 上游记录的未支持观察 |

---

## 常见问题

- **型号不在表里 / 电量不对**：协议实现在 [engine/src/providers/](engine/src/providers/)，每个读取器一个模块；请附上型号、VID:PID 和实际电量提 issue。
- **「已检测到接收器，尚未读到电量」**：接收器出现了但没有电量回复，常见于耳机未开机或 dongle 需要重新插拔。
- **等级 C 是什么意思**：协议已按上游读取器接入，尚未按该确切型号在实机上确认过读数。

> 完整协议来源与逐型号细节见上游的 [upstream-protocols.md](https://github.com/wushuai0802/myfinder-device-battery/blob/73d99e2087dd70ae8eef4199854e0c495a66f0bc/engine/upstream-protocols.md) 与 [compatibility.json](https://github.com/wushuai0802/myfinder-device-battery/blob/73d99e2087dd70ae8eef4199854e0c495a66f0bc/engine/compatibility.json)。

## English

Since 0.2.0 the readers are rewritten in Rust and cover the same models as the pinned upstream readers. **A** = a level was actually observed on real hardware; **C** = protocol implemented but not verified on this exact model; **D** = device detected but no level obtained. Every rewritten reader is graded C until re-tested; models previously confirmed with the Python engine are marked as awaiting re-verification. The ATK A9 Air+ reader lives in the unchanged bridge. Headsets, keyboards and gamepads are listed in the [upstream device table](https://github.com/wushuai0802/myfinder-device-battery/blob/73d99e2087dd70ae8eef4199854e0c495a66f0bc/engine/upstream-devices.md).
