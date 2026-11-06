import type { PluginStatusEntry } from "./api";
import "./PluginStatusChip.css";

/** A plugin's status text on the collapsed bar (status.update); opens the plugin's page when it has one. */
export function PluginStatusChip({ status, onOpen }: { status: PluginStatusEntry; onOpen: (() => void) | null }) {
  const title = status.tooltip ? `${status.text} · ${status.tooltip}` : status.text;
  return (
    <button
      className={`plugin-status-chip plugin-status-chip--${status.tone}`}
      type="button"
      aria-label={title}
      disabled={!onOpen}
      onClick={(event) => {
        event.stopPropagation();
        onOpen?.();
      }}
    >
      {status.text}
    </button>
  );
}
