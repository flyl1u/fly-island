import { MiniRing } from "../../components/MiniRing";
import type { PluginStatusEntry } from "./api";
import "./PluginStatusChip.css";

/** Outer size of the status ring in px; it fits the collapsed bar's 22px chip. */
const RING_SIZE = 16;

/**
 * A plugin's status on the collapsed bar (status.update): its text, or label-over-value cells
 * when it sent some, with an optional progress ring in front. Opens the plugin's page when it has one.
 */
export function PluginStatusChip({ status, onOpen }: { status: PluginStatusEntry; onOpen: (() => void) | null }) {
  const title = status.tooltip ? `${status.text} · ${status.tooltip}` : status.text;
  const cells = status.cells ?? [];
  const classes = ["plugin-status-chip", `plugin-status-chip--${status.tone}`];
  if (cells.length > 0) classes.push("plugin-status-chip--cells");
  if (status.ring != null) classes.push("plugin-status-chip--ring");
  return (
    <button
      className={classes.join(" ")}
      type="button"
      aria-label={title}
      title={status.tooltip ?? undefined}
      disabled={!onOpen}
      onClick={(event) => {
        event.stopPropagation();
        onOpen?.();
      }}
    >
      {status.ring != null && (
        <MiniRing
          className="plugin-status-chip__ring"
          rings={[{ value: status.ring, color: "currentColor" }]}
          size={RING_SIZE}
          strokeWidth={2.5}
          ariaLabel=""
        />
      )}
      {cells.length > 0 ? (
        cells.map((cell, index) => (
          <span key={index} className={`plugin-status-chip__cell plugin-status-chip__cell--${cell.tone}`} aria-hidden="true">
            <span className="plugin-status-chip__label">{cell.label}</span>
            <span className="plugin-status-chip__value">{cell.value}</span>
          </span>
        ))
      ) : (
        <span className="plugin-status-chip__text">{status.text}</span>
      )}
    </button>
  );
}
