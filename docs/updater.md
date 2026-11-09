# 应用内更新

小岛在「设置 → 关于」的「版本」组里检查新版本，发现更新后可以在应用内下载、安装并自动重启。

- **启动时下载**：岛屿启动后检查一次（主窗口的 `features/updater/updaterController.ts`）；有新版本时在后台下载好，待办列表顶部出现一条「更新到 vX.Y.Z」的待办，点它的按钮重启安装。删掉这条待办只是本次不再提醒。没有角标、没有定期检查、没有发布说明页。
- 「关于」页也可以手动检查；设置窗口独立时，它通过事件向主窗口要状态、发请求，下载只在主窗口里进行。

实现基于 Tauri 2 的 `tauri-plugin-updater`，所有更新包都用 minisign 签名，App 内置公钥校验，签名不符的包不会被安装。

## 更新通道

「更新」页的「更新通道」可选**稳定版**或**测试版（beta）**，保存在 `focusd-island-update-channel`。没选过时，beta 版本的程序默认测试版（是用户特意装的），其他版本默认稳定版，所以**不主动选测试版的用户永远收不到 beta**：

- **稳定版**读 `plugins.updater.endpoints`，即 `releases/latest/download/latest.json`。GitHub 的 latest 永远不会是 Pre-release，而 beta 版都发成 Pre-release。0.3.0 及更早的客户端没有通道设置，也只读这里。
- **测试版**读同一组镜像下的 `releases/download/beta-channel/latest.json`（由 `src-tauri/src/system/update_channel.rs` 从稳定端点换算），全部取不到时再退回稳定版端点，所以 beta 清单缺失或下载失败时，测试版用户仍能收到正式版。`beta-channel` 是一个固定的 Pre-release，只放这份清单，**不要删除**。
- 每次 `pnpm release`（正式版和 beta 版都算）发布后会刷新 `beta-channel` 上的清单，除非它已经指向更新的版本。所以测试版用户也会收到正式版；从测试版切回稳定版不会降级，要等稳定版追上当前版本才收到更新。

版本号带 `-`（如 `0.3.1-beta.1`）就算 beta：`release.mjs` 会把它发成 Pre-release、不设为 latest，判断与比较在 `scripts/release/channel.mjs`。

## 检查与安装流程

1. 设置页调用 `updater_check`（按通道选端点，`src-tauri/src/system/update_channel.rs`），依次尝试各端点：GitHub 直连、`ghfast.top`、`gh-proxy.com`，第一个能取到清单的胜出。
2. 清单里的 `version` 高于当前版本时，界面显示「发现新版本 vX.Y.Z」。
3. 点「下载并安装」后，安装包下载到本地临时目录，边下边用清单里的 `signature` 校验。
4. Windows 走 NSIS 安装模式 `passive`：显示安装进度条，装完由安装器拉起新版本，旧进程自动退出。

检查与下载的进度存在 `src/updaterController.ts` 的模块级状态里，设置页关掉或切到别的页面都不会中断，回来还能看到实时百分比。

相关代码：

- `src-tauri/tauri.conf.json`：`plugins.updater`（端点、安装模式）
- `src-tauri/capabilities/default.json`：`updater:default` 权限
- `src/updaterController.ts`：检查 / 下载 / 安装状态机，跨页面存活
- `src/UpdatePanel.tsx`：设置页里的检查更新面板，只负责渲染
- `scripts/release/prepare-release-config.mjs`：构建发布包时写入公钥与签名开关
- `scripts/release/make-latest-json.mjs`：根据构建产物生成 `latest.json`
- `scripts/release/release.mjs`：一键构建 + 签名 + 生成清单 + 上传 Release
- `scripts/release/release-signing.mjs`：优先使用显式环境变量，否则读取本机签名配置并通过 Windows DPAPI 解锁密码

## 网络、代理与镜像

GitHub 的 `github.com` 在国内经常连不上（`api.github.com` 往往还能通），所以检查更新做了两层兜底：

- **多端点**：`tauri.conf.json` 里配了 GitHub 直连和两个公共加速前缀，插件会按顺序尝试，任一成功即返回。面板失败时会显示「原因：…」方便判断是网络问题还是清单缺失。
- **系统代理**：前端启动时调用 `get_updater_proxy`（`src-tauri/src/system/updater.rs`），依次读 `HTTPS_PROXY` / `HTTP_PROXY` 环境变量和 Windows 系统代理（`Internet Settings\ProxyServer`），把结果传给 `check()` / `downloadAndInstall()`。开了 Clash 之类的系统代理时，更新自动走代理。

清单同时提供 `windows-x86_64-nsis` 与 `windows-x86_64-msi`，客户端按当前安装格式选择对应包；通用 `windows-x86_64` 入口保留为 NSIS 回退。

清单里的下载地址由 `scripts/release/make-latest-json.mjs --base-url` 决定：

```powershell
# 默认：直连 GitHub，海外用户最稳
node scripts/release/make-latest-json.mjs

# 国内分发：安装包也走加速前缀（清单里额外的那两个端点会返回同一份清单）
node scripts/release/make-latest-json.mjs --base-url "https://ghfast.top/https://github.com/<owner>/<repo>/releases/download/v0.2.12"
```

公共加速前缀是第三方服务，可用性不由本项目保证；有条件时换成自己的对象存储或 CDN，把地址填进 `--base-url` 即可，代码无需改动。
镜像或自建分发要改清单地址时，也可以用环境变量 `TAURI_UPDATER_ENDPOINTS`（逗号或换行分隔）在构建时整组替换端点。

## 签名密钥

更新包必须用私钥签名，App 用内置的公钥验证。**私钥不进仓库**，归仓库维护者所有。

