import { useEffect, useState, useSyncExternalStore } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { RefreshCcw, X } from "lucide-react";
import { useTranslation } from "./i18n";
import { getUpdateState, installUpdate, subscribeToUpdate } from "./updaterController";

type UpdateReadyPromptProps = {
  hidden?: boolean;
  onReveal?: () => void;
};

/**
 * Startup updates download silently; this prompt is what tells the user the
 * package is ready and that restarting is all that is left. It hangs under the
 * collapsed pill instead of blocking the panel, so a deferred restart never
 * hides the working UI.
 */
export function UpdateReadyPrompt({ hidden = false, onReveal }: UpdateReadyPromptProps) {
  const t = useTranslation();
  const { stage, nextVersion } = useSyncExternalStore(subscribeToUpdate, getUpdateState);
  const [dismissed, setDismissed] = useState(false);

  const visible = stage === "ready" && !dismissed;
  const active = visible && !hidden;

  // The prompt sits outside the island rect, where the window is normally
  // click-through. Tell the shell so the restart button can be clicked.
  useEffect(() => {
    if (!isTauri()) return;
    void invoke("set_update_prompt_visible", { visible: active }).catch(() => {});
    return () => {
      void invoke("set_update_prompt_visible", { visible: false }).catch(() => {});
    };
  }, [active]);

  // A packaged update is worth pulling the island back out of the tucked edge.
  useEffect(() => {
    if (visible) onReveal?.();
  }, [visible, onReveal]);

  if (!active) return null;

  return (
    <div className="island-update-prompt" role="status" aria-live="polite">
      <RefreshCcw className="island-update-prompt__icon" size={16} strokeWidth={2} aria-hidden="true" />
      <span className="island-update-prompt__copy">
        <strong>{t.settings.project.update.ready(nextVersion)}</strong>
        <span>{t.settings.project.update.readyHint}</span>
      </span>
      <button
        className="island-update-prompt__restart"
        type="button"
        onClick={() => void installUpdate()}
      >
        {t.settings.project.update.restart}
      </button>
      <button
        className="island-update-prompt__dismiss"
        type="button"
        aria-label={t.settings.project.update.later}
        title={t.settings.project.update.later}
        onClick={() => setDismissed(true)}
      >
        <X size={14} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}
