export const TEMPLATES = ["custom", "general", "newapi", "sub2api", "token_plan", "official"] as const;
export type BalanceTemplate = typeof TEMPLATES[number];
export const PLAN_PROVIDERS = ["kimi", "zhipu", "zhipu_team", "minimax", "zenmux", "volcengine", "opencode_go", "command_code"] as const;
export type PlanProvider = typeof PLAN_PROVIDERS[number];

/** Rust api_balance/model.rs::Account; secrets are kept separately. */
export interface BalanceAccount {
  id: string;
  name: string;
  template: BalanceTemplate;
  provider: string;
  baseUrl: string;
  userId: string;
  organizationId: string;
  projectId: string;
  accessKeyId: string;
  region: string;
  timeoutSeconds: number;
  intervalMinutes: number;
  quotaPerUnit: number;
  enabled: boolean;
  alertThreshold: number | null;
  alertUnit: string;
}
export interface BalanceSecrets { apiKey: string; accessToken: string; secretAccessKey: string; code: string; clearCode?: boolean }
export interface UsageData {
  planName: string | null; remaining: number | null; total: number | null;
  used: number | null; unit: string | null; isValid: boolean | null;
  invalidMessage: string | null; unlimited: boolean;
}
export interface QuotaTier {
  name: string; utilization: number; resetsAt: string | null;
  usedValueUsd: number | null; maxValueUsd: number | null;
}
export interface BalanceResult { data: UsageData[]; tiers: QuotaTier[]; planName: string | null }
export interface BalanceAccountState {
  account: BalanceAccount; hasCredentials: boolean; codeConfigured: boolean;
  result: BalanceResult | null; updatedAt: number | null; attemptedAt: number | null;
  refreshing: boolean; error: string | null;
  warning?: { remaining: number; unit: string; threshold: number; triggeredAt: number } | null;
}
export interface BalanceSnapshot { revision: number; enabled: boolean; accounts: BalanceAccountState[] }
export interface ImportEntry { account: BalanceAccount; secrets: BalanceSecrets }
export const emptySecrets = (): BalanceSecrets => ({ apiKey: "", accessToken: "", secretAccessKey: "", code: "" });
export const newAccount = (id: string): BalanceAccount => ({
  id, name: "", template: "general", provider: "", baseUrl: "", userId: "", organizationId: "",
  projectId: "", accessKeyId: "", region: "cn-beijing", timeoutSeconds: 10, intervalMinutes: 5,
  quotaPerUnit: 500000, enabled: false, alertThreshold: null, alertUnit: "USD",
});
