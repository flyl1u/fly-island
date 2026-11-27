export const BATTERY_DISPLAY_MODES = ["percent", "remaining"] as const;
export type BatteryDisplayMode = typeof BATTERY_DISPLAY_MODES[number];

export const BATTERY_READOUT_STYLES = ["inverted", "badge"] as const;
export type BatteryReadoutStyle = typeof BATTERY_READOUT_STYLES[number];

export type BatteryPreferences = {
  batteryDisplayMode: BatteryDisplayMode;
  batteryReadoutStyle: BatteryReadoutStyle;
  batteryHistoryEnabled: boolean;
};

export const DEFAULT_BATTERY_PREFERENCES: BatteryPreferences = {
  batteryDisplayMode: "percent",
  batteryReadoutStyle: "inverted",
  batteryHistoryEnabled: true,
};

export function normalizeBatteryPreferences(settings?: { [Key in keyof BatteryPreferences]?: unknown } | null): BatteryPreferences {
  return {
    batteryDisplayMode: BATTERY_DISPLAY_MODES.find((mode) => mode === settings?.batteryDisplayMode)
      ?? DEFAULT_BATTERY_PREFERENCES.batteryDisplayMode,
    batteryReadoutStyle: BATTERY_READOUT_STYLES.find((style) => style === settings?.batteryReadoutStyle)
      ?? DEFAULT_BATTERY_PREFERENCES.batteryReadoutStyle,
    batteryHistoryEnabled: typeof settings?.batteryHistoryEnabled === "boolean"
      ? settings.batteryHistoryEnabled : DEFAULT_BATTERY_PREFERENCES.batteryHistoryEnabled,
  };
}
