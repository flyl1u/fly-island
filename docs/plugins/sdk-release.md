# 发布插件 SDK

npm 包 `fly-island-plugin`（SDK、命令行工具、模拟宿主）和 `create-fly-island-plugin`（脚手架）由 GitHub Actions 工作流 [`publish-sdk.yml`](../../.github/workflows/publish-sdk.yml) 发布：推送 `sdk-v<版本>` 标签就发。它用 npm 的 **Trusted Publishing**（OIDC），仓库里和电脑上都不保存 npm 令牌，也不需要绕过两步验证。

两个包的版本号始终相同：脚手架建的插件依赖 `fly-island-plugin ^<脚手架自己的版本>`。

## 一次性设置（维护者在 npmjs.com 上做）

对两个包各做一次：

1. 登录 [npmjs.com](https://www.npmjs.com)，打开包页面 → **Settings**。
2. **Trusted Publisher** 一栏选 **GitHub Actions**，填：
   - Organization or user：`TixXin`
   - Repository：`fly-island`
   - Workflow filename：`publish-sdk.yml`
   - Environment name：`npm`
3. 保存。确认工作流能发布以后，同一页的 **Publishing access** 可以改成 "Require two-factor authentication and disallow tokens"，以后只有这个工作流能发布新版本。

工作流跑在 GitHub 的 `npm` 环境里，第一次运行时会自动创建。想在每次发布前人工批准，就到仓库 Settings → Environments → `npm` 加上 Required reviewers。

## 发布一个版本

1. 把 `packages/fly-island-plugin/package.json` 和 `packages/create-fly-island-plugin/package.json` 改成同一个新版本号，运行 `pnpm sdk:build`，在 [更新日志](changelog.md) 写上这次的变化，提交并合入 `main`。
2. 给合入后的提交打标签并推送：

   ```sh
   git tag sdk-v0.2.1 origin/main
   git push origin sdk-v0.2.1
   ```

3. 工作流会先核对：标签里的版本号和两个包一致、生成的 SDK 文件是最新的（`scripts/plugins/check-sdk-release.mjs`），然后跑两个包的测试，再发布。npm 上已经有的版本会跳过，所以重推同一个标签不会出错。
4. 发布后用 `npm view fly-island-plugin version` 确认；包页面会显示 provenance（来自哪个仓库的哪次运行）。

PowerShell 模块 `FlyIsland.Plugin` 不在这个工作流里，仍按 [packages/powershell/FlyIsland.Plugin](../../packages/powershell/FlyIsland.Plugin) 手动发布到 PowerShell Gallery。
