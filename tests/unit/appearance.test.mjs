import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  hexToRgba,
  isSameSettings,
  normalizeSettings,
  withAppearanceFrom,
} from "../../src/features/appearance/settings.ts";
import {
  COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY,
  STORAGE_KEY,
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


test("hex colors convert to rgba and invalid input falls back to the pulse color", () => {
  assert.equal(hexToRgba("#2F2F37", 0.5), "rgba(47, 47, 55, 0.5)");
  assert.equal(hexToRgba("nope", 1), "rgba(58, 228, 137, 1)");
});

test("settings are clamped and legacy fields are migrated", () => {
  const normalized = normalizeSettings({
    opacity: 10,
    glassIntensity: 999,
    sizeScale: 1.2,
    taskTitleColor: "#123456",
    appearanceMode: "neon",
    fontFamily: "pixel",
  });
  assert.equal(normalized.opacity, 50);
  assert.equal(normalized.glassIntensity, 100);
  assert.equal(normalized.collapsedScale, 1.2);
  assert.equal(normalized.taskTextColor, "#123456");
  assert.equal(normalized.appearanceMode, "classic");
  assert.equal(normalized.fontFamily, "pixel");
  assert.equal(normalized.topEdgeLayoutVersion, 1);
  // The old default scale pair moves to the default it moved to back then.
  assert.equal(normalizeSettings({ collapsedScale: 0.81, expandedScale: 0.88 }).collapsedScale, 0.82);
});

test("the expanded size is a scale from 0.85 to 1.2; the three sizes of 3.0.0 keep their value", () => {
  assert.equal(DEFAULT_SETTINGS.expandedScale, 1);
  assert.equal(normalizeSettings({}).expandedScale, 1);
  // Small, medium and large as 3.0.0 stored them.
  assert.equal(normalizeSettings({ expandedScale: 0.9 }).expandedScale, 0.9);
  assert.equal(normalizeSettings({ expandedScale: 1 }).expandedScale, 1);
  assert.equal(normalizeSettings({ expandedScale: 1.1 }).expandedScale, 1.1);
  // Anything on the slider, to the hundredth.
  assert.equal(normalizeSettings({ expandedScale: 0.97 }).expandedScale, 0.97);
  assert.equal(normalizeSettings({ expandedScale: 1.0449 }).expandedScale, 1.04);
  // Older scales (0.75–1.4) come within the range; a non-number is the default.
  assert.equal(normalizeSettings({ expandedScale: 0.75 }).expandedScale, 0.85);
  assert.equal(normalizeSettings({ expandedScale: 1.3 }).expandedScale, 1.2);
  assert.equal(normalizeSettings({ expandedScale: "big" }).expandedScale, 1);
  assert.equal(normalizeSettings({ expandedScale: null }).expandedScale, 1);
});

test("options no longer in Settings load as their defaults, whatever was saved", () => {
  const saved = {
    marginY: 48,
    islandMonitor: "cursor",
    islandCornerRadius: 30,
    islandCornerShape: "round",
    maxPanelHeight: 320,
    clipboardVisibleRows: 3,
    pulseBrightness: 140,
    todoBackgroundColor: "#ffeeaa",
    showTitle: true,
    showCollapsedText: false,
    showIdleTodoCount: false,
    enableTodoReorder: true,
    rotateTodos: true,
    todoRotationSeconds: 12,
    autoTuckSeconds: 90,
    autoTuckRetract: false,
    autoTuckRetractDelayMs: 2_000,
    revealOnMessage: false,
    hoverExpandDelayMs: 600,
    hoverCollapseDelayMs: 900,
    minimizeAction: "tray",
    tuckedHoverAction: "expand",
    translationTarget: "window",
    shelfExpandOnDrop: false,
    shelfRemoveMissing: false,
    shelfRemoveAfterDragOut: false,
    shelfMaxItems: 20,
    shelfDoubleClick: "reveal",
    shelfShowCount: false,
    gameDoNotDisturb: false,
    gameAutoTuck: true,
    agentVisibleRows: 5,
    agentHostDisplay: "both",
    agentSessionHours: 24,
    agentShowClaudeCode: false,
    agentShowCodex: false,
    agentHideFinished: true,
    agentShowElapsed: true,
    agentAlertStarted: "off",
    agentAlertFailed: false,
    agentAlertSeconds: 30,
    agentRemindSeconds: 0,
    agentQuotaAlertPercent: 0,
  };
  const normalized = normalizeSettings(saved);
  for (const key of Object.keys(saved)) assert.deepEqual(normalized[key], DEFAULT_SETTINGS[key], key);
});

test("the options still in Settings are read back and fall back for older settings", () => {
  const older = normalizeSettings({});
  assert.equal(older.expandTrigger, "click");
  assert.equal(older.autoTuck, false);
  assert.equal(normalizeSettings({ expandTrigger: "hover" }).expandTrigger, "hover");
  assert.equal(normalizeSettings({ expandTrigger: "doubleClick" }).expandTrigger, "click");
  assert.equal(normalizeSettings({ autoTuck: true }).autoTuck, true);
  assert.equal(normalizeSettings({ carryOverIncompleteTodos: false }).carryOverIncompleteTodos, false);
  assert.equal(normalizeSettings({ agentAlertWaiting: false, agentAlertCompleted: false }).agentAlertCompleted, false);
  assert.equal(normalizeSettings({ shelfAutoCleanupDays: 7 }).shelfAutoCleanupDays, 7);
  assert.equal(normalizeSettings({ shelfAutoCleanupDays: 3 }).shelfAutoCleanupDays, 0);
  for (const key of ["todoEnabled", "musicEnabled", "agentStatusEnabled", "agentTitleEnabled", "mailEnabled", "shelfEnabled", "translationEnabled"]) {
    assert.equal(older[key], true, key);
    assert.equal(normalizeSettings({ [key]: false })[key], false, key);
    assert.equal(normalizeSettings({ [key]: "no" })[key], true, key);
  }
});

test("dragging files out keeps shelf entries, including settings saved by older versions", () => {
  assert.equal(DEFAULT_SETTINGS.shelfRemoveAfterDragOut, false);
  for (const saved of [undefined, {}, { shelfRemoveAfterDragOut: true }, { shelfRemoveAfterDragOut: false }]) {
    assert.equal(normalizeSettings(saved).shelfRemoveAfterDragOut, false);
  }
});

test("normalizing saved settings keeps the first-launch defaults", () => {
  assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  assert.equal(isSameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS }), true);
  assert.equal(isSameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, opacity: 60 }), false);
});

