import { useState } from "react";
import { NeteasePluginControls } from "./NeteasePluginControls";
import { Info, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { PlayerDiagnostic } from "./api";
import { useTranslation } from "../../i18n";
import { diagnosticIdentity, diagnosticMessageKey } from "./diagnosticStatus";
import { loadMediaDiagnosticsDismissed, saveMediaDiagnosticsDismissed } from "./storage";
import "./MediaDiagnosticsCard.css";

export function MediaDiagnosticsCard({ player }: { player: PlayerDiagnostic | undefined }) {
  const t = useTranslation();
  const [dismissed, setDismissed] = useState(loadMediaDiagnosticsDismissed);
  const [failed, setFailed] = useState(false);
  if (!player || player.status === "ok" || dismissed.includes(diagnosticIdentity(player))) return null;
  const text = t.music.diagnostics;
  const href = player.status === "needsUpdate" ? "https://y.qq.com/download/"
    : player.status === "neteaseNeedsPlugin" ? "https://github.com/apoint123/inflink-rs" : null;
  const message = player.status === "smtcOff" && /kugou/i.test(player.sourceAppId)
    ? text.kugou : text[diagnosticMessageKey(player.status)](player.label);
  return (
    <aside className="media-diag-card" aria-label={text.title}>
      <Info size={14} aria-hidden="true" />
      <div className="media-diag-copy">
        <span>{message}</span>
        <div className="media-diag-actions">
          {player.status === "neteaseNeedsPlugin" && <NeteasePluginControls />}
          {href && player.status !== "neteaseNeedsPlugin" && <a href={href} onClick={(event) => {
            event.preventDefault();
            void openUrl(href).then(() => setFailed(false)).catch(() => setFailed(true));
          }}>{player.status === "needsUpdate" ? text.update : text.details}</a>}
          {failed && <span role="alert">{text.openFailed}</span>}
        </div>
      </div>
      <button type="button" className="media-diag-dismiss" aria-label={text.dismiss} title={text.dismiss} onClick={() => {
        const next = [...new Set([...loadMediaDiagnosticsDismissed(), diagnosticIdentity(player)])];
        saveMediaDiagnosticsDismissed(next); setDismissed(next);
      }}><X size={13} aria-hidden="true" /></button>
    </aside>
  );
}
