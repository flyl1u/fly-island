import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api";
import { cacheBalanceMetadata } from "./storage";
import type { BalanceSnapshot } from "./types";

export function useApiBalance() {
  const [snapshot, setSnapshot] = useState<BalanceSnapshot>({ revision: 0, enabled: false, accounts: [] });
  const latest = useRef(-1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const accept = useCallback((next: BalanceSnapshot) => {
    if (!next || !Array.isArray(next.accounts)) return;
    if (next.revision < latest.current) return;
    latest.current = next.revision;
    setSnapshot(next); cacheBalanceMetadata(next);
  }, []);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let receivedEvent = false;
    void api.onBalanceChanged(next => { if (!disposed) { receivedEvent = true; accept(next); } }).then(off => {
      if (disposed) off(); else unlisten = off;
      return api.getBalanceState();
    }).then(next => { if (!disposed && !receivedEvent) accept(next); }).catch(reason => {
      if (!disposed) setError(String(reason));
    }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; unlisten?.(); };
  }, [accept]);
  const perform = async <T,>(action: () => Promise<T>, after?: (value: T) => void) => {
    setBusy(true); setError("");
    try { const value = await action(); after?.(value); return true; }
    catch (reason) { setError(String(reason)); return false; }
    finally { setBusy(false); }
  };
  const change = (action: () => Promise<BalanceSnapshot>) => perform(action, accept);
  return { snapshot, error, setError, busy, loading, perform, change, accept };
}
