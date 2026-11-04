import { useTranslation } from "../../../i18n";
import { runPluginViewAction } from "../api";
import { viewIcon } from "../icons";
import type { ViewAction } from "../model";
import "./TemplateActions.css";

/** The buttons at the bottom of a detail or status page; a click sends view.action. */
export function TemplateActions({ pluginId, viewId, actions }: { pluginId: string; viewId: string; actions: ViewAction[] }) {
  const t = useTranslation();
  if (actions.length === 0) return null;
  return (
    <div className="plugin-template-actions" role="group" aria-label={t.pluginViews.actions}>
      {actions.map((action) => {
        const Icon = action.icon ? viewIcon(action.icon) : null;
        return (
          <button
            className="plugin-template-actions__button"
            type="button"
            key={action.id}
            title={action.title}
            onClick={() =>
              void runPluginViewAction(pluginId, viewId, action.id, null, null).catch((error: unknown) =>
                console.error("Failed to send a plugin view action", error),
              )
            }
          >
            {Icon ? <Icon size={13} strokeWidth={2.4} aria-hidden="true" /> : null}
            <span>{action.title}</span>
          </button>
        );
      })}
    </div>
  );
}
