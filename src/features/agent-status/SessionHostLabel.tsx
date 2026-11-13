import { AppWindow, Server, SquareCode, SquareTerminal } from "lucide-react";
import type { AgentHostDisplay } from "../appearance/types";
import type { SessionHost } from "./api";
import { useHostIcon } from "./useHostIcon";
import { AgentProviderIcon } from "./AgentProviderIcon";
import { useTranslation } from "../../i18n";
import { dshHostLabel } from "./dshHost";

const FALLBACK_ICONS = { terminal: SquareTerminal, editor: SquareCode, app: AppWindow, remote: Server } as const;

/** Where a session runs: the program's own icon and/or its name, before the session's status. */
export function SessionHostLabel({ host, display }: { host: SessionHost; display: AgentHostDisplay }) {
  const icon = useHostIcon(display === "name" ? null : host.exe);
  const Fallback = FALLBACK_ICONS[host.kind];
  const t = useTranslation();
  const dsh = dshHostLabel(host.name, t.agent.dshHosts);
  // Without the program's own icon, the desktop apps fall back to their brand tile.
  const brand = dsh ? "dsh" : host.name === "WorkBuddy" ? "workbuddy" : null;

  return (
    <span className={`agent-session__host${dsh ? " agent-session__host--dsh" : ""}`} title={dsh && display !== "icon" ? host.name : undefined}>
      {display !== "name" &&
        (icon ? (
          <img className="agent-session__host-icon" src={icon} alt="" width={13} height={13} />
        ) : (
          brand ? <AgentProviderIcon provider={brand} size={13} /> : <Fallback className="agent-session__host-icon" size={13} strokeWidth={2} aria-hidden="true" />
        ))}
      {display !== "icon" && <span className="agent-session__host-name">{dsh ?? host.name}</span>}
    </span>
  );
}
