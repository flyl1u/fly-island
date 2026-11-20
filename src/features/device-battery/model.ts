export type DeviceBatterySettings = { enabled: boolean; directory: string; speakerId: string; headsetId: string };
export const DEFAULT_DEVICE_BATTERY: DeviceBatterySettings = { enabled: false, directory: "", speakerId: "", headsetId: "" };
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown) { return typeof value === "string" ? value.slice(0, 4096) : ""; }
export function normalizeDeviceBatterySettings(value: unknown): DeviceBatterySettings {
  const v = object(value);
  const directory = text(v.directory);
  return { enabled: v.enabled === true && directory.length > 0, directory, speakerId: text(v.speakerId), headsetId: text(v.headsetId) };
}
// Projections of the headless helper's AudioReading and engine schema-2 devices.
export type AudioSnapshot = { currentId: string; succeeded: boolean; error: string; devices: { id: string; name: string }[] };
export type BatteryDevice = { id: string; name: string; kind: string; percent: number | null; charging: boolean | null; approximate: boolean; unconfirmed: boolean; receiverOnly: boolean; state: "current" | "cached" | "unknown"; confirmedAt: string };
export type BatterySnapshot = { devices: BatteryDevice[]; errors: string[] };
export function normalizeAudio(value: unknown): AudioSnapshot {
  const v = object(value);
  if (!Array.isArray(v.Devices)) throw new Error("Invalid audio response");
  return { currentId: text(v.ConsoleOutputId), succeeded: v.OperationSucceeded === true, error: text(v.Error),
    devices: v.Devices.flatMap((item) => {
      const d = object(item);
      return d.Flow === 0 && text(d.Id) ? [{ id: text(d.Id), name: text(d.Name) || text(d.Id) }] : [];
    }) };
}
export function normalizeBatteries(value: unknown): BatterySnapshot {
  const v = object(value);
  if (!Array.isArray(v.devices)) throw new Error("Invalid battery response");
  const seen = new Set<string>();
  return { errors: Array.isArray(v.errors) ? v.errors.filter((x): x is string => typeof x === "string") : [],
    devices: v.devices.slice(0, 66).flatMap((item) => {
      const d = object(item);
      const id = text(d.id);
      if (!id || seen.has(id)) return [];
      seen.add(id);
      const percent = typeof d.percent === "number" && Number.isFinite(d.percent) && d.percent >= 0 && d.percent <= 100 ? d.percent : null;
      const state = d.measurementState === "current" || d.measurementState === "cached" ? d.measurementState : "unknown";
      return [{ id, name: text(d.name) || id, kind: text(d.kind), percent, charging: typeof d.charging === "boolean" ? d.charging : null,
        approximate: d.approximate === true, unconfirmed: d.unconfirmed === true, receiverOnly: d.receiverOnly === true, state, confirmedAt: text(d.confirmedAtUtc) }];
    }) };
}
