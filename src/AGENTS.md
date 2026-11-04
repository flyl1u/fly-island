# 前端规则（src/）

适用于 `src/` 下的所有文件，在根目录 [AGENTS.md](../AGENTS.md) 的基础上补充前端细则。各文件从旧位置迁到新位置的映射见 [docs/architecture/overview.md](../docs/architecture/overview.md)。

## 目标结构

```text
src/
├── main.tsx                 # 唯一入口：按 ?window= 分发到 windows/ 下的根组件
├── windows/                 # 每个 Tauri 窗口一个目录，只负责组合与窗口级行为
│   ├── island/              # 主窗口：IslandApp、IslandShell、窗口尺寸/拖拽/贴边 hook、自动化 hook
│   ├── settings/            # 设置窗口
│   └── translation/         # 快捷翻译窗口
├── features/                # 业务领域，每个领域自包含
│   ├── todos/               # 待办、每日笔记、归档、Markdown 导出
│   ├── media/               # 媒体控制、波形
│   ├── clipboard/           # 剪贴板历史、快捷键
│   ├── file-shelf/          # 文件中转：拖到岛上的文件（只存路径）、拖出、复制、打开
│   ├── local-api/           # 本地接口的前端一侧：转发请求的分发与桥接 hook（待办部分在 todos/apiCommands.ts；开关与设置在内置插件页）
│   ├── plugins/             # 设置 → 插件页：插件列表、启用与授权、状态与日志
│   ├── messages/            # 消息导航与预览；qq-mail/、qq-notifications/、wechat/ 子目录
│   ├── agent-status/        # AI 代理状态
│   ├── appearance/          # 外观设置、布局编辑器、预设
│   ├── translation/         # 快捷翻译：服务与模型设置、凭据、快捷键的类型化封装
│   └── updater/             # 自动更新
├── components/              # 与领域无关的通用 UI（滑块、颜色、开关、数字输入等控件）
├── lib/                     # 有副作用的通用基础设施，例如 localStorage 安全读写
├── utils/                   # 无副作用的纯函数（文本测量、颜色、日期、数值）
├── i18n/                    # 类型化多语言字典与 Provider
├── styles/                  # 全局 CSS：变量、基础样式、字体
└── assets/                  # 品牌图标、字体及其许可证
```

单个 feature 目录的标准组成（按需创建，不需要的文件不建）：

```text
features/<领域>/
├── <Name>Panel.tsx / <Name>.tsx   # 组件，每个文件一个主组件
├── use<Name>.ts                   # 领域状态与副作用 hook
├── api.ts                         # 本领域全部 invoke / listen 的类型化封装、事件名常量、与 Rust 对应的类型
├── storage.ts                     # 本领域的 localStorage key 与 load / save / normalize
├── types.ts                       # 本领域共享类型（类型较少时可省略，直接写在使用处）
├── <纯逻辑>.ts                     # 可单测的纯函数，例如 markdown.ts、shortcut.ts
└── <Name>.css                     # 与组件同名的样式文件
```

`features/messages/` 下的 `qq-mail/QQMail.tsx`、`qq-notifications/QQNotifications.tsx`、`wechat/WeChatReminders.tsx`采用的就是"领域 hook + 面板 + 控件"的组织方式，可作为样板。迁移时再把其中的 invoke 调用和存储 key 拆到 `api.ts` 与 `storage.ts`。

## 分层与依赖方向

```text
main.tsx → windows/ → features/ → components/、lib/、utils/、i18n/、styles/
```

- 只能向右（向下）依赖，下层不得 import 上层。`components/`、`utils/` 不得依赖任何 feature。
- `utils/` 只放纯函数，不依赖 React、Tauri、DOM 和 `localStorage`。
- feature 之间尽量不直接依赖。确需共享的类型或函数，上提到 `utils/`、`components/`，或通过对方目录的 `index.ts` 公开导出后引用，不得深入引用对方的内部文件。
- `windows/` 负责组合 feature、处理窗口级状态（折叠/展开、尺寸、面板切换），不写领域逻辑。

## 边界收口

- **IPC**：`invoke`、`listen` 只出现在各目录的 `api.ts` 中。组件和 hook 调用 `api.ts` 导出的类型化函数，不直接写命令名字符串。
  - `api.ts` 中与 Rust 结构对应的类型，用注释标明对应的 Rust 文件和结构名。
  - 事件名定义为常量，与 Rust 侧常量保持一致。
  - `listen` 返回的取消函数必须在组件卸载时调用，并处理"Promise 尚未 resolve 就已卸载"的情况。
