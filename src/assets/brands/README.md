# 消息来源品牌图标

以下图标于 2026-10-19 从对应产品的官方网站取得，保留原始图片，仅在界面中等比例显示，用于标识消息来源。

| 文件 | 官网 | 原始资源 |
| --- | --- | --- |
| `qq.png` | [QQ](https://im.qq.com/index) | [官网图标](https://static-res.qq.com/static-res/imqq/qq-logo.png) |
| `wechat.png` | [微信 Windows](https://pc.weixin.qq.com/) | [官网 Apple Touch 图标](https://res.wx.qq.com/a/wx_fed/assets/res/OTE0YTAw.png) |
| `qq-mail.png` | [QQ 邮箱](https://mail.qq.com/) | [官网图标](https://res.wx.qq.com/t/webmail/webmail/res/images/qqmail_favicon_96h.8d124a7.png) |

以下 AI Agent 图标于 2026-11-04 取得，用于在小岛上标识正在运行的 Agent：

| 文件 | 官网 | 原始资源 |
| --- | --- | --- |
| `claude-code.png` | [Claude](https://claude.ai/) | [官网 Apple Touch 图标](https://claude.ai/apple-touch-icon.png) |
| `codex.webp` | [ChatGPT / Codex](https://chatgpt.com/) | [官网 Apple Touch 图标](https://cdn.oaistatic.com/assets/apple-touch-icon-mz9nytnj.webp) |
| `deepseek.png` | [DeepSeek](https://www.deepseek.com/) | [官网 favicon](https://www.deepseek.com/favicon.ico)（225×225 PNG 转 180×180；浅色圆角底由界面 CSS 提供） |
| `workbuddy.png` | [WorkBuddy](https://www.workbuddy.cn/) | 2026-11-13 取自本机安装的 WorkBuddy 5.9.3 的应用磁贴图标（`Assets/Square44x44Logo.targetsize-256_altform-unplated.png`，256×256 缩小到 64×64） |

QQ、微信、QQ 邮箱的品牌标识及相关权利归腾讯及对应权利人所有；Claude 标识归 Anthropic 所有，OpenAI 标识归 OpenAI 所有，DeepSeek 标识归杭州深度求索所有，WorkBuddy 标识归腾讯所有。图标随应用打包，不在运行时请求远程图片。

以下插件市场图标于 2026-11-18 取得，统一做成方形磁贴（SVG），用于插件卡片、消息标签与 Agent 会话：

| 文件 | 来源 |
| --- | --- |
| `dingtalk.svg` | 钉钉开放平台官网矢量标记（白色标记，界面底色为钉钉蓝 `#0089FF`），经 [xiaotang-daozai](https://github.com/Renly1994/xiaotang-daozai)（MIT）`assets/calendar/dingtalk.svg` 取得 |
| `feishu.svg` | 飞书官网 favicon 矢量图（`lf-package-cn.feishucdn.com/.../favicon-logo.svg`），经 xiaotang-daozai 取得 |
| `wecom.svg` | 企业微信官网 LogoSingle 矢量图标，经 xiaotang-daozai 取得 |
| `kimi-code.svg` | [LobeHub Icons](https://github.com/lobehub/lobe-icons)（MIT）`kimi.svg`，白色标记配黑底 |
| `zcode.svg` | xiaotang-daozai `assets/ai-icons/zcode.svg`，改为方形深色底 |
| `cursor.svg` | LobeHub Icons `cursor.svg`，浅色标记配深色底 |
| `hermes.svg` | LobeHub Icons `nousresearch.svg`（Hermes Agent 由 Nous Research 出品），白色标记配黑底 |
| `telegram.svg` | 2026-11-26 取自 Telegram 官网 <https://telegram.org/img/t_logo.svg>（1694 字节，原样使用的蓝色圆形标志）；官网未附单独的图标许可证，标识归 Telegram 所有，仅用于标识对应产品 |

以下图标于 2026-11-26 取自各产品官网，用于插件卡片、分组标题与小岛上的 Agent 会话。官网都未附单独的图标许可证：

| 文件 | 来源与处理 |
| --- | --- |
| `codebuddy.svg` | [CodeBuddy 官网](https://www.codebuddy.cn/) 的站点图标 <https://download.codebuddy.cn/web/website/83dd563b5dca63a0481155ad7d02b2e59064ac39/assets/logo.svg>，原样使用 |
| `antigravity.svg` | [Antigravity 官网](https://antigravity.google/) 的矢量站点图标 <https://antigravity.google/favicon.svg>，原样使用（自带随系统深浅色切换的圆形底） |
| `minimax.png` | [MiniMax Code 官网](https://code.minimax.io/) 的 Apple Touch 图标 <https://code.minimax.io/assets/logo/apple-touch_v2.png?v=5>（1024×1024）缩小到 128×128；官网没有提供 SVG 图标 |

没有自己品牌的功能插件（时间与天气、日历标记、护眼提醒、设备电量与音频）用本项目手绘的 SVG 应用图标，在 `src/assets/plugins/`。插件图标规则见 [插件设置归类规范](../../../docs/design/settings.md#插件设置归类规范长期)。

钉钉、飞书、企业微信、Kimi、Z Code（智谱）、Cursor（Anysphere）、Nous Research、Telegram、CodeBuddy（腾讯）、Antigravity（Google）、MiniMax 的标识及相关权利归各自权利人所有，仅用于标识对应产品，不在运行时请求远程图片。
