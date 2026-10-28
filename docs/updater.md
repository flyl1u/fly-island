# 应用内更新

小岛在「设置 → 关于小岛 → 检查更新」里检查新版本，发现更新后可以在应用内下载、安装并自动重启。
实现基于 Tauri 2 的 `tauri-plugin-updater`，所有更新包都用 minisign 签名，App 内置公钥校验，签名不符的包不会被安装。

## 检查与安装流程

1. 前端调用 `check()`，读取 `https://github.com/flyl1u/fly-island/releases/latest/download/latest.json`。
2. 清单里的 `version` 高于当前版本时，界面显示「发现新版本 vX.Y.Z」。
3. 点「下载并安装」后，安装包下载到本地临时目录，边下边用清单里的 `signature` 校验。
4. Windows 走 NSIS 安装模式 `passive`：显示安装进度条，装完由安装器拉起新版本，旧进程自动退出。

相关代码：

- `src-tauri/tauri.conf.json`：`plugins.updater`（公钥、端点、安装模式）、`bundle.createUpdaterArtifacts`
- `src-tauri/capabilities/default.json`：`updater:default` 权限
- `src/UpdatePanel.tsx`：设置页里的检查更新面板
- `scripts/make-latest-json.mjs`：发布时生成 `latest.json`

## 签名密钥

更新包必须用私钥签名，App 用配置里的公钥验证。

- 私钥：`C:\Users\11451\.tauri\fly-island.key`（本机维护者目录，已被 .gitignore 之外的位置保管，不要提交、不要外传）
- 公钥：已写入 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`

请把私钥备份到密码管理器或发布 CI 的 Secret。**私钥一旦丢失，已安装的旧版本就只能手动下载安装包重装，无法再通过应用内更新升级。**

换机器时把私钥文件拷过去即可，不要重新生成密钥对：重新生成会换掉公钥，线上旧版本会因签名校验失败而无法更新到新包。

生成新密钥对（仅在确定要重新开始一条发布线时使用）：

```powershell
pnpm tauri signer generate -w C:\Users\<user>\.tauri\fly-island.key
```

## 发布一个可自动更新的版本

1. 三处版本号一起改：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`。
2. 写发布说明 `docs/releases/vX.Y.Z.md`，它会成为 `latest.json` 里的 `notes`。
3. 设置签名环境变量（私钥内容整体传入）：

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw C:\Users\<user>\.tauri\fly-island.key
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
   ```

   私钥设了密码时，把真实密码填进 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`；当前这把私钥没有密码，必须显式给空字符串，否则构建会停在 "Decrypting updater signing key" 等待交互输入。

4. 构建：

   ```powershell
   pnpm tauri build
   ```

   `bundle.createUpdaterArtifacts` 已开启，构建会额外产出 `*-setup.exe.sig`。**没设签名密钥时构建会直接失败**，这是预期行为，避免发出未签名、无法自更新的安装包。

5. 生成更新清单：

   ```powershell
   node scripts/make-latest-json.mjs
   ```

6. 在 GitHub 建 `vX.Y.Z` release，上传这三个文件：

   - `fly-island_X.Y.Z_x64-setup.exe`
   - `fly-island_X.Y.Z_x64-setup.exe.sig`
   - `latest.json`

   `latest.json` 里的下载地址指向 `releases/download/vX.Y.Z/...`，所以 tag 必须和版本号一致。

7. 之后所有装了「带更新功能」版本的用户，点「检查更新」就能收到。更早的版本（v0.2.11 及以前）没有这段逻辑，需要手动下载安装一次。

## 常见问题

- **一直显示已是最新版本**：确认 release 里的 `latest.json` 的 `version` 高于客户端版本；同一版本号重发不会触发更新。
- **提示签名校验失败**：`latest.json` 里的 `signature` 必须来自本次安装包的 `.sig` 文件，且签名私钥与 `tauri.conf.json` 里的公钥配对。
- **发布后短时间内检查不到**：`releases/latest/download/` 走 CDN，通常几分钟内生效。
- **只想手动下载安装包**：设置页下方的「查看最新版本」仍然是打开 Release 页面的链接。
