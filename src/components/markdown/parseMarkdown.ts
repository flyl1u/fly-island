// A small Markdown subset for text from outside the app (plugin READMEs and
// changelogs): headings, paragraphs, lists, quotes, fenced code, rules, and inline
// code, bold, italics and links. HTML in the source stays plain text; images show
// their alt text. The result is data, rendered by Markdown.tsx without innerHTML.

export type Inline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  /** Only http(s) links; anything else is kept as its text. */
  | { type: "link"; text: string; href: string };

export type Block =
  | { type: "heading"; level: number; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; content: Inline[] }
  | { type: "code"; text: string }
  | { type: "rule" };

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(!?\[[^\]]*\]\([^)\s]+\))/g;

export function parseInline(text: string): Inline[] {
  const result: Inline[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = result[result.length - 1];
    if (last?.type === "text") last.text += value;
    else result.push({ type: "text", text: value });
  };
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    pushText(text.slice(at, match.index));
    const [token, code, strong, em, link] = match;
    if (code) result.push({ type: "code", text: code.slice(1, -1) });
    else if (strong) result.push({ type: "strong", text: strong.slice(2, -2) });
    else if (em) result.push({ type: "em", text: em.slice(1, -1) });
    else if (link) {
      const image = link.startsWith("!");
      const [, label = "", href = ""] = /^!?\[([^\]]*)\]\(([^)\s]+)\)$/.exec(link) ?? [];
      if (!image && /^https?:\/\//i.test(href)) result.push({ type: "link", text: label || href, href });
      else pushText(label);
    } else pushText(token);
    at = (match.index ?? 0) + token.length;
  }
  pushText(text.slice(at));
  return result;
}

const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flush();
      const code: string[] = [];
      for (index += 1; index < lines.length && !lines[index].trim().startsWith("```"); index += 1) code.push(lines[index]);
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    if (!trimmed) { flush(); continue; }
    const heading = /^(#{1,6})\s+(.*?)\s*#*$/.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: heading[1].length, content: parseInline(heading[2]) });
      continue;
    }
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed.replace(/\s/g, ""))) { flush(); blocks.push({ type: "rule" }); continue; }
    if (trimmed.startsWith(">")) {
      flush();
      const quote: string[] = [];
      for (; index < lines.length && lines[index].trim().startsWith(">"); index += 1) quote.push(lines[index].trim().replace(/^>\s?/, ""));
      index -= 1;
      blocks.push({ type: "quote", content: parseInline(quote.join(" ")) });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      const ordered = item[2] !== undefined;
      const items: string[] = [];
      for (; index < lines.length; index += 1) {
        const next = LIST_ITEM.exec(lines[index]);
        if (next && (next[2] !== undefined) === ordered) items.push(next[3]);
        // An indented line continues the item above it.
        else if (items.length > 0 && /^\s{2,}\S/.test(lines[index])) items[items.length - 1] += ` ${lines[index].trim()}`;
        else break;
      }
      index -= 1;
      blocks.push({ type: "list", ordered, items: items.map(parseInline) });
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}
