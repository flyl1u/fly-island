import { useEffect, useLayoutEffect, useRef } from "react";
import { balanceAmount, balanceDisplays, takeBalanceAlerts, useApiBalance } from "../../features/api-balance";
import { useAgentSoundSettings } from "../../features/agent-status/sounds/useAgentSoundSettings";
import { playAgentSound } from "../../features/agent-status/sounds/player";
import { useTranslation } from "../../i18n";
import type { ShowCollapsedNotice } from "./useCollapsedNotice";

export function useIslandBalances(quiet: boolean, onNotice: ShowCollapsedNotice, agentsEnabled: boolean) {
  const { snapshot } = useApiBalance();
  const accounts = balanceDisplays(snapshot);
  const seen = useRef(new Map<string, number>());
  const [sounds] = useAgentSoundSettings();
  const t = useTranslation().settings.plugins.balance;
  const latest = useRef({ quiet, onNotice, sounds, t, agentsEnabled });
  useLayoutEffect(() => { latest.current = { quiet, onNotice, sounds, t, agentsEnabled }; });
  useEffect(() => {
    const warnings = takeBalanceAlerts(seen.current, snapshot);
    const current = latest.current;
    if (!warnings.length || current.quiet) return;
    // This is explicitly enabled per account; reuse the quota sound and the global mute.
    playAgentSound("quotaLow", { ...current.sounds, events: { ...current.sounds.events, quotaLow: true } });
    const message = warnings.map(w => current.t.lowBalance(w.name, balanceAmount(w.remaining), w.unit, balanceAmount(w.threshold))).join(" · ");
    current.onNotice(message, current.agentsEnabled ? "agents" : "settings", 8000);
  }, [snapshot]);
  const first = accounts[0];
  const collapsedText = first ? `${first.name} · ${first.amount}${first.stale ? ` · ${t.stale}` : ""}${accounts.length > 1 ? ` +${accounts.length - 1}` : ""}` : null;
  return { accounts, collapsedText, low: first?.low ?? false };
}
