import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { exportBalanceAccounts, parseBalanceImport, validateAccount } from "../../src/features/api-balance/importExport.ts";
import { detectPlanProvider } from "../../src/features/api-balance/presets.ts";
import { newAccount, PLAN_PROVIDERS, TEMPLATES } from "../../src/features/api-balance/types.ts";

const makeId = (() => { let n = 0; return () => `test-${++n}`; })();
const account = (overrides = {}) => ({ ...newAccount("saved-id"), name: "Example", baseUrl: "https://api.example.com", ...overrides });
const parse = value => parseBalanceImport(JSON.stringify(value), "balance.json", makeId);

test("native versioned configuration imports paused with new IDs and separate credentials", () => {
  const [entry] = parse({ format: "focusd-island-api-balance", version: 1, accounts: [{ account: account({ enabled: true }), secrets: { apiKey: "fictional-key" } }] });
  assert.equal(entry.account.enabled, false);
  assert.notEqual(entry.account.id, "saved-id");
  assert.equal(entry.secrets.apiKey, "fictional-key");
  assert.equal("apiKey" in entry.account, false);
});

test("cc-switch provider metadata and NewAPI additional fields import", () => {
  const [entry] = parse({ name: "NewAPI", settingsConfig: { env: { ANTHROPIC_BASE_URL: "https://new.example.com", ANTHROPIC_AUTH_TOKEN: "fictional-key" } }, meta: { usage_script: { templateType: "new_api", accessToken: "fictional-token", userId: "42", timeout: 15, autoQueryInterval: 0 } } });
  assert.equal(entry.account.template, "newapi"); assert.equal(entry.account.userId, "42");
  assert.equal(entry.account.timeoutSeconds, 15); assert.equal(entry.account.intervalMinutes, 0);
  assert.equal(entry.secrets.accessToken, "fictional-token");
});

test("provider collections, coding plans and Codex TOML base_url are recognized", () => {
  const entries = parse({ providers: { claude: { providers: { a: { name: "Team", settingsConfig: { env: { ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic" } }, meta: { usage_script: { templateType: "token_plan", codingPlanProvider: "zhipu_team", teamOrganizationId: "org", teamProjectId: "proj" } } } } }, codex: { b: { name: "Go", settingsConfig: { config: '[model_providers.test]\nbase_url = "https://opencode.ai/zen/go/v1"', auth: { OPENAI_API_KEY: "fictional" } } } } } });
  assert.equal(entries.length, 2); assert.equal(entries[0].account.provider, "zhipu_team");
  assert.equal(entries[0].account.organizationId, "org"); assert.equal(entries[0].account.projectId, "proj");
  assert.equal(entries[1].account.provider, "opencode_go"); assert.equal(entries[1].account.template, "token_plan");
});

test("custom scripts are preserved as text and never run during import", () => {
  const code = '({request:{url:"{{baseUrl}}/balance"},extractor:function(r){return {remaining:r.balance};}})';
  const [entry] = parseBalanceImport(code, "my-balance.js", makeId);
  assert.equal(entry.account.template, "custom"); assert.equal(entry.secrets.code, code);
  const [jsonEntry] = parse({ name: "Custom", code, templateType: "custom" });
  assert.equal(jsonEntry.secrets.code, code);
  assert.equal(parseBalanceImport('throw new Error("must-not-run")', "test.js", makeId)[0].secrets.code, 'throw new Error("must-not-run")');
});

test("invalid files, unsupported versions, OAuth templates and unsafe endpoints fail", () => {
  for (const [value, filename] of [["not json", "a.json"], ["{}", "a.plugin"], ["SELECT 1", "a.sql"], ["{}", "a.zip"]]) assert.throws(() => parseBalanceImport(value, filename, makeId));
  assert.throws(() => parse({ format: "focusd-island-api-balance", version: 2, accounts: [account()] }));
  assert.throws(() => parse(account({ template: "official_subscription" })));
  assert.throws(() => parse(account({ template: "token_plan", provider: "unknown" })));
  for (const baseUrl of ["http://remote.example.com", "file:///C:/data", "https://user:secret@example.com"]) assert.throws(() => parse(account({ baseUrl })));
  assert.doesNotThrow(() => parse(account({ baseUrl: "http://127.0.0.1:1234" })));
  assert.throws(() => parse([])); assert.throws(() => parse(Array.from({ length: 51 }, () => account())));
  assert.throws(() => parseBalanceImport("x".repeat(1024 * 1024 + 1), "a.js", makeId));
});

test("default export omits keys and scripts, and explicitly included scripts round-trip", () => {
  const state = { account: account({ enabled: true }), apiKey: "MUST-NOT-EXPORT", code: "MUST-NOT-EXPORT", hasCredentials: true };
  const exported = exportBalanceAccounts([state]);
  assert.equal(exported.includes("MUST-NOT-EXPORT"), false);
  assert.equal(parseBalanceImport(exported, "a.json", makeId)[0].account.enabled, false);
  const script = '({request:{url:"https://example.com"},extractor:r=>({remaining:1})})';
  assert.equal(parseBalanceImport(exportBalanceAccounts([state], new Map([[state.account.id, script]])), "a.json", makeId)[0].secrets.code, script);
});

test("provider detection uses exact hosts and does not match lookalikes", () => {
  for (const baseUrl of ["https://api.kimi.com.evil.test/coding/v1", "https://open.bigmodel.cn.evil.test", "https://example.com/?url=https://api.kimi.com/coding"]) assert.equal(detectPlanProvider(baseUrl), undefined);
  assert.equal(detectPlanProvider("https://api.kimi.ai/coding/v1"), "kimi");
  assert.equal(detectPlanProvider("https://opencode.ai/inference/go/anthropic"), "opencode_go");
  assert.equal(detectPlanProvider("https://opencode.ai/zen/v1"), undefined);
  assert.throws(() => validateAccount(account({ timeoutSeconds: 0 })));
  assert.throws(() => validateAccount(account({ quotaPerUnit: NaN })));
});

test("shipped example imports every requested template and Token Plan provider", () => {
  const path = new URL("../../examples/api-balance/all-presets.flyisland-balance.json", import.meta.url);
  const entries = parseBalanceImport(readFileSync(path, "utf8"), "all-presets.flyisland-balance.json", makeId);
  assert.deepEqual([...new Set(entries.map(e => e.account.template))].sort(), [...TEMPLATES].sort());
  assert.deepEqual([...new Set(entries.filter(e => e.account.template === "token_plan").map(e => e.account.provider))].sort(), [...PLAN_PROVIDERS].sort());
  assert.ok(entries.every(e => !e.account.enabled && !e.secrets.apiKey && !e.secrets.accessToken && !e.secrets.secretAccessKey));
});
