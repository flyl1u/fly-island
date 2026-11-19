# 插件开发规范 / Plugin development guide

> **插件功能即将上线。** 现在就可以按这份规范开发插件并提交 PR，flyl1u 审核、适配后统一上线。
>
> **Plugins are coming soon.** You can build one now and open a PR; flyl1u reviews, adapts and ships it. An English summary is at the end.

---

## 一、插件是什么

**一句话：插件是基于小岛源码做出来的功能，装上之后就成了小岛自己的一部分。**

插件可以是两种：

1. **改造原有功能。** 例如小岛的每日笔记现在只能写纯文字，有人做了「Markdown 笔记」插件，装上后**原来的那个笔记**就能加粗、斜体、设多级标题。小岛里不会多出第二个笔记，用户还在原来的地方写，只是笔记本身变强了。
2. **做一个全新的功能。** 例如给小岛加一个「番茄钟统计」页面、一个新的消息来源，或者一组新的快捷操作。它是小岛原来没有的，但做出来要像小岛原生的功能一样：放在合适的位置（岛上的一页、收起时的一个状态、设置里的一组选项），用小岛的样式和操作习惯。

两种都可以。功能放在哪里也由你决定：可以放在岛上（一个新页面、收起时的一个状态），也可以**单独开一个窗口**，就像小岛的剪贴板和翻译窗口那样。关键在于看起来、用起来都是小岛的一部分。插件**不是**：

- ❌ 一个和小岛毫无关系的小程序，只是借小岛启动一下，界面风格、操作习惯全是另一套；
- ❌ 一段和小岛各走各的代码：功能虽然塞进来了，但样式、交互都和小岛格格不入。

插件**是**：

- ✅ 基于小岛的**完整源代码**来写，能用小岛已有的组件、样式、数据和原生能力，也能按需新增；
- ✅ 装上后和原生功能没有区别：看起来、用起来都像小岛本来就有的；
- ✅ **默认不安装**，用户在「设置 → 插件」里按需下载。没装的用户，小岛和原来一模一样。

## 二、整个流程

```text
Fork 仓库 → 本地改造小岛源码 → 在真实小岛里自测、录制演示 → 按模板提 PR
        → flyl1u 审核 → flyl1u 做适配（改成可按需安装）→ 随版本上线，用户按需下载
```

因为插件改的是小岛本身，**不能直接合并上线**：flyl1u 会在合并时把你的改动适配成「可选安装」的形式，保证没装插件的用户不受影响。所以你只需要专心把功能做好、把演示和信息交代清楚。

## 三、怎么开发

### 1. 准备环境

