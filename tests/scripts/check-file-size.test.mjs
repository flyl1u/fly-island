import assert from "node:assert/strict";
import test from "node:test";
import { checkFiles, countLines, inlineTestLines, lineLimitFor } from "../../scripts/check-file-size.mjs";

const lines = (count) => "x\n".repeat(count);

function rustWithTests(productionLines, testBodyLines) {
  return `${lines(productionLines)}#[cfg(test)]\nmod tests {\n${lines(testBodyLines)}}\n`;
}

test("physical lines ignore a final newline and accept CRLF", () => {
  assert.equal(countLines(""), 0);
  assert.equal(countLines("a"), 1);
  assert.equal(countLines("a\nb\n"), 2);
  assert.equal(countLines("a\r\nb\r\n\r\n"), 3);
});

test("limits follow the file type and exempt dictionaries and extracted Rust tests", () => {
  assert.equal(lineLimitFor("src/App.tsx"), 400);
  assert.equal(lineLimitFor("src/utils/text.ts"), 400);
  assert.equal(lineLimitFor("tests/i18n.test.mjs"), 400);
  assert.equal(lineLimitFor("src/App.css"), 500);
  assert.equal(lineLimitFor("src-tauri/src/lib.rs"), 800);
  assert.equal(lineLimitFor("src-tauri/src/agent_status/hooks/focusd-agent-status.ps1"), 400);
  assert.equal(lineLimitFor("src/i18n/locales/en.ts"), null);
  assert.equal(lineLimitFor("src/i18n/types.ts"), null);
  assert.equal(lineLimitFor("src/i18n/sections/settings/plugins.ts"), null);
  assert.equal(lineLimitFor("src-tauri/src/mail/tests.rs"), null);
  assert.equal(lineLimitFor("src/i18n/index.ts"), 400);
  assert.equal(lineLimitFor("docs/i18n.md"), null);
});

test("inline test modules are measured from the attribute to the column-0 closing brace", () => {
  assert.equal(inlineTestLines(rustWithTests(10, 5)), 8);
  assert.equal(inlineTestLines("#[cfg(test)]\nfn helper() {}\n"), 0);
  assert.equal(inlineTestLines("#[cfg(test)]\nmod tests;\n"), 0);
  assert.equal(inlineTestLines("#[cfg(test)]\r\n#[allow(dead_code)]\r\nmod tests {\r\n    x\r\n}\r\nfn after() {}\r\n"), 5);
  const productionAfterTests = `${rustWithTests(2, 3)}${lines(4)}`;
  assert.equal(inlineTestLines(productionAfterTests), 6);
});

test("Rust production size excludes inline tests and oversized inline tests fail", () => {
  const ok = checkFiles([{ path: "src-tauri/src/a.rs", source: rustWithTests(800, 140) }]);
  assert.deepEqual(ok.errors, []);
  const tooManyTests = checkFiles([{ path: "src-tauri/src/a.rs", source: rustWithTests(10, 149) }]);
  assert.match(tooManyTests.errors.join("\n"), /内联测试模块行数 152 超过上限 150/);
});

test("new oversized files fail and exempt files are skipped", () => {
  const result = checkFiles([
    { path: "src/New.tsx", source: lines(401) },
    { path: "src/i18n/locales/en.ts", source: lines(5000) },
  ]);
  assert.equal(result.checked, 1);
  assert.deepEqual(result.errors, ["src/New.tsx: 行数 401 超过上限 400"]);
});

test("allowlisted files may shrink but never grow", () => {
  const allowlist = { lines: { "src/App.tsx": 1000 } };
  assert.deepEqual(checkFiles([{ path: "src/App.tsx", source: lines(1000) }], allowlist), {
    checked: 1,
    errors: [],
    warnings: [],
  });
  assert.match(checkFiles([{ path: "src/App.tsx", source: lines(1001) }], allowlist).errors[0], /不得变长/);
  const shrunk = checkFiles([{ path: "src/App.tsx", source: lines(900) }], allowlist);
  assert.deepEqual(shrunk.errors, []);
  assert.match(shrunk.warnings[0], /从 1000 更新为 900/);
});

test("allowlist entries must be removed once a file fits or no longer exists", () => {
  const allowlist = { lines: { "src/App.tsx": 1000, "src/Gone.tsx": 900 }, inlineTests: { "src-tauri/src/gone.rs": 200 } };
  const errors = checkFiles([{ path: "src/App.tsx", source: lines(400) }], allowlist).errors.join("\n");
  assert.match(errors, /src\/App\.tsx: 行数 400 已不超过上限 400，请从白名单中删除该条目/);
  assert.match(errors, /src\/Gone\.tsx: 白名单 lines 中的文件不存在/);
  assert.match(errors, /src-tauri\/src\/gone\.rs: 白名单 inlineTests 中的文件不存在/);
});
