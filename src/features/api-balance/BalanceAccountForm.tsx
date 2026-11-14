import { useId } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsNumberRow } from "../../components/settings/SettingsNumberRow";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import { CUSTOM_SCRIPT, PROVIDER_NAMES, PROVIDER_URLS } from "./presets";
import { PLAN_PROVIDERS, TEMPLATES } from "./types";
import type { BalanceAccount, BalanceSecrets, BalanceTemplate, PlanProvider } from "./types";

export interface BalanceDraft { account: BalanceAccount; secrets: BalanceSecrets }

export function BalanceAccountForm({ draft, stored, onChange }: {
  draft: BalanceDraft; stored: boolean; onChange: (draft: BalanceDraft) => void;
}) {
  const t = useTranslation().settings.plugins.balance;
  const prefix = useId();
  const { account: a, secrets: s } = draft;
  const patch = (next: Partial<BalanceAccount>) => onChange({ ...draft, account: { ...a, ...next } });
  const secret = (next: Partial<BalanceSecrets>) => onChange({ ...draft, secrets: { ...s, ...next } });
  const input = (field: "name" | "baseUrl" | "userId" | "organizationId" | "projectId" | "accessKeyId" | "region", label: string) => <SettingsRow title={label} labelFor={`${prefix}-${field}`} key={field}>
    <SettingsInput id={`${prefix}-${field}`} value={a[field]} onChange={e => patch({ [field]: e.currentTarget.value })} maxLength={field === "name" ? 100 : 2048} monospace={field !== "name"} autoComplete="off" />
  </SettingsRow>;
  const secretInput = (field: "apiKey" | "accessToken" | "secretAccessKey", label: string) => <SettingsRow title={label} labelFor={`${prefix}-${field}`} key={field}>
    <SettingsInput id={`${prefix}-${field}`} type="password" value={s[field]} onChange={e => secret({ [field]: e.currentTarget.value })} placeholder={stored ? t.stored : ""} maxLength={8192} autoComplete="new-password" monospace />
  </SettingsRow>;
  const changeTemplate = (template: BalanceTemplate) => {
    const provider = a.provider && PLAN_PROVIDERS.includes(a.provider as PlanProvider) ? a.provider as PlanProvider : "kimi";
    onChange({ account: { ...a, template, ...(template === "token_plan" ? { provider, baseUrl: PROVIDER_URLS[provider] } : {}), ...(template === "official" ? { baseUrl: "https://api.deepseek.com" } : {}) }, secrets: { ...s, code: template === "custom" ? s.code || CUSTOM_SCRIPT : "", clearCode: true } });
  };
  const scripted = ["custom", "general", "newapi", "sub2api"].includes(a.template);
  return <>
    <SettingsGroup title={t.name} footer={a.template === "token_plan" && a.provider === "zenmux" ? t.zenmuxHint : undefined}>
      {input("name", t.name)}
      <SettingsRow title={t.template} control={<SettingsSelect value={a.template} options={TEMPLATES.map(value => ({ value, label: t.templates[value] }))} ariaLabel={t.template} onChange={changeTemplate} />} />
      {a.template === "token_plan" && <SettingsRow title={t.provider} control={<SettingsSelect value={a.provider as PlanProvider} options={PLAN_PROVIDERS.map(value => ({ value, label: PROVIDER_NAMES[value] }))} ariaLabel={t.provider} onChange={provider => patch({ provider, baseUrl: PROVIDER_URLS[provider] })} />} />}
      {a.template === "official" && <SettingsRow title={t.provider} control={<SettingsSelect value={a.baseUrl} options={[
        { value: "https://api.deepseek.com", label: "DeepSeek" }, { value: "https://api.stepfun.com", label: "StepFun" },
        { value: "https://api.siliconflow.cn", label: "SiliconFlow (CN)" }, { value: "https://api.siliconflow.com", label: "SiliconFlow (EN)" },
        { value: "https://openrouter.ai/api/v1", label: "OpenRouter" }, { value: "https://api.novita.ai", label: "Novita AI" },
        { value: "https://open.bigmodel.cn", label: "Zhipu GLM" }, { value: "https://api.z.ai", label: "Z.ai" },
      ]} ariaLabel={t.provider} onChange={baseUrl => patch({ baseUrl })} />} />}
      {input("baseUrl", t.baseUrl)}
    </SettingsGroup>
    <SettingsGroup footer={t.secretHint}>
      {a.template === "newapi" ? <>{secretInput("accessToken", t.accessToken)}{input("userId", t.userId)}</> : a.provider === "volcengine" && a.template === "token_plan" ? <>{input("accessKeyId", t.accessKeyId)}{secretInput("secretAccessKey", t.secretAccessKey)}{input("region", t.region)}</> : secretInput("apiKey", t.apiKey)}
      {a.provider === "zhipu_team" && a.template === "token_plan" && <>{input("organizationId", t.organizationId)}{input("projectId", t.projectId)}</>}
      {a.template === "custom" && <>{secretInput("accessToken", t.accessToken)}{input("userId", t.userId)}</>}
    </SettingsGroup>
    <SettingsGroup footer={t.intervalHint}>
      <SettingsToggleRow title={t.enabled} checked={a.enabled} onChange={enabled => patch({ enabled })} />
      <SettingsNumberRow title={t.timeout} value={a.timeoutSeconds} min={1} max={120} unit={t.seconds} onChange={timeoutSeconds => patch({ timeoutSeconds })} />
      <SettingsNumberRow title={t.interval} value={a.intervalMinutes} min={0} max={1440} unit={t.minutes} onChange={intervalMinutes => patch({ intervalMinutes })} />
      {a.template === "newapi" && <SettingsNumberRow title={t.conversion} value={a.quotaPerUnit} min={1} max={1000000000} onChange={quotaPerUnit => patch({ quotaPerUnit })} />}
    </SettingsGroup>
    {scripted && <SettingsGroup title={t.code} footer={t.codeHint}>
      <textarea className="api-balance-code" aria-label={t.code} value={s.code} onChange={e => secret({ code: e.currentTarget.value, clearCode: true })} spellCheck={false} maxLength={65536} rows={10} />
    </SettingsGroup>}
  </>;
}
