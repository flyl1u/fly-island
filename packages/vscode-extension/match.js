// Picks the terminal that runs an agent session. Kept free of the vscode module so it can be
// tested with node:test.

/** Parses `pids=1,2,3&title=...` from the island's link. */
function parseQuery(query) {
  const params = new URLSearchParams(query);
  const pids = (params.get("pids") ?? "")
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
  return { pids, title: params.get("title") ?? "" };
}

/** A title without the status glyph Claude Code puts in front and the island's ellipsis. */
function bareTitle(title) {
  return title
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim()
    .replace(/…$/u, "")
    .trim()
    .toLowerCase();
}

/**
 * Index of the terminal to show. `terminals` are `{ processId, name }`; `pids` are the session's
 * process and its ancestors, one of which is the terminal's shell. Falls back to the only
 * terminal named like the session (a cut title matches the start of the name). -1 when none.
 */
function pickTerminal(terminals, { pids, title }) {
  const byProcess = terminals.findIndex((terminal) => pids.includes(terminal.processId));
  if (byProcess >= 0) {
    return byProcess;
  }
  const wanted = bareTitle(title);
  if ([...wanted].length < 2) {
    return -1;
  }
  const truncated = title.trimEnd().endsWith("…");
  const named = terminals
    .map((terminal, index) => ({ name: bareTitle(terminal.name ?? ""), index }))
    .filter(({ name }) => name === wanted || (truncated && name.startsWith(wanted)));
  return named.length === 1 ? named[0].index : -1;
}

module.exports = { parseQuery, bareTitle, pickTerminal };
