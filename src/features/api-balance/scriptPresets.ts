import type { BalanceAccount } from "./types";

/** A visible, editable equivalent of the basic native protocols; previews never replace native queries. */
export function builtinBalanceScript(account: BalanceAccount): string {
  const kind = account.template;
  const base = '"{{baseUrl}}".replace(/\\/+$/, "")';
  const url = kind === "newapi" ? `${base}.match(/^https?:\\/\\/[^/?#]+/)[0] + "/api/user/self"`
    : kind === "sub2api" ? `${base}.replace(/\\/v1$/, "") + "/v1/usage"`
      : `${base} + "/user/balance"`;
  const extractor = kind === "newapi" ? `    const data = response.data || {};
    const remaining = amount(data.quota);
    const used = amount(data.used_quota);
    return { remaining: remaining == null ? null : remaining / ${account.quotaPerUnit},
      used: used == null ? null : used / ${account.quotaPerUnit},
      total: remaining == null || used == null ? null : (remaining + used) / ${account.quotaPerUnit},
      planName: data.group || null, unit: "USD" };`
    : kind === "sub2api" ? `    const quota = response.quota || {};
    const remaining = amount(response.remaining);
    const total = amount(quota.limit);
    return { remaining: remaining === -1 ? null : remaining, unlimited: remaining === -1,
      total: total > 0 ? total : null, used: total > 0 ? amount(quota.used) : null,
      unit: response.unit || quota.unit || "USD", planName: response.planName || null,
      isValid: typeof response.isValid === "boolean" ? response.isValid : null };`
      : `    return { remaining: amount(response.balance), unit: response.unit || "USD", isValid: true };`;
  return `({
  request: {
    url: ${url},
    method: "GET",
    headers: { Authorization: "Bearer {{${kind === "newapi" ? "accessToken" : "apiKey"}}}"${kind === "newapi" ? ', "New-Api-User": "{{userId}}"' : ""} }
  },
  extractor: function(response) {
    if (response.success === false || response.error != null && response.error !== "" || response.base_resp && response.base_resp.status_code != null && response.base_resp.status_code !== 0) throw new Error("Provider rejected request");
    function amount(value) {
      if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?$/.test(value))) return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
${extractor}
  }
})`;
}
