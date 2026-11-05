export type TranslatorText = {
  label: string;
  title: string;
  subtitle: string;
  settings: string;
  closeLabel: string;
  credentialHint: string;
  provider: string;
  providers: {
    deepseek: string;
    volcengine: string;
    dashscope: string;
    moonshot: string;
    siliconflow: string;
    openai: string;
    custom: string;
  };
  baseUrl: string;
  baseUrlHint: string;
  model: string;
  modelDefault: (model: string) => string;
  modelRequired: string;
  secret: string;
  replaceSecret: string;
  enterSecret: string;
  saveSecret: string;
  deleteSecret: string;
  shortcut: string;
  pressShortcut: string;
  shortcutHint: string;
  direction: string;
  auto: string;
  zhEn: string;
  enZh: string;
  chinese: string;
  english: string;
  bilingual: string;
  source: string;
  limit: string;
  placeholder: string;
  paste: string;
  result: string;
  copy: string;
  copied: string;
  clearSource: string;
  loading: string;
  emptyResult: string;
  configureSecret: string;
  enterHint: string;
  translate: string;
  emptyClipboard: string;
  nothingToTranslate: string;
  panelPlaceholder: string;
  peekLabel: (text: string) => string;
  emptySource: string;
  tooLong: string;
  clipboard: (text: string) => string;
};

export const zhCN: TranslatorText = {
  label: "快捷翻译",
  title: "快捷翻译",
  subtitle: "中英互译",
  settings: "翻译设置",
  closeLabel: "关闭翻译窗口",
  credentialHint: "密钥只保存在本机 Windows 凭据管理器，每个服务分开保存",
  provider: "翻译服务",
  providers: {
    deepseek: "DeepSeek",
    volcengine: "火山方舟",
    dashscope: "通义千问",
    moonshot: "Kimi",
    siliconflow: "硅基流动",
    openai: "OpenAI",
    custom: "自定义（OpenAI 兼容）",
  },
  baseUrl: "接口地址",
  baseUrlHint: "OpenAI 兼容接口的地址，例如 https://example.com/v1；本机服务可用 http://localhost",
  model: "模型",
  modelDefault: (model) => `留空使用 ${model}`,
  modelRequired: "填写服务商提供的模型名称或接入点 ID",
  secret: "API 密钥",
  replaceSecret: "输入新密钥以替换",
  enterSecret: "输入 API 密钥",
  saveSecret: "保存密钥",
  deleteSecret: "删除已保存密钥",
  shortcut: "全局快捷键",
  pressShortcut: "请按下组合键…",
  shortcutHint: "点击输入框，再按新的组合键",
  direction: "翻译方向",
  auto: "自动识别",
  zhEn: "中文 → 英文",
  enZh: "英文 → 中文",
  chinese: "中文",
  english: "English",
  bilingual: "中英互译",
  source: "原文",
  limit: "最多 5,000 字",
  placeholder: "输入文本，或按 Tab 粘贴最新复制内容",
  paste: "粘贴最新剪贴板内容",
  result: "译文",
  copy: "复制译文",
  copied: "已复制",
  clearSource: "清空原文和译文",
  loading: "正在翻译…",
  emptyResult: "译文会显示在这里",
  configureSecret: "配置翻译服务密钥",
  enterHint: "Enter 翻译 · Shift+Enter 换行",
  translate: "翻译",
  emptyClipboard: "剪贴板中没有可粘贴的文本。",
  nothingToTranslate: "没有可翻译的文字",
  panelPlaceholder: "输入要翻译的文字，Enter 翻译",
  peekLabel: (text) => `译文：${text}`,
  emptySource: "请输入原文，或按 Tab 填入剪贴板内容。",
  tooLong: "单次最多翻译 5000 个字符。",
  clipboard: (text) => `剪贴板：${text}`,
};

export const en: TranslatorText = {
  label: "Quick translation",
  title: "Quick translation",
  subtitle: "Chinese / English",
  settings: "Translation settings",
  closeLabel: "Close translation window",
  credentialHint: "Keys are stored only in Windows Credential Manager on this PC, one per service",
  provider: "Service",
  providers: {
    deepseek: "DeepSeek",
    volcengine: "Volcano Ark",
    dashscope: "Qwen (DashScope)",
    moonshot: "Kimi",
    siliconflow: "SiliconFlow",
    openai: "OpenAI",
    custom: "Custom (OpenAI-compatible)",
  },
  baseUrl: "Base URL",
  baseUrlHint: "Address of an OpenAI-compatible API, such as https://example.com/v1; local services may use http://localhost",
  model: "Model",
  modelDefault: (model) => `Leave empty for ${model}`,
  modelRequired: "Model name or endpoint ID from the provider",
  secret: "API key",
  replaceSecret: "Enter a new key to replace it",
  enterSecret: "Enter your API key",
  saveSecret: "Save key",
  deleteSecret: "Delete saved key",
  shortcut: "Global shortcut",
  pressShortcut: "Press a key combination…",
  shortcutHint: "Click the field, then press a new key combination",
  direction: "Direction",
  auto: "Auto-detect",
  zhEn: "Chinese → English",
  enZh: "English → Chinese",
  chinese: "Chinese",
  english: "English",
  bilingual: "Chinese / English",
  source: "Source",
  limit: "Up to 5,000 characters",
  placeholder: "Enter text, or press Tab to paste the latest clipboard text",
  paste: "Paste latest clipboard text",
  result: "Translation",
  copy: "Copy translation",
  copied: "Copied",
  clearSource: "Clear source and translation",
  loading: "Translating…",
  emptyResult: "Your translation will appear here",
  configureSecret: "Set up a translation service",
  enterHint: "Enter to translate · Shift+Enter for a new line",
  translate: "Translate",
  emptyClipboard: "The clipboard has no text to paste.",
  nothingToTranslate: "Nothing to translate",
  panelPlaceholder: "Type text to translate; Enter translates",
  peekLabel: (text) => `Translation: ${text}`,
  emptySource: "Enter source text, or press Tab to paste from the clipboard.",
  tooLong: "Translate up to 5,000 characters at a time.",
  clipboard: (text) => `Clipboard: ${text}`,
};
