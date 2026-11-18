import { useCallback, useEffect, useRef, useState } from "react";
import type { EyeCareBreak } from "../../features/eye-care/types";
import { getEyeCareBreak, onEyeCareBreak, runEyeCareAction, showEyeCareBreakWindow } from "./api";

export function useEyeCareWindow() {
  const [snapshot, setSnapshot] = useState<EyeCareBreak | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const revealed = useRef(false);
  useEffect(() => {
    let disposed = false;
    let version = 0;
    let unlisten: (() => void) | undefined;
    void onEyeCareBreak((value) => {
      version += 1;
      if (!disposed) setSnapshot(value);
    }).then(async (stop) => {
      if (disposed) { stop(); return; }
      unlisten = stop;
      const before = version;
      const current = await getEyeCareBreak();
      if (!disposed && version === before) setSnapshot(current);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  const active = snapshot !== null;
  useEffect(() => {
    if (!active || revealed.current) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        revealed.current = true;
        void showEyeCareBreakWindow().catch(() => setFailed(true));
      });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [active]);

  const run = useCallback(async (action: string) => {
    setBusy(true);
    setFailed(false);
    try { await runEyeCareAction(action); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }, []);
  return { snapshot, busy, failed, run };
}
