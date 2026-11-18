# 提交与审核 / Contribution and review

[总览 / Overview](README.md) · [规范 / Specification](specification.md) · [API](api.md) · [设计 / Design](design.md) · [PR 模板 / PR template](../../.github/PULL_REQUEST_TEMPLATE/plugin.md)

贡献流程：**基于 API 开发 → 嵌入真实小岛测试与录屏 → 提 PR → flyl1u 审核 → 合并 → 维护者统一构建发布**。开放开发规范不等于正式版已开放插件安装。新扩展点、特殊权限、额外运行时资源或大依赖先开 issue 讨论，避免写完后才发现无法融入宿主。

Flow: **build on the API → test and record inside the real island → submit a PR → flyl1u reviews → merge → maintainer builds/publishes**. Opening the guide does not enable plugin installation in production. Discuss new extension points, unusual permissions, runtime assets or large dependencies in an issue first.

## PR 必填材料 / Required PR evidence

使用 [plugin.md](../../.github/PULL_REQUEST_TEMPLATE/plugin.md)（GitHub 新建 PR 时可指定 `template=plugin.md`）；以下均须填写，「无」也应明确说明原因，不以截图替代录屏。

Use plugin.md (select it with `template=plugin.md` when creating the GitHub PR). Complete all fields; state and explain “none” where applicable. Screenshots do not replace the recording.

| 必填项 / Required item | 内容 / Contents |
| --- | --- |
| **录屏演示链接 / Demo recording URL** | 可供维护者打开的链接；必须是插件**实际嵌入小岛后运行**，包含启用、真实功能、点击动作（如有）、停用。不能只是独立程序、终端输出、设计稿或 API 响应。/ Accessible recording showing the plugin **running inside the actual island**, including enable, real functionality, actions if present and disable; no standalone app/terminal/mockup/API-only demo. |
| **作者 / Author** | 署名与 GitHub 用户名，多作者逐一列出 / Credit name and GitHub handle; list all authors |
| **联系方式 / Contact** | 愿意公开的邮箱或其他可联系渠道；不要填密码/密钥/私人凭据 / Public contact email or another reachable channel; no passwords, keys or private credentials |
| **GitHub 链接 / GitHub URL** | 作者主页、插件源码仓库/路径，注明原作或 fork 来源与许可证 / Author profile and plugin source repository/path; identify upstream/fork and license |
| 功能说明 / Functionality | 解决什么问题、三个扩展点中用了哪些、明确不能做什么、支持客户端/版本 / Problem solved, used extension points, limitations, supported clients/versions |
| 权限与数据 / Permissions and data | 每个 manifest 权限的理由、读写路径、数据流、凭据来源与保存/删除方式 / Justification per permission, paths, data flow, credential sourcing/storage/deletion |
| 联网域名 / Network domains | 全部 API/登录/重定向域名、用途、发送内容、接口出处、超时/刷新/退避 / All API/auth/redirect domains, purposes, sent data, endpoint provenance, timeout/refresh/backoff |
| 自测步骤与结果 / Self-tests and results | 可复现准备、命令与结果、真实账号验收、失败路径、资源观测、未验证范围 / Reproducible setup, commands/results, real-account checks, failure paths, resource observations and unverified scope |

录屏建议 1–3 分钟；长度是建议，真实嵌入演示是必填要求。显示岛与设置入口，避免只录裁切后无法确认宿主的局部。用测试数据/账号，隐藏姓名、私人对话、token、Cookie、Authorization、机器路径中的个人信息；不要为了展示私密消息而泄露其他人的信息。维护者不应需要安装作者环境才能看懂演示。

A 1–3 minute recording is recommended; actual in-island footage is mandatory. Show enough of the island/settings to identify the host. Use test accounts/data and redact names, private conversations, tokens, cookies, Authorization and personal paths. Do not expose others' private information. Reviewers should understand the demo without installing the author's environment.

## 提交内容与验证 / Source and validation

提交 `plugins/<id>/` 源码、manifest、必要测试/脱敏 fixture、许可，及 `plugins/Cargo.toml`/`plugins/Cargo.lock` 的必要变更。主程序不依赖插件 crate，不为插件把客户端/数据库依赖引入宿主。不要提交 target、exe、ZIP、账号数据库、真实凭据、运行日志或打开的发布开关；不要改应用版本。

Commit plugin source, manifest, tests/sanitized fixtures and licenses, plus necessary plugin workspace/lock changes. Do not add plugin client/database dependencies to the host. Exclude target, executables, ZIPs, account databases, real credentials, runtime logs and enabled release flags. Do not change app versions.

