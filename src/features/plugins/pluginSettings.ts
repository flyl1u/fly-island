import type { PluginSetting } from "./api";

/**
 * The settings a page shows now. A row can wait for another row's value (`showWhen`): Eye Care
 * hides its break length and skip switch in notify mode, where neither applies.
 */
export function visiblePluginSettings(
  settings: readonly PluginSetting[],
  values: Readonly<Record<string, boolean | string>>,
): PluginSetting[] {
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  const valueOf = (setting: PluginSetting) =>
    Object.prototype.hasOwnProperty.call(values, setting.key) ? values[setting.key] : setting.default;
  return settings.filter((setting) => {
    const rule = setting.showWhen;
    if (!rule) return true;
    const source = byKey.get(rule.key);
    // A rule that points nowhere keeps the row visible rather than hiding a setting for good.
    return source === undefined || String(valueOf(source)) === rule.value;
  });
}