`tauri.conf.json` 的 `plugins.updater.pubkey` 在仓库里是空串，发布构建时才由 `prepare-release-config.mjs` 写入公钥，所以本地 `pnpm tauri build`、`pnpm tauri dev` 出来的程序不能应用内更新。维护者也可以把公钥直接写进这个字段（公钥不是秘密），让本地构建也能检查和安装发布的更新。这个字段在插件配置里是必填项（没有默认值），删掉整个键会让应用在启动阶段报 `missing field \`pubkey\`` 并直接退出；改成空串不会影响启动，面板会显示「这里不能应用内更新」并禁用更新入口。别人 fork 本仓库做自己的发布线时，应把它换成自己的公钥或清空。

发布构建仍通过 `TAURI_UPDATER_PUBKEY` 传入公钥，`prepare-release-config.mjs` 会核对它和 `tauri.conf.json` 里的公钥一致，不一致就中止：用别的私钥签名的更新包，已装的 App 都会拒绝安装。

```powershell
# 只需在第一次启用应用内更新前生成一次
pnpm tauri signer generate -w $env:USERPROFILE\.tauri\fly-island.key
```

生成后同目录会有 `fly-island.key`（私钥）和 `fly-island.key.pub`（公钥）：

- 私钥：自己保管，放在密码管理器或发布机器的 `%USERPROFILE%\.tauri\` 下，不要提交、不要外传。
- 公钥：写进 `tauri.conf.json` 的 `plugins.updater.pubkey`，发布构建时也通过 `TAURI_UPDATER_PUBKEY` 传入并核对。

**私钥一旦丢失，已装上的旧版本就收不到更新**，只能让用户手动重装；换新密钥同样会让旧客户端拒绝新包。所以第一条发布线尽量只生成一次密钥，换机器时把私钥文件拷过去，不要重新生成。

普通 `pnpm tauri build` 带着公钥、能检查更新，但不产出签名包，任何机器都能直接编出来自测；只有发布构建（`pnpm release`）才要求私钥。

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
6. 发布后检查：

   - 两个通道的清单都是新版本：

     ```powershell
     curl.exe -sL https://github.com/flyl1u/fly-island/releases/latest/download/latest.json
     curl.exe -sL https://github.com/flyl1u/fly-island/releases/download/beta-channel/latest.json
     ```

     正式版两个都应是新版本；beta 版只有第二个是，第一个仍是上一个正式版。

版本号和发布说明的提交先合入 `main`，再在停在这个提交、工作区干净的 `main` 上运行 `pnpm release`。

CI 也可以复用同样的步骤：在仓库 Secrets 里存 `TAURI_UPDATER_PUBKEY`、`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，按上面的顺序跑 `prepare-release-config` → `tauri build --config` → `make-latest-json` → `gh release`。

## 撤回有问题的版本

已经装上的版本没法从远处卸载，能做的是让还没更新的人不再收到它，再尽快发一个修好的版本。客户端只会升级、不会降级，所以"退回上一版"对已更新的人无效，修复只能靠更高的版本号。

**测试版（beta）有问题**：把 beta 通道的清单换回上一个好的版本。

```powershell
$repo = "flyl1u/fly-island"
# 取上一个好版本 Release 里的 latest.json，覆盖到 beta-channel 上
gh release download v0.3.1-beta.2 --repo $repo --pattern latest.json --dir $env:TEMP\rollback --clobber
gh release upload beta-channel "$env:TEMP\rollback\latest.json" --repo $repo --clobber
```

有问题的那个 Release 可以留着（已经在下载的人不会中途 404），也可以在说明里标注"请勿安装"。之后发下一个 beta（比如 `-beta.4`）修复，`pnpm release` 会再刷新 beta 通道。

**正式版有问题**：把 GitHub 的 Latest 指回上一个好版本，稳定版用户检查更新就会拿到它的清单（版本不比自己新，所以不会再提示）。

```powershell
gh release edit v0.3.0 --repo flyl1u/fly-island --latest
gh release edit v0.3.2 --repo flyl1u/fly-island --prerelease --latest=false   # 有问题的那个
```

把有问题的版本改成 Pre-release，是为了它不会被 GitHub 重新当成 Latest。修好后照常 `pnpm release` 一个更高的版本，它会重新成为 Latest。

**不要做的事**：不要删除已发布 Release 里的安装包或换成别的文件（正在下载的人会校验失败，签名也对不上）；不要删除 `beta-channel` 这个 Release，它是 beta 通道唯一的清单位置。

## 常见问题

- **构建提示缺少私钥**：只有发布构建需要签名。普通 `pnpm tauri build` 不会产出签名包，也不会要求私钥；要出正式包请走 `pnpm release` 并配好环境变量。
- **面板显示「这里不能应用内更新」**：浏览器预览页，或 `tauri.conf.json` 的公钥被清空的构建。更新入口会显示不可用提示并禁用。
- **点了检查提示失败**：面板会显示「原因：…」。`Could not fetch a valid release JSON from the remote` 表示三个端点都没拿到清单——最常见是这次 Release 没上传 `latest.json`，其次是本机到 GitHub 和镜像都不通；带 `error sending request` 字样的是网络或代理问题。
- **一直显示已是最新版本**：确认 release 里的 `latest.json` 的 `version` 高于客户端版本；同一版本号重发不会触发更新。
- **提示签名校验失败**：`latest.json` 里的 `signature` 必须来自本次安装包的 `.sig` 文件，且签名私钥与构建时注入的公钥配对。
- **发布后短时间内检查不到**：`releases/latest/download/` 走 CDN，通常几分钟内生效。
- **只想手动下载安装包**：直接访问 [GitHub Releases](https://github.com/flyl1u/fly-island/releases/latest)；设置中的「查看最新版本」用于应用内检查、下载和安装。
