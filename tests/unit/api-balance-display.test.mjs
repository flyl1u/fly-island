import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { balanceDisplays, takeBalanceAlerts } from "../../src/features/api-balance/balanceDisplay.ts";
import { builtinBalanceScript } from "../../src/features/api-balance/scriptPresets.ts";
import { newAccount } from "../../src/features/api-balance/types.ts";
import { parseBalanceImport } from "../../src/features/api-balance/importExport.ts";
import { normalizeSettings } from "../../src/features/appearance/settings.ts";
import { pickCollapsedItem } from "../../src/windows/island/collapsedItem.ts";

const warning = { remaining: 1, threshold: 5, unit: "USD", triggeredAt: 100 };
const row = (id, unit = "USD") => ({ account: { ...newAccount(id), name: id, enabled: true },
  result: { data: [{ remaining: 1, unit }], tiers: [] }, warning: null, error: null });
const snapshot = accounts => ({ revision: 1, enabled: true, accounts });

test("balance displays keep currencies and accounts separate; prioritize low balances", () => {
  const a = row("normal", "CNY"), b = { ...row("low"), warning }, c = row("disabled");
  c.account.enabled = false;
  const displayed = balanceDisplays(snapshot([a, b, c]));
  assert.deepEqual(displayed.map(r => r.name), ["low", "normal"]);
  assert.deepEqual(displayed.map(r => r.amount), ["1 USD", "1 CNY"]);
  assert.deepEqual(balanceDisplays({ ...snapshot([a]), enabled: false }), []);
  assert.equal(balanceDisplays(snapshot([{ ...a, error: "HTTP 429" }]))[0].stale, true);
});

test("native alert consumption handles duplicates, recovery, failures and disabled state", () => {
  const seen = new Map(), a = { ...row("account"), warning };
  assert.equal(takeBalanceAlerts(seen, snapshot([a])).length, 1);
  assert.equal(takeBalanceAlerts(seen, snapshot([a])).length, 0);
  assert.equal(takeBalanceAlerts(seen, snapshot([{ ...a, error: "HTTP 500" }])).length, 0);
  takeBalanceAlerts(seen, snapshot([{ ...a, warning: null }]));
  assert.equal(takeBalanceAlerts(seen, snapshot([{ ...a, warning: { ...warning, triggeredAt: 200 } }])).length, 1);
  assert.deepEqual(takeBalanceAlerts(new Map(), { ...snapshot([a]), enabled: false }), []);
  assert.deepEqual(takeBalanceAlerts(new Map(), snapshot([{ ...a, account: { ...a.account, enabled: false } }])), []);
});

test("old priority orders append balance, and the new rank participates in content selection", () => {
  assert.deepEqual(normalizeSettings({ collapsedPriority: ["todo", "agent", "lyrics"] }).collapsedPriority, ["todo", "agent", "lyrics", "balance", "clock"]);
  const has = { agent: true, lyrics: true, todo: true, balance: true };
  assert.equal(pickCollapsedItem(["balance", "agent", "lyrics", "todo"], has), "balance");
  assert.equal(pickCollapsedItem(["balance", "agent", "lyrics", "todo"], { ...has, balance: false }), "agent");
});

test("alert settings survive native import shape; older imports default alerts off", () => {
  const account = { ...newAccount("old"), name: "A", baseUrl: "https://example.com" };
  const parse = a => parseBalanceImport(JSON.stringify({ account: a }), "a.json", () => "new")[0].account;
  assert.equal(parse(account).alertThreshold, null);
  assert.equal(parse({ ...account, alertThreshold: 2.25, alertUnit: "CNY" }).alertThreshold, 2.25);
  assert.throws(() => parse({ ...account, alertThreshold: -1 }), /invalidAlert/);
});

test("visible basic scripts use correct endpoints, credentials and quota conversion", () => {
  const read = template => vm.runInNewContext(builtinBalanceScript({ ...newAccount("x"), template }).replaceAll("{{baseUrl}}", "https://example.com/v1").replaceAll("{{apiKey}}", "inference").replaceAll("{{accessToken}}", "dashboard").replaceAll("{{userId}}", "42"));
  const general = read("general"), newapi = read("newapi"), sub = read("sub2api");
  assert.equal(general.request.url, "https://example.com/v1/user/balance");
  assert.equal(general.extractor({ balance: "10.6799" }).remaining, 10.6799);
  for (const balance of ["", " ", "0x10", null, false]) assert.equal(general.extractor({ balance }).remaining, null);
  assert.equal(newapi.request.url, "https://example.com/api/user/self");
  assert.equal(newapi.request.headers.Authorization, "Bearer dashboard");
  assert.equal(newapi.request.headers["New-Api-User"], "42");
  assert.equal(newapi.extractor({ data: { quota: 1000000, used_quota: 500000 } }).total, 3);
  assert.equal(sub.request.url, "https://example.com/v1/usage");
  assert.equal(sub.extractor({ remaining: -1 }).unlimited, true);
  assert.equal(sub.extractor({ remaining: 0 }).remaining, 0);
  assert.throws(() => general.extractor({ success: false, balance: 99 }));
});
