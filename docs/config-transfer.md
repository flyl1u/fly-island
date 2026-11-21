# 配置备份与迁移 / Backup & transfer

在 **设置 → 通用 → 备份与迁移** 选择「导出配置…」，按需勾选「包含剪贴板历史」（默认不勾），选择保存位置。默认文件名为 `fly-island-config-YYYY-MM-DD.json`。

在另一台电脑安装 Fly Island，选择「导入配置…」并打开备份。文件通过格式校验后，先阅读覆盖提示，再点「继续导入」与「确认覆盖并重启」。导入会替换设置、待办、归档、每日笔记、外观 / 预设、语言、快捷键、功能开关、文件中转列表、音效包、插件偏好及 Agent 集成开关。建议先导出目标电脑的配置。恢复过程中断时，下次启动会先撤销未完成的文件写入，再重试；本地存储写入失败会尝试回滚。

备份不包含：邮箱授权码、翻译 API 密钥、插件密钥 / 登录 Cookie、WorkBuddy 登录配置、第三方 Agent 配置原文、SSH 密钥、通知 / 邮件正文、运行中的 Agent 会话与状态、日志正文和缓存。完成提示会提醒重新填写凭据 / 连接账号。软件权限（例如 Windows 通知访问权限）仍需在新电脑授权。

窗口位置、设置窗口尺寸、剪贴板窗口位置及剪贴板自选存储目录保留目标电脑的选择。剪贴板设置始终包含；未勾选历史时，目标电脑已有历史保留。勾选后历史与图片一起恢复，并改为目标电脑的图片路径。文件中转只保存引用，不复制实际文件；待办导出路径、歌词文件夹、开发插件索引等用户填写的路径仍需按新电脑实际情况检查。

第三方插件只备份 id、版本、启用状态和非秘密设置，不备份可执行包。目标电脑缺少相同版本时，完成提示会列出插件，请到插件市场重新安装对应版本；设置会保留，装回该版本后恢复。开发插件需要重新加载其本机目录。网易云进度插件在目标电脑重新探测 / 安装，不复制旧电脑的安装文件与安装目录。

## English

Open **Settings → General → Backup & transfer → Export configuration…**. Clipboard history is unchecked by default. Choose a location for `fly-island-config-YYYY-MM-DD.json`.

On the destination computer, install Fly Island, choose **Import configuration…**, and select the backup. After validation, review the replacement warning, choose **Continue import**, then **Replace and restart**. Export the destination's current configuration first if you need a fallback. The app restores native files before services start and shared settings before any window mounts. Interrupted restores retry on the next launch; failed writes attempt to restore the previous configuration.

Backups include settings, todos, archives, daily notes, appearance/presets, language, shortcuts, feature switches, file shelf references, imported sound packs, plugin preferences, and Agent integration switches. They exclude credentials, API keys, login cookies/profiles, SSH keys, external Agent configuration files, runtime sessions/status, notifications, mail bodies, logs and caches. Re-enter secrets, reconnect accounts, and grant Windows permissions on the destination.

Window coordinates/sizes and the destination's clipboard storage location are preserved. Clipboard preferences always transfer; history and images transfer only when selected. File shelf references do not copy their underlying files. Review user-entered filesystem paths on the new computer. Missing plugin versions are listed after import; reinstall the recorded version to recover its non-secret preferences. Development plugins must be loaded again from a local directory. The NetEase progress integration is detected/installed afresh.

格式和命令契约 / Format and IPC contract: [contracts.md](architecture/contracts.md)。数据边界 / Data boundaries: [data-storage.md](architecture/data-storage.md)。
