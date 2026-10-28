# PR #22 / #23 本地联合评估

评估时间：2026-10-28（Asia/Shanghai）。本地分支：`codex/try-pr-22-23`。

## 评估版本与冲突

- 主线：`9443a1f`（v0.2.11）。
- [PR #22：邮件图片](https://github.com/flyl1u/fly-island/pull/22)：`c97efef69aab784bae168542a2279efb26e95964`。
- [PR #23：应用内更新](https://github.com/flyl1u/fly-island/pull/23)：`087e2d62707702f3ae3bbeede3d12a7e175c01c0`。
- 两个 PR 均实际合入本地分支，无文本冲突；三个翻译文件自动合并成功。
- PR #22 基于较早主线，合并后保留了主线 v0.2.11 的版本和图标。
- GitHub 检查接口对两个指定提交都返回空的 checks/statuses，没有可确认通过的远端 CI 记录。
- 旧本地体验分支保留，未向 GitHub 推送、评论或合并 PR。

## 问题与合并价值

### PR #23：P1，普通构建在启动时无法解析 updater 配置

`tauri-plugin-updater` 2.12.0 的配置反序列化要求 `pubkey: String`。PR 为了让普通构建不依赖发布密钥，删除了整个字段，但仍注册 updater 插件。前端的 `updater_configured` 检查晚于插件初始化，无法保护启动。

新增回归测试解析仓库中的真实配置，修复前复现 `missing field pubkey`。本地修复为 `"pubkey": ""`：满足插件配置格式，普通体验包仍禁用更新；正式发布覆盖配置继续注入维护者公钥。修复后回归测试、完整打包和 release 程序启动均通过。

应用内更新有合并价值，原版应先修复此启动问题。模块级更新状态已通过模拟测试确认可跨面板卸载保留，下载失败后也可重新检查。

### PR #22：P2，三个新增 Rust 测试失败

原版联合分支执行 Rust 测试：43 通过、3 失败、5 跳过。失败项为：

- `images_split_across_fetch_responses_without_repeated_uid_are_all_inlined`
- `an_image_missing_from_the_batches_is_fetched_again_on_its_own`
- `inline_image_failures_keep_the_text_body`

原因是 BODYSTRUCTURE 测试数据把图片 Content-ID 放在 description 字段，实际 id 为 NIL，图片根本没有进入获取流程。本地仅修正测试数据的字段顺序，三个测试均通过，未为通过测试修改图片处理逻辑。

HTML 优先、内嵌图片、默认拦截远程图片和布局表格处理有明确使用价值。浏览器集成测试覆盖了图片开关、清理危险 HTML、内嵌 data URI、布局表格和阅读状态，建议修正测试后合并。

## 本地验证结果

| 验证 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过 |
| `pnpm build` | 通过 |
| `node --test tests/*.test.mjs` | 18 通过；含新增的 5 项 updater 控制器模拟测试 |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib` | 47 通过、0 失败、5 跳过；含新增配置回归测试 |
| `http://localhost:1420/tests/mail-reader.html?run=1` | `data-test-result="passed"`，33 条 PASS |
| `pnpm tauri build --no-bundle` | 通过 |
| `pnpm tauri build` | 通过，生成 NSIS 和 MSI；普通打包未要求私钥 |
| `git diff --check` | 通过 |
| release 程序启动 | 进程持续运行，路径为本仓库 release EXE；启动 stderr 为空 |
| 桌面快捷方式 | 已更新并重新读取验证目标、工作目录、图标及目标存在性 |

Rust 的 5 项跳过测试需要真实 QQ 系统通知、QQ 主窗口或微信会话。构建存在依赖 `imap-proto` 的未来兼容性警告，不影响本次构建。

## 本次未验证的范围

- 真实邮箱中的图片兼容性仍需用户体验；浏览器使用模拟邮箱数据，Rust 使用脚本化 IMAP 响应。
- 正式仓库的 `releases/latest/download/latest.json` 在检查时返回 HTTP 404。
- 本次不生成正式签名密钥，不发布 Release，也不执行真实版本升级。真实签名验证、安装和自动重启不能据本次测试宣称通过。
- 此体验包未注入发布公钥，设置中的更新面板会提示不可用。要体验完整更新链路，需要维护者配置稳定密钥并发布带签名安装包及 `latest.json` 的新版本。

## 体验产物

- `D:\FocuSD\src-tauri\target\release\focusd-island.exe`
- `D:\FocuSD\src-tauri\target\release\bundle\nsis\fly-island_0.2.11_x64-setup.exe`
- `D:\FocuSD\src-tauri\target\release\bundle\msi\fly-island_0.2.11_x64_en-US.msi`

当前用户桌面的 `fly-island.lnk` 指向上述 release EXE，工作目录为该 EXE 所在目录，图标来自同一文件。已启动此 EXE 供体验。
