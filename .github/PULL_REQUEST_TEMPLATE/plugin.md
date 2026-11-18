---
name: 插件贡献 / Plugin contribution
about: 按插件规范贡献源码与嵌入演示 / Contribute source and an in-island demo
---

请先阅读[插件开发规范](../../docs/plugins/README.md)。以下项目均须填写；不适用请说明。不要提交凭据或私人数据。
Read the [plugin guide](../../docs/plugins/README.md). Complete every field; explain inapplicable items. Do not include secrets or private data.

## 录屏演示链接（必填）/ Demo recording URL (required)

<!-- 必须展示插件实际嵌入小岛后的运行效果：启用、功能/动作、停用。截图或独立程序演示不能替代。遮住私人消息与凭据。
Show the plugin actually running inside the island: enable, functionality/actions, disable. Screenshots or a standalone app demo are insufficient. Redact private messages and credentials. -->

## 作者（必填）/ Author (required)

<!-- 署名与 GitHub 用户名；多作者逐一列出 / Credit name and GitHub handle; list all authors -->

## 联系方式（必填）/ Contact (required)

<!-- 可公开的邮箱或其他联系渠道，不填密码/密钥 / Public email or another reachable channel, never passwords/keys -->

## GitHub 链接（必填）/ GitHub URL (required)

<!-- 作者主页与插件源码仓库/路径；注明上游、fork 与许可证 / Author profile and plugin source repository/path; identify upstream/fork and license -->

## 功能 / Functionality

<!-- 用途、使用的扩展点、支持客户端/版本、限制与动态文案语言策略 / Purpose, extension points, supported clients/versions, limitations and runtime language strategy -->

## 权限 / Permissions

<!-- 逐项解释 manifest 权限、读写路径、数据流、凭据来源/保存/清理 / Explain each permission, read/write paths, data flow and credential source/storage/cleanup -->

## 联网域名 / Network domains

<!-- 无联网也明确写无；列全 API/登录/重定向域名、接口来源、所发数据、超时/刷新/退避 / State none if offline; list API/auth/redirect domains, endpoint sources, sent data, timeout/refresh/backoff -->

## 截图（可选，不能替代录屏）/ Screenshots (optional, not a recording substitute)

## 自测步骤 / Self-test steps

<!-- 可复现准备、build/test/clippy 与宿主检查结果；未登录/过期凭据/离线/坏数据/大历史/启停/退出/卸载；CPU/内存/轮询实测，注明未验证范围
Reproducible setup, build/test/clippy and host-check results; unsigned-in/expired/offline/malformed/large-history/enable-disable/exit/uninstall cases; measured CPU/memory/polling and unverified scope -->

## 规范自检 / Specification checklist

- [ ] 已附真实嵌入小岛录屏、作者、联系方式与 GitHub 链接。/ Included an actual in-island recording, author, contact and GitHub links.
- [ ] 已阅读 manifest/API/设计/审核规范；只用宿主组件，无 HTML/CSS/Webview 或独立通知 UI。/ Followed manifest/API/design/review rules; host components only, no HTML/CSS/Webview or separate notification UI.
- [ ] 文案中英完整，动态文案语言策略明确，窄窗口和明暗主题正常。/ Complete bilingual metadata, explicit runtime language strategy, narrow-layout and light/dark checks.
- [ ] 权限与全部联网域名准确；第三方文件只读；无未声明采集、遥测、自更新或注入。/ Accurate permissions/domains; read-only third-party files; no undeclared collection, telemetry, self-updates or injection.
- [ ] secret 使用 Windows 凭据管理器及本插件已声明 key，可卸载清理；日志/快照/fixture/录屏无秘密。/ Secrets use Windows Credential Manager and this plugin's declared keys, removable on uninstall; no secrets in logs/snapshots/fixtures/video.
- [ ] 快照完整且有界，id/事件时间稳定，不把失败当 0，不制造重复提醒，尊重免打扰。/ Complete bounded snapshots, stable IDs/event times, no false zero values or alert spam; respects DND.
- [ ] 已测资源、超时退避、stdin EOF/shutdown、取消任务与子进程退出，无遗留浏览器。/ Tested resources, timeouts/backoff, EOF/shutdown, cancellation and child cleanup; no orphan browsers.
- [ ] 必要检查已运行并如实列结果；无 exe/ZIP/target/账号数据；未改应用版本或打开发布开关。/ Ran required checks and reported results; no binaries/ZIP/target/account data, app-version changes or enabled release flags.

由 flyl1u 审核合并后统一发布；提交不保证合并或立即上线。
flyl1u reviews, merges and publishes approved plugins; submission does not guarantee merge or immediate availability.
