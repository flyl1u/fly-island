import { useCallback, useEffect, useRef, useState } from "react";
import { closeNetease, getNeteasePluginStatus, installNeteasePlugin, prepareNeteaseManualInstall, uninstallNeteasePlugin, listenMediaPluginProgress } from "./api";
import type { NeteasePluginStatus, MediaPluginError, MediaPluginProgress, MediaPluginResult } from "./api";

function asPluginError(value: unknown): MediaPluginError {
  const e = value as Partial<MediaPluginError> | null;
  return e && typeof e.kind === "string" && typeof e.detail === "string" ? e as MediaPluginError : { kind: "Io", detail: String(value) };
}

export function useNeteasePlugin(enabled = true) {
  const [status, setStatus] = useState<NeteasePluginStatus | null>(null);
  const [progress, setProgress] = useState<MediaPluginProgress | null>(null);
  const [error, setError] = useState<MediaPluginError | null>(null);
  const [result, setResult] = useState<MediaPluginResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restarted, setRestarted] = useState(false);
  const [manualReady, setManualReady] = useState(false);
  const mounted = useRef(false);
  const active = useRef(false);
  const lastRemove = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (!enabled) return () => { mounted.current = false; };
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const refresh = () => { void getNeteasePluginStatus().then((value) => { if (!disposed) setStatus(value); }).catch(() => {}); };
    refresh();
    // 用户在资源管理器里手动放好文件后回到这里，状态要跟着变。
    window.addEventListener("focus", refresh);
    void listenMediaPluginProgress((value) => {
      if (disposed) return;
      setProgress(value);
      if (value.stage === "done" || value.stage === "error") { setBusy(false); refresh(); }
      else setBusy(true);
    }).then((off) => { if (disposed) off(); else unlisten = off; }).catch(() => {});
    return () => { disposed = true; mounted.current = false; window.removeEventListener("focus", refresh); unlisten?.(); };
  }, [enabled]);
  const run = useCallback(async (remove: boolean, closeFirst = false) => {
    if (active.current) return;
    active.current = true;
    lastRemove.current = remove;
    setBusy(true); setError(null); setResult(null); setRemoved(false); setRestarted(false); setManualReady(false); setProgress({ stage: "downloading" });
    try {
      if (closeFirst) await closeNetease(false);
      const value = await (remove ? uninstallNeteasePlugin() : installNeteasePlugin());
      if (mounted.current) { setResult(value); setRemoved(remove); setStatus(await getNeteasePluginStatus()); }
    } catch (value: unknown) {
      if (mounted.current) setError(asPluginError(value));
    } finally {
      active.current = false;
      if (mounted.current) { setBusy(false); setProgress(null); }
    }
  }, []);
  /** 只在用户点了“手动放入”后调用：安全软件拦下了写入，改由用户在资源管理器里拖一个文件。 */
  const manual = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    setBusy(true); setError(null);
    try {
      await prepareNeteaseManualInstall();
      if (mounted.current) setManualReady(true);
    } catch (value: unknown) {
      if (mounted.current) setError(asPluginError(value));
    } finally {
      active.current = false;
      if (mounted.current) { setBusy(false); setProgress(null); }
    }
  }, []);
  /** 只在用户点了“立即重启网易云”后调用：结束网易云再重新打开，让刚装的插件生效。 */
  const restart = useCallback(async () => {
    setRestarting(true); setError(null);
    try {
      await closeNetease(true);
      if (mounted.current) setRestarted(true);
    } catch (value: unknown) {
      if (mounted.current) setError(asPluginError(value));
    } finally {
      if (mounted.current) setRestarting(false);
    }
  }, []);
  return {
    status, progress, error, result, busy: busy || restarting, restarting, removed, restarted, manualReady, manual,
    install: () => run(false), uninstall: () => run(true),
    /** 用户点了“关闭网易云并继续”：关掉网易云，再做刚才没做成的安装或卸载。 */
    closeAndRetry: () => run(lastRemove.current, true),
    restart,
  };
}
export type NeteasePlugin = ReturnType<typeof useNeteasePlugin>;
