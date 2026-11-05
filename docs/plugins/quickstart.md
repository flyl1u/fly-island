# 快速开始：一小时写出一个插件

本文带你从零做出一个 FocuSD Island 插件，并完成调试、测试和打包。协议细节见 [README.md](README.md)，所有方法和事件见 [API 参考](api.md)，各版本新增了什么见 [更新日志](changelog.md)。

> 开发者工具的 npm 包 `fly-island-plugin`、`create-fly-island-plugin` 和 PowerShell 模块 `FlyIsland.Plugin` 还没有发布到 npm / PowerShell Gallery。发布之前请在本仓库里用 `node packages/create-fly-island-plugin/bin/create-fly-island-plugin.mjs` 和 `node packages/fly-island-plugin/bin/fly-island-plugin.mjs` 代替下文的 `npm create` / `npx` 命令。

## 1. 准备

- FocuSD Island（本仓库的当前版本）。
- 写 TypeScript / JavaScript 插件需要 Node.js 20 或更新版本。写 PowerShell 插件，插件本身用 Windows 自带的 PowerShell 5.1 运行，但脚手架和命令行工具仍然需要 Node.js。
- 在岛屿的 **设置 → 插件扩展** 里：
  1. 打开 **本地 API** 插件和它的 **允许修改**（命令行工具通过它让岛屿加载插件）。
  2. 展开页面底部的 **开发者**，打开 **开发模式**。开发模式不保存，岛屿重启后要重新打开。

## 2. 用脚手架建插件

```sh
npm create fly-island-plugin@latest
```

依次选择：

| 问题 | 选项 |
|---|---|
| 语言 | PowerShell（用户不用装任何东西）、TypeScript、JavaScript（用户需要装 Node.js） |
| 模板 | `command`：一个在岛上弹出提示的命令；`list`：岛上的一个列表页面；`status`：折叠条上的一小段状态；`blank`：空白 |
| 作者 | 你的 GitHub 用户名 |
| 名称 | 英文名和中文名 |
| 插件 id | 小写字母、数字、`.`、`-`，例如 `yourname.reading-list`；不能包含 `focusd`（留给官方插件） |

也可以不问直接生成：`npm create fly-island-plugin@latest my-plugin -- --language typescript --template list --author yourname --id yourname.reading-list --name "Reading list" --name-zh 阅读清单 --yes`。

生成的文件夹（以 TypeScript 列表页面为例）：

```text
yourname.reading-list/
├── focusd-plugin.json        # 清单：名称、权限、页面、命令
├── src/main.mts              # 插件代码，编译到 dist/main.mjs
├── lib/focusd.mjs            # SDK（一个没有依赖的文件），lib/*.d.mts 是它的类型
├── test/plugin.test.mjs      # 用模拟宿主跑的测试
├── .focusdignore             # 打包时排除的文件
├── .github/workflows/plugin.yml  # 推送时检查，推送版本标签时发布
├── package.json / tsconfig.json
└── README.md / LICENSE
```

插件运行时只需要 `lib/` 里的 SDK，不依赖 `node_modules`。

## 3. 开发：改代码，2 秒内看到效果

```sh
cd yourname.reading-list
npm install
npm run watch                 # TypeScript：另开一个终端，持续编译到 dist/
npx fly-island-plugin dev     # 把这个文件夹以开发模式加载进岛屿
```

`dev` 会：

- 先检查清单（同 `validate`），然后通过本地 API 让岛屿加载这个文件夹（不用复制到插件目录，也不用打开“允许第三方插件”）；
- 监视文件夹，文件变化 300 毫秒后让岛屿重启插件（`.focusdignore` 排除的文件和 `node_modules` 不算）；
- 在终端实时打印插件日志和状态变化；
- Ctrl+C 退出时把插件从岛屿移除。

开发中的插件卡片标着“开发中”，自动获得清单里申请的全部权限（敏感权限第一次使用时仍会在岛上询问）。在 **设置 → 插件扩展 → 开发者** 里还可以：

- 手动加载一个文件夹（不用命令行）；
- 点插件查看最近 200 行原始 JSON-RPC 收发记录（→ 岛屿发给插件，← 插件发给岛屿）；
- 手动给插件发一个事件（例如 `todos.changed`），不管它有没有订阅。

列表模板的插件：展开岛屿，点页眉里插件的小图标就能看到页面。改 `src/main.mts`，保存后页面会随插件重启刷新。

## 4. 测试：不用启动岛屿

```sh
npx fly-island-plugin test
```

有 `test/*.test.mjs` 时用 `node --test` 运行它们；没有时做一次冒烟测试：启动插件、运行每个命令、打开每个页面，检查插件没有退出、没有调用不存在的方法、没有越权。

测试里用模拟宿主 `fly-island-plugin/test` 启动插件。它和岛屿一样启动进程、发送 `initialize`，并在内存里实现全部宿主方法：

