import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import { createTodoId } from "../todos";
import { LEGACY_DEFAULT_PRESET_NAMES, isDefaultSettingPreset, mergeWithDefaultSettingPresets, normalizeSettings } from "./settings";
import { loadSettingPresets, saveSettingPresets } from "./storage";
import type { IslandPreset, IslandSettings } from "./types";

/** Saved style presets: saving the current settings, applying, renaming and deleting them. */
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
        onSettingsChange(normalizeSettings(preset.settings));
      }
    },
    [presets, onSettingsChange],
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

  return {
    presets,
    onSavePreset: saveSettingsPreset,
    onApplyPreset: applySettingsPreset,
    onRenamePreset: renameSettingsPreset,
    onDeletePreset: deleteSettingsPreset,
  };
}
