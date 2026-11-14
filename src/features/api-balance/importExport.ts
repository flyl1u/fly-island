import { emptySecrets, newAccount, PLAN_PROVIDERS, TEMPLATES } from "./types.ts";
import type { BalanceAccount, BalanceAccountState, BalanceSecrets, BalanceTemplate, ImportEntry } from "./types";
import { detectPlanProvider } from "./presets.ts";

export const BALANCE_FILE_FORMAT = "focusd-island-api-balance";
export const MAX_IMPORT_BYTES = 1024 * 1024;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (...values: unknown[]): string => values.find((v): v is string => typeof v === "string" && v.length > 0) ?? "";
const number = (value: unknown, fallback: number): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function validateAccount(account: BalanceAccount): void {
  if (!account.name.trim() || account.name.length > 100 || account.baseUrl.length > 2048) throw new Error("invalidAccount");
  if (!TEMPLATES.includes(account.template)) throw new Error("unsupportedTemplate");
  if (!Number.isInteger(account.timeoutSeconds) || account.timeoutSeconds < 1 || account.timeoutSeconds > 120 || !Number.isInteger(account.intervalMinutes) || account.intervalMinutes < 0 || account.intervalMinutes > 1440 || !Number.isFinite(account.quotaPerUnit) || account.quotaPerUnit <= 0) throw new Error("invalidAccount");
  if (account.template === "token_plan" && !PLAN_PROVIDERS.includes(account.provider as typeof PLAN_PROVIDERS[number])) throw new Error("unsupportedProvider");
  if (account.template !== "custom" && !account.baseUrl) throw new Error("invalidAccount");
  if (account.baseUrl) {
    let url: URL;
    try { url = new URL(account.baseUrl); } catch { throw new Error("invalidAccount"); }
    if (url.username || url.password || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("invalidAccount");
  }
}

function template(value: string, code: string, provider: string): BalanceTemplate {
  const aliases: Record<string, BalanceTemplate> = { new_api: "newapi", balance: "official", tokenPlan: "token_plan" };
  const result = aliases[value] ?? value;
  if (TEMPLATES.includes(result as BalanceTemplate)) return result as BalanceTemplate;
  if (value) throw new Error("unsupportedTemplate");
  return code ? "custom" : provider ? "token_plan" : "general";
}

function parseEntry(value: unknown, index: number, makeId: () => string): ImportEntry {
  const root = object(value);
  const data = Object.keys(object(root.account)).length ? object(root.account) : root;
  const meta = object(data.meta);
  const usage = object(meta.usage_script ?? meta.usageScript ?? data.usageScript ?? data.usage_script);
  const settings = object(data.settingsConfig ?? data.settings_config);
  const env = object(settings.env);
  const auth = object(settings.auth);
  const secretsData = object(root.secrets ?? data.secrets);
  const configText = string(settings.config);
  const tomlBase = /^\s*base_url\s*=\s*["']([^"']+)["']/m.exec(configText)?.[1];
  const secrets: BalanceSecrets = {
    apiKey: string(secretsData.apiKey, data.apiKey, usage.apiKey, env.ANTHROPIC_AUTH_TOKEN, env.ANTHROPIC_API_KEY, env.OPENAI_API_KEY, auth.OPENAI_API_KEY),
    accessToken: string(secretsData.accessToken, data.accessToken, usage.accessToken, usage.access_token),
    secretAccessKey: string(secretsData.secretAccessKey, data.secretAccessKey, usage.secretAccessKey, usage.secret_access_key),
    code: string(secretsData.code, root.code, data.code, usage.code),
  };
  const baseUrl = string(data.baseUrl, data.base_url, usage.baseUrl, usage.base_url, env.ANTHROPIC_BASE_URL, env.OPENAI_BASE_URL, tomlBase);
  const provider = string(data.provider, usage.codingPlanProvider, usage.coding_plan_provider) || detectPlanProvider(baseUrl) || "";
  const account: BalanceAccount = {
    ...newAccount(makeId()), name: string(data.name, data.label) || `Imported ${index + 1}`,
    template: template(string(data.template, data.templateType, usage.templateType, usage.template_type), secrets.code, provider),
    provider, baseUrl, userId: string(data.userId, usage.userId, usage.user_id),
    organizationId: string(data.organizationId, usage.teamOrganizationId, usage.team_organization_id),
    projectId: string(data.projectId, usage.teamProjectId, usage.team_project_id),
    accessKeyId: string(data.accessKeyId, usage.accessKeyId, usage.access_key_id),
    region: string(data.region) || "cn-beijing",
    timeoutSeconds: number(data.timeoutSeconds ?? usage.timeout ?? usage.timeoutSeconds, 10),
    intervalMinutes: number(data.intervalMinutes ?? usage.autoQueryInterval ?? usage.auto_query_interval, 5),
    quotaPerUnit: number(data.quotaPerUnit, 500000), enabled: false,
  };
  validateAccount(account);
  if (secrets.code.length > 65536 || [secrets.apiKey, secrets.accessToken, secrets.secretAccessKey].some(v => v.length > 8192)) throw new Error("fileTooLarge");
  return { account, secrets };
}

function entriesFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const data = object(value);
  if ("format" in data) {
    if (data.format !== BALANCE_FILE_FORMAT || data.version !== 1 || !Array.isArray(data.accounts)) throw new Error("unsupportedFormat");
    return data.accounts;
  }
  if (Array.isArray(data.accounts)) return data.accounts;
  if (Array.isArray(data.providers)) return data.providers;
  const providers = object(data.providers);
  if (Object.keys(providers).length) return Object.values(providers).flatMap(v => {
    const group = object(v);
    if ("settingsConfig" in group || "meta" in group || "baseUrl" in group) return [group];
    return Object.values(object(group.providers ?? group));
  });
  if ("request" in data && "extractor" in data) throw new Error("scriptMustBeText");
  if ("code" in data || "baseUrl" in data || "account" in data || "settingsConfig" in data || "usageScript" in data || "meta" in data) return [data];
  throw new Error("unsupportedFormat");
}

export function parseBalanceImport(text: string, filename: string, makeId: () => string = () => crypto.randomUUID()): ImportEntry[] {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error("fileTooLarge");
  if (!/\.(json|js)$/i.test(filename)) throw new Error("unsupportedFormat");
  let values: unknown[];
  if (/\.js$/i.test(filename)) values = [{ name: filename.replace(/\.js$/i, ""), template: "custom", code: text }];
  else {
    let value: unknown;
    try { value = JSON.parse(text.replace(/^\uFEFF/, "")) as unknown; } catch { throw new Error("invalidJson"); }
    values = entriesFrom(value);
  }
  if (!values.length || values.length > 50) throw new Error("accountLimit");
  return values.map((v, i) => parseEntry(v, i, makeId));
}

export function exportBalanceAccounts(states: readonly BalanceAccountState[], scripts?: ReadonlyMap<string, string>): string {
  return JSON.stringify({
    format: BALANCE_FILE_FORMAT, version: 1,
    accounts: states.map(({ account }) => ({ account: { ...account, enabled: false }, secrets: { ...emptySecrets(), code: scripts?.get(account.id) ?? "" } })),
  }, null, 2);
}
