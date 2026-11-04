import { ShieldQuestion } from "lucide-react";
import { useLocale, useTranslation } from "../../i18n";
import type { PluginPermissionPrompts } from "./usePluginPermissionPrompts";
import "./PluginPermissionPrompt.css";

/** "<plugin> wants to read your clipboard history: allow / once / deny", over the top row of the island. */
export function PluginPermissionPrompt({ prompts }: { prompts: PluginPermissionPrompts }) {
  const t = useTranslation();
  const { locale } = useLocale();
  const request = prompts.current;
  if (!request) return null;
  const labels = t.settings.plugins.sensitive;
  const text = labels.prompt(request.pluginName?.[locale] ?? request.pluginId, labels.action[request.permission]);

  return (
    <div className="plugin-permission-prompt" role="alertdialog" aria-label={text} key={request.requestId}>
      <ShieldQuestion size={15} strokeWidth={2.3} aria-hidden="true" />
      <span className="plugin-permission-prompt__text" title={text}>
        {text}
      </span>
      <button className="plugin-permission-prompt__button plugin-permission-prompt__button--allow" type="button" onClick={() => prompts.answer("allow")}>
        {labels.allow}
      </button>
      <button className="plugin-permission-prompt__button" type="button" onClick={() => prompts.answer("once")}>
        {labels.once}
      </button>
      <button className="plugin-permission-prompt__button" type="button" onClick={() => prompts.answer("deny")}>
        {labels.deny}
      </button>
    </div>
  );
}
