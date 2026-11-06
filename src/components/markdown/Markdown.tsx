import { useMemo, type ReactNode } from "react";
import { parseMarkdown, type Inline } from "./parseMarkdown.ts";
import "./Markdown.css";

function renderInline(content: Inline[], onOpenLink: (href: string) => void): ReactNode[] {
  return content.map((part, index) => {
    switch (part.type) {
      case "code": return <code key={index}>{part.text}</code>;
      case "strong": return <strong key={index}>{part.text}</strong>;
      case "em": return <em key={index}>{part.text}</em>;
      case "link":
        return (
          <a key={index} href={part.href} onClick={(event) => { event.preventDefault(); onOpenLink(part.href); }}>
            {part.text}
          </a>
        );
      default: return part.text;
    }
  });
}

/** Markdown text from outside the app, rendered as elements only (see parseMarkdown.ts). */
export function Markdown({ text, onOpenLink, className }: { text: string; onOpenLink: (href: string) => void; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className={className ? `markdown ${className}` : "markdown"}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading": {
            // Page headings are taken; a README's # starts one level below the panel's own.
            const Tag = (["h3", "h4", "h5", "h6", "h6", "h6"] as const)[block.level - 1];
            return <Tag key={index}>{renderInline(block.content, onOpenLink)}</Tag>;
          }
          case "paragraph": return <p key={index}>{renderInline(block.content, onOpenLink)}</p>;
          case "quote": return <blockquote key={index}>{renderInline(block.content, onOpenLink)}</blockquote>;
          case "code": return <pre key={index}><code>{block.text}</code></pre>;
          case "rule": return <hr key={index} />;
          case "list": {
            const items = block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, onOpenLink)}</li>);
            return block.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>;
          }
          default: return null;
        }
      })}
    </div>
  );
}
