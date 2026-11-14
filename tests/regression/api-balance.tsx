import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { ApiBalancePanel } from "../../src/features/api-balance/ApiBalancePanel";
import { newAccount, PLAN_PROVIDERS, TEMPLATES } from "../../src/features/api-balance/types";
import type { BalanceAccount, BalanceAccountState, BalanceResult, BalanceSecrets, BalanceSnapshot, ImportEntry } from "../../src/features/api-balance/types";
import { BALANCE_METADATA_KEY } from "../../src/features/api-balance/storage";
import { I18nProvider, LOCALE_STORAGE_KEY, TRANSLATIONS } from "../../src/i18n";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import "../../src/windows/settings/SettingsWindow.css";
import { BalanceSummary } from "../../src/features/api-balance/BalanceSummary";
import { balanceDisplays } from "../../src/features/api-balance/balanceDisplay";
import { AgentSessionsPanel } from "../../src/features/agent-status/AgentSessionsPanel";
import { CollapsedIslandSection } from "../../src/features/appearance/CollapsedIslandSection";
import { normalizeSettings } from "../../src/features/appearance/settings";

const query = new URLSearchParams(location.search);
const locale = query.get("lang") === "en" ? "en" : "zh-CN";
const t = TRANSLATIONS[locale].settings.plugins.balance;
const previous = new Map([LOCALE_STORAGE_KEY, BALANCE_METADATA_KEY].map(key => [key, localStorage.getItem(key)]));
const restore = () => { for (const [key, value] of previous) if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); };
window.addEventListener("beforeunload", restore);
localStorage.setItem(LOCALE_STORAGE_KEY, locale);
document.documentElement.dataset.theme = query.get("theme") ?? "dark";
if (query.get("theme") === "light") document.body.style.background = "#f2f4f7";
const fixture = document.getElementById("fixture")!;
fixture.style.width = query.has("narrow") ? "340px" : "548px";
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
let snapshot: BalanceSnapshot = { revision: 0, enabled: false, accounts: [] };
const secrets = new Map<string, BalanceSecrets>();
const calls: string[] = [];
const result: BalanceResult = { data: [{ remaining: 12.5, total: null, used: null, unit: "USD", isValid: true, invalidMessage: null, unlimited: false, planName: null }], tiers: [{ name: "five_hour", utilization: 125, resetsAt: "2026-11-15T00:00:00Z", usedValueUsd: null, maxValueUsd: null }], planName: "Mock Plan" };
const row = (account: BalanceAccount, value: BalanceSecrets): BalanceAccountState => ({ account, hasCredentials: Boolean(value.apiKey || value.accessToken || value.secretAccessKey), codeConfigured: Boolean(value.code), result: null, updatedAt: null, attemptedAt: null, refreshing: false, error: null });
mockIPC((command, payload) => {
  calls.push(command);
  const args = (payload ?? {}) as Record<string, unknown>;
  switch (command) {
    case "get_api_balance_state": return structuredClone(snapshot);
    case "set_api_balance_enabled": snapshot.enabled = Boolean(args.enabled); break;
    case "save_api_balance_account": {
      const account = args.account as BalanceAccount;
      const next = args.secrets as BalanceSecrets;
      const old = secrets.get(account.id);
      const merged = { ...next, apiKey: next.apiKey || old?.apiKey || "" };
      secrets.set(account.id, merged);
      snapshot.accounts = [...snapshot.accounts.filter(r => r.account.id !== account.id), row(account, merged)]; break;
    }
    case "test_api_balance": return result;
    case "read_api_balance_script": return secrets.get(String(args.id))?.code ?? "";
    case "refresh_api_balance": snapshot.accounts = snapshot.accounts.map(r => r.account.id === args.id ? { ...r, result, updatedAt: Date.now() } : r); break;
    case "remove_api_balance_account": snapshot.accounts = snapshot.accounts.filter(r => r.account.id !== args.id); secrets.delete(String(args.id)); break;
    case "import_api_balance_accounts":
      for (const entry of args.entries as ImportEntry[]) { secrets.set(entry.account.id, entry.secrets); snapshot.accounts.push(row(entry.account, entry.secrets)); } break;
    default: return null;
  }
  snapshot.revision++;
  return structuredClone(snapshot);
}, { shouldMockEvents: true });
mockWindows("settings");
const root = createRoot(fixture);
const messages: string[] = [];
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); messages.push(`PASS ${message}`); };
const wait = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });
const click = async (element: HTMLElement | undefined | null) => { if (!element) throw new Error("Missing button"); await act(async () => element.click()); await wait(); };
const button = (label: string) => [...fixture.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label);
const input = (label: string) => {
  const item = [...fixture.querySelectorAll<HTMLLabelElement>("label")].find(l => l.textContent === label);
  return item ? document.getElementById(item.htmlFor) as HTMLInputElement : null;
};
const type = async (label: string, value: string) => {
  const element = input(label); if (!element) throw new Error(`Missing input: ${label}`);
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
};
const select = async (label: string, value: string) => {
  await click(fixture.querySelector<HTMLElement>(`[role=combobox][aria-label="${label}"]`));
  await click(fixture.querySelector<HTMLElement>(`[role=option][data-value="${value}"]`));
};
const upload = async (file: File) => {
  const target = fixture.querySelector<HTMLInputElement>("input[type=file]")!;
  const transfer = new DataTransfer(); transfer.items.add(file);
  await act(async () => { target.files = transfer.files; target.dispatchEvent(new Event("change", { bubbles: true })); });
  await wait();
};