先按[快速开始](quickstart.md)构建示例与自己的插件，记录自己 crate 的 build/test/clippy 结果。仓库要求按改动运行 `pnpm check`、`pnpm build`、`pnpm test:regression`；Rust 变更还需 `cargo test --manifest-path src-tauri/Cargo.toml` 与 `pnpm tauri build --no-bundle`，所有 Rust 命令使用同一 CARGO_TARGET_DIR。仅文档改动不需要构建。环境阻塞必须说明，不能把未运行写成通过。

Build the example and your crate as described in the quickstart and record build/test/clippy results. Follow repository scope rules for pnpm check/build/test:regression; Rust changes also require host cargo test and tauri build --no-bundle, sharing CARGO_TARGET_DIR. Documentation-only changes need no build. Report environment blockers accurately, never mark unrun checks passed.

至少自测：未登录、有效登录、过期/撤销凭据、离线/超时/限流、坏数据/缺字段、大历史、重启、设置保存后重新初始化、连续启停、stdin EOF/shutdown、子进程回收、卸载清理；并完成[设计检查](design.md)。没有对应能力可写不适用并说明。

At minimum test unsigned-in, signed-in, expired/revoked credentials, offline/timeout/rate limits, malformed/missing data, large history, restart, settings reinitialization, repeated enable/disable, EOF/shutdown, child cleanup and uninstall. Complete the design checks too; explain inapplicable cases.

## flyl1u 的审核标准 / flyl1u's review criteria

1. **安全隐私与信任。** 实现与权限/域名/数据流一致，最小读取、第三方文件只读，秘密只在本机必要范围使用；无注入、浏览器接管、遥测外传或自更新。凭据可清理，依赖来源与许可证可审核。/ **Security, privacy and trust:** implementation matches declared permissions/domains/data flow; minimal access, read-only third-party files, scoped local secrets, cleanup, auditable dependencies/licenses; no injection, browser takeover, exfiltration or self-update.
2. **能融入小岛。** 由宿主组件显示，文案简短准确、中英完整、动态语言策略清楚；无新 UI 体系、虚构状态、周期刷提醒或抢焦点，尊重宿主免打扰。/ **Island integration:** host-rendered UI, concise bilingual copy and explicit runtime language strategy; no separate UI, fabricated states, alert spam or focus stealing; respect DND.
3. **契约与兼容。** manifest/RPC 正确、快照有界、id/时间稳定、版本一致、设置升级兼容；不修改既有主程序命令、事件、存储键或协议。/ **Contract/compatibility:** valid manifest/RPC, bounded snapshots, stable IDs/times, aligned versions and compatible settings upgrades without breaking host contracts.
4. **质量与资源。** 解析可离线测试，CPU/内存/扫描/日志有界，联网超时退避、主循环响应及时、停止与退出可靠，无孤儿浏览器；所需检查通过。/ **Quality/resources:** offline parser tests, bounded CPU/memory/scans/logs, request timeouts/backoff, responsive RPC, reliable shutdown and no orphan browsers; required checks pass.
5. **证据完整可复现。** PR 必填项、实际嵌入录屏、真实账号验证和失败情况清楚；不将模拟数据或截图说成实测。/ **Reproducible evidence:** all required PR fields, actual in-island recording, clear real-account checks and failure cases; do not present mocks/screenshots as verified integration.

缺必填材料会要求补齐；能力超出 v1、UI 难以融合或数据不可靠会要求缩小范围/重做。越权采集、秘密泄露、恶意/混淆代码、不可审查二进制、未授权品牌/依赖、持续资源消耗或绕过用户意愿可能被拒。提供材料不保证合并；维护者可要求修订或等宿主 API 完善后再评审。

Missing evidence requires completion. Scope beyond v1, poor UI integration or unreliable data may require reduction/rework. Excessive access, leaked secrets, malicious/obfuscated code, unreviewable binaries, unlicensed assets/dependencies, sustained resource misuse or bypassing user intent can be rejected. Submission does not guarantee merge; the maintainer may request revisions or defer until host APIs support the feature.

## 合并后的发布 / Publishing after merge

由 **flyl1u** 确认合并与发布时机，统一运行构建、生成包/哈希/索引并上传 GitHub Release；插件作者不自行修改生产索引或替小岛发布。合并不等于立即出现在当前正式版，插件发布开关仍由主发布流程决定。后续修复继续提 PR，说明兼容性、接口变化和凭据迁移影响。

**flyl1u** decides merge/release timing and centrally builds packages/hashes/index for GitHub Release. Authors do not modify the production index or publish on the island's behalf. Merge does not mean immediate production availability; release flags remain controlled by the main release process. Submit follow-up fixes as PRs with compatibility, endpoint-change and credential-migration impact.
