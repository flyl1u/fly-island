import { readJson, writeJson } from "../../../lib/storage.ts";

/** The Telegram plugin's receive switch; off until the user turns it on. */
export const TELEGRAM_ENABLED_KEY = "fly-island-telegram-notifications-enabled";

export const isTelegramEnabled = () => readJson(TELEGRAM_ENABLED_KEY) === true;
export const saveTelegramEnabled = (enabled: boolean) => writeJson(TELEGRAM_ENABLED_KEY, enabled);
