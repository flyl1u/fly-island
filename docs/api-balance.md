# API 余额查询插件

本功能编入 FocuSD Island（飞岛），入口为 **设置 → 插件 → API 余额**。需运行包含本次功能的构建；原版 3.2.1 的插件页没有这个导入器。

**折叠展示**：在插件页用「折叠时显示余额」单独控制折叠岛上的余额摘要（默认开启）。关闭后余额查询、展开页余额和已启用的低余额提醒仍然有效。展示先后在 **设置 → 外观 → 岛屿展示优先级** 调整，包含可排序的「时间与日期」；时间仍需开启「空闲时间与日期」，消息提醒与进行中的倒计时优先。旧配置会在原排序末尾自动补上时间项。

## 安装与文件格式

它是可启停的内置功能，不是可装入原版飞岛的 DLL、ZIP 或网易云 `.plugin` 文件。网易云的插件安装入口、Agent 音效包导入入口各有用途，不能接收余额配置。

在余额面板点击「导入配置」，支持：

| 文件 | 接收内容 |
| --- | --- |
| `*.flyisland-balance.json` | 飞岛余额专用格式，推荐；`format: "focusd-island-api-balance"`、`version: 1`、`accounts` 数组 |
| `*.json` | 同一原生格式；或兼容的 cc-switch 供应商 / usage-script JSON，见下节 |
| `*.js` | 一个返回 `request` 与 `extractor(response)` 的 JavaScript 对象表达式，作为自定义账号导入 |

单文件最大 1 MiB、单个脚本最大 64 KiB、总计最多 50 个账号。导入先预览，再点击确认；账号重新生成 ID，默认停用。不会在预览阶段执行脚本或联网查询。

示例文件：[全部预设](../examples/api-balance/all-presets.flyisland-balance.json)。它覆盖 6 类模板、8 类套餐和官方余额，所有密钥留空且账号停用。ZenMux 示例使用 `example.com` 占位地址，必须替换为你已有的完整额度查询地址。示例不是有效账号，不会自动产生余额。

原生最小示例（保存为 `my-account.flyisland-balance.json`）：

```json
{
  "format": "focusd-island-api-balance",
  "version": 1,
  "accounts": [
    {
      "account": {
        "name": "我的 NewAPI 站点",
        "template": "newapi",
        "baseUrl": "https://your-site.example",
        "userId": "42",
        "timeoutSeconds": 10,
        "intervalMinutes": 5,
        "quotaPerUnit": 500000
      },
      "secrets": {}
    }
  ]
}
```

导入后编辑账号，填写后台 Access Token，测试成功后保存并启用。原生文件可含 `secrets.apiKey`、`accessToken`、`secretAccessKey`、`code`，但建议在界面填写密钥，避免把明文文件传给他人。

## cc-switch JSON 兼容范围

接受单个供应商对象、供应商数组、`providers` 数组，以及按应用分组的 `providers` 对象。读取 `meta.usage_script` / `meta.usageScript`、`usageScript`，以及 `settingsConfig.env` 的 Claude / OpenAI 常见地址与密钥、Codex 的 `settingsConfig.auth.OPENAI_API_KEY` 和 TOML 字符串里的 `base_url`。

支持模板标识 `custom`、`general`、`newapi`（兼容 `new_api`）、`sub2api`、`token_plan`（兼容 `tokenPlan`）、`official`（兼容 `balance`）。套餐标识见下表。脚本需保存在 `code` 字符串里；含函数的 request/extractor 不能直接当 JSON，需保存为 `.js`。

这不是 cc-switch 数据库恢复功能，不接收 SQLite、SQL 全量备份、压缩包、OAuth 订阅账号或其他应用的完整插件包。没有识别到的供应商结构应先整理为上面的原生 JSON；不会执行或安装文件中夹带的指令。

## 支持的查询

| 模板 | 用途 / 凭据 |
| --- | --- |
| 自定义 | 完整 request/extractor 对象；HTTP 由 Rust 执行 |
| 通用模板 | `GET <Base URL>/user/balance`，读取 `balance`；站点协议不同时填写脚本 |
| NewAPI | `GET <origin>/api/user/self`；后台 Access Token + 用户 ID；quota 默认每 500000 对应 1 USD，可修改换算 |
| Sub2API | `GET <base>/v1/usage`，自动处理已有 `/v1`；API Key；区分余额 0、欠费和 `-1` 不限量 |
| Token Plan | 下列 8 类套餐 |
| 官方余额 | DeepSeek、StepFun、SiliconFlow 国内/国际、OpenRouter、Novita AI、智谱国内 / Z.ai；按响应区分货币 |

| 套餐 | 标识 | 配置要求 |
| --- | --- | --- |
| Kimi For Coding | `kimi` | Coding API Key |
| Zhipu GLM | `zhipu` | API Key；根据国内 / 国际 Base URL 选择站点；明确返回无 Coding Plan 时查询官方余额 |
| Zhipu GLM Team | `zhipu_team` | API Key、组织 ID、项目 ID；不会仅凭域名自动猜为团队版 |
| MiniMax | `minimax` | API Key；国内 / 国际站点 |
| ZenMux | `zenmux` | API Key 与**可返回额度 JSON 的完整 URL**；按原样 GET，不猜测统一路径 |
| 火山方舟 | `volcengine` | 账号 AccessKey ID + SecretAccessKey，默认 `cn-beijing`；V4 签名；推理 Key 不适用 |
| OpenCode Go | `opencode_go` | Go 套餐 API Key，支持旧 / 新 Go 推理入口；按量 Zen 不等同于 Go |
| Command Code | `command_code` | API Key；余额、月度和滚动窗口 |

