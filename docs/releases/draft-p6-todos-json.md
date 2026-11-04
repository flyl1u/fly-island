<!-- 草稿：插件平台 P6。发版时改名为 docs/releases/v<版本>.md（release 脚本只读这个名字），并补上下载一节和 Full changelog 链接。按计划，这个版本单独发，不和其他新功能一起发。 -->

## 更新内容

- **待办数据换了存放位置。** 待办、以后的待办、每日笔记、归档、正在进行的待办，以前存在岛屿窗口内部（WebView 的 localStorage），现在存在应用数据目录的 `todos.json` 里。升级后第一次启动时会自动搬过去，界面和用法都不变。
  - 应用数据目录：`%APPDATA%\com.focusd.island\`。
  - 搬之前的原始数据会备份到同一目录的 `todos-migration-backup.json`，这个文件不会被自动删除。
  - 旧位置的数据也保留着，没有删除。如果装回旧版本，旧版本仍能看到升级前的待办。
  - 如果在旧版本里又改过待办再升级回来，岛屿会按旧版本的数据重新导入，并先把当时的 `todos.json` 备份成 `todos.before-reimport-<时间>.json`，待办页底部会有提示。
  - 如果搬迁失败，这次会继续用原来的数据，待办页底部会提示，下次启动再试。
- 插件和本地接口读写待办不再经过岛屿窗口，窗口卡住时也能正常工作；插件收到的 `todos.changed` 事件会说明是新增、修改、删除、排序还是换了一天。
- 插件可以申请更多数据：剪贴板历史里的文字、QQ / 微信 / QQ 邮箱的提醒（不含邮件正文）、正在播放的歌曲和播放控制、文件中转列表。这些属于敏感权限：插件第一次使用时，岛上会弹出一行确认（允许 / 本次 / 拒绝），之后也可以在插件设置页撤销。QQ 邮箱授权码和翻译密钥不会对任何插件开放。
- 新的示例插件"正在播放"。

## 下载

（发版时补上安装包、签名与 `latest.json` 的说明。）

---

## What's new

- **Todos are stored in a new place.** Todos, todos for later days, the daily note, archives and the todo in progress used to live inside the island window (WebView localStorage); they now live in `todos.json` in the app data folder. The first start after the update moves them over; nothing changes in how they look or work.
  - App data folder: `%APPDATA%\com.focusd.island\`.
  - The original data is backed up to `todos-migration-backup.json` in the same folder, and that file is never deleted automatically.
  - The old copy is kept too, so an older version installed again still sees the todos from before the update.
  - If todos were changed in an older version and you update again, the island imports that version's data, first saving the then-current `todos.json` as `todos.before-reimport-<time>.json`, and says so at the bottom of the todo page.
  - If moving the data fails, this run keeps using the old data, the todo page says so, and the next start tries again.
- Plugins and the local API read and change todos without going through the island window, so they keep working while the window is busy. The `todos.changed` event now says whether a todo was added, changed, removed or reordered, or the day changed.
- Plugins can ask for more data: clipboard history text, QQ / WeChat / QQ Mail alerts (never mail bodies), what is playing and playback control, and the file shelf. These are sensitive permissions: the first time a plugin uses one, the island asks (allow / once / deny), and the answer can be revoked on the plugin's settings page. The QQ Mail authorization code and translation keys are never available to plugins.
- New example plugin "Now playing".

## Downloads

(Add the installers, signatures and `latest.json` when releasing.)
