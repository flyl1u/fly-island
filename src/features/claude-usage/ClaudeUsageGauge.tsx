import { useMemo } from "react";
import { IslandHoverCard } from "../../components/IslandHoverCard";
import { MiniRing } from "../../components/MiniRing";
import { useTranslation } from "../../i18n";
import { usageCardLines, usageRings } from "./usageRing";
import { useClaudeUsage } from "./useClaudeUsage";
import "./ClaudeUsageGauge.css";

type ClaudeUsageGaugeProps = {
  /** False once the cursor has left the island, which closes the card. */
  islandHovered?: boolean;
  /** Shows what is left instead of what is used (the plugin's "show" setting). */
  showRemaining?: boolean;
};

/**
 * The usage ring on the collapsed bar: 5 hours outside, 7 days inside. Resting on it shows the
 * details under the island; a click re-reads claude-hud's snapshot.
 */
export function ClaudeUsageGauge({ islandHovered = true, showRemaining = false }: ClaudeUsageGaugeProps) {
  const t = useTranslation();
  const { usage, now, refresh } = useClaudeUsage();
  const rings = useMemo(() => usageRings(usage, now, showRemaining), [usage, now, showRemaining]);
  const lines = useMemo(() => usageCardLines(usage, now, t.claudeUsage, showRemaining), [usage, now, t, showRemaining]);
  const label = t.claudeUsage.ringLabel(lines.map((line) => line.text).join("; "));

  return (
    <IslandHoverCard lines={lines} suppressed={!islandHovered}>
      <button
        className="claude-usage-gauge"
        type="button"
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          refresh();
        }}
      >
        <MiniRing rings={rings} ariaLabel={label} />
      </button>
    </IslandHoverCard>
  );
}