```js
import assert from "node:assert/strict";
import test from "node:test";
import { startMockHost } from "fly-island-plugin/test";

test("the list shows the saved items", async () => {
  const host = startMockHost(".", { storage: { items: [{ id: "1", title: "Read", done: false }] } });
  try {
    host.viewVisible("main");                       // 用户打开页面
    const model = await host.waitForView("main");   // 等插件发来 view.update
    assert.equal(model.items[0].title, "Read");
    host.viewAction("main", "check", { itemId: "1", checked: true });
    await host.waitFor((state) => state.storage.get("items")?.[0].done);
  } finally {
    await host.stop();
  }
});
```

常用选项和方法（完整类型见 `fly-island-plugin/test` 的 `index.d.mts`）：

| 用途 | 写法 |
|---|---|
| 只授予部分权限 / 模拟用户拒绝敏感权限 | `startMockHost(dir, { permissions: [...], deny: ["clipboard:read"] })` |
| 初始数据 | `todos`、`note`、`storage`、`secrets`、`clipboard`、`messages`、`media`、`shelf`、`settings` |
| 模拟用户操作 | `command(id)`、`viewVisible(viewId)`、`viewAction(viewId, actionId, { itemId, checked })`、`viewSubmit`、`viewSearch`、`notificationAction(id)`、`changeSettings(values)` |
| 发事件 | `publish("todos.changed", { date })`（只发给已订阅的插件，和岛屿一样） |
| 检查结果 | `requests`、`logs`、`views`、`statuses`、`notifications`、`storage`、`subscriptions`、`keepAlive` |
| 等待 | `waitFor(state => …)`、`waitForRequest(method)`、`waitForView(viewId, model => …)`、`waitForLog(text)` |

模拟宿主和岛屿一样检查权限、第 1 版插件不能用第 2 版方法、模型不超过 256 KB、折叠条文字不超过 24 个字、每分钟最多 6 条提示等规则。

## 5. 打包和发布

```sh
npx fly-island-plugin validate   # 检查清单和文件夹
npx fly-island-plugin pack       # 写出 .package/<id>-<version>.zip
```

`validate` 检查：清单符合 [`manifest.schema.json`](../../plugins/schema/manifest.schema.json)；入口文件存在、在插件文件夹内、没有被 `.focusdignore` 排除；激活事件、菜单指向的命令和页面存在；没有 `experimentalApis`；包不超过 20 MB。它还会扫描代码里出现的方法名和事件名，提示“申请了但似乎没用到”和“用到了但没申请”的权限。

`pack` 生成的 zip 和插件市场的完全一样：文件按名称排序、时间戳固定、文本文件统一为 LF，所以同样的文件每次得到同样的哈希。

发布：提高 `focusd-plugin.json` 的 `version`，提交后推送同名标签（例如 `0.2.0`），脚手架生成的 GitHub Actions 工作流会检查、测试、打包，并把 zip 附到 GitHub Release 上。插件市场接收外部作者之前（P11），可以把 Release 链接发到 [issues](https://github.com/TixXin/fly-island/issues)；用户也可以把 zip 解压到插件目录下名为插件 id 的文件夹里手动安装。`npx fly-island-plugin publish` 会打包并打印这些步骤。

## 6. 其他写法

- **PowerShell**：脚手架复制的 `lib/focusd.ps1` 是 PowerShell 模块 `FlyIsland.Plugin` 的单文件版本，`. "$PSScriptRoot\lib\focusd.ps1"` 引入后可用 `Invoke-FocusdLoop`（按通知名分派处理函数）、`Register-FocusdEvent`、`Show-FocusdNotification`、`Update-FocusdView`、`Update-FocusdStatus`、`Get-/Set-/Remove-FocusdStorage`、`Get-/Set-/Remove-FocusdSecret`、`Set-FocusdKeepAlive` 等函数。脚本文件要保持 ASCII，中文用 `ConvertFrom-FocusdEscape` 加 `\u` 转义写。
- **Node.js，不用脚手架**：复制 [`plugins/sdk/node/focusd.mjs`](../../plugins/sdk/node/focusd.mjs)（以及同目录的 `.d.mts` 类型）到插件里。
- **其他语言**：只要在 stdin / stdout 上按 [API 参考](api.md) 收发 JSON-RPC 即可，岛屿按扩展名启动 `.exe`、`.ps1`、`.js` / `.mjs` / `.cjs`。

## 7. 实验 API

还在设计中的 API 先作为实验 API 提供。插件在清单里写 `"experimentalApis": ["<名称>"]` 申请；只有以开发模式加载的插件能用，岛屿拒绝加载装在插件目录里的这类插件，`validate` 和插件市场也拒收。`initialize.experimentalApis` 告诉插件岛屿实际提供了哪些。**目前岛屿还没有实验 API**，这个通道是为以后的新 API 准备的。
