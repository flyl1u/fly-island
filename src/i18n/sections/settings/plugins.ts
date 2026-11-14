export type SettingsPluginsText = {
  empty: string;
  balance: {
    title: string; description: string; enabled: string; add: string; edit: string; remove: string;
    confirmRemove: string; cancel: string; save: string; test: string; refresh: string; refreshing: string;
    import: string; export: string; confirmImport: string; importPreview: string; importHint: string;
    exportScripts: string; secretHint: string; name: string; template: string; provider: string;
    baseUrl: string; apiKey: string; accessToken: string; userId: string; organizationId: string;
    projectId: string; accessKeyId: string; secretAccessKey: string; region: string;
    timeout: string; interval: string; intervalHint: string; seconds: string; minutes: string;
    conversion: string; code: string; codeHint: string; stored: string; noAccounts: string;
    noData: string; remaining: string; used: string; total: string; unlimited: string; updated: string;
    reset: string; testPassed: string; paused: string; invalid: string; loading: string; zenmuxHint: string;
    templates: Record<"custom" | "general" | "newapi" | "sub2api" | "token_plan" | "official", string>;
    windows: Record<string, string>; errors: Record<string, string>;
  };
};

export const zhCN: SettingsPluginsText = {
  empty: "暂无插件",
  balance: {
    title: "API 余额", description: "查看 API 账户余额和编程套餐额度。", enabled: "启用余额查询",
    add: "添加账号", edit: "编辑", remove: "删除", confirmRemove: "确认删除账号与密钥", cancel: "取消",
    save: "保存", test: "测试查询", refresh: "立即刷新", refreshing: "查询中…", import: "导入配置",
    export: "导出配置", confirmImport: "确认导入", importPreview: "导入预览", importHint: "支持 .flyisland-balance.json、兼容的 cc-switch 供应商/余额脚本 JSON 和自定义 .js 脚本。导入账号默认停用；请检查脚本与地址后再启用。",
    exportScripts: "导出时包含脚本（脚本可能含敏感内容）", secretHint: "密钥保存在 Windows 凭据管理器。留空保留已保存值；默认导出不含密钥和脚本。",
    name: "账号名称", template: "预设模板", provider: "套餐供应商", baseUrl: "Base URL", apiKey: "API Key",
    accessToken: "后台 Access Token", userId: "用户 ID", organizationId: "组织 ID", projectId: "项目 ID",
    accessKeyId: "AccessKey ID", secretAccessKey: "SecretAccessKey", region: "Region", timeout: "请求超时",
    interval: "自动查询间隔", intervalHint: "0 表示仅手动查询。关闭设置页后仍可自动刷新。", seconds: "秒", minutes: "分钟",
    conversion: "每 1 USD 对应的 quota", code: "请求与结果提取脚本", codeHint: "支持 {{baseUrl}}、{{apiKey}}、{{accessToken}}、{{userId}}；返回 request 与 extractor(response)。空脚本使用内置模板。",
    stored: "已保存，留空保留", noAccounts: "添加账号，或导入配置文件开始使用。", noData: "尚未查询", remaining: "剩余",
    used: "已用", total: "总额", unlimited: "不限量", updated: "更新于", reset: "重置于", testPassed: "测试成功",
    paused: "自动查询已停用", invalid: "密钥或套餐不可用", loading: "正在加载…", zenmuxHint: "ZenMux 按原样 GET 你填写的完整额度查询地址，请从现有可用配置复制；不自动推断推理地址的余额路径。",
    templates: { custom: "自定义", general: "通用模板", newapi: "NewAPI", sub2api: "Sub2API", token_plan: "Token Plan", official: "官方余额" },
    windows: { five_hour: "5 小时", weekly_limit: "每周", monthly: "每月" },
    errors: { invalidAccount: "请检查名称、HTTPS 地址、超时和刷新间隔。", unsupportedTemplate: "文件包含不支持的模板。", unsupportedProvider: "文件包含不支持的套餐供应商。", unsupportedFormat: "文件格式不受支持，请导入余额 JSON 配置或 .js 脚本。", invalidJson: "JSON 格式不正确。", fileTooLarge: "文件或脚本过大（文件最多 1 MiB，脚本最多 64 KiB）。", accountLimit: "每次导入 1–50 个账号，总计最多 50 个。", scriptMustBeText: "请将 request/extractor 脚本保存为 .js，或放在 JSON 的 code 字符串中。" },
  },
};

export const en: SettingsPluginsText = {
  empty: "No plugins yet",
  balance: {
    title: "API Balance", description: "Check API account balances and coding plan quotas.", enabled: "Enable balance queries",
    add: "Add account", edit: "Edit", remove: "Delete", confirmRemove: "Confirm account and key deletion", cancel: "Cancel",
    save: "Save", test: "Test query", refresh: "Refresh", refreshing: "Querying…", import: "Import configuration",
    export: "Export configuration", confirmImport: "Confirm import", importPreview: "Import preview", importHint: "Accepts .flyisland-balance.json, compatible cc-switch provider/usage-script JSON, and custom .js scripts. Imported accounts are disabled; review scripts and endpoints before enabling.",
    exportScripts: "Include scripts in export (may contain secrets)", secretHint: "Keys are stored in Windows Credential Manager. Leave blank to keep saved values. Default exports omit keys and scripts.",
    name: "Account name", template: "Preset template", provider: "Plan provider", baseUrl: "Base URL", apiKey: "API Key",
    accessToken: "Dashboard Access Token", userId: "User ID", organizationId: "Organization ID", projectId: "Project ID",
    accessKeyId: "AccessKey ID", secretAccessKey: "SecretAccessKey", region: "Region", timeout: "Request timeout",
    interval: "Auto refresh interval", intervalHint: "0 means manual only. Refreshing continues when settings are closed.", seconds: "seconds", minutes: "minutes",
    conversion: "Quota per 1 USD", code: "Request and extractor script", codeHint: "Supports {{baseUrl}}, {{apiKey}}, {{accessToken}}, {{userId}}; return request and extractor(response). An empty script uses the built-in preset.",
    stored: "Saved; leave blank to keep", noAccounts: "Add an account or import a configuration file.", noData: "Not queried yet", remaining: "Remaining",
    used: "Used", total: "Total", unlimited: "Unlimited", updated: "Updated", reset: "Resets", testPassed: "Test succeeded",
    paused: "Auto refresh disabled", invalid: "Invalid key or plan", loading: "Loading…", zenmuxHint: "ZenMux sends GET to the exact quota URL entered here. Copy a working quota endpoint from your configuration; no balance path is inferred from inference URLs.",
    templates: { custom: "Custom", general: "General", newapi: "NewAPI", sub2api: "Sub2API", token_plan: "Token Plan", official: "Official balance" },
    windows: { five_hour: "5 hours", weekly_limit: "Weekly", monthly: "Monthly" },
    errors: { invalidAccount: "Check the name, HTTPS URL, timeout and refresh interval.", unsupportedTemplate: "The file contains an unsupported template.", unsupportedProvider: "The file contains an unsupported plan provider.", unsupportedFormat: "Unsupported file format. Import a balance JSON configuration or .js script.", invalidJson: "Invalid JSON file.", fileTooLarge: "File or script is too large (file: 1 MiB, script: 64 KiB).", accountLimit: "Import 1–50 accounts, with at most 50 accounts in total.", scriptMustBeText: "Save request/extractor code as .js, or put it in a JSON code string." },
  },
};
