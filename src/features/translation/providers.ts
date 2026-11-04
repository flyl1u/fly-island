// Mirrors PROVIDERS in src-tauri/src/translation/provider.rs. The native side owns the
// preset base URLs; the window only picks a provider and, for "custom", supplies one.
export const TRANSLATION_PROVIDERS = [
  "deepseek",
  "volcengine",
  "dashscope",
  "moonshot",
  "siliconflow",
  "openai",
  "custom",
] as const;

export type TranslationProvider = (typeof TRANSLATION_PROVIDERS)[number];

// What older versions always used; settings saved before providers existed load as this.
export const DEFAULT_TRANSLATION_PROVIDER: TranslationProvider = "deepseek";

/** Models the native side falls back to when the model field is left empty. */
export const DEFAULT_PROVIDER_MODELS: Partial<Record<TranslationProvider, string>> = {
  deepseek: "deepseek-flash",
};

export function isTranslationProvider(value: unknown): value is TranslationProvider {
  return TRANSLATION_PROVIDERS.includes(value as TranslationProvider);
}
