import type { MailContent } from "./api";
import DOMPurify from "dompurify";

/** Inert parsing keeps notification text readable without loading a mail's images or links. */
export function mailContentText(content: MailContent): string {
  if (content.contentType === "text/plain") return content.content.trim();
  const safe = DOMPurify.sanitize(content.content, {
    ALLOWED_TAGS: ["p", "br", "div", "span", "h1", "h2", "h3", "h4", "li", "tr", "td", "th", "blockquote", "pre", "a", "b", "strong", "em", "i", "ul", "ol", "table", "tbody"],
    ALLOWED_ATTR: [],
  });
  const doc = new DOMParser().parseFromString(safe, "text/html");
  doc.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  doc.querySelectorAll("p, div, h1, h2, h3, h4, li, tr, blockquote, pre").forEach((node) => node.append("\n"));
  doc.querySelectorAll("td, th").forEach((node) => node.append("\t"));
  return (doc.body.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

