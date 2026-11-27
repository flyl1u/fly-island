import { readJson, writeJson } from "../../lib/storage.ts";

export const WATER_REMINDER_KEY = "fly-island-water-reminder";
export const WATER_INTERVAL = { min: 1, max: 1440, default: 45 };
export const WATER_MESSAGE_LIMIT = 160;
export const WATER_MESSAGE_COUNT = 20;
export const WATER_NOTICE_MS = 5000;

export type WaterReminderSettings = {
  intervalMinutes: number;
  messages: string[];
};

export function normalizeWaterReminder(value: unknown): WaterReminderSettings {
  const data = value && typeof value === "object" ? value as Partial<WaterReminderSettings> : {};
  const minutes = data.intervalMinutes;
  return {
    intervalMinutes: typeof minutes === "number" && Number.isInteger(minutes) && minutes >= WATER_INTERVAL.min && minutes <= WATER_INTERVAL.max
      ? minutes : WATER_INTERVAL.default,
    messages: Array.isArray(data.messages) ? data.messages
      .filter((line): line is string => typeof line === "string")
      .map((line) => Array.from(line.trim()).slice(0, WATER_MESSAGE_LIMIT).join(""))
      .filter(Boolean).slice(0, WATER_MESSAGE_COUNT) : [],
  };
}

export const loadWaterReminder = () => normalizeWaterReminder(readJson(WATER_REMINDER_KEY));

export function saveWaterReminder(update: Partial<WaterReminderSettings>) {
  return writeJson(WATER_REMINDER_KEY, normalizeWaterReminder({ ...loadWaterReminder(), ...update }));
}
