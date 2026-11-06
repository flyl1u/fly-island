import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  MAX_CUSTOM_SETTING_PRESETS,
  hexToRgba,
  isDefaultSettingPreset,
  isSameSettings,
  mergeWithDefaultSettingPresets,
  normalizeSettings,
  withAppearanceFrom,
} from "../../src/features/appearance/settings.ts";
import {
  COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY,
  SETTINGS_PRESETS_STORAGE_KEY,
  STORAGE_KEY,
  loadSettingPresets,
  loadSettings,
} from "../../src/features/appearance/storage.ts";

function withStorage(entries, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map(entries);
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, crypto: globalThis.crypto } });
  try {
    run(values);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
  }
}

const t = { settings: { presets: { defaultName: (n) => `Preset ${n}` } } };

test("hex colors convert to rgba and invalid input falls back to the pulse color", () => {
  assert.equal(hexToRgba("#2F2F37", 0.5), "rgba(47, 47, 55, 0.5)");
  assert.equal(hexToRgba("nope", 1), "rgba(58, 228, 137, 1)");
});

test("settings are clamped and legacy fields are migrated", () => {
  const normalized = normalizeSettings({
    opacity: 10,
    glassIntensity: 999,
    margin: 40,
    sizeScale: 1.2,
    taskTitleColor: "#123456",
    appearanceMode: "neon",
    fontFamily: "pixel",
    todoRotationSeconds: 0.2,
  });
  assert.equal(normalized.opacity, 50);
  assert.equal(normalized.glassIntensity, 100);
  assert.equal(normalized.marginY, 40);
  assert.equal(normalized.collapsedScale, 1.2);
  assert.equal(normalized.expandedScale, 1.2);
  assert.equal(normalized.taskTextColor, "#123456");
  assert.equal(normalized.appearanceMode, "classic");
  assert.equal(normalized.fontFamily, "pixel");
  assert.equal(normalized.todoRotationSeconds, 1);
  assert.equal(normalized.topEdgeLayoutVersion, 1);
});

test("the top fillet radius is rounded, clamped, and defaults for older settings", () => {
  assert.equal(normalizeSettings({}).topFilletRadius, 8);
  assert.equal(normalizeSettings({ topFilletRadius: "10" }).topFilletRadius, 8);
  assert.equal(normalizeSettings({ topFilletRadius: Number.NaN }).topFilletRadius, 8);
  assert.equal(normalizeSettings({ topFilletRadius: 5.6 }).topFilletRadius, 6);
  assert.equal(normalizeSettings({ topFilletRadius: 0 }).topFilletRadius, 0);
  assert.equal(normalizeSettings({ topFilletRadius: -3 }).topFilletRadius, 0);
  assert.equal(normalizeSettings({ topFilletRadius: 40 }).topFilletRadius, 12);
});

test("the island corner radius is rounded, clamped, and defaults to 30 for older settings", () => {
  assert.equal(normalizeSettings({}).islandCornerRadius, 30);
  assert.equal(normalizeSettings({ islandCornerRadius: "20" }).islandCornerRadius, 30);
  assert.equal(normalizeSettings({ islandCornerRadius: Number.POSITIVE_INFINITY }).islandCornerRadius, 30);
  assert.equal(normalizeSettings({ islandCornerRadius: 24.4 }).islandCornerRadius, 24);
  assert.equal(normalizeSettings({ islandCornerRadius: 2 }).islandCornerRadius, 16);
  assert.equal(normalizeSettings({ islandCornerRadius: 99 }).islandCornerRadius, 40);
});

test("session starts alert every turn unless new sessions only or off was chosen", () => {
  assert.equal(DEFAULT_SETTINGS.agentAlertStarted, "everyTurn");
  assert.equal(normalizeSettings({}).agentAlertStarted, "everyTurn");
  assert.equal(normalizeSettings({ agentAlertStarted: "newSession" }).agentAlertStarted, "newSession");
  assert.equal(normalizeSettings({ agentAlertStarted: "off" }).agentAlertStarted, "off");
  assert.equal(normalizeSettings({ agentAlertStarted: true }).agentAlertStarted, "everyTurn");
});

test("the island corner shape is squircle unless round was chosen, older settings included", () => {
  assert.equal(DEFAULT_SETTINGS.islandMonitor, "primary");
  assert.equal(normalizeSettings({}).islandMonitor, "primary");
  assert.equal(normalizeSettings({ islandMonitor: "cursor" }).islandMonitor, "cursor");
  assert.equal(normalizeSettings({ islandMonitor: "foreground" }).islandMonitor, "foreground");
  assert.equal(normalizeSettings({ islandMonitor: "all" }).islandMonitor, "primary");
  assert.equal(DEFAULT_SETTINGS.islandCornerShape, "squircle");
  assert.equal(normalizeSettings({}).islandCornerShape, "squircle");
  assert.equal(normalizeSettings({ islandCornerShape: "round" }).islandCornerShape, "round");
  assert.equal(normalizeSettings({ islandCornerShape: "bevel" }).islandCornerShape, "squircle");
});

