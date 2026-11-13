import { useCallback, useEffect, useRef, useState } from "react";
import { getNeteasePluginStatus, installNeteasePlugin, uninstallNeteasePlugin, listenMediaPluginProgress } from "./api";
import type { NeteasePluginStatus, MediaPluginError, MediaPluginProgress, MediaPluginResult } from "./api";

export function useNeteasePlugin(enabled = true) {
  const [status, setStatus] = useState<NeteasePluginStatus | null>(null);
  const [progress, setProgress] = useState<MediaPluginProgress | null>(null);
  const [error, setError] = useState<MediaPluginError | null>(null);
  const [result, setResult] = useState<MediaPluginResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  const mounted = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (!enabled) return () => { mounted.current = false; };
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const refresh = () => { void getNeteasePluginStatus().then((value) => { if (!disposed) setStatus(value); }).catch(() => {}); };
    refresh();
    void listenMediaPluginProgress((value) => {
      if (disposed) return;
      setProgress(value);
      if (value.stage === "done" || value.stage === "error") { setBusy(false); refresh(); }
      else setBusy(true);
    }).then((off) => { if (disposed) off(); else unlisten = off; }).catch(() => {});
    return () => { disposed = true; mounted.current = false; unlisten?.(); };
  }, [enabled]);
  const run = useCallback(async (remove: boolean) => {
    if (active.current) return;
    active.current = true;
    setBusy(true); setError(null); setResult(null); setRemoved(false); setProgress({ stage: "downloading" });
    try {
      const value = await (remove ? uninstallNeteasePlugin() : installNeteasePlugin());
      if (mounted.current) { setResult(value); setRemoved(remove); setStatus(await getNeteasePluginStatus()); }
    } catch (value: unknown) {
      if (mounted.current) {
        const e = value as Partial<MediaPluginError> | null;
        setError(e && typeof e.kind === "string" && typeof e.detail === "string"
          ? e as MediaPluginError : { kind: "Io", detail: String(value) });
      }
    } finally {
      active.current = false;
      if (mounted.current) { setBusy(false); setProgress(null); }
    }
  }, []);
  return { status, progress, error, result, busy, removed, install: () => run(false), uninstall: () => run(true) };
}
