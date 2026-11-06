# 待完善任务

任务一项一个文件，放在 [`docs/tasks/`](tasks/)（`<编号>.md`，头部写状态、负责人、lane、认领时间、涉及目录、依赖）。看板和认领都用脚本，规则见 [AGENTS.md](../AGENTS.md)「任务」一节：

- `pnpm tasks`：按优先级列出没做完的任务，标出失效的认领和留了交接的任务；`--all` 连已完成的一起列，`--json` 给其他程序读。
- `pnpm task:claim <编号> --as <会话名> --scope <目录/,文件>`：在 lane 里认领。会先同步 `origin/main`；已经是你的就不重复提交，别人在做就拒绝；成功后自动 land。
- `pnpm tasks add <编号> --title .. --section ..`：新任务（和其他改动一起提交）。
- `pnpm tasks note <编号> <文字>`：给接手的会话留交接；`pnpm tasks done <编号> --commit <提交>`：标为完成，和功能改动放在同一个提交里。
- `pnpm tasks stale`：lane 没了、建 lane 的会话退出了、或 24 小时没提交的认领。
- `pnpm tasks:plugin`：把「开发任务看板」插件装到本机岛屿（插件目录），在岛上看等你确认、失效、进行中和待做的任务，收起条显示等你确认的数量。装好后在 设置 → 插件扩展 里允许第三方插件、重新加载、启用。
- `pnpm tasks conflicts`：本 lane 和 `origin/main` 有没有冲突（`git merge-tree`），以及改到了别人声明的目录。

状态：`待做` / `进行中` / `待用户确认` / `已完成` / `不做`。决定不做的标「不做」并写原因，不要删文件。

2026-11-07 之前的清单（Markdown 表格）已迁移到 `docs/tasks/`；旧「已完成」表格里的条目归在「已完成（迁移自 roadmap）」一组。

## 参考

竞品对比来源：[NotchPixel 对比 13 款](https://notchpixel.com/guides/dynamic-island-for-windows)、[Notchify 对比](https://notchify.app/en/compare/)、[Pillar](https://github.com/warpirate/pillar-dynamic-island-for-windows)。