test("expand trigger, hover delays and max panel height default for older settings and stay in range", () => {
  const older = normalizeSettings({});
  assert.equal(older.expandTrigger, "click");
  assert.equal(older.hoverExpandDelayMs, 300);
  assert.equal(older.maxPanelHeight, 490);
  assert.equal(normalizeSettings({ expandTrigger: "hover" }).expandTrigger, "hover");
  assert.equal(normalizeSettings({ expandTrigger: "doubleClick" }).expandTrigger, "click");
  assert.equal(normalizeSettings({ hoverExpandDelayMs: -50 }).hoverExpandDelayMs, 0);
  assert.equal(normalizeSettings({ hoverExpandDelayMs: 5_000 }).hoverExpandDelayMs, 1_000);
  assert.equal(normalizeSettings({ hoverExpandDelayMs: "600" }).hoverExpandDelayMs, 300);
  assert.equal(older.hoverCollapseDelayMs, 400);
  assert.equal(older.revealOnMessage, true);
  assert.equal(normalizeSettings({ revealOnMessage: false }).revealOnMessage, false);
  assert.equal(normalizeSettings({ revealOnMessage: "no" }).revealOnMessage, true);
  assert.equal(older.autoTuckRetract, true);
  assert.equal(older.autoTuckRetractDelayMs, 500);
  assert.equal(normalizeSettings({ autoTuckRetract: false }).autoTuckRetract, false);
  assert.equal(normalizeSettings({ autoTuckRetractDelayMs: 9_000 }).autoTuckRetractDelayMs, 3_000);
  assert.equal(normalizeSettings({ autoTuckRetractDelayMs: -1 }).autoTuckRetractDelayMs, 0);
  assert.equal(normalizeSettings({ hoverCollapseDelayMs: 9_000 }).hoverCollapseDelayMs, 2_000);
  assert.equal(normalizeSettings({ hoverCollapseDelayMs: 0 }).hoverCollapseDelayMs, 0);
  assert.equal(normalizeSettings({ maxPanelHeight: 100 }).maxPanelHeight, 306);
  assert.equal(normalizeSettings({ maxPanelHeight: 999 }).maxPanelHeight, 546);
  assert.equal(normalizeSettings({ maxPanelHeight: 400.6 }).maxPanelHeight, 401);
  assert.equal(older.minimizeAction, "tray");
  assert.equal(older.tuckedHoverAction, "reveal", "settings saved before the option only slide out, as before");
  assert.equal(normalizeSettings({ tuckedHoverAction: "expand" }).tuckedHoverAction, "expand");
  assert.equal(normalizeSettings({ tuckedHoverAction: "panel" }).tuckedHoverAction, "reveal");
  assert.equal(older.pageDigitModifiers, "Alt");
  assert.equal(older.pageNextShortcut, "Ctrl+Tab");
  assert.equal(older.pagePreviousShortcut, "Ctrl+Shift+Tab");
  assert.equal(normalizeSettings({ pageDigitModifiers: "ctrl+shift" }).pageDigitModifiers, "Ctrl+Shift");
  assert.equal(normalizeSettings({ pageDigitModifiers: "Win+1" }).pageDigitModifiers, "Alt");
  assert.equal(normalizeSettings({ pageNextShortcut: "Alt+Tab" }).pageNextShortcut, "Ctrl+Tab");
  assert.equal(normalizeSettings({ pagePreviousShortcut: "alt+q" }).pagePreviousShortcut, "Alt+Q");
  assert.equal(normalizeSettings({ minimizeAction: "tuck" }).minimizeAction, "tuck");
  assert.equal(normalizeSettings({ minimizeAction: "hide" }).minimizeAction, "tray");
  for (const key of ["todoEnabled", "musicEnabled", "agentStatusEnabled", "mailEnabled", "shelfEnabled", "shelfExpandOnDrop", "translationEnabled"]) {
    assert.equal(older[key], true, key);
    assert.equal(normalizeSettings({ [key]: false })[key], false, key);
    assert.equal(normalizeSettings({ [key]: "no" })[key], true, key);
  }
});

