import { useEffect, useState } from "react";
import { loadSettings, STORAGE_KEY } from "../../features/appearance/storage";
import { closeClipboardWindow, closesClipboardWindowOnBlur, isClipboardWindowFocused, listenClipboardWindowFocus, setClipboardWindowPinned, setClipboardWindowTitle, showClipboardWindow } from "./api";
import { loadClipboardWindowPinned, saveClipboardWindowPinned } from "./storage";

/** Restore pinning before the first reveal, so an unpinned window never flashes on top. */
export function useClipboardWindow(title: string) {
  const [pinned, setPinned] = useState(loadClipboardWindowPinned);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const [hoverPreview, setHoverPreview] = useState(() => loadSettings().clipboardHoverPreview);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setHoverPreview(loadSettings().clipboardHoverPreview);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    void setClipboardWindowTitle(title).catch(() => setFailed(true));
  }, [title]);
  useEffect(() => {
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    const reveal = () => {
      if (!cancelled) void showClipboardWindow().catch(() => { if (!cancelled) setFailed(true); });
    };
    void setClipboardWindowPinned(loadClipboardWindowPinned()).catch(() => {
      if (!cancelled) setFailed(true);
    }).finally(() => {
      if (cancelled) return;
      setBusy(false);
      if (document.visibilityState === "hidden") reveal();
      else firstFrame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(reveal); });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, []);
  // Unpinned and set to close on blur: clicking another window closes it. A short wait lets a
  // focus that comes straight back (the system menu, a title-bar drag) keep it open.
  useEffect(() => {
    if (pinned) return;
    let didCancel = false;
    let timer = 0;
    let unlisten: (() => void) | null = null;
    void listenClipboardWindowFocus((focused) => {
      window.clearTimeout(timer);
      if (focused || !closesClipboardWindowOnBlur()) return;
      timer = window.setTimeout(() => {
        void isClipboardWindowFocused().then((back) => {
          if (!back && !didCancel) void closeClipboardWindow().catch(() => setFailed(true));
        });
      }, 150);
    }).then((next) => { if (didCancel) next(); else unlisten = next; });
    return () => { didCancel = true; window.clearTimeout(timer); unlisten?.(); };
  }, [pinned]);
  const togglePinned = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const next = !pinned;
    try {
      await setClipboardWindowPinned(next);
      if (!saveClipboardWindowPinned(next)) {
        await setClipboardWindowPinned(pinned);
        setFailed(true);
      } else setPinned(next);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return { pinned, busy, failed, hoverPreview, togglePinned, reportFailure: () => setFailed(true) };
}