- **持久化**：`localStorage` 只在各目录的 `storage.ts` 中读写，统一通过 `lib/` 中的安全读写函数完成。`src/i18n/index.ts` 中的语言偏好属于存量例外，已有测试覆盖。
  - load 函数必须容错：JSON 解析失败、字段缺失、旧格式数据都要回退到默认值，不能抛出异常。
  - key 名和数据格式属于对外契约，见根目录规则。格式需要演进时，在 normalize 中兼容旧数据。

## 文件与命名

- 组件文件用 `PascalCase.tsx`，hook 用 `useXxx.ts`，其他模块用 `camelCase.ts`，目录用 `kebab-case`。
- 一个 `.tsx` 文件只导出一个主组件；仅被它使用、且不超过约 50 行的小子组件可以放在同一文件。
- 不含 JSX 的逻辑不放进 `.tsx` 文件。
- 统一使用具名导出；`App` 根组件等存量的默认导出在迁移时一并改为具名导出。
- 行数上限见根目录规则。另外有两条软性上限，代码评审时检查：单个组件函数不超过 200 行，单个 hook 不超过 150 行。

## 组件与状态

- 单个组件的 `useState` 超过 8 个时，把相关状态抽成自定义 hook 或改用 `useReducer`。
- 一个 `useEffect` 只做一件事。订阅、定时器、监听器必须返回清理函数。
- 能由现有状态计算出来的值，直接计算或用 `useMemo`，不要用 effect 把一个 state 同步到另一个 state。
- 状态共享按以下顺序选择：props 下传 → 提升到共同父级的 hook → React Context。Context 只用于语言、主题这类全局低频数据。不引入第三方状态管理库。
- 主窗口在展开时有性能约束（见 `docs/expansion-performance-investigation.md`）。高频更新的状态（音频电平、计时器等）应放在叶子组件或独立 hook 中，避免带动整个窗口重渲染。
- 类型禁止使用 `any`；外部数据先当作 `unknown`，经过校验或 normalize 后再使用。

## 样式

- 组件的样式放在同目录、同名的 `.css` 文件中，由组件自己 `import`。
- 全局样式只放在 `styles/` 下：`tokens.css`（CSS 变量：颜色、圆角、间距、字号）、`base.css`（重置与基础元素）、`fonts.css`。
- class 名使用领域前缀（如 `todo-`、`media-`、`clipboard-`、`mail-`），新增 class 不得与已有 class 冲突。搬迁时保持原 class 名不变。
- 颜色、圆角、间距优先使用 CSS 变量，不新增散落的硬编码值。
- 保持现有视觉语言：悬浮岛、紧凑面板、透明背景、清晰的控件状态。界面方向以 `DESIGN.md` 为准。
- 图标使用 lucide-react，不手写图标库已有的 SVG。

## 多语言

- 所有用户可见文案，包括 `aria-label` 和 `title`，都通过 `useTranslation()` 取得，不硬编码。
- 新增文案时同步修改 `i18n/types.ts`、`locales/zh-CN.ts`、`locales/en.ts`。由类型检查保证没有遗漏。
- 用户输入的内容（待办、笔记、预设名、消息原文）保持原样，不翻译。原生服务返回的错误信息原样显示。

## 测试

- 纯逻辑写在不含 JSX 的 `.ts` 文件中，由 `tests/*.test.mjs` 用 `node:test` 覆盖。
- Node 直接加载 `.ts` 源码，所以被测模块必须满足：
  - 运行时的相对导入写完整的 `.ts` 扩展名（纯类型导入用 `import type`，可以不写扩展名）；
  - 只使用可擦除的 TS 语法，不用 `enum`、`namespace`、构造函数参数属性。
- `tests/updater-controller.test.mjs` 和 `tests/island-automation.test.mjs` 用 `vm` 加载源码，并按 import 路径注入 mock。修改这些被测模块的 import 时，必须同步更新测试里的 mock 表。
- 移动被测模块时，同步更新 `tests/` 中的导入路径，并确认测试通过。
- 浏览器回归页 `tests/*.html` 在 `pnpm dev` 启动后通过 `/tests/<name>.html` 访问，用于检查界面和数据兼容性。回归页不经过 `main.tsx`，新增回归页时要自己导入 `src/styles/tokens.css`，否则组件样式中的变量无法解析。回归页的 `.tsx` 由 `tsconfig.tests.json` 做严格类型检查（`pnpm check` 中的 `check:tests-types`），修改组件属性或 `api.ts` 类型时要同步更新回归页中的 mock。

## 新增 Tauri 命令清单

1. Rust 侧实现命令，并在 `generate_handler!` 中注册（见 `src-tauri/AGENTS.md`）。
2. 在对应 feature 的 `api.ts` 中添加类型化封装和返回类型。
3. 如果用到插件或核心权限，更新 `src-tauri/capabilities/default.json`。
4. 运行 `pnpm build` 和 Rust 侧要求的验证。
