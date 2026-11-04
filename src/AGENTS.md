# 前端模块边界

在根目录规则的基础上遵守以下约定。结构与本次改造来源见 [改造说明](../docs/architecture/local-refactor.md)。

- `main.tsx` 根据 `?window=` 选择 `windows/island`、`windows/settings` 或 `windows/translation`。
- `windows/` 组合功能、管理窗口尺寸/拖拽/导航；业务状态归 `features/`。
- `features/` 按待办、媒体、剪贴板、消息、外观、代理状态、更新分组；组件与同名 CSS 放在一起。
- 通用控件放 `components/controls/`，无副作用函数放 `utils/`，安全存储工具放 `lib/`，全局样式放 `styles/`。
- Tauri `invoke` / `listen` 统一经各模块的 `api.ts` 封装。组件不直接写命令名。
- 各领域的 `storage.ts` 保持现有 key 和数据格式，通过 `lib/storage.ts` 访问存储。旧数据读取和存储不可用时必须容错。
- 更新任务只由主窗口的 `features/updater/updaterController.ts` 持有。设置窗口通过事件取得快照、请求操作，不创建第二个更新句柄。
- 更新待办是临时 UI 状态，不得写入 localStorage、Markdown、归档或跨日结转；不参与普通任务轮播。
- 订阅和计时器在卸载时清理，异步订阅要处理完成前已卸载的情况。
- 用户可见文案经 `i18n/` 获取，用户输入保持原样。新增文案同步中英文与类型。
- 优先小组件和清晰的职责，不为了行数上限增加无意义的包装。一般 TS/TSX 文件上限 400 行、CSS 500 行；文案字典豁免。
- 修改后运行 `pnpm check`、`pnpm build`。浏览器回归页也由 `tsconfig.tests.json` 检查。
- Node 测试直接加载的纯 TS 模块使用可擦除语法；运行时相对导入写 `.ts` 扩展名，类型使用 `import type`。
