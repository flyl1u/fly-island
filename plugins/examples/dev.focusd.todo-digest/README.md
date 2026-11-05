# 待办摘要（示例）

把还没完成的待办整理进每日笔记。

## 怎么用

- 待办有变化时，插件会在日志里记下未完成待办的数量（在插件设置页可以看到日志）。
- 运行命令「写入摘要」，未完成的待办会追加到今天的每日笔记。

## 权限

- `todos:read`：读取待办。
- `notes:write`：写入每日笔记。

## 示例演示了什么

订阅待办变化事件、读取待办、写每日笔记。用 Windows 自带的 PowerShell 运行，不需要安装别的东西。

## English

Logs how many todos are open whenever they change; the Write digest command appends the open todos to today's daily note.
