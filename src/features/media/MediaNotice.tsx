import { useState } from "react";
import { CircleAlert, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { PlayerDiagnostic } from "./api";
import { useTranslation } from "../../i18n";
import { diagnosticIdentity, diagnosticMessageKey } from "./diagnosticStatus";
import { loadMediaDiagnosticsDismissed, saveMediaDiagnosticsDismissed } from "./storage";
import { NeteasePluginActions } from "./NeteasePluginControls";
import "./MediaNotice.css";

/**
 * 当前播放器有兼容性问题时：头部多一个提示图标，提示卡浮在播放器上，不占封面和歌词的位置。
 * 同一个播放器的同一个问题只自动弹出一次；收起后点图标还能再打开。
 */
export function useMediaNotice(diagnostic: PlayerDiagnostic | undefined) {
  const player = diagnostic && diagnostic.status !== "ok" ? diagnostic : undefined;
  const identity = player ? diagnosticIdentity(player) : null;
  const [dismissed, setDismissed] = useState(loadMediaDiagnosticsDismissed);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = identity !== null && (openFor === identity || !dismissed.includes(identity));
  const close = () => {
    if (!identity) return;
    const next = [...new Set([...loadMediaDiagnosticsDismissed(), identity])];
    saveMediaDiagnosticsDismissed(next);
    setDismissed(next);
    setOpenFor(null);
  };
  return { player, open, close, toggle: () => (open ? close() : setOpenFor(identity)) };
}

export function MediaNoticeButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  const label = useTranslation().music.plugin.notice;
  return <button className="music-icon-button media-notice-button" type="button" aria-label={label} title={label}
    aria-expanded={open} onClick={onClick}>
    <CircleAlert size={16} strokeWidth={1.5} absoluteStrokeWidth />
  </button>;
}

export function MediaNotice({ player, onClose }: { player: PlayerDiagnostic; onClose: () => void }) {
  const text = useTranslation().music.diagnostics;
  const [failed, setFailed] = useState(false);
  const href = player.status === "needsUpdate" ? "https://y.qq.com/download/" : null;
  const message = player.status === "smtcOff" && /kugou/i.test(player.sourceAppId)
    ? text.kugou : text[diagnosticMessageKey(player.status)](player.label);
  return (
    <aside className="media-notice" aria-label={text.title}>
      <div className="media-notice__head">
        <CircleAlert className="media-notice__icon" size={15} strokeWidth={1.75} aria-hidden="true" />
        <span className="media-notice__message">{message}</span>
        <button type="button" className="media-notice__close" aria-label={text.dismiss} title={text.dismiss} onClick={onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {player.status === "neteaseNeedsPlugin" && <NeteasePluginActions />}
      {href && <div className="media-notice__actions">
        <a className="media-notice__link" href={href} onClick={(event) => {
          event.preventDefault();
          void openUrl(href).then(() => setFailed(false)).catch(() => setFailed(true));
        }}>{text.update}</a>
        {failed && <span className="media-notice__feedback media-notice__feedback--error" role="alert">{text.openFailed}</span>}
      </div>}
    </aside>
  );
}
