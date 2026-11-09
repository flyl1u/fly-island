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

/** The provider on first launch. */
export const DEFAULT_TRANSLATION_PROVIDER: TranslationProvider = "siliconflow";
// What older versions always used; saved settings without a valid provider load as
// this, so their stored DeepSeek key keeps working.
export const LEGACY_TRANSLATION_PROVIDER: TranslationProvider = "deepseek";

/** Models the native side falls back to when the model field is left empty. */
export const DEFAULT_PROVIDER_MODELS: Partial<Record<TranslationProvider, string>> = {
  deepseek: "deepseek-flash",
};

export function isTranslationProvider(value: unknown): value is TranslationProvider {
  return TRANSLATION_PROVIDERS.includes(value as TranslationProvider);
}
