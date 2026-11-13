import { useEffect, useState } from "react";
import { getMediaDiagnostics, listenMediaSessionChanged, type MediaDiagnostics } from "./api";

const EMPTY: MediaDiagnostics = { players: [] };
let cached = EMPTY;
let lastStarted = -Infinity;
let pending: Promise<MediaDiagnostics> | null = null;

function read() {
  if (pending) return pending;
  if (Date.now() - lastStarted < 5000) return Promise.resolve(cached);
  lastStarted = Date.now();
  pending = getMediaDiagnostics().then((value) => (cached = value)).finally(() => { pending = null; });
  return pending;
}

/** 仅在打开、切换播放器和媒体事件时刷新；末尾补读，跨面板最多每五秒一次。 */
export function useMediaDiagnostics(sourceAppId: string | null = null) {
  const [diagnostics, setDiagnostics] = useState(cached);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let unlisten: (() => void) | undefined;
    const refresh = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        void read().then((value) => {
          if (!disposed) { setDiagnostics(value); setError(null); }
        }).catch((failure: unknown) => { if (!disposed) setError(String(failure)); });
      }, Math.max(0, 5000 - (Date.now() - lastStarted)));
    };
    refresh();
    listenMediaSessionChanged(refresh).then((stop) => {
      if (disposed) stop(); else unlisten = stop;
    }).catch((failure: unknown) => { if (!disposed) setError(String(failure)); });
    return () => { disposed = true; unlisten?.(); window.clearTimeout(timer); };
  }, [sourceAppId]);
  return { diagnostics, error };
}
