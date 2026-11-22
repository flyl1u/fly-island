export const BATTERY_DISPLAY_MODES = ["percent", "remaining"] as const;
export type BatteryDisplayMode = typeof BATTERY_DISPLAY_MODES[number];

export type BatteryPreferences = {
  batteryDisplayMode: BatteryDisplayMode;
  batteryHistoryEnabled: boolean;
};

export const DEFAULT_BATTERY_PREFERENCES: BatteryPreferences = {
  batteryDisplayMode: "percent",
  batteryHistoryEnabled: true,
};

export function normalizeBatteryPreferences(settings?: { [Key in keyof BatteryPreferences]?: unknown } | null): BatteryPreferences {
  return {
    batteryDisplayMode: BATTERY_DISPLAY_MODES.find((mode) => mode === settings?.batteryDisplayMode)
      ?? DEFAULT_BATTERY_PREFERENCES.batteryDisplayMode,
    batteryHistoryEnabled: typeof settings?.batteryHistoryEnabled === "boolean"
      ? settings.batteryHistoryEnabled : DEFAULT_BATTERY_PREFERENCES.batteryHistoryEnabled,
  };
}
