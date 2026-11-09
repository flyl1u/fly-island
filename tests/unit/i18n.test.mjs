import assert from "node:assert/strict";
import test from "node:test";
import { detectLocale, isLocaleCode, loadLocale, saveLocale, LOCALE_STORAGE_KEY, TRANSLATIONS } from "../../src/i18n/index.ts";
import { messagePreviewText } from "../../src/features/messages/messagePreview.ts";
import { getCollapsedTextUnits, getTodoTitleLineCount, getTodoTitleVisualLength } from "../../src/utils/text.ts";

test("locale detection respects language preference order and regional tags", () => {
  assert.equal(detectLocale(["en-US", "zh-CN"]), "en");
  assert.equal(detectLocale(["zh-Hant-TW", "en-GB"]), "zh-CN");
  assert.equal(detectLocale(["fr-FR", "EN-gb"]), "en");
  assert.equal(detectLocale(["ZH-cn"]), "zh-CN");
  assert.equal(detectLocale(["de-DE"]), "zh-CN");
  assert.equal(detectLocale([]), "zh-CN");
});

test("stored locale validation rejects prototype keys and malformed values", () => {
  for (const value of ["constructor", "toString", "__proto__", "en-US", "", null, {}, 1]) {
    assert.equal(isLocaleCode(value), false, String(value));
  }
  assert.equal(isLocaleCode("en"), true);
  assert.equal(isLocaleCode("zh-CN"), true);
});

test("saved preferences override the system while unavailable storage falls back safely", () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const values = new Map([[LOCALE_STORAGE_KEY, "en"]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { languages: ["zh-CN"], language: "zh-CN" } });
  try {
    assert.equal(loadLocale(), "en");
    saveLocale("zh-CN");
    assert.equal(values.get(LOCALE_STORAGE_KEY), "zh-CN");
    values.set(LOCALE_STORAGE_KEY, "constructor");
    assert.equal(loadLocale(), "zh-CN");
    Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage blocked"); } });
    assert.equal(loadLocale(), "zh-CN");
    assert.doesNotThrow(() => saveLocale("en"));
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else delete globalThis.window;
    Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
  }
});

test("both dictionaries have complete, nonempty copy including new panels", () => {
  function entries(value, prefix = "") {
    return Object.entries(value).flatMap(([key, item]) => typeof item === "object"
      ? entries(item, `${prefix}${key}.`)
      : [[`${prefix}${key}`, item]]);
  }
  const zh = entries(TRANSLATIONS["zh-CN"]);
  const en = entries(TRANSLATIONS.en);
  assert.deepEqual(zh.map(([key]) => key), en.map(([key]) => key));
  for (const [key, value] of [...zh, ...en]) {
    assert.ok(typeof value === "function" || typeof value === "string" && value.trim(), key);
  }
  assert.equal(TRANSLATIONS.en.island.pendingTodos(1), "1 todo left");
  assert.equal(TRANSLATIONS.en.island.pendingTodos(2), "2 todos left");
  assert.equal(TRANSLATIONS.en.mail.readMessage("用户内容", true), "Read email: 用户内容, unread");
});

test("message fallbacks follow the interface language and preserve user content", () => {
  const empty = { title: " ", body: " ", receivedAt: 0 };
  assert.equal(messagePreviewText({ ...empty, source: "wechat" }, TRANSLATIONS.en.messages), "You received a message");
  assert.equal(messagePreviewText({ ...empty, source: "qqMail" }, TRANSLATIONS.en.messages), "New email");
  assert.equal(messagePreviewText({ ...empty, source: "qq" }, TRANSLATIONS.en.messages), "QQ: New message");
  assert.equal(messagePreviewText({ ...empty, source: "qqMail", body: " 项目周报 " }, TRANSLATIONS.en.messages), "项目周报");
});

test("narrow scripts do not inflate island sizing and wide scripts still wrap", () => {
  assert.equal(getTodoTitleVisualLength("Привет"), 6);
  assert.equal(getTodoTitleVisualLength("Ελλάδα"), 6);
  assert.equal(getTodoTitleVisualLength("待办"), 3.2);
  assert.equal(getTodoTitleLineCount("я".repeat(32)), 1);
  assert.equal(getTodoTitleLineCount("文".repeat(21)), 2);
  assert.equal(getTodoTitleLineCount("x".repeat(1000)), 5);
  assert.equal(getTodoTitleLineCount(""), 1);
  assert.equal(getCollapsedTextUnits("Привет"), getCollapsedTextUnits("abcdef"));
  assert.equal(getCollapsedTextUnits("文😀"), 2);
});
