import { useCallback, useEffect, useState } from "react";
import { getWorkbuddyUsage, onWorkbuddyUsageChanged, type WorkbuddyState } from "./api";

const SIGNED_OUT: WorkbuddyState = { status: "signedOut" };
const UNAVAILABLE: WorkbuddyState = { status: "unavailable" };
const WORKBUDDY_POLL_MS = 30_000;

export function useWorkbuddyUsage(enabled: boolean, polling = enabled) {
  const [state, setState] = useState<WorkbuddyState>(SIGNED_OUT);

  useEffect(() => {
    if (!enabled) {
      setState(SIGNED_OUT);
      return;
    }
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let generation = 0;
    const refresh = () => {
      const requested = ++generation;
      void getWorkbuddyUsage(false, !polling).catch(() => UNAVAILABLE).then((next) => {
        if (!disposed && requested === generation) setState(next ?? UNAVAILABLE);
      });
    };
    void onWorkbuddyUsageChanged((next) => {
      generation++;
      if (!disposed) setState(next);
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch(() => undefined).finally(() => { if (!disposed) refresh(); });

    // The native cache limits successful billing requests to every five minutes. Checking the
    // local connection more often notices expiry and updates the two island windows together.
    const timer = polling ? window.setInterval(refresh, WORKBUDDY_POLL_MS) : undefined;
    return () => {
      disposed = true;
      unlisten?.();
      window.clearInterval(timer);
    };
  }, [enabled, polling]);

  const retry = useCallback(async () => { await getWorkbuddyUsage(true); }, []);

  return { state: enabled ? state : SIGNED_OUT, retry };
}