1. Fork [flyl1u/fly-island](https://github.com/flyl1u/fly-island)，克隆到本地。
2. 安装 Node.js、pnpm、Rust（版本见仓库里的 `rust-toolchain.toml`）和 Tauri 2 的 Windows 依赖（WebView2、MSVC 生成工具）。
3. 在仓库根目录运行：

   ```powershell
   pnpm install
   pnpm tauri dev
   ```

   能看到小岛跑起来，就可以开始改了。

### 2. 先读这几份文件

| 文件 | 为什么要读 |
| --- | --- |
| [AGENTS.md](../../AGENTS.md) | 仓库总规则：目录结构、文件行数上限、不能改的对外契约、验证命令 |
| [src/AGENTS.md](../../src/AGENTS.md) | 前端规则：分层、文案必须中英双语、样式和组件怎么写 |
| [src-tauri/AGENTS.md](../../src-tauri/AGENTS.md) | 如果要改 Rust / Windows 原生部分 |
| [DESIGN.md](../../DESIGN.md) 和 `docs/design/` | 小岛的界面约定：配色、圆角、间距、动效，插件必须遵守 |

### 3. 改造时的要求

- **改造已有功能时，就在原功能上改。** 要增强笔记，就改 `src/features/todos/` 里的笔记；要增强剪贴板，就改 `src/features/clipboard/`，不要另做一个平行的版本。
- **做新功能时，按小岛的结构来放。** 新的领域放在 `src/features/<新功能>/`，岛上的新页面、设置里的新分组都接到现有的页面和设置结构里（参考已有功能怎么接）。无论哪种，都复用现有组件和样式，不要再造一套。
- **需要独立窗口时，照着现有窗口做。** 参考剪贴板窗口（`?window=clipboard`）：用新的窗口名和 `?window=` 参数，按需创建，用小岛的样式；不要改动已有的四个窗口名。
- **把改动收拢、做成能关掉的。** 尽量把新增逻辑放在独立的文件或目录里，在原功能里只留少量接入点，并且在 PR 里写清楚「哪几处是接入点」。这样 flyl1u 才能把它改成可选安装，没装时一行都不生效。
- **不破坏没装插件的用户。** 已保存的数据（`localStorage` 里的 `focusd-island-*`、应用数据目录里的文件）、Tauri 命令名、窗口名都不能改；需要新存数据就用新的 key，并能兼容读旧数据。完整清单见 [contracts.md](../architecture/contracts.md)。
- **看起来就是小岛的一部分。** 用小岛已有的颜色变量和组件，深色 / 浅色、液态玻璃 / 磨砂玻璃都要看一遍；窄窗口下文字和按钮不能溢出。
- **中英双语。** 所有用户能看到的字（包括按钮的悬停提示、读屏标签）都要有中文和英文。
- **安全与隐私。** 不偷偷联网、不收集数据、不读和功能无关的文件；如果需要联网或读文件，在 PR 里写清楚连哪些域名、读写哪些路径、为什么。不提交任何账号、密钥或私人数据。
- **性能。** 小岛常驻后台，不要加高频轮询或常驻的重计算；展开、收起不能变卡。

### 4. 提交前自测

在仓库根目录运行，全部通过再提交：

```powershell
pnpm check
pnpm build
pnpm test:regression
```

改了 Rust 部分还要运行：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

然后在真实小岛里（`pnpm tauri dev`）把功能完整用一遍，**边用边录屏**。

## 四、提交 PR 需要什么

用[插件 PR 模板](../../.github/PULL_REQUEST_TEMPLATE/plugin.md)提交，下面几项**必须填**，缺了不会审核：

| 必填项 | 说明 |
| --- | --- |
| **使用演示录屏链接** | 在真实小岛里实际使用插件的录屏（B 站、YouTube、网盘等公开链接都行）。要能看到：改造前是什么样、改造后怎么用、主要功能逐一演示。截图或单独的程序演示不能代替。录屏里遮住私人消息和账号信息。 |
| **作者** | 署名和 GitHub 用户名，多人合作逐一列出。 |
| **联系方式** | 一个能联系到你的公开渠道（邮箱、微信、QQ 群等），审核有问题时用。 |
| **GitHub 链接** | 你的 GitHub 主页，以及插件代码所在的仓库或分支。 |
| **插件简介** | 名字、一句话介绍、改造了小岛的哪个功能、用户装上后有什么变化。会用在插件列表里，写得让普通用户看得懂。 |
| **改动说明** | 改了哪些文件；哪几处是接入原功能的地方；有没有新增存储、命令、联网、读写文件。 |
| **自测结果** | 上面几条命令的结果，以及你手动测过哪些场景（深浅色、两种玻璃、窄窗口、中英文、长内容、空内容）。 |

可选：截图、已知问题、后续计划。

## 五、审核和上线

1. **flyl1u 审核**：看功能是否值得做、是否和小岛浑然一体、有没有安全和性能问题。可能会请你修改。
2. **flyl1u 适配**：把改动整理成「可选安装」的插件形式。这一步由 flyl1u 完成，你不需要关心安装机制怎么实现。
3. **随版本上线**：插件默认不安装，出现在「设置 → 插件」的列表里，带上你的名字、简介和演示，用户按需下载。
4. 提交不保证一定合并或立刻上线；flyl1u 会在 PR 里说明原因。

## 六、常见问题

**Q：我想做一个全新的功能，不是改已有的，可以吗？**
当然可以，这也是插件的一种。只要它像小岛原生的功能一样放在合适的位置（岛上的一个新页面、收起时的一个状态、设置里的一组选项），并遵守同样的设计规范。较大的新功能，建议动手前先开一个 Issue 聊聊方向，免得白做。

**Q：插件能不能单独开一个窗口？**
可以。像剪贴板、翻译那样的独立窗口都行，照着现有窗口的做法来（新的窗口名、按需创建）。但窗口里的界面要用小岛自己的组件和样式，不要另搞一套风格。

**Q：需要我自己实现「下载 / 安装插件」吗？**
不需要。你只管把功能做好，可选安装的适配由 flyl1u 完成。

**Q：仓库里 `plugins/` 目录和 `api.md`、`specification.md` 是什么？**
那是小岛内部已有的一套「外部数据接入」机制（把其他 AI 工具的额度、会话、消息接进 Agent 页）的技术说明和示例。它不是「插件」的定义。如果你的插件正好需要接入外部数据源，可以参考；否则不用看。

---

## English summary

**A plugin is a feature built from the island's source that becomes part of the island once installed.** It can either **upgrade an existing feature**, for example a "Markdown notes" plugin that adds bold, italics and headings to the island's own daily note (no second notes window), or **add a brand-new feature**, such as a new page, a new message source or new quick actions. It can live on the island or **open its own window**, like the island's clipboard and translation windows. Either way it must feel native: island styles, island interactions.

- Not an unrelated app that merely launches from the island with its own look, and not code bolted on beside the original feature.
- **Not installed by default.** Users download it on demand in Settings → Plugins; everyone else gets the island unchanged.

**Flow:** fork → modify the island's source → test and record a demo inside the real island → open a PR with the [plugin template](../../.github/PULL_REQUEST_TEMPLATE/plugin.md) → flyl1u reviews and adapts it into an optional install → it ships with a release.

**Rules:** follow [AGENTS.md](../../AGENTS.md), [src/AGENTS.md](../../src/AGENTS.md) and [DESIGN.md](../../DESIGN.md). When upgrading a feature, change it in place rather than building a parallel copy; when adding one, put it in `src/features/<name>/` and wire it into the existing pages and settings. A plugin window follows the clipboard window's pattern: a new window label and `?window=` value, created on demand. Either way, keep new logic in its own files with a few clearly listed hook points. Never change saved data keys, Tauri command names or window labels ([contracts.md](../architecture/contracts.md)). Use the island's own components and styles, and provide every visible string in Chinese and English. Declare any network domains or file access, and add no heavy polling. Run `pnpm check`, `pnpm build`, `pnpm test:regression` (and `cargo test` for Rust changes) before submitting.

**Required in the PR:** a public link to a demo recording of the plugin in use inside the real island, the author(s), a public contact, your GitHub profile and the source repository/branch, a plain-language description for the plugin list, a list of changed files and hook points, and your self-test results. flyl1u handles the optional-install packaging; submission does not guarantee a merge or immediate release.

The `plugins/` directory and the `api.md` / `specification.md` documents describe the island's existing external data adapter mechanism (quota, sessions and messages from other AI tools). They are a reference for plugins that need external data sources, not the definition of a plugin.

## 本分支插件 / Plugins in this branch

[护眼提醒 / Eye Care](eye-care.md) integrates a native island page and settings, with optional installation. 本分支新增的 panel / number schema 见 [API](api.md) 与 [specification](specification.md)。正式发布门禁保持主分支默认值；本地测试按 [quickstart](quickstart.md) 临时启用。
