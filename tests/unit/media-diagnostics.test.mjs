import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticIdentity, diagnosticMessageKey } from "../../src/features/media/diagnosticStatus.ts";
import { loadMediaDiagnosticsDismissed, saveMediaDiagnosticsDismissed, MEDIA_DIAGNOSTICS_DISMISSED_KEY } from "../../src/features/media/storage.ts";
import { zhCN, en } from "../../src/i18n/sections/music.ts";

test("each diagnostic status maps to bilingual copy", () => {
  for (const status of ["ok", "noTimeline", "needsUpdate", "smtcOff", "neteaseNeedsPlugin"]) {
    const key = diagnosticMessageKey(status);
    assert.equal(key, status);
    for (const locale of [zhCN, en]) assert.ok(locale.diagnostics[key]("Player").length > 0);
  }
  assert.equal(diagnosticIdentity({ sourceAppId: "QQMusic.exe", status: "needsUpdate" }), "qqmusic.exe\u001fneedsUpdate");
});

test("dismissed storage tolerates invalid JSON, old formats, malformed entries and denied storage", () => {
  let stored = null;
  globalThis.window = { localStorage: { getItem: () => stored, setItem: (key, value) => {
    assert.equal(key, MEDIA_DIAGNOSTICS_DISMISSED_KEY); stored = value;
  } } };
  for (const value of [null, "{", "null", "{}", '"old"', '[1,null,{},"", "x\\u001fok"]']) {
    stored = value;
    assert.deepEqual(loadMediaDiagnosticsDismissed(), []);
  }
  const ids = ["cloudmusic.exe\u001fneteaseNeedsPlugin", "qqmusic.exe\u001fneedsUpdate"];
  saveMediaDiagnosticsDismissed([...ids, ids[0]]);
  assert.deepEqual(loadMediaDiagnosticsDismissed(), ids);
  globalThis.window = { get localStorage() { throw new Error("denied"); } };
  assert.deepEqual(loadMediaDiagnosticsDismissed(), []);
  assert.doesNotThrow(() => saveMediaDiagnosticsDismissed(ids));
  delete globalThis.window;
});
