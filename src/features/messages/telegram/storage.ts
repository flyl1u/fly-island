import { readJson, writeJson } from "../../../lib/storage.ts";

const ENABLED_KEY = "fly-island-telegram-notifications-enabled";

export const isTelegramEnabled = () => readJson(ENABLED_KEY) === true;
export const saveTelegramEnabled = (enabled: boolean) => writeJson(ENABLED_KEY, enabled);
