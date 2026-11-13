/** 把 docs/releases/vX.Y.Z.md 里的“更新内容 / What's new”一节解析成条目，供关于页的更新日志使用。 */
export type ChangelogItem = { text: string; depth: number };
export type ChangelogEntry = { version: string; items: ChangelogItem[] };
export type InlinePart = { kind: "text" | "strong" | "code"; value: string };

const SECTION = { "zh-CN": /^##\s*更新内容\s*$/, en: /^##\s*what's new\s*$/i } as const;

function sectionItems(markdown: string, heading: RegExp): ChangelogItem[] {
  const items: ChangelogItem[] = [];
  let inside = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^##\s/.test(line) || /^---\s*$/.test(line)) {
      inside = heading.test(line.trim());
      continue;
    }
    if (!inside || !line.trim()) continue;
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (bullet) items.push({ depth: Math.min(2, Math.floor(bullet[1].length / 2)), text: bullet[2].trim() });
    else if (items.length) items[items.length - 1].text += ` ${line.trim()}`;
    else items.push({ depth: 0, text: line.trim() });
  }
  return items;
}

/** 英文缺这一节时退回中文。 */
export function parseReleaseNotes(markdown: string, locale: "zh-CN" | "en"): ChangelogItem[] {
  const items = sectionItems(markdown, SECTION[locale]);
  return items.length || locale === "zh-CN" ? items : sectionItems(markdown, SECTION["zh-CN"]);
}

export function versionFromPath(path: string): string | null {
  return /v(\d+\.\d+\.\d+(?:-[\w.]+)?)\.md$/.exec(path)?.[1] ?? null;
}

/** 新版本在前；预发布版排在同号正式版之后。 */
export function compareVersionsDescending(a: string, b: string): number {
  const parse = (value: string) => {
    const [core, pre = ""] = value.split("-", 2);
    return { parts: core.split(".").map(Number), pre };
  };
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < 3; index++) {
    const diff = (right.parts[index] ?? 0) - (left.parts[index] ?? 0);
    if (diff) return diff;
  }
  if (left.pre === right.pre) return 0;
  if (!left.pre) return -1;
  if (!right.pre) return 1;
  return right.pre.localeCompare(left.pre, "en", { numeric: true });
}

/** 行内只保留粗体和代码；链接只留文字。 */
export function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const plain = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  for (const piece of plain.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
    if (!piece) continue;
    if (piece.startsWith("**") && piece.endsWith("**")) parts.push({ kind: "strong", value: piece.slice(2, -2) });
    else if (piece.startsWith("`") && piece.endsWith("`")) parts.push({ kind: "code", value: piece.slice(1, -1) });
    else parts.push({ kind: "text", value: piece });
  }
  return parts;
}

export function buildChangelog(files: Record<string, string>, locale: "zh-CN" | "en"): ChangelogEntry[] {
  return Object.entries(files)
    .map(([path, markdown]) => ({ version: versionFromPath(path), items: parseReleaseNotes(markdown, locale) }))
    .filter((entry): entry is ChangelogEntry => entry.version !== null && entry.items.length > 0)
    .sort((a, b) => compareVersionsDescending(a.version, b.version));
}
