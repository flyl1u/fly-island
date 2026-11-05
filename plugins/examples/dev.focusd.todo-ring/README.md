# 待办进度环（示例）

在岛上加一个页面，用圆环画出今天的待办完成了多少。

## 怎么用

- 安装并启用后，岛上会多一个「待办进度环」页面。
- 完成或新增待办时，圆环会立刻跟着变。

## 权限

- `todos:read`：读取今天的待办。

## 示例演示了什么

自定义界面页面：页面是插件自己写的 HTML，只能通过消息和插件进程通信，不能联网，也不能调用岛屿的任何命令。

## English

Adds an island page with a ring showing how much of today's todos are done. The page is the plugin's own HTML; it can only talk to the plugin process and cannot reach the network.
