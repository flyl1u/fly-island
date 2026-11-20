# 时间与天气 / Clock & Weather

时间与天气是一个默认未安装的内置插件。插件市场启用的版本中，在「设置 → 插件」安装后，可以独立开关「在岛上显示时间」和「在岛上显示天气」。初次安装和重新安装均默认打开两个开关，重新安装保留上次选择的城市。卸载立即隐藏两个状态位，保留设置和缓存以便下次恢复。

时间显示本机时区的 24 小时制 `HH:mm`，由叶子组件在整分钟更新；展开或贴边隐藏时暂停，重新显示时校准。数字预留固定宽度，不随分钟变化改变岛的大小。

天气需要先搜索并选择城市。没有城市时显示「选择城市后显示天气」，不请求天气、不占用岛上位置。搜索只在按搜索按钮或回车时提交；点击「定位」才会请求 Windows 位置权限，失败时使用网络大致位置。城市名称和坐标保存在本机。

天气在岛上显示 lucide 图标和取整摄氏温度（例如 `23°`），悬停和读屏标签包含城市、天气描述及 ℃。每 30 分钟刷新，失败不弹通知，继续显示有效缓存；观测或获取时间中更早的一项超过三小时即隐藏。切换城市不会混用旧城市的数据。所有文案支持简体中文和英文。

「设置 → 外观 → 岛上的排列」中，安装后增加时间和天气两个可拖动状态位。关闭开关的位变灰且保留顺序；未选城市的天气位也变灰。卸载后编辑器隐藏这两个位，保存的顺序保留。旧用户的排列保持不变，缺少的两个位追加在末尾。实际显示时为时间和有效天气预留宽度，必要时提高窄手动宽度的最小内容空间，上限仍为 480。

## 网络、存储与接入

- Rust `src-tauri/src/weather/mod.rs` 请求 Open-Meteo 固定 HTTPS 域名：`geocoding-api.open-meteo.com`（城市搜索）、`api.open-meteo.com`（当前温度和 WMO weather_code）。当 Open-Meteo 的结果缺少高质量城市时，会用 Nominatim 搜索补充一项。无需 API key，不跟随重定向，超时 12 秒，响应上限 256 KiB。
- 定位只在用户点击时发生：同时请求 Windows `Geolocator` 和 `ipwho.is` 的网络位置（精确到城市），Windows 拿到坐标就用它，系统定位关闭、被拒绝或 8 秒内没结果时用已经回来的网络结果，所以不需要用户去开系统定位。网络结果直接用 `ipwho.is` 返回的本地化城市名，开了代理时可能定位到代理所在城市，提示里引导用户直接搜索。Windows 坐标只发送给反向地理编码服务 `nominatim.openstreetmap.org` 和天气服务，不写入 Rust 文件或后台记录。
- 前端 `src/features/weather/api.ts` 封装 `search_weather_cities` / `locate_weather` / `get_current_weather`。插件安装态沿用 `features/plugins/native` 的跨窗口同步。
- 设置与一条城市天气缓存写入 WebView2 localStorage：`fly-island-clock-weather` / `fly-island-weather-cache`。无新增 Rust 数据文件、凭据或后台线程。格式见 [对外契约](../architecture/contracts.md)，位置见 [数据存储](../architecture/data-storage.md)。
- 岛屿接入点为 `IslandCollapsedBar.tsx` 与 `useCollapsedTodo.ts`；预览与排列位在 `features/appearance/`。时间定时器不向窗口提升状态，天气由同一窗口的订阅共享请求和低频定时器。

## 回归与人工查看

`pnpm test:regression` 包含中英文插件安装、独立开关、城市选择、卸载与重新安装，以及真实 IslandApp 下的窄岛宽度、storage 同步、离线缓存、三小时过期检查。

启动启用保留功能的回归 Vite 后可查看：
- `/tests/regression/settings.html?page=appearance&clockWeather=1`：排列编辑器，含两个示例位。
- `/tests/regression/settings.html?page=plugins&clockWeather=1`：已安装插件与城市设置。
- `/tests/regression/island-tour.html?test=1&clockWeather=1&notch=1&font=120&features=enabled`：自动跑天气后继续全岛验收。

回归页使用模拟天气。真实 Open-Meteo 可达性、WebView2 多窗口同步、桌面缩放和拖动手感仍须在 Windows 应用中验收。

## English

Install **Clock & Weather** in Settings → Plugins when the built-in market is available. Time and weather have independent switches, both on after installation. Pick a city before weather appears; the plugin never locates you automatically. It shows local 24-hour time and Celsius weather, refreshes weather every 30 minutes, and quietly retains valid cached observations for up to three hours. Uninstalling hides both slots while preserving preferences. Installed slots can be reordered in Appearance, with disabled slots dimmed. Network requests run in Rust against Open-Meteo. Clicking Locate first asks Windows for a position; if that is unavailable, `ipwho.is` supplies an approximate network location and Nominatim turns it into a city name. Coordinates are sent only to those geocoding/weather services and are not recorded separately. Preferences and one cached reading stay in localStorage.