火山查询先探测 Agent Plan，仅明确无套餐或返回未启用的额度窗口时尝试 Coding Plan。鉴权、网络、限流、非法响应不会作为「零余额」返回。部分供应商接口来自参考项目中的第一方未公开路由，供应商修改接口后可能需要适配。

## 自定义脚本

将以下内容保存为 `my-balance.js` 导入，之后填写 Base URL 与 API Key：

```js
({
  request: {
    url: "{{baseUrl}}/user/balance",
    method: "GET",
    headers: { Authorization: "Bearer {{apiKey}}" }
  },
  extractor: function (response) {
    return { remaining: response.balance, unit: "USD" };
  }
})
```

变量 `{{baseUrl}}`、`{{apiKey}}`、`{{accessToken}}`、`{{userId}}` 放在 JavaScript 字符串内。替换会转义引号、反斜杠与模板字符串字符；引用了但未填写的变量会报错。

extractor 可返回一个对象或对象数组；支持 `remaining`、`used`、`total`、`unit`、`planName`、`isValid`、`unlimited`。金额必须是有限数值；缺少金额不冒充 0。可选字段可省略或为 null。通用 / NewAPI / Sub2API 的脚本留空时使用内置协议，自定义模板则必须有脚本。

脚本以受限 QuickJS 执行：每阶段 500ms 执行时限、16 MiB 内存、256 KiB 栈，无文件系统、进程或 Node.js API。请求阶段与提取阶段独立运行，不能靠全局变量跨阶段传递状态。通用 / NewAPI / Sub2API 的脚本请求必须与配置地址同源；自定义模板可指定 HTTPS 地址。HTTP 只对本机回环允许，禁止 URL 用户名 / 密码与自动重定向，响应上限 2 MiB。导入的脚本仍应先阅读，确认它把密钥发往预期站点。

## 自动刷新、凭据与导出

先启用插件，再启用需要自动刷新的账号。默认超时 10 秒、间隔 5 分钟，间隔 0 为仅手动查询。关闭设置页后后台仍调度，同一账号不重叠请求；禁用后不再调度，已在途请求的过期结果会丢弃。失败时保留上次成功数值与更新时间并显示错误。

普通配置写入应用数据目录 `api-balance.json`，前端 `focusd-island-api-balance` 仅镜像普通元数据；密钥和脚本保存在 Windows 凭据管理器独立服务 `com.focusd.island.api-balance`。它们不会作为结果或普通配置返回。编辑时密钥输入留空表示保留，删除账号清理相应凭据。

「导出配置」默认不含密钥或脚本。可明确勾选包含脚本以便迁移自定义提取器；脚本可能包含手写密钥，分享前自行检查。导出的账号默认停用。批量导入先完成校验再保存，失败会尝试清理本次新增凭据，避免留下半批账号。

## 脚本预览、余额预警和岛屿展示

通用 / NewAPI / Sub2API 在未配置自定义脚本时显示内置协议的脚本预览，不再显示空框。预览不会写入凭据，也不会替换原生查询。点击「编辑为自定义脚本」后可修改；「恢复内置模板」会删除该账号的脚本覆盖。编辑已有自定义脚本时保留原文，切换模板后仍保留该覆盖；需要新模板的默认协议时点击恢复。NewAPI 的预览使用当前 quota 换算值，自定义副本中的常数需手动调整。

每个账号的「余额预警」默认关闭。开启后设置非负阈值（支持小数）及单位，例如 `5 USD`。保存，启用插件和账号后，在下次成功查询时生效。余额严格小于阈值才报警，等于阈值不报警；只有有效、有限、与预警单位相同的 `remaining` 参与判断。不会将币种相加，不将未知值、查询失败或只有百分比的套餐窗口视作零余额。

本次运行中持续低余额只触发一次；同单位余额恢复至阈值后，下一次跌破会再次触发。查询失败保留上次结果和警报状态，不重新报警。保存账号重新评估，重启后首次成功查询重新判断。主岛常驻窗口负责声音与 8 秒折叠提醒；全屏游戏免打扰时不弹出、不响铃。声音复用额度不足音效，遵循 Agent 提示音总开关；红色低余额状态仍可在账号卡片和 Agent 摘要查看。

「设置 → 外观 → 岛屿展示优先级」增加可拖动的「API 余额」，旧排序末尾自动追加。显示已启用并成功查询过的账号名称与余额，多个账号优先显示低余额，`+N` 表示还有其他账号。倒计时、消息与临时提醒继续沿用原有优先规则。

Agent 页配额行最右侧同步显示名称和余额，位于「第三方模型」右侧，即使关闭官方额度展示也可显示。悬停或键盘聚焦可查看全部账号；每个钱包保留单位，不混合 USD / CNY。失败后显示的摘要标注「上次查询值」。新增预警配置兼容原有 JSON 文件，仍通过 `.flyisland-balance.json` / `.json` 导入导出，导入账号保持停用。

## 验证边界

本项目通过纯解析、真实本机 HTTP 模拟与浏览器回归检查协议和交互。没有用户供应商凭据时，不能据此声称所有供应商都已线上联调。首次接入请使用「测试查询」，并与供应商控制台核对单位、换算和余额。内置模板不会通过模型生成请求探测余额；自定义脚本按用户定义发送请求。

协议解析及火山签名参考固定提交 `e9bb11fa3abea90f926d5faa2a427f7004f7e166` 的 cc-switch（MIT）；许可保存在 `THIRD_PARTY_LICENSES/cc-switch.txt`。
