import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  normalizeTranslationSettings,
  requestTranslationHandoffOpen,
  saveTranslationHandoff,
  takeTranslationHandoff,
} from "../../src/features/translation/storage.ts";

test("settings saved before providers existed keep DeepSeek and their shortcut and direction", () => {
  assert.deepEqual(normalizeTranslationSettings({ shortcut: "Ctrl+Q", direction: "en-zh" }), {
    shortcut: "Ctrl+Q",
    direction: "en-zh",
    provider: "deepseek",
    customBaseUrl: "",
    models: {},
    selectionShortcut: "Ctrl+Alt+T",
    pasteClipboardOnOpen: true,
    autoTranslate: false,
  });
  assert.deepEqual(normalizeTranslationSettings(null), DEFAULT_SETTINGS);
  assert.equal(normalizeTranslationSettings({ shortcut: "Alt+Space" }).shortcut, "Ctrl+Shift+F");
  assert.equal(normalizeTranslationSettings({ shortcut: "Alt+C" }).shortcut, "Ctrl+Shift+F");
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
  assert.equal(normalizeTranslationSettings({ provider: "siliconflow" }).provider, "siliconflow");
  assert.deepEqual(normalizeTranslationSettings({ models: "x" }).models, {});
});

test("clipboard fill stays on and auto-translate stays off unless switched", () => {
  const settings = normalizeTranslationSettings({ pasteClipboardOnOpen: false, autoTranslate: true, selectionShortcut: "" });
  assert.equal(settings.pasteClipboardOnOpen, false);
  assert.equal(settings.autoTranslate, true);
  assert.equal(settings.selectionShortcut, "Ctrl+Alt+T");
  assert.equal(normalizeTranslationSettings({ autoTranslate: "yes" }).autoTranslate, false);
});

test("the window takes a quick result only right after the island asked to open it", () => {
  const values = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) },
  });
  try {
    saveTranslationHandoff("hello", "你好");
    assert.equal(takeTranslationHandoff(), null, "an ordinary open stays blank");
    requestTranslationHandoffOpen();
    const now = Date.now();
    assert.equal(takeTranslationHandoff(now + 6_000), null, "a stale open request is ignored");
    requestTranslationHandoffOpen();
    assert.deepEqual(takeTranslationHandoff(), { source: "hello", output: "你好" });
    assert.equal(takeTranslationHandoff(), null, "it is consumed once");
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});
