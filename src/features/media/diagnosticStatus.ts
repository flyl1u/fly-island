import type { MediaDiagnosticStatus, PlayerDiagnostic } from "./api";

export function diagnosticMessageKey(status: MediaDiagnosticStatus) {
  return { ok: "ok", needsUpdate: "needsUpdate", smtcOff: "smtcOff", neteaseNeedsPlugin: "neteaseNeedsPlugin", neteasePluginInactive: "neteasePluginInactive", noTimeline: "noTimeline" }[status] as MediaDiagnosticStatus;
}

export function diagnosticIdentity(player: Pick<PlayerDiagnostic, "sourceAppId" | "status">) {
  return `${player.sourceAppId.toLowerCase()}\u001f${player.status}`;
}
