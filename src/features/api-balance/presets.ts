import type { PlanProvider } from "./types";

export const PROVIDER_NAMES: Record<PlanProvider, string> = {
  kimi: "Kimi For Coding", zhipu: "Zhipu GLM", zhipu_team: "Zhipu GLM Team", minimax: "MiniMax",
  zenmux: "ZenMux", volcengine: "Volcengine", opencode_go: "OpenCode Go", command_code: "Command Code",
};
export const PROVIDER_URLS: Record<PlanProvider, string> = {
  kimi: "https://api.kimi.com/coding/v1", zhipu: "https://open.bigmodel.cn/api/anthropic",
  zhipu_team: "https://open.bigmodel.cn/api/anthropic", minimax: "https://api.minimaxi.com/anthropic",
  zenmux: "", volcengine: "https://ark.cn-beijing.volces.com/api/coding/v3",
  opencode_go: "https://opencode.ai/zen/go", command_code: "https://api.commandcode.ai/provider",
};
export const CUSTOM_SCRIPT = `({
  request: {
    url: "{{baseUrl}}/user/balance",
    method: "GET",
    headers: { Authorization: "Bearer {{apiKey}}" }
  },
  extractor: function(response) {
    return { remaining: response.balance, unit: "USD" };
  }
})`;

export function detectPlanProvider(baseUrl: string): PlanProvider | undefined {
  let url: URL;
  try { url = new URL(baseUrl); } catch { return undefined; }
  const host = url.hostname.toLowerCase();
  if (["api.kimi.com", "api.kimi.ai"].includes(host) && url.pathname.includes("/coding")) return "kimi";
  if (["open.bigmodel.cn", "api.z.ai"].includes(host)) return "zhipu";
  if (["api.minimaxi.com", "api.minimax.cn", "api.minimax.io"].includes(host)) return "minimax";
  if (host === "zenmux.ai") return "zenmux";
  if (host === "ark.cn-beijing.volces.com") return "volcengine";
  if (host === "opencode.ai" && /\/(zen|inference)\/go(?:\/|$)/.test(url.pathname)) return "opencode_go";
  if (host === "api.commandcode.ai") return "command_code";
  return undefined;
}
