import type { SettingsConfigTransferText } from "../../i18n/sections/settings/configTransfer";
import { BackupError } from "./format.ts";

export function transferError(error: unknown, text: SettingsConfigTransferText): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof BackupError ? error.code : message.replace(/^configTransfer:/, "").split(":")[0];
  const known = ["invalidJson", "wrongApp", "unsupportedVersion", "invalidStructure", "tooLarge", "storageUnavailable", "storageRollbackFailed"] as const;
  const match = known.find((key) => key === code);
  return match ? text[match] : `${text.failed}${message}`;
}
