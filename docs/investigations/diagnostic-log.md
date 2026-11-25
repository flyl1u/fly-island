# Fly Island 诊断日志

## 如何收集

1. 遇到异常后先不要退出应用。在「设置 → 关于 → 问题排查」点「导出诊断包…」，即使「记录日志」是关的也可导出最近事件。也可先开启开关，复现一次再导出，便于保留更长的现场。
2. 在 Windows 保存对话框选位置。成功后设置页显示完整保存路径；取消不会创建文件。应用不会上传任何文件；分享前可以解压检查。
3. 说明发生时间、操作、预期和实际结果（尤其是多屏、显示缩放或游戏）。不需要提供账号或消息正文。

ZIP 内包含：

- `fly-island.log` 与已有的轮转文件 `fly-island.1.log`：当前磁盘历史。没开过日志时主文件可能为空。
- `recent-events.log`：当前进程最近约 2,000 条事件，包含尚未落盘的部分；可能与主日志重合。关闭开关后只写入内存，重启会丢失尚未导出的现场。
- `startup.log`：版本、Windows 构建号、WebView2、显示器、主任务栏位置和自动隐藏、启动时岛屿设置、插件 ID / 版本 / 启用状态。内置插件随应用发版，版本取应用版本。
- `island-settings.json`：导出那一刻的白名单岛屿设置；不包含完整 localStorage、路径、正文或密钥。
- `plugin-logs/*.log`：存在时提供各插件最近 stderr 中的错误分类与计数，不打包插件可执行文件或原始自由文本。

## 事件格式

每行是 `时间 [类别] 事件 key=value …`，时间为本机时区。包含空格或控制字符的值使用 JSON 字符串表示，每行最多 1,024 字节（含换行，长行以 `...` 截断）。相同类别、事件和字段 3 秒内只记一次，下一条实际写入的事件末尾 `repeated=N` 是此前被合并的次数，可能来自交错出现的事件。导出时仍未结算的计数记为 `pending_repeat`。非阻塞队列满时丢弃新事件，恢复后以 `dropped reason=queue_full` 报告丢弃数量；不会让业务线程等待磁盘。

| 类别 / 事件 | 如何阅读 |
| --- | --- |
| `island / mode` | `from → to` 是实测状态变化，`reason` 区分点击、悬停、闲置计时、游戏模式、最小化、消息、保持可见、peek 回退等。 |
| `island / tuck_blocked、collapse_blocked、peek_blocked` | Idle 贴边计时被面板预览、设置对话框、消息或正在运行的 Agent / 歌词 / 待办挡住时记录；编辑或选择对话框拦截自动收起、游戏模式拦截 peek，各有单独事件。 |
| `island / hover、drag_start、drag_blocked、drag_end、tray_hide` | 指针进入 / 离开原生命中区；拖动开始、被拒、释放位置、吸回顶边或收进托盘。不会记录每次指针移动。 |
| `window / apply_stage_geometry、stage_failed` | 目标显示器的物理边界、目标位置、缩放、窗口高度、顶部保留区和实际是否计划动画；原因区分已保存位置、跟随指针/前台、主屏和回退。结果未变不重复。 |
| `window / topology、monitor` | 显示器拓扑变更和逐屏快照，包含主屏标记；仅用于观测，不修改窗口行为。 |
| `fullscreen / foreground` | 发生活跃状态、屏幕覆盖或系统信号变化时记前台窗口类名、进程文件名、是否覆盖显示器和 Windows 通知信号。若 Fly Island 自己在前台并沿用上次结果，`retained=true`，未读取的判定输入标为 `not_read`。 |
| `media / session` | SMTC 会话 AUMID（桌面程序路径只取文件名）和播放状态，切换时记录，不记录曲名、歌词、专辑或播放进度。 |
| `weather / city_search、locate、locate_fallback、forecast` | 请求搜索语言、输入长度及返回城市数；定位方式、回退原因及耗时；天气查询结果与耗时。位置只记城市级名称和一位小数坐标，不记搜索原文、IP、请求 URL 或响应正文。 |
| `plugin / netease_operation` | 网易云插件安装/卸载结果与原生错误类别。其他插件的启动信息在启动头，现有 stderr 只记录安全分类。 |
| `update / check` | 检查通道、是否配置代理、结果、可用版本、耗时。不记录代理 URL、清单内容或发布说明。 |
| `startup、legacy` | 启动现场和缓冲报告；旧的无结构控制台错误、stderr（包括 panic）只保留来源与已知错误分类，不透传正文或堆栈。 |

不要在事件字段里放凭据、Cookie、token、消息/邮件/剪贴板/待办正文或原始错误对象。系统用户目录压成 `%USERPROFILE%`；不能保证安全的旧日志或插件自由文本只输出分类。维护者先读启动摘要和 `island / mode`，再按时间用 `window / apply_stage_geometry、stage_failed` 与 `fullscreen / foreground` 对齐位置、显示器和全屏判定；多屏物理坐标可为负值。

## 一分钟示例（构造，非真机采集）

```text
2026-11-25 09:00:00.031 [startup] version reason=launch app=3.3.0 windows=24H2 build=26100 webview=143.0.0.0
2026-11-25 09:00:00.036 [startup] monitor reason=launch primary=true position=0,0 resolution=2560x1440 scale=1.250
2026-11-25 09:00:00.054 [startup] taskbar reason=launch edge=bottom auto_hide=false
2026-11-25 09:00:00.373 [island] mode reason=launch from=none to=collapsed
2026-11-25 09:00:04.286 [update] check reason=no_update channel=stable version=none proxy_configured=false elapsed_ms=474
2026-11-25 09:00:08.421 [island] hover reason=cursor_enter
2026-11-25 09:00:08.634 [island] mode reason=hover from=collapsed to=expanded
2026-11-25 09:00:08.688 [window] apply_stage_geometry reason=primary monitor=0,0:2560x1440 scale=1.250 target=767,0 stage_height=560 island_size=568x420 top_inset=0 animate=false
2026-11-25 09:00:18.302 [island] mode reason=idle_timer from=expanded to=collapsed
2026-11-25 09:00:23.315 [island] mode reason=idle_timer from=collapsed to=tucked
2026-11-25 09:00:27.459 [island] mode reason=hover from=tucked to=peek
2026-11-25 09:00:31.214 [media] session reason=playback_changed aumid=MusicApp.exe playback=playing
2026-11-25 09:00:32.817 [island] tuck_blocked reason=keep_visible_lyrics
2026-11-25 09:00:40.482 [weather] forecast reason=success latitude=37.8 longitude=-122.4 elapsed_ms=258
2026-11-25 09:00:52.008 [fullscreen] foreground reason=foreground_changed active=true on_island_monitor=true class=GameWindow process=Game.exe covers_monitor=true notification_signal=d3d_full_screen retained=false
2026-11-25 09:00:52.050 [island] mode reason=game_mode from=collapsed to=tucked
```
