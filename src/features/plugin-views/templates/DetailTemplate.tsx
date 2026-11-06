import { useMemo, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import { useLocale, useTranslation } from "../../../i18n";
import { openPluginViewLink } from "../api";
import { RESTRICTED_MARKDOWN_TAGS, restrictedMarkdownToHtml } from "../restrictedMarkdown";
import { normalizeDetailModel } from "../templateModels";
import { TemplateActions } from "./TemplateActions";
import "./DetailTemplate.css";

/** The detail template: a title, restricted Markdown, facts and actions. Links open in the browser. */
export function DetailTemplate({ pluginId, viewId, model }: { pluginId: string; viewId: string; model: unknown }) {
  const t = useTranslation();
  const { locale } = useLocale();
  const detail = useMemo(() => normalizeDetailModel(model, locale), [locale, model]);
  const html = useMemo(
    () =>
      detail.markdown
        ? DOMPurify.sanitize(restrictedMarkdownToHtml(detail.markdown), {
            ALLOWED_TAGS: RESTRICTED_MARKDOWN_TAGS,
            ALLOWED_ATTR: ["href"],
            ALLOWED_URI_REGEXP: /^https:/i,
            ALLOW_DATA_ATTR: false,
            ALLOW_ARIA_ATTR: false,
          })
        : "",
    [detail.markdown],
  );

  // Links never navigate the island window; https ones open in the browser.
  const openLink = (event: MouseEvent<HTMLDivElement>) => {
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href");
    if (href) void openPluginViewLink(href);
  };

  return (
    <div className="plugin-detail" aria-busy={detail.loading}>
      <div className="plugin-detail__scroll">
        {detail.title ? <h2 className="plugin-detail__title">{detail.title}</h2> : null}
        {detail.error ? <p className="plugin-detail__error" role="alert">{detail.error}</p> : null}
        {detail.loading && !html ? <p className="plugin-detail__muted">{t.pluginViews.loading}</p> : null}
        {html ? (
          // Built from escaped text with a fixed tag list, then sanitized again.
          <div className="plugin-detail__markdown" onClick={openLink} dangerouslySetInnerHTML={{ __html: html }} />
        ) : null}
        {!html && !detail.loading && detail.meta.length === 0 ? <p className="plugin-detail__muted">{t.pluginViews.empty}</p> : null}
        {detail.meta.length > 0 ? (
          <dl className="plugin-detail__meta">
            {detail.meta.map((item, index) => (
              <div key={`${item.label}-${index}`}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      <TemplateActions pluginId={pluginId} viewId={viewId} actions={detail.actions} />
    </div>
  );
}
