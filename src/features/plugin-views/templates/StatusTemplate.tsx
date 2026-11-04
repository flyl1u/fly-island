import { useMemo } from "react";
import { useLocale, useTranslation } from "../../../i18n";
import { normalizeStatusModel } from "../templateModels";
import { TemplateActions } from "./TemplateActions";
import "./StatusTemplate.css";

/** The status template: one or two lines of large text, a caption, a progress bar and actions. */
export function StatusTemplate({ pluginId, viewId, model }: { pluginId: string; viewId: string; model: unknown }) {
  const t = useTranslation();
  const { locale } = useLocale();
  const status = useMemo(() => normalizeStatusModel(model, locale), [locale, model]);

  return (
    <div className={`plugin-status plugin-status--${status.tone}`}>
      <div className="plugin-status__text" role="status">
        <strong title={status.primary ?? undefined}>{status.primary ?? t.pluginViews.empty}</strong>
        {status.secondary ? <span title={status.secondary}>{status.secondary}</span> : null}
      </div>
      {status.progress !== null ? (
        <div className="plugin-status__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(status.progress * 100)}>
          <span style={{ transform: `scaleX(${status.progress})` }} />
        </div>
      ) : null}
      {status.caption ? <p className="plugin-status__caption">{status.caption}</p> : null}
      <TemplateActions pluginId={pluginId} viewId={viewId} actions={status.actions} />
    </div>
  );
}
