import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../src/features/appearance/settings.ts";
import { SCHEME_COLORS, followsScheme, resolveColorScheme, resolveSchemeColors, toneOn } from "../../src/features/appearance/theme.ts";

test("the colour scheme defaults to dark and rejects unknown saved values", () => {
  assert.equal(DEFAULT_SETTINGS.colorScheme, "dark");
  for (const value of [undefined, null, "", "Dark", "auto", 1, {}]) {
    assert.equal(normalizeSettings({ colorScheme: value }).colorScheme, "dark");
  }
  assert.equal(normalizeSettings({ colorScheme: "light" }).colorScheme, "light");
  assert.equal(normalizeSettings({ colorScheme: "system" }).colorScheme, "system");
});

test("system follows Windows; dark and light ignore it", () => {
  assert.equal(resolveColorScheme("system", true), "dark");
  assert.equal(resolveColorScheme("system", false), "light");
  assert.equal(resolveColorScheme("dark", false), "dark");
  assert.equal(resolveColorScheme("light", true), "light");
});

test("the default palette is the dark scheme's, and both schemes' colours follow the scheme", () => {
  assert.equal(DEFAULT_SETTINGS.islandBackgroundColor.toUpperCase(), SCHEME_COLORS.dark.islandBackgroundColor);
  assert.equal(DEFAULT_SETTINGS.taskTextColor.toUpperCase(), SCHEME_COLORS.dark.taskTextColor);
  assert.equal(DEFAULT_SETTINGS.pulseColor.toUpperCase(), SCHEME_COLORS.dark.pulseColor);
  assert.equal(followsScheme("islandBackgroundColor", "#2f2f37"), true);
  assert.equal(followsScheme("islandBackgroundColor", SCHEME_COLORS.light.islandBackgroundColor), true);
  assert.equal(followsScheme("islandBackgroundColor", "#FFFFFF"), false);
});

test("untouched colours take the drawn scheme's palette", () => {
  assert.deepEqual(resolveSchemeColors(DEFAULT_SETTINGS, "light"), { ...SCHEME_COLORS.light, tone: "light" });
  assert.deepEqual(resolveSchemeColors(DEFAULT_SETTINGS, "dark"), { ...SCHEME_COLORS.dark, tone: "dark" });
});

test("a white island picked in the dark scheme keeps white and gets dark text (the original report)", () => {
  const colors = resolveSchemeColors({ ...DEFAULT_SETTINGS, islandBackgroundColor: "#FFFFFF" }, "dark");
  assert.equal(colors.islandBackgroundColor, "#FFFFFF");
  assert.equal(colors.tone, "light");
  assert.equal(colors.taskTextColor, SCHEME_COLORS.light.taskTextColor);
  assert.equal(colors.pulseColor, SCHEME_COLORS.light.pulseColor);
});

test("colours the user picked stay theirs in every scheme", () => {
  const mine = { islandBackgroundColor: "#123456", taskTextColor: "#ABCDEF", pulseColor: "#FF00AA" };
  for (const scheme of ["dark", "light"]) {
    const colors = resolveSchemeColors(mine, scheme);
    assert.equal(colors.islandBackgroundColor, mine.islandBackgroundColor);
    assert.equal(colors.taskTextColor, mine.taskTextColor);
    assert.equal(colors.pulseColor, mine.pulseColor);
    assert.equal(colors.tone, "dark");
  }
});

test("the tone flips where white and black text read about the same", () => {
  assert.equal(toneOn("#000000"), "dark");
  assert.equal(toneOn("#2F2F37"), "dark");
  assert.equal(toneOn("#F4F4F7"), "light");
  assert.equal(toneOn("#FFFFFF"), "light");
});
