import { getZcodeUsage } from "./api";
import type { AgentUsage } from "./api";

export type ZcodeApiKeyFeedback =
  | { kind: "http"; detail: string }
  | { kind: "loading" | "checking" | "noQuota" | "invalidKey" | "network" | "response" | "storage" | "invalidInput" | "desktopError" };

export function zcodeApiKeyError(error: unknown): ZcodeApiKeyFeedback {
  if (error === "zcode_usage:auth" || error === "zcode_usage:rejected") return { kind: "invalidKey" };
  if (error === "zcode_usage:network") return { kind: "network" };
  if (typeof error === "string" && error.startsWith("zcode_usage:http:")) return { kind: "http", detail: error.slice("zcode_usage:http:".length) };
  if (error === "zcode_api_key:invalid" || error === "zcode_api_key:platform") return { kind: "invalidInput" };
  if (typeof error === "string" && error.startsWith("zcode_usage:")) return { kind: "response" };
  return { kind: "storage" };
}

export async function checkZcodeQuota(hasKey: boolean): Promise<{ usage: AgentUsage | null; feedback: ZcodeApiKeyFeedback | null }> {
  try {
    const usage = await getZcodeUsage();
    return { usage, feedback: hasKey && !usage ? { kind: "noQuota" } : null };
  } catch (error) {
    return { usage: null, feedback: hasKey ? zcodeApiKeyError(error) : { kind: "desktopError" } };
  }
}
