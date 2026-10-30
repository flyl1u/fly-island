# 应用内更新

小岛在「设置 → 关于小岛 → 检查更新」里检查新版本，发现更新后可以在应用内下载、安装并自动重启。
实现基于 Tauri 2 的 `tauri-plugin-updater`，所有更新包都用 minisign 签名，App 内置公钥校验，签名不符的包不会被安装。

## 检查与安装流程

1. 前端调用 `check()`，依次尝试 `plugins.updater.endpoints` 里的地址：GitHub 直连、`ghfast.top`、`gh-proxy.com`，第一个能取到清单的胜出。
2. 清单里的 `version` 高于当前版本时，界面显示「发现新版本 vX.Y.Z」。
3. 点「下载并安装」后，安装包下载到本地临时目录，边下边用清单里的 `signature` 校验。
4. Windows 走 NSIS 安装模式 `passive`：显示安装进度条，装完由安装器拉起新版本，旧进程自动退出。

检查与下载的进度存在 `src/updaterController.ts` 的模块级状态里，设置页关掉或切到别的页面都不会中断，回来还能看到实时百分比。

相关代码：

- `src-tauri/tauri.conf.json`：`plugins.updater`（端点、安装模式）
- `src-tauri/capabilities/default.json`：`updater:default` 权限
- `src/updaterController.ts`：检查 / 下载 / 安装状态机，跨页面存活
- `src/UpdatePanel.tsx`：设置页里的检查更新面板，只负责渲染
- `scripts/prepare-release-config.mjs`：构建发布包时写入公钥与签名开关
- `scripts/make-latest-json.mjs`：根据构建产物生成 `latest.json`
- `scripts/release.mjs`：一键构建 + 签名 + 生成清单 + 上传 Release
- `scripts/release-signing.mjs`：优先使用显式环境变量，否则读取本机签名配置并通过 Windows DPAPI 解锁密码

## 网络、代理与镜像

GitHub 的 `github.com` 在国内经常连不上（`api.github.com` 往往还能通），所以检查更新做了两层兜底：

- **多端点**：`tauri.conf.json` 里配了 GitHub 直连和两个公共加速前缀，插件会按顺序尝试，任一成功即返回。面板失败时会显示「原因：…」方便判断是网络问题还是清单缺失。
- **系统代理**：前端启动时调用 `get_updater_proxy`（`src-tauri/src/lib.rs`），依次读 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量和 Windows 系统代理（`Internet Settings\ProxyServer`），把结果传给 `check()` / `downloadAndInstall()`。开了 Clash 之类的系统代理时，更新自动走代理。

清单同时提供 `windows-x86_64-nsis` 与 `windows-x86_64-msi`，客户端按当前安装格式选择对应包；通用 `windows-x86_64` 入口保留为 NSIS 回退。

清单里的下载地址由 `scripts/make-latest-json.mjs --base-url` 决定：

```powershell
# 默认：直连 GitHub，海外用户最稳
node scripts/make-latest-json.mjs

# 国内分发：安装包也走加速前缀（清单里额外的那两个端点会返回同一份清单）
node scripts/make-latest-json.mjs --base-url "https://ghfast.top/https://github.com/<owner>/<repo>/releases/download/v0.2.12"
```

公共加速前缀是第三方服务，可用性不由本项目保证；有条件时换成自己的对象存储或 CDN，把地址填进 `--base-url` 即可，代码无需改动。
镜像或自建分发要改清单地址时，也可以用环境变量 `TAURI_UPDATER_ENDPOINTS`（逗号或换行分隔）在构建时整组替换端点。

## 签名密钥

更新包必须用私钥签名，App 用构建时注入的公钥验证。**仓库里不保存任何公钥或私钥**，密钥归仓库维护者所有。

`tauri.conf.json` 里的 `plugins.updater.pubkey` 保留为空字符串占位。这个字段在插件配置里是必填项（没有默认值），删掉整个键会让应用在启动阶段报 `missing field \`pubkey\`` 并直接退出；空串不会影响启动，面板会识别为「没带更新公钥」并隐藏检查按钮。发布构建用上面的 `TAURI_UPDATER_PUBKEY` 覆盖它。

```powershell
# 只需在第一次启用应用内更新前生成一次
pnpm tauri signer generate -w $env:USERPROFILE\.tauri\fly-island.key
```

生成后同目录会有 `fly-island.key`（私钥）和 `fly-island.key.pub`（公钥）：

