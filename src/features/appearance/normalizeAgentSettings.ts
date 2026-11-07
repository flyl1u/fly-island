// Reading saved settings, part 2 (normalizeSettings in settings.ts): the Agent page and its alerts.
import { clamp } from "../../utils/number.ts";
import { DEFAULT_SETTINGS, LEGACY_FALLBACKS } from "./settingsDefaults.ts";
import {
  AGENT_ALERT_SECONDS, AGENT_HOST_DISPLAYS, AGENT_QUOTA_ALERT_PERCENTS, AGENT_REMIND_SECONDS, AGENT_SESSION_HOURS, MAX_AGENT_VISIBLE_ROWS,
  MIN_AGENT_VISIBLE_ROWS, oneOf,
} from "./settingsLimits.ts";
import type { AgentHostDisplay, IslandSettings, LegacyIslandSettings } from "./types";

/** The Agent page's rows and columns, and which session events alert, for how long. */
export function normalizeAgentSettings(settings: LegacyIslandSettings | null | undefined) {
  return {
    agentVisibleRows: typeof settings?.agentVisibleRows === "number" && Number.isFinite(settings.agentVisibleRows)
      ? clamp(Math.round(settings.agentVisibleRows), MIN_AGENT_VISIBLE_ROWS, MAX_AGENT_VISIBLE_ROWS)
      : LEGACY_FALLBACKS.agentVisibleRows,
    agentHostDisplay: AGENT_HOST_DISPLAYS.includes(settings?.agentHostDisplay as AgentHostDisplay)
      ? (settings?.agentHostDisplay as AgentHostDisplay)
      : DEFAULT_SETTINGS.agentHostDisplay,
    agentSessionHours: oneOf(AGENT_SESSION_HOURS, settings?.agentSessionHours, DEFAULT_SETTINGS.agentSessionHours),
    agentShowClaudeCode: settings?.agentShowClaudeCode !== false,
    agentShowCodex: settings?.agentShowCodex !== false,
    agentHideFinished: settings?.agentHideFinished === true,
    agentHideClosed: settings?.agentHideClosed === true,
    agentShowElapsed: settings?.agentShowElapsed === true,
    agentShowModel: settings?.agentShowModel !== false,
    agentShowActivity: settings?.agentShowActivity !== false,
    agentShowUsage: settings?.agentShowUsage !== false,
    agentAlertCompleted: settings?.agentAlertCompleted !== false,
    agentAlertFailed: settings?.agentAlertFailed !== false,
    agentAlertWaiting: settings?.agentAlertWaiting !== false,
    agentAlertStarted: settings?.agentAlertStarted === "newSession" || settings?.agentAlertStarted === "off" ? settings.agentAlertStarted : "everyTurn",
    agentAlertSeconds: oneOf(AGENT_ALERT_SECONDS, settings?.agentAlertSeconds, DEFAULT_SETTINGS.agentAlertSeconds),
    agentRemindSeconds: oneOf(AGENT_REMIND_SECONDS, settings?.agentRemindSeconds, DEFAULT_SETTINGS.agentRemindSeconds),
    agentQuotaAlertPercent: oneOf(AGENT_QUOTA_ALERT_PERCENTS, settings?.agentQuotaAlertPercent, DEFAULT_SETTINGS.agentQuotaAlertPercent),
  } satisfies Partial<IslandSettings>;
}
