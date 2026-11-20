import { readJson, writeJson } from "../../../lib/storage.ts";
import { OFFICE_SOURCES, type OfficeSource } from "../messagePreview.ts";

/** Whether each installed office client's reminders are on (`{ dingtalk, feishu, wecom }`, default on). */
export const OFFICE_IM_ENABLED_KEY = "focusd-island-office-im-enabled";

export type OfficeImEnabled = Readonly<Record<OfficeSource, boolean>>;

export function loadOfficeImEnabled(): OfficeImEnabled {
  const stored = readJson(OFFICE_IM_ENABLED_KEY);
  const record = stored && typeof stored === "object" ? stored as Record<string, unknown> : {};
  return Object.fromEntries(OFFICE_SOURCES.map((source) => [source, record[source] !== false])) as Record<OfficeSource, boolean>;
}

export function saveOfficeImEnabled(source: OfficeSource, enabled: boolean) {
  return writeJson(OFFICE_IM_ENABLED_KEY, { ...loadOfficeImEnabled(), [source]: enabled });
}
