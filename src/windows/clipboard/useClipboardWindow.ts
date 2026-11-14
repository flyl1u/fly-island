import { useEffect, useState } from "react";
import { setClipboardWindowPinned, setClipboardWindowTitle, showClipboardWindow } from "./api";
import { loadClipboardWindowPinned, saveClipboardWindowPinned } from "./storage";

/** Restore pinning before the first reveal, so an unpinned window never flashes on top. */
export function useClipboardWindow(title: string) {
  const [pinned, setPinned] = useState(loadClipboardWindowPinned);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
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
  return { pinned, busy, failed, togglePinned, reportFailure: () => setFailed(true) };
}