- 私钥：自己保管，放在密码管理器或发布机器的 `%USERPROFILE%\.tauri\` 下，不要提交、不要外传。
- 公钥：发布构建时通过 `TAURI_UPDATER_PUBKEY` 传进去，被写进 App 二进制（`plugins.updater.pubkey`）。

**私钥一旦丢失，已装上的旧版本就收不到更新**，只能让用户手动重装；换新密钥同样会让旧客户端拒绝新包。所以第一条发布线尽量只生成一次密钥，换机器时把私钥文件拷过去，不要重新生成。

普通 `pnpm tauri build` 不带公钥、也不产出签名包，任何机器都能直接编出来自测；只有发布构建（`pnpm release`）才要求密钥。

### Windows 本机自动读取

已配置的发布机器运行 `pnpm release` 即可，无需每次复制密钥内容或设置环境变量。本机配置路径为 `%USERPROFILE%\.tauri\fly-island\release.json`，格式如下（路径应为实际绝对路径）：

```json
{
  "schemaVersion": 1,
  "privateKeyPath": "C:\\Users\\<user>\\.tauri\\fly-island\\updater.key",
  "publicKeyPath": "C:\\Users\\<user>\\.tauri\\fly-island\\updater.key.pub",
  "passwordFile": "C:\\Users\\<user>\\.tauri\\fly-island\\password.dpapi"
}
```

私钥本身带密码；`password.dpapi` 是通过 `ConvertFrom-SecureString` 生成的 Windows 当前用户加密密码。密钥目录应只授予维护者账号访问。文件均位于仓库外，不能提交到 Git。可用 `FOCUSD_SIGNING_CONFIG` 指定其他本机配置路径。

更换 Windows 用户或重装系统后，原 DPAPI 密码文件无法解密。恢复时使用受保护备份中的私钥及恢复密码重新创建 DPAPI 密码文件；同一条发布线继续使用原密钥，不重新生成。恢复密码与私钥都属于敏感文件。

显式提供公钥或私钥时，脚本不会混入本机的另一套密钥，CI 仍需完整提供下面三项环境变量。

## 发布一个可自动更新的版本

1. 三处版本号一起改，保持一致：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
2. 写发布说明 `docs/releases/vX.Y.Z.md`，它会成为 `latest.json` 里的 `notes`，同时作为 Release 正文。
3. Windows 发布机器配置一次上述本机凭据即可；其他机器或 CI 设置发布环境变量：

   ```powershell
   $env:TAURI_UPDATER_PUBKEY = Get-Content -Raw $env:USERPROFILE\.tauri\fly-island.key.pub
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw $env:USERPROFILE\.tauri\fly-island.key
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
   ```

   私钥设了密码时把真实密码填进 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`；没设密码也必须显式给空字符串，否则构建会停在 "Decrypting updater signing key" 等交互输入。

4. 一键发布：

   ```powershell
   pnpm release
   ```

   脚本会依次：

   - 校验三处版本号一致、`docs/releases/vX.Y.Z.md` 存在、工作区没有未提交改动、`gh` 已登录；
   - 生成 `src-tauri/tauri.release.conf.json`（公钥 + `createUpdaterArtifacts`，该文件已被 git 忽略）；
   - `tauri build --config` 出带签名的 NSIS、MSI 安装包与各自 `.sig`；
   - 生成 `latest.json`；
   - 生成两种安装包的 `SHA256SUMS.txt`；
   - 创建指向当前提交的 Release 草稿，上传安装包、`.sig`、`latest.json` 与校验文件；
   - 比较 GitHub 上每个文件的 SHA-256 与本地产物，一致后才公开并设为最新版本；已存在的版本会被拒绝，避免覆盖用户正在下载的更新包。

   只出包不上传用 `pnpm release --no-upload`；安装包走镜像分发用 `pnpm release --base-url "https://..."`。

5. 发布后已装「带更新功能」版本的用户点「检查更新」就能收到。更早的版本（v0.2.11 及以前）没有这段逻辑，需要手动下载安装一次。

CI 也可以复用同样的步骤：在仓库 Secrets 里存 `TAURI_UPDATER_PUBKEY`、`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，按上面的顺序跑 `prepare-release-config` → `tauri build --config` → `make-latest-json` → `gh release`。

## 常见问题

- **构建提示缺少私钥**：只有发布构建需要签名。普通 `pnpm tauri build` 不会产出签名包，也不会要求私钥；要出正式包请走 `pnpm release` 并配好环境变量。
- **面板显示「这个构建没带更新公钥」**：这是开发构建或没走发布流程的包。检查更新按钮会隐藏，避免点了必然报错。
- **点了检查提示失败**：面板会显示「原因：…」。`Could not fetch a valid release JSON from the remote` 表示三个端点都没拿到清单——最常见是这次 Release 没上传 `latest.json`，其次是本机到 GitHub 和镜像都不通；带 `error sending request` 字样的是网络或代理问题。
- **一直显示已是最新版本**：确认 release 里的 `latest.json` 的 `version` 高于客户端版本；同一版本号重发不会触发更新。
- **提示签名校验失败**：`latest.json` 里的 `signature` 必须来自本次安装包的 `.sig` 文件，且签名私钥与构建时注入的公钥配对。
- **发布后短时间内检查不到**：`releases/latest/download/` 走 CDN，通常几分钟内生效。
- **只想手动下载安装包**：设置页下方的「查看最新版本」仍然是打开 Release 页面的链接。
