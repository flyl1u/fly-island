import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, normalizeTranslationSettings } from "../src/features/translation/storage.ts";

test("settings saved before providers existed keep DeepSeek and their shortcut and direction", () => {
  assert.deepEqual(normalizeTranslationSettings({ shortcut: "Ctrl+Q", direction: "en-zh" }), {
    shortcut: "Ctrl+Q",
    direction: "en-zh",
    provider: "deepseek",
    customBaseUrl: "",
    models: {},
  });
  assert.deepEqual(normalizeTranslationSettings(null), DEFAULT_SETTINGS);
  assert.equal(normalizeTranslationSettings({ shortcut: "Alt+Space" }).shortcut, "Alt+C");
});

test("provider, custom base URL and per-provider models are kept when valid", () => {
  const settings = normalizeTranslationSettings({
    provider: "custom",
    customBaseUrl: "http://localhost:11434/v1",
    models: { custom: "qwen3:8b", volcengine: "ep-123", baidu: "x", openai: 4 },
  });
  assert.equal(settings.provider, "custom");
  assert.equal(settings.customBaseUrl, "http://localhost:11434/v1");
  assert.deepEqual(settings.models, { custom: "qwen3:8b", volcengine: "ep-123" });
  assert.equal(normalizeTranslationSettings({ provider: "baidu" }).provider, "deepseek");
  assert.deepEqual(normalizeTranslationSettings({ models: "x" }).models, {});
});