async function run() {
  try {
    await act(async () => root.render(<StrictMode><I18nProvider><ApiBalancePanel /></I18nProvider></StrictMode>)); await wait();
    check(fixture.textContent?.includes(t.title), "Plugin panel loads in selected language");
    await click(button(t.add));
    for (const value of TEMPLATES) {
      await select(t.template, value);
      check(fixture.querySelector(`[role=combobox][aria-label="${t.template}"]`)?.textContent?.includes(t.templates[value]), `${value} template is selectable`);
    }
    await select(t.template, "newapi");
    check(input(t.accessToken)?.type === "password" && input(t.userId), "NewAPI exposes dashboard token and user ID");
    await select(t.template, "token_plan");
    for (const provider of PLAN_PROVIDERS) {
      await select(t.provider, provider);
      if (provider === "zhipu_team") check(input(t.organizationId) && input(t.projectId), "Team organization/project fields are available");
      if (provider === "volcengine") check(input(t.accessKeyId) && input(t.secretAccessKey)?.type === "password", "Volcengine uses AK/SK");
      if (provider === "zenmux") check(input(t.baseUrl)?.value === "" && fixture.textContent?.includes(t.zenmuxHint), "ZenMux asks for an explicit working quota endpoint");
    }
    await select(t.template, "general"); await type(t.name, "Protocol Test"); await type(t.baseUrl, "https://api.example.com"); await type(t.apiKey, "ONLY-IN-NATIVE-CREDENTIALS");
    if (button(t.resetScript)) await click(button(t.resetScript));
    const script = () => fixture.querySelector<HTMLTextAreaElement>("textarea.api-balance-code")!;
    check(script().readOnly && script().value.includes("/user/balance"), "Built-in template shows a populated preview without changing native queries");
    await click(button(t.customizeScript));
    check(!script().readOnly && script().value.includes("extractor"), "Customize makes the populated template editable");
    await click(button(t.resetScript));
    check(script().readOnly, "Restore returns to the built-in query");
    await click(input(t.alertEnabled));
    await type(t.alertThreshold, "2.25"); await type(t.alertUnit, "USD");
    await click(button(t.test)); check(fixture.textContent?.includes(t.testPassed) && fixture.textContent.includes("12.5"), "Draft test displays wallet result");
    check(snapshot.accounts.length === 0, "Draft test does not save credentials or create an account");
    await click(button(t.save));
    check(snapshot.accounts.length === 1 && secrets.values().next().value?.apiKey === "ONLY-IN-NATIVE-CREDENTIALS", "Save sends credentials separately to native API");
    check(snapshot.accounts[0].account.alertThreshold === 2.25 && snapshot.accounts[0].account.alertUnit === "USD" && secrets.values().next().value?.code === "", "Decimal alert configuration saves separately from the native preview");
    check(!localStorage.getItem(BALANCE_METADATA_KEY)?.includes("ONLY-IN-NATIVE-CREDENTIALS"), "Metadata cache contains no API key");
    await click(fixture.querySelector<HTMLElement>("[role=switch]")); await click(button(t.refresh));
    check(fixture.textContent?.includes("125%") && fixture.querySelector("progress")?.value === 100, "Quota preserves overage label and clamps only progress bar");
    await click(button(t.edit)); check(input(t.apiKey)?.value === "" && input(t.apiKey)?.placeholder === t.stored, "Editing leaves the stored secret masked");
    await click(button(t.cancel));
    const imported = { format: "focusd-island-api-balance", version: 1, accounts: [{ account: { ...newAccount("old-id"), name: "Imported", baseUrl: "https://example.com", enabled: true }, secrets: { apiKey: "IMPORTED-SECRET" } }] };
    await upload(new File([JSON.stringify(imported)], "account.flyisland-balance.json", { type: "application/json" }));
    check(fixture.textContent?.includes(t.importPreview) && snapshot.accounts.length === 1, "File selection previews before changing native accounts");
    await click(button(`${t.confirmImport} (1)`));
    check(snapshot.accounts.length === 2 && !snapshot.accounts[1].account.enabled && snapshot.accounts[1].account.id !== "old-id", "Confirmed import gets a new ID and stays disabled");
    await upload(new File(["{}"], "wrong.plugin")); check(fixture.querySelector("[role=alert]")?.textContent === t.errors.unsupportedFormat, "Unsupported .plugin files show a localized format error");
    const failed: BalanceSnapshot = { ...snapshot, revision: ++snapshot.revision, accounts: snapshot.accounts.map((r, i) => i === 0 ? { ...r, error: "HTTP 429 Too Many Requests" } : r) };
    await act(async () => { await emit("api-balance-changed", failed); });
    check(fixture.textContent?.includes("HTTP 429") && fixture.textContent.includes("12.5"), "Failure event keeps the last successful balance visible");
    await act(async () => { await emit("api-balance-changed", { revision: 0, enabled: false, accounts: [] }); });
    check(fixture.textContent?.includes("HTTP 429") && fixture.textContent.includes("12.5"), "Older snapshot cannot overwrite a newer result or configuration");
    await click(button(t.remove)); check(snapshot.accounts.length === 2, "Delete requires confirmation");
    await click(button(t.confirmRemove)); check(snapshot.accounts.length === 1, "Confirmed delete removes the account");
    await upload(new File(['({request:{url:"{{baseUrl}}"},extractor:r=>({remaining:r.balance})})'], "custom.js"));
    check(fixture.textContent?.includes(t.importPreview), ".js imports through the same preview flow"); await click(button(t.cancel));
    check(fixture.scrollWidth <= fixture.clientWidth + 1, "Panel fits its narrow or regular settings column");
    check(calls.includes("test_api_balance") && calls.includes("refresh_api_balance"), "Test and saved refresh use their dedicated commands");
    await act(async () => root.render(<I18nProvider><CollapsedIslandSection settings={normalizeSettings({})} onSettingsChange={() => {}} /></I18nProvider>));
    check(fixture.textContent?.includes(TRANSLATIONS[locale].settings.appearance.collapsedIsland.items.balance.name), "API balance is available in the display priority reorder list");
    // Agent rows extend into the real island's side padding by 6px.
    Object.assign(fixture.style, { padding: "0 20px", boxSizing: "border-box", background: query.get("theme") === "light" ? "#f2f4f7" : "#2f2f37", borderRadius: "20px" });
    fixture.style.setProperty("--island-ink-rgb", query.get("theme") === "light" ? "30, 30, 40" : "241, 240, 246");
    const balanceState: BalanceSnapshot = { revision: 1, enabled: true, accounts: [
      { ...row({ ...newAccount("display-a"), name: "Example balance account with a very long name 测试账号", enabled: true }, { apiKey: "", accessToken: "", secretAccessKey: "", code: "" }), result,
        warning: { remaining: 12.5, unit: "USD", threshold: 15, triggeredAt: 1 } },
      { ...row({ ...newAccount("display-b"), name: "CNY account", enabled: true }, { apiKey: "", accessToken: "", secretAccessKey: "", code: "" }), result: { ...result, data: [{ ...result.data[0], unit: "CNY" }] } },
    ] };
    for (const scale of [1, 1.2]) {
      fixture.style.setProperty("--island-font-scale", String(scale));
      await act(async () => root.render(<I18nProvider><AgentSessionsPanel sessions={[]} hostDisplay="both" showUsage usages={{ claude: null, codex: null, dsh: null, dshProblem: "customProvider", readAt: 0 }} balanceSummary={<BalanceSummary accounts={balanceDisplays(balanceState)} />} /></I18nProvider>));
      const quota = fixture.querySelector<HTMLElement>(".agent-quota")!;
      const summary = fixture.querySelector<HTMLElement>(".balance-summary")!;
      const problem = fixture.querySelector<HTMLElement>(".agent-quota__agent--problem")!;
      const q = quota.getBoundingClientRect(), b = summary.getBoundingClientRect(), p = problem.getBoundingClientRect();
      check(Math.abs(b.right - q.right) < 2 && b.left > p.right && Math.abs((b.top + b.height / 2) - (p.top + p.height / 2)) < 2, `Account balance is at the right edge beside the third-party label (${scale})`);
      check(summary.textContent?.includes("12.5 USD") && summary.textContent.includes("+1") && summary.classList.contains("balance-summary--low"), `Summary displays account, amount, low state and additional account count (${scale})`);
      check(summary.getAttribute("aria-label")?.includes("CNY") && fixture.scrollWidth <= fixture.clientWidth + 1 && b.width > 70, `Long names and mixed currencies fit the narrow page with accessible full details (${scale})`);
    }
    fixture.style.removeProperty("--island-font-scale");
    document.documentElement.dataset.testResult = "passed";
  } catch (error) {
    messages.push(`FAIL ${String(error)}`); document.documentElement.dataset.testResult = "failed"; console.error(error);
  } finally {
    document.getElementById("results")!.textContent = messages.join("\n"); restore();
  }
}
void run();
