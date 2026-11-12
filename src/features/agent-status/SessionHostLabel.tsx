import { AppWindow, Server, SquareCode, SquareTerminal } from "lucide-react";
import type { AgentHostDisplay } from "../appearance/types";
import type { SessionHost } from "./api";
import { useHostIcon } from "./useHostIcon";
import { AgentProviderIcon } from "./AgentProviderIcon";

const FALLBACK_ICONS = { terminal: SquareTerminal, editor: SquareCode, app: AppWindow, remote: Server } as const;

/** Where a session runs: the program's own icon and/or its name, before the session's status. */
export function SessionHostLabel({ host, display }: { host: SessionHost; display: AgentHostDisplay }) {
  const icon = useHostIcon(display === "name" ? null : host.exe);
  const Fallback = FALLBACK_ICONS[host.kind];
  const dsh = host.name === "DeepSeek Harness";

  return (
    <span className="agent-session__host" title={dsh && display !== "icon" ? host.name : undefined}>
      {display !== "name" &&
        (icon ? (
          <img className="agent-session__host-icon" src={icon} alt="" width={13} height={13} />
        ) : (
          dsh ? <AgentProviderIcon provider="dsh" size={13} /> : <Fallback className="agent-session__host-icon" size={13} strokeWidth={2} aria-hidden="true" />
        ))}
      {display !== "icon" && <span className="agent-session__host-name">{dsh ? "DSH" : host.name}</span>}
    </span>
  );
}