test("old default margins and scales move to the current defaults", () => {
  assert.equal(normalizeSettings({ marginY: 31 }).marginY, DEFAULT_SETTINGS.marginY);
  assert.equal(normalizeSettings({ marginY: 31, topEdgeLayoutVersion: 1 }).marginY, 31);
  const scaled = normalizeSettings({ collapsedScale: 0.81, expandedScale: 0.88 });
  assert.equal(scaled.collapsedScale, 0.82);
  assert.equal(scaled.expandedScale, 1.05);
});

test("normalizing saved settings keeps the first-launch defaults", () => {
  assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  assert.equal(isSameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS }), true);
  assert.equal(isSameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, opacity: 60 }), false);
});

test("first launch uses the maintainer's layout, while saved settings missing a field keep older behavior", () => {
  assert.equal(DEFAULT_SETTINGS.appearanceMode, "classic");
  assert.equal(DEFAULT_SETTINGS.islandBackgroundColor, "#030303");
  assert.equal(DEFAULT_SETTINGS.islandCornerRadius, 16);
  assert.equal(DEFAULT_SETTINGS.collapsedScale, 1);
  assert.equal(DEFAULT_SETTINGS.expandedScale, 1);
  // Saved settings keep their own scale and radius; only a missing radius falls back.
  assert.equal(normalizeSettings({ collapsedScale: 0.96, expandedScale: 1.05, islandCornerRadius: 16 }).expandedScale, 1.05);
  assert.equal(normalizeSettings({ collapsedScale: 0.96, expandedScale: 1.05, islandCornerRadius: 16 }).islandCornerRadius, 16);
  assert.equal(DEFAULT_SETTINGS.expandTrigger, "hover");
  assert.equal(DEFAULT_SETTINGS.autoTuck, true);
  assert.equal(DEFAULT_SETTINGS.minimizeAction, "tuck");
  assert.equal(DEFAULT_SETTINGS.translationTarget, "island");
  assert.equal(DEFAULT_SETTINGS.clipboardVisibleRows, 6);

  const older = normalizeSettings({ opacity: 95 });
  assert.equal(older.expandTrigger, "click");
  assert.equal(older.autoTuck, false);
  assert.equal(older.minimizeAction, "tray");
  assert.equal(older.translationTarget, "window");
  assert.equal(older.shelfShowCount, false);
  assert.equal(older.clipboardVisibleRows, 3);
  assert.equal(older.agentVisibleRows, 3);
  assert.equal(older.hoverCollapseDelayMs, 400);
});

test("legacy default presets are dropped and custom presets are capped", () => {
  const preset = (id, name) => ({ id, name, settings: DEFAULT_SETTINGS, createdAt: 1 });
  const merged = mergeWithDefaultSettingPresets([
    preset("default-white", "White"),
    preset("x", " 卡其 "),
    ...Array.from({ length: 8 }, (_, i) => preset(`p${i}`, `P${i}`)),
  ]);
  assert.equal(merged.length, MAX_CUSTOM_SETTING_PRESETS);
  assert.deepEqual(merged.map((p) => p.id), ["p0", "p1", "p2", "p3", "p4", "p5"]);
  assert.ok(merged.every((p) => p.isDefault === false));
  assert.equal(isDefaultSettingPreset("default-khaki"), true);
  assert.equal(isDefaultSettingPreset("p0"), false);
});

test("first launch stores the collapsed-text migration marker and uses defaults", () => {
  withStorage([], (values) => {
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
    assert.equal(values.get(COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY), "1");
  });
});

test("existing settings get collapsed text turned on once by the migration", () => {
  withStorage([[STORAGE_KEY, JSON.stringify({ showCollapsedText: false, opacity: 80 })]], (values) => {
    const migrated = loadSettings();
    assert.equal(migrated.showCollapsedText, true);
    assert.equal(migrated.opacity, 80);
    assert.equal(values.get(COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY), "1");
    assert.equal(JSON.parse(values.get(STORAGE_KEY)).showCollapsedText, true);
  });
  withStorage([[STORAGE_KEY, JSON.stringify({ showCollapsedText: false })], [COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY, "1"]], () => {
    assert.equal(loadSettings().showCollapsedText, false);
  });
  withStorage([[STORAGE_KEY, "{broken"]], () => {
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
  });
});

test("stored presets are normalized with fallback names", () => {
  const stored = [{ id: "a", name: "  Mine  ", settings: { opacity: 1 }, createdAt: 5 }, { name: "" }, { id: "default-white", name: "x" }];
  withStorage([[SETTINGS_PRESETS_STORAGE_KEY, JSON.stringify(stored)]], () => {
    const presets = loadSettingPresets(t);
    assert.equal(presets.length, 2);
    assert.equal(presets[0].name, "Mine");
    assert.equal(presets[0].settings.opacity, 50);
    assert.equal(presets[1].name, "Preset 2");
    assert.equal(typeof presets[1].id, "string");
  });
  withStorage([[SETTINGS_PRESETS_STORAGE_KEY, "{}"]], () => assert.deepEqual(loadSettingPresets(t), []));
});

