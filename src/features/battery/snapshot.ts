// BatterySnapshot and BatteryDetails in src-tauri/src/system/battery.rs.
export type BatterySnapshot = {
  percent: number | null;
  pluggedIn: boolean | null;
  charging: boolean | null;
  secondsRemaining: number | null;
  details: {
    remainingMwh: number | null;
    fullMwh: number | null;
    designMwh: number | null;
    rateMw: number | null;
  } | null;
};

export type ReadBatterySnapshot = (includeDetails: boolean) => Promise<BatterySnapshot | null>;
