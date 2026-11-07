# 系统监控

岛上多一个「系统监控」页，收起条上也可以放几个数字。

## 怎么用

- 安装并启用后，岛上会多一个「系统监控」页面：CPU 总占用和一分钟曲线、每个逻辑核心一根小柱、CPU 温度；GPU 占用、温度、显存和功耗（只支持 NVIDIA）；内存；上下行网速和曲线；电池；最占 CPU 或内存的 5 个程序（同一程序的进程合在一起）。
- 在插件设置里勾选「收起条显示 CPU 占用 / 内存占用 / CPU 温度 / GPU 温度」，收起条上就会出现对应的几列，数值偏高时变黄、变红，点击打开监控页。默认都不勾。

## 开销

- 只在需要时读取：监控页打开时每秒一次（程序列表每 3 秒），收起条有勾选项时每 2 秒一次，都没有时不读。
- 没勾收起条项目时，插件在空闲 60 秒后停下，打开页面时再启动；勾了就一直运行（插件卡片上会写原因）。
- 运行时是一个 Windows 自带的 PowerShell 进程，常驻内存约 60–120 MB（大部分是 PowerShell 本身）。

## 数据来源

都不需要管理员权限，也不联网：

- CPU、每个核心、内存：Windows 性能计数器。
- 网速：网卡的收发字节数。
- 程序：`Get-Process`，两次读取之间的 CPU 时间。
- CPU 温度：WMI 的 ACPI 温度区（`Win32_PerfFormattedData_Counters_ThermalZoneInformation`），取最热的一个。很多台式机主板不提供，会显示 -；这个温度通常是主板测的，比 CPU 核心温度低。
- GPU：`nvidia-smi`，至多每 2 秒一次。没有 NVIDIA 显卡时显示 —。
- 电池：`Win32_Battery`，每 10 秒一次。

## 权限

不需要任何权限。

## 示例演示了什么

自定义界面页面（`webview`）和收起条上的列（`status.update` 的 `cells`，能力 `statusCells`；旧版岛屿只显示文字）。

## English

Adds a System page: CPU load with a minute of history, one bar per logical core and the CPU temperature; GPU load, temperature, memory and power (NVIDIA only); memory; download and upload speed; the battery; and the five programs using the most CPU or memory. Tick the plugin's settings to show CPU load, memory, CPU or GPU temperature as small columns on the collapsed bar; they turn yellow and red as they climb.

It reads only while the page is open (every second) or the bar shows figures (every 2 s), needs no administrator rights and never goes online. The CPU temperature is the hottest ACPI thermal zone, which many desktops do not have.
