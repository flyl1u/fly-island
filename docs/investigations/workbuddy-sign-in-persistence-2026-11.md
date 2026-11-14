# WorkBuddy 重新打开岛屿后要重新登录：排查记录（2026-11-14）

反馈：部分用户每次重新打开岛屿，WorkBuddy 额度环都变成「需要登录」。作者本机复现不了。下面的结论来自读代码；没有真实账户可测，也没有读取作者本机浏览器配置里的 cookie。

## 登录态存在哪里

| 位置 | 内容 | 重启后 |
|---|---|---|
| `%LOCALAPPDATA%/com.focusd.island/workbuddy-web/WebView2` | 独立 WebView2 用户数据目录，官网登录的 cookie 在这里 | 目录固定，不会每次变。**只有带 `Expires` 的持久 cookie 会写进磁盘** |
| 同级 `connected` 文件 | 「曾经连接成功」的标记，只决定启动后要不要去读积分 | 保留 |
| 进程内 `Connection` | 上次状态、积分缓存、User-Agent | 丢失（只是缓存） |
| 凭据管理器 | 修复前**没有使用** | — |

读积分时，`summary_cookies` 用 `cookies_for_url` 从这个 WebView2 配置里取 `www.workbuddy.cn` 的 cookie，拼成 `Cookie` 请求头，由 Rust 直接请求积分接口。

## 已排除

- **数据目录每次不一样**：路径由 `app_local_data_dir()` 固定拼出，同一台机器同一用户不会变。
- **关闭登录窗口时清掉了数据**：关闭只是 `hide()`，只有「断开」才会清 cookie 和浏览数据。
- **只缓存在内存**：积分缓存在内存，但登录本身在 WebView2 配置里。

## 推测的根因（按可能性排序）

1. **会话 cookie 不会跨进程保留。** WebView2 退出浏览器进程时丢弃所有没有 `Expires` 的会话 cookie（普通 Chrome 靠「继续浏览上次打开的网页」恢复它们，WebView2 没有这一步）。如果用户走的登录方式（微信扫码、QQ 登录，或网站没勾「记住我」）只发会话 cookie，那么本次运行中一切正常，一重启就变成未登录。作者本机能保持登录，说明作者那条登录路径拿到的是持久 cookie；遇到问题的用户很可能走了另一条路径。这是最符合「部分用户、作者复现不了」的解释，但没有真实账户无法证实。
2. **持久 cookie 还没写盘就退出。** Chromium 每隔约 30 秒才把 cookie 库写盘一次。登录或网站刷新 token 后很快退出、更新重启或被系统结束进程，新 cookie 会丢，下次启动拿到的是旧的、已失效的 cookie。
3. **短期 token 过期后没人刷新。** 不少网站用短期 token 加刷新 token，靠页面脚本在打开页面时续期。岛屿重启后隐藏窗口一直停在 `about:blank`，从不加载官网页面，网站脚本没有机会续期；Rust 拿着过期 token 请求积分接口，得到「需要登录」。

## 修复

1. **cookie 副本存进凭据管理器**（`workbuddy_cookie_vault.rs`）：每次读到积分后，把发往积分接口的 `workbuddy.cn` cookie（名称、值、域、路径、Secure、HttpOnly、过期时间）序列化后存进 Windows 凭据管理器 `com.focusd.island.workbuddy-web`。单个凭据最多 2560 字节，所以分成最多 8 段（`cookies-0`…`cookies-7`）；放不下就整份不存，不会存半份。凭据管理器由 Windows 按用户用 DPAPI 加密，不写明文文件。内容没变时不重复写入。
2. **启动后缺 cookie 时放回去**：已记住登录、读积分却得到「需要登录」时，先把副本里未过期的 cookie 用 `set_cookie` 放回独立配置，再读一次。只放回 `workbuddy.cn` 及其子域的 cookie。
3. **仍不行就让官网自己续期**：在隐藏窗口里加载一次积分页面（等页面加载完成，最多 12 秒，再留 2 秒给页面脚本），然后回到空白页，再读一次。
4. **都不行才要求登录**，同时清掉凭据管理器副本，避免反复用失效的 cookie。每次读到积分后重新允许这套恢复流程；连续失败期间只试一次，不会每次刷新都偷偷加载网页。
5. 「断开」时同时清除凭据管理器副本。

服务端让登录过期时（token 和刷新 token 都失效），仍会正常显示「需要登录」。

命令名、事件名、状态取值和 `connected` 标记文件都没有变；新增的只有凭据管理器条目，已写进 `docs/architecture/contracts.md` 和 `data-storage.md`。

## 测试

`workbuddy_cookie_vault.rs` 单元测试：只保留未过期的 `workbuddy.cn` cookie（`workbuddy.cn.evil.test` 等不保留），过期时间往返不变，会话 cookie 放回后仍是会话 cookie；分段编码不超过单个凭据上限，往返一致，超过 8 段整份拒绝。凭据管理器读写与 WebView2 的 cookie 接口需要真实桌面环境，没有自动化测试。

## 需要实机验收

1. 登录 WorkBuddy → 等积分出现 → 退出岛屿 → 重新打开：额度环直接显示积分，不要求登录。
2. 登录后立刻（10 秒内）退出再打开：仍保持登录。
3. 在「凭据管理器 → Windows 凭据」里能看到 `com.focusd.island.workbuddy-web` 条目；点「断开」后条目消失。
4. 在官网退出登录（或等服务端过期）后：额度环显示「需要登录」，凭据条目被清掉。
