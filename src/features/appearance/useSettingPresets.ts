import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import { createTodoId } from "../todos";
import { LEGACY_DEFAULT_PRESET_NAMES, isDefaultSettingPreset, mergeWithDefaultSettingPresets, normalizeSettings, withAppearanceFrom } from "./settings";
import { loadSettingPresets, saveSettingPresets } from "./storage";
import { saveThemeFile } from "./api";
import { buildTheme, parseTheme, themeFileName, type ThemeProblem } from "./theme.ts";
import type { IslandPreset, IslandSettings } from "./types";

/**
 * Saved style presets: saving the current settings, applying, renaming and deleting them, and
 * moving one in or out as a theme file.
 */
export function useSettingPresets(
  settings: IslandSettings,
  onSettingsChange: (settings: IslandSettings) => void,
) {
  const t = useTranslation();
  const [presets, setPresets] = useState<IslandPreset[]>(() =>
    loadSettingPresets(t),
  );

  useEffect(() => {
    saveSettingPresets(presets);
  }, [presets]);

  const saveSettingsPreset = useCallback(() => {
    setPresets((currentPresets) => {
      const customPresetCount = currentPresets.filter(
        (preset) => !preset.isDefault && !isDefaultSettingPreset(preset.id),
      ).length;
      const preset: IslandPreset = {
        id: createTodoId(),
        name: t.settings.presets.defaultName(customPresetCount + 1),
        settings,
        createdAt: Date.now(),
        isDefault: false,
      };

      return mergeWithDefaultSettingPresets([preset, ...currentPresets]);
    });
  }, [settings, t]);

  const applySettingsPreset = useCallback(
    (presetId: string) => {
      const preset = presets.find((item) => item.id === presetId);

      if (preset) {
        onSettingsChange(withAppearanceFrom(settings, normalizeSettings(preset.settings)));
      }
    },
    [presets, settings, onSettingsChange],
  );

  const renameSettingsPreset = useCallback((presetId: string, name: string) => {
    const nextName = name.trim();

    if (
      !nextName ||
      isDefaultSettingPreset(presetId) ||
      LEGACY_DEFAULT_PRESET_NAMES.has(nextName)
    ) {
      return;
    }

    setPresets((currentPresets) =>
      currentPresets.map((preset) =>
        preset.id === presetId ? { ...preset, name: nextName } : preset,
      ),
    );
  }, []);

  const deleteSettingsPreset = useCallback((presetId: string) => {
    if (isDefaultSettingPreset(presetId)) {
      return;
    }

    setPresets((currentPresets) =>
      currentPresets.filter((preset) => preset.id !== presetId),
    );
  }, []);

  /** Saves a preset as a theme file in Downloads; resolves to the file's path. */
  const exportSettingsPreset = useCallback(
    (presetId: string) => {
      const preset = presets.find((item) => item.id === presetId);
      if (!preset) return Promise.reject(new Error("No such preset."));
      const now = new Date();
      return saveThemeFile(themeFileName(now), JSON.stringify(buildTheme(preset.name, preset.settings, now), null, 2));
    },
    [presets],
  );

  /** Adds a theme file's text as a new preset (not applied); returns its name or the problem. */
  const importSettingsPreset = useCallback(
    (text: string): { name: string } | { problem: ThemeProblem } => {
      const parsed = parseTheme(text, settings);
      if ("problem" in parsed) return parsed;
      const name = parsed.name && !LEGACY_DEFAULT_PRESET_NAMES.has(parsed.name) ? parsed.name : t.settings.presets.importedName;
      const preset: IslandPreset = { id: createTodoId(), name, settings: parsed.settings, createdAt: Date.now(), isDefault: false };
      setPresets((currentPresets) => mergeWithDefaultSettingPresets([preset, ...currentPresets]));
      return { name };
    },
    [settings, t],
  );

  return {
    presets,
    onSavePreset: saveSettingsPreset,
    onApplyPreset: applySettingsPreset,
    onRenamePreset: renameSettingsPreset,
    onDeletePreset: deleteSettingsPreset,
    onExportPreset: exportSettingsPreset,
    onImportPreset: importSettingsPreset,
  };
}
