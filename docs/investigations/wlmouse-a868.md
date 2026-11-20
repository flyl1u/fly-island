# 万灵花兽 Mini Pro 8K 接收器无电量回复

2026-11-20，用户反馈岛上没有当前的万灵鼠标，并确认使用 2.4G 8K 接收器。

本机只读枚举显示 `WLMOUSE MINI PRO 8K RECEIVER`，VID/PID `36A7:A868`，配置集合为接口 2、`FFFF:0000`。固定引擎已有对应型号表项；不存在缺少该 PID 的问题。

此前本会话成功取得的鼠标读数为 `WLMOUSE MINI PRO`、80%、充电中，PID `A869`，是 USB 有线通道，不能当作 `A868` 无线接收器读取成功的证据。

插件完整查询和直接调用原 WLmouse 读取器均未取得有效电量。使用同一个已公开的只读 `0x83` 查询复核，SetFeature 成功，回复为 `00 A0 00 02 02 00 83 00 00`（等待 / 未完成），没有 `A1/A2` 有效电量结果。用户确认连接方式并移动鼠标后，两次读取仍无有效结果；目前不能确定是睡眠、无线链路还是其他软件同时访问造成，不能宣称硬件电量已读通。

参考事实：[上游 WLmouse 实现](https://github.com/krisgfx9/Wireless-Device-Battery-Monitor/blob/main/src/drivers/wlmouse.cpp)说明了查询和响应状态；[原固定快照](../../plugins/device-battery/upstream/engine/providers/wlmouse.py)中也已有相同查询。本次未复制网络项目源码、未更改固定引擎、未发送配对 / 固件 / DPI 或其他设置命令。

界面遗漏的原因是宿主只合并引擎 `devices` 数组，丢弃了 `unadapted` 中已枚举但未返回电量的接收器。`device_battery/inventory.rs` 现对本次确认的精确 VID/PID、产品名与配置集合保留一张未知卡片，标记「已检测到接收器，尚未读到鼠标电量」，不声称无线鼠标在线，不捏造百分比或充电状态。已有实际 WLmouse 读数时不追加该卡片；重复型号条目合并为一张，不把型号元数据当作独立物理设备 ID。

修复验证：`pnpm check`（461 项单元测试）、Rust 默认测试（471 通过、15 忽略）、clippy 均通过；设备 / 音乐 / 设置相关 10 页浏览器回归通过。新增测试覆盖已枚举但未知电量、避免重复实际读数、拒绝未经证明的其他型号及 UI 状态提示。
