/**
 * The small Markdown the detail template accepts: headings, bold, italic,
 * inline code, lists, paragraphs and https links. Everything else stays
 * text: the input is HTML-escaped first, so the result only ever holds the
 * tags made here. DetailTemplate still runs it through DOMPurify with the
 * same short list (RESTRICTED_MARKDOWN_TAGS).
 */

export const RESTRICTED_MARKDOWN_TAGS = ["h3", "h4", "h5", "p", "strong", "em", "code", "ul", "ol", "li", "a", "br"];
export const MAX_MARKDOWN_CHARS = 20000;

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Inline marks on escaped text. Code spans are taken out first so nothing inside them is formatted. */
function inline(escaped: string) {
  const codes: string[] = [];
  let text = escaped.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
    // href is escaped text; only plain https links become links.
    return /^https:\/\/[^\s"'<>]+$/.test(href) ? `<a href="${href}">${label}</a>` : label;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>");
  text = text.replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, "$1<em>$2</em>");
  return text.replace(/\u0000(\d+)\u0000/g, (_, index: string) => `<code>${codes[Number(index)]}</code>`);
}

export function restrictedMarkdownToHtml(markdown: string): string {
  const lines = markdown.slice(0, MAX_MARKDOWN_CHARS).replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) html.push(`<p>${paragraph.map((line) => inline(escapeHtml(line))).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.tag}>${list.items.map((item) => `<li>${inline(escapeHtml(item))}</li>`).join("")}</${list.tag}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d{1,3}[.)]\s+(.+)$/.exec(line);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length + 2, 5);
      html.push(`<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`);
    } else if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push((bullet ?? numbered)?.[1] ?? "");
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return html.join("");
}
