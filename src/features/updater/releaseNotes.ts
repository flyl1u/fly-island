export type ReleaseNoteLine = { kind: "heading" | "item" | "text"; text: string };

/** Release notes are bilingual: the Chinese half, a `---` rule, then English. */
const LANGUAGE_RULE = /^\s*-{3,}\s*$/m;

function plain(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/**
 * Turns the markdown notes of a release into plain lines for the About page,
 * keeping only the half written in the interface language. The installer list
 * at the end is dropped: the update panel installs the right one by itself.
 */
export function releaseNoteLines(notes: string, locale: "zh-CN" | "en"): ReleaseNoteLine[] {
  const halves = notes.split(LANGUAGE_RULE);
  const half = halves.length > 1 && locale === "en" ? halves[1] : halves[0];
  const lines: ReleaseNoteLine[] = [];
  let skipping = false;

  for (const quoted of half.replace(/\r\n?/g, "\n").split("\n")) {
    const raw = quoted.replace(/^\s*>\s?/, "");
    const heading = raw.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      const text = plain(heading[1]);
      skipping = /^(安装包|downloads?)$/i.test(text);
      if (!skipping) lines.push({ kind: "heading", text });
      continue;
    }
    if (skipping) continue;
    const item = raw.match(/^\s*[-*]\s+(.*)$/);
    const text = plain(item ? item[1] : raw);
    if (!text || text.startsWith("[!")) continue;
    lines.push({ kind: item ? "item" : "text", text });
  }
  return lines;
}