test("first launch stores the collapsed-text migration marker and uses defaults", () => {
  withStorage([], (values) => {
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
    assert.equal(values.get(COLLAPSED_TEXT_DEFAULT_MIGRATION_KEY), "1");
  });
  withStorage([[STORAGE_KEY, JSON.stringify({ opacity: 80 })]], () => {
    assert.equal(loadSettings().opacity, 80);
  });
  withStorage([[STORAGE_KEY, "{broken"]], () => {
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
  });
});

test("taking the appearance from other settings keeps todo and tuck behavior", () => {
  const current = { ...DEFAULT_SETTINGS, opacity: 60, pulseColor: "#123456", carryOverIncompleteTodos: false, autoTuck: false };
  const next = withAppearanceFrom(current, DEFAULT_SETTINGS);
  assert.equal(next.opacity, DEFAULT_SETTINGS.opacity);
  assert.equal(next.pulseColor, DEFAULT_SETTINGS.pulseColor);
  assert.equal(next.carryOverIncompleteTodos, false);
  assert.equal(next.autoTuck, false);
  assert.deepEqual(withAppearanceFrom(DEFAULT_SETTINGS, DEFAULT_SETTINGS), DEFAULT_SETTINGS);
});

test("liquid glass is paused: a saved glass preference draws classic but is kept", async () => {
  const { getEffectiveAppearanceMode, LIQUID_GLASS_ENABLED } = await import("../../src/features/appearance/settings.ts");
  assert.equal(LIQUID_GLASS_ENABLED, false);
  assert.equal(getEffectiveAppearanceMode("liquidGlass"), "classic");
  assert.equal(getEffectiveAppearanceMode("classic"), "classic");
  assert.equal(normalizeSettings({ appearanceMode: "liquidGlass" }).appearanceMode, "liquidGlass");
});
