import { Pin, PinOff, X } from "lucide-react";
import { useTranslation } from "../../i18n";
import { ClipboardHistoryPanel } from "../../features/clipboard/ClipboardHistoryPanel";
import { useClipboardHistory } from "../../features/clipboard/useClipboardHistory";
import { useDocumentTheme, useStoredTheme } from "../../features/appearance/useDocumentTheme";
import { closeClipboardWindow, dragClipboardWindow, resizeClipboardWindow, type ClipboardResizeDirection } from "./api";
import { useClipboardWindow } from "./useClipboardWindow";
import "./ClipboardWindow.css";

const EDGES: ClipboardResizeDirection[] = ["North", "South", "East", "West", "NorthEast", "NorthWest", "SouthEast", "SouthWest"];

export function ClipboardWindow() {
  const t = useTranslation();
  const frame = useClipboardWindow(t.clipboard.title);
  const clipboard = useClipboardHistory();
  useDocumentTheme(useStoredTheme());
  const PinIcon = frame.pinned ? Pin : PinOff;
  return (
    <main className="clipboard-window">
      <header className="clipboard-window__titlebar" onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as Element).closest("button")) return;
        event.preventDefault();
        void dragClipboardWindow().catch(frame.reportFailure);
      }}>
        <button className={`clipboard-window__button${frame.pinned ? " clipboard-window__button--pinned" : ""}`} type="button"
          aria-label={frame.pinned ? t.clipboard.unpinWindow : t.clipboard.pinWindow} aria-pressed={frame.pinned}
          disabled={frame.busy} onClick={() => void frame.togglePinned()}>
          <PinIcon size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
        <span className="clipboard-window__drag-area" aria-label={t.clipboard.moveWindow} />
        <button className="clipboard-window__button" type="button" aria-label={t.clipboard.closeWindow}
          onClick={() => { void closeClipboardWindow().catch(frame.reportFailure); }}>
          <X size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
      </header>
      <div className="clipboard-window__content">
        <ClipboardHistoryPanel variant="window" snapshot={clipboard.clipboardHistory}
          onCopyItem={clipboard.copyClipboardHistoryItem} onToggleFavorite={clipboard.toggleClipboardHistoryFavorite}
          onUpdateNote={clipboard.updateClipboardHistoryItemNote} onDeleteItem={clipboard.deleteClipboardHistoryItem}
          onDeleteItems={clipboard.deleteClipboardHistoryItems} />
      </div>
      {frame.failed && <div className="clipboard-window__error" role="alert">{t.clipboard.windowActionFailed}</div>}
      {EDGES.map((edge) => <div key={edge} className={`clipboard-window__resize clipboard-window__resize--${edge}`} aria-hidden="true"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          void resizeClipboardWindow(edge).catch(frame.reportFailure);
        }} />)}
    </main>
  );
}
