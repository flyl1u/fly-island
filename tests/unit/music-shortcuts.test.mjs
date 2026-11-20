import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMusicShortcuts } from "../../src/features/media/shortcuts.ts";
import { loadMusicShortcuts, saveMusicShortcuts, MUSIC_SHORTCUTS_STORAGE_KEY } from "../../src/features/media/storage.ts";
import { collectShortcutOwners, findShortcutOwner } from "../../src/windows/settings/shortcutConflicts.ts";

const empty = { playPause: "", previous: "", next: "" };
test("music shortcuts have no default keys and normalize saved values independently", () => {
  for (const value of [undefined, null, 42, "Ctrl+P", [], {}]) assert.deepEqual(normalizeMusicShortcuts(value), empty);
  assert.deepEqual(normalizeMusicShortcuts({ playPause: "Control + alt + P", previous: false, next: "" }), { ...empty, playPause: "Ctrl+Alt+P" });
  assert.deepEqual(normalizeMusicShortcuts({ playPause: "P", previous: "Ctrl", next: "Meta+ArrowRight" }), { ...empty, next: "Win+Right" });
});

test("music storage tolerates corrupt JSON and denied storage, and persists cleared keys", () => {
  let stored;
  const events = [];
  globalThis.window = { dispatchEvent: (event) => events.push(event.type), localStorage: {
    getItem: () => stored, setItem: (key, value) => { assert.equal(key, MUSIC_SHORTCUTS_STORAGE_KEY); stored = value; },
  } };
  try {
    for (const value of [null, "{", "[]", "null", '"old"']) { stored = value; assert.deepEqual(loadMusicShortcuts(), empty); }
    saveMusicShortcuts({ ...empty, playPause: "Ctrl+Alt+P" });
    assert.equal(loadMusicShortcuts().playPause, "Ctrl+Alt+P");
    saveMusicShortcuts(empty);
    assert.deepEqual(loadMusicShortcuts(), empty);
    assert.equal(events.length, 2);
    window.localStorage = { getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); } };
    assert.deepEqual(loadMusicShortcuts(), empty);
    assert.doesNotThrow(() => saveMusicShortcuts(empty));
  } finally { delete globalThis.window; }
});

test("music, clipboard, translation and reserved approvals detect conflicts in both directions", () => {
  const clipboard = { id: "clipboard", label: "Clipboard", shortcut: "Ctrl+Shift+W", enabled: true };
  const translation = { id: "translation", label: "Translation", shortcut: "Ctrl+Alt+Space", enabled: true };
  const music = [{ id: "music-playPause", label: "Play / pause", shortcut: "Ctrl+Alt+P" }, { id: "music-next", label: "Next", shortcut: "" }];
  const approvals = [{ id: "approval-allow", label: "Agent approval", shortcut: "Ctrl+Alt+Y" }];
  const owners = collectShortcutOwners({ clipboard, translation, music, approvals });
  assert.equal(findShortcutOwner("Shift+Control+W", owners, "music-playPause"), "Clipboard");
  assert.equal(findShortcutOwner("Alt+Ctrl+Space", owners, "music-next"), "Translation");
  assert.equal(findShortcutOwner("Ctrl+Alt+P", owners, "clipboard"), "Play / pause");
  assert.equal(findShortcutOwner("Ctrl+Alt+P", owners, "translation"), "Play / pause");
  assert.equal(findShortcutOwner("Alt+Control+Y", owners, "music-playPause"), "Agent approval");
  assert.equal(findShortcutOwner("Ctrl+Alt+P", owners, "music-playPause"), null);
  assert.equal(findShortcutOwner("", owners, "music-playPause"), null);
  const off = collectShortcutOwners({ clipboard: { ...clipboard, enabled: false }, translation: { ...translation, enabled: false }, music: [], approvals });
  assert.equal(findShortcutOwner(clipboard.shortcut, off, "music-next"), null);
  assert.equal(findShortcutOwner(translation.shortcut, off, "music-next"), null);
  assert.equal(findShortcutOwner("Ctrl+Alt+Y", off, "music-next"), "Agent approval");
});