test("taking the appearance from other settings keeps todo and tuck behavior", () => {
  const current = {
    ...DEFAULT_SETTINGS,
    opacity: 60,
    pulseColor: "#123456",
    showTitle: true,
    carryOverIncompleteTodos: true,
    rotateTodos: true,
    todoRotationSeconds: 12,
    autoTuck: true,
    autoTuckSeconds: 90,
    marginY: 48,
    showIdleTodoCount: false,
  };
  const next = withAppearanceFrom(current, DEFAULT_SETTINGS);

  assert.equal(next.opacity, DEFAULT_SETTINGS.opacity);
  assert.equal(next.pulseColor, DEFAULT_SETTINGS.pulseColor);
  assert.equal(next.showTitle, DEFAULT_SETTINGS.showTitle);
  assert.equal(next.carryOverIncompleteTodos, true);
  assert.equal(next.rotateTodos, true);
  assert.equal(next.todoRotationSeconds, 12);
  assert.equal(next.autoTuck, true);
  assert.equal(next.autoTuckSeconds, 90);
  // Shown on the general and todos pages, so presets and Reset appearance leave them.
  assert.equal(next.marginY, 48);
  assert.equal(next.showIdleTodoCount, false);
  assert.deepEqual(withAppearanceFrom(DEFAULT_SETTINGS, DEFAULT_SETTINGS), DEFAULT_SETTINGS);
});

test("clipboard visible rows default to three for older settings and stay in range", () => {
  assert.equal(normalizeSettings({}).clipboardVisibleRows, 3);
  assert.equal(normalizeSettings({ clipboardVisibleRows: 1 }).clipboardVisibleRows, 2);
  assert.equal(normalizeSettings({ clipboardVisibleRows: 9 }).clipboardVisibleRows, 6);
  assert.equal(normalizeSettings({ clipboardVisibleRows: 4.4 }).clipboardVisibleRows, 4);
  assert.equal(normalizeSettings({ clipboardVisibleRows: "5" }).clipboardVisibleRows, 3);
});

test("file shelf settings default for older settings and only take known values", () => {
  const older = normalizeSettings({});
  assert.equal(older.shelfAutoCleanupDays, 0);
  assert.equal(older.shelfRemoveMissing, false);
  assert.equal(older.shelfRemoveAfterDragOut, false);
  assert.equal(older.shelfMaxItems, 100);
  assert.equal(older.shelfDoubleClick, "open");
  assert.equal(older.shelfShowCount, false);
  assert.equal(normalizeSettings({ shelfAutoCleanupDays: 7 }).shelfAutoCleanupDays, 7);
  assert.equal(normalizeSettings({ shelfAutoCleanupDays: 3 }).shelfAutoCleanupDays, 0);
  assert.equal(normalizeSettings({ shelfAutoCleanupDays: "7" }).shelfAutoCleanupDays, 0);
  assert.equal(normalizeSettings({ shelfMaxItems: 5 }).shelfMaxItems, 20);
  assert.equal(normalizeSettings({ shelfMaxItems: 999 }).shelfMaxItems, 200);
  assert.equal(normalizeSettings({ shelfDoubleClick: "reveal" }).shelfDoubleClick, "reveal");
  assert.equal(normalizeSettings({ shelfDoubleClick: "delete" }).shelfDoubleClick, "open");
  assert.equal(normalizeSettings({ shelfRemoveMissing: true, shelfShowCount: true }).shelfShowCount, true);
});

test("game mode keeps quiet by default and tucks only when asked", () => {
  const older = normalizeSettings({});
  assert.equal(older.gameDoNotDisturb, true);
  assert.equal(older.gameAutoTuck, false);
  assert.equal(normalizeSettings({ gameDoNotDisturb: false }).gameDoNotDisturb, false);
  assert.equal(normalizeSettings({ gameAutoTuck: true }).gameAutoTuck, true);
  assert.equal(normalizeSettings({ gameAutoTuck: "yes" }).gameAutoTuck, false);
});

test("translation opens in its window unless the island page was chosen", () => {
  assert.equal(normalizeSettings({}).translationTarget, "window");
  assert.equal(normalizeSettings({ translationTarget: "island" }).translationTarget, "island");
  assert.equal(normalizeSettings({ translationTarget: "page" }).translationTarget, "window");
});
