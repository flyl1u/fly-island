import { AppWindow, SquareCode, SquareTerminal } from "lucide-react";
import type { AgentHostDisplay } from "../appearance/types";
import type { SessionHost } from "./api";
import { useHostIcon } from "./useHostIcon";

const FALLBACK_ICONS = { terminal: SquareTerminal, editor: SquareCode, app: AppWindow } as const;

/** Where a session runs: the program's own icon and/or its name, before the session's status. */
export function SessionHostLabel({ host, display }: { host: SessionHost; display: AgentHostDisplay }) {
  const icon = useHostIcon(display === "name" ? null : host.exe);
  const Fallback = FALLBACK_ICONS[host.kind];

  return (
    <span className="agent-session__host" title={host.name}>
      {display !== "name" &&
        (icon ? (
          <img className="agent-session__host-icon" src={icon} alt="" width={13} height={13} />
        ) : (
          <Fallback className="agent-session__host-icon" size={13} strokeWidth={2} aria-hidden="true" />
        ))}
      {display !== "icon" && <span className="agent-session__host-name">{host.name}</span>}
    </span>
  );
}
