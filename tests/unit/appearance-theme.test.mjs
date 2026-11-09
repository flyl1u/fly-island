import assert from "node:assert/strict";
import test from "node:test";
import { APPEARANCE_SETTING_KEYS, DEFAULT_SETTINGS } from "../../src/features/appearance/settings.ts";
import { buildTheme, parseTheme, themeFileName } from "../../src/features/appearance/theme.ts";

const current = { ...DEFAULT_SETTINGS, opacity: 80, pulseColor: "#112233" };

test("a theme holds the preset's name and only its appearance settings", () => {
  const theme = buildTheme("Night", { ...current, gameAutoTuck: true }, new Date("2026-11-08T06:30:00Z"));
  assert.equal(theme.app, "fly-island");
  assert.equal(theme.kind, "theme");
  assert.equal(theme.version, 1);
  assert.equal(theme.name, "Night");
  assert.equal(theme.exportedAt, "2026-11-08T06:30:00.000Z");
  assert.deepEqual(Object.keys(theme.appearance).sort(), [...APPEARANCE_SETTING_KEYS].sort());
  assert.equal(theme.appearance.opacity, 80);
  assert.ok(!("gameAutoTuck" in theme.appearance));
});

test("theme files are named by local date and time", () => {
  assert.equal(themeFileName(new Date(2026, 10, 8, 9, 5)), "fly-island-theme-2026-11-08-0905.json");
});

test("importing round-trips a theme over the current settings", () => {
  const exported = buildTheme("Night", { ...current, opacity: 60, pulseColor: "#abcdef" }, new Date());
  const parsed = parseTheme("\uFEFF" + JSON.stringify(exported), { ...current, gameAutoTuck: true });
  assert.ok(!("problem" in parsed));
  assert.equal(parsed.name, "Night");
  assert.equal(parsed.settings.opacity, 60);
  assert.equal(parsed.settings.pulseColor, "#abcdef");
  // Non-appearance settings come from the current ones, not the file.
  assert.equal(parsed.settings.gameAutoTuck, true);
});

test("importing checks every value and ignores fields outside the appearance", () => {
  const file = {
    app: "fly-island",
    kind: "theme",
    version: 1,
    name: "  " + "x".repeat(100) + "  ",
    appearance: { pulseColor: "red; background:url(x)", opacity: "loud", gameAutoTuck: true },
  };
  const parsed = parseTheme(JSON.stringify(file), current);
  assert.ok(!("problem" in parsed));
  assert.equal(parsed.name.length, 60);
  assert.match(parsed.settings.pulseColor, /^#[0-9a-f]{6}$/i);
  assert.equal(typeof parsed.settings.opacity, "number");
  assert.equal(parsed.settings.gameAutoTuck, current.gameAutoTuck);
});

test("importing refuses files that are not themes", () => {
  assert.deepEqual(parseTheme("nope", current), { problem: "notJson" });
  assert.deepEqual(parseTheme("[]", current), { problem: "notTheme" });
  assert.deepEqual(parseTheme(JSON.stringify({ app: "fly-island", version: 1, keys: {} }), current), { problem: "notTheme" });
  assert.deepEqual(
    parseTheme(JSON.stringify({ app: "fly-island", kind: "theme", version: 2, appearance: {} }), current),
    { problem: "newerVersion" },
  );
});
