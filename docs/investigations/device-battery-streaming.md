# 设备页长时间读取与 HyperX Cloud III S 电量

2026-11-20，用户反馈设备页一直读取、耳机电量缺失。

## 查询阻塞

通过插件的便携 Python 实测，WLmouse Mini Pro 8K 接收器 `36A7:A868` 在约 0.5 秒返回 93%，最终快照约 15.6 秒后才返回，等待来自蓝牙读取器超时。原宿主运行 `server.py --once`，只能获得最终结果；反复切页会重新显示空的读取状态。

宿主现通过现有行协议发送一次 `poll`，在独立进程内保持超时和 Job 清理，用可选 Tauri Channel 把累积读数送到页面；仍返回最终快照。相同目录的前端查询继续合并，新订阅者接收本轮已有结果，旧 hook 通过 generation 拒绝过时回复。未更改固定的上游引擎。

真实 Rust 进程路径复测：约 0.99 秒收到鼠标 92%，整轮 16.18 秒正常完成，最终报告 `bluetooth: timeout`。这是同一接收器稍后取得的新读数，不是有线通道。浏览器回归覆盖扫描未完成时鼠标卡片已出现。

## 耳机仍未取得电量

系统枚举及引擎库存均识别到 `HyperX Cloud III S Wireless`、`03F0:06BE`，接口 3，包含 `01C0:0001` 集合。现有原生 C# 读取器没有返回这款设备；Python `hyperx_cloud3s` 读取器接受输出报告后未取得有效电量。

使用已公开的 GET 查询复核：`0C 02 03 01 00 02` 收到 `0C 02 03 01 00 02 02 ...` 连接状态回复；`0x06` 电量和 `0x48` 充电查询均没有对应回复。读取 `GET_INPUT` 只得到报告 ID 后全零，不能解读为 0%。复核期间 NGENUITY 的应用及通信进程正在运行；尚不能确定是否存在竞争读取或设备状态问题。

当前仅保证接收器在最终快照保留一张「已检测到接收器，尚未读到电量」卡片，百分比和充电状态为空。不能据此声称耳机电量已读通，也不把接收器存在等同于耳机在线。

协议参考：[HyperHeadset Cloud III S 实现](https://github.com/LennardKittner/HyperHeadset/blob/master/src/devices/cloud_iii_s_wireless.rs)、[HaloBattery 型号实测记录](https://github.com/HeyOkay/HaloBattery/issues/156)、[固定读取器](../../plugins/device-battery/upstream/engine/providers/hyperx_cloud3s.py)。只执行公开的状态查询，没有发送配对、音效、灯光、固件或其他设置命令。后续需在保持耳机 2.4G 开机的情况下重新插拔接收器，并对照 NGENUITY 是否也能读取电量。
