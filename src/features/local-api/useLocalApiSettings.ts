import { useCallback, useEffect, useState } from "react";
import { getLocalApiState, resetLocalApiToken, setLocalApiSettings, type LocalApiState } from "./api";

/** Local API state for the settings page: switches, address, token and errors. */
export function useLocalApiSettings() {
  const [state, setState] = useState<LocalApiState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (action: () => Promise<LocalApiState>) => {
    setBusy(true);
    try {
      setState(await action());
      setError("");
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run(getLocalApiState);
  }, [run]);

  const setEnabled = useCallback(
    (enabled: boolean) => void run(() => setLocalApiSettings(enabled, state?.allowWrite ?? false)),
    [run, state?.allowWrite],
  );
  const setAllowWrite = useCallback(
    (allowWrite: boolean) => void run(() => setLocalApiSettings(state?.enabled ?? false, allowWrite)),
    [run, state?.enabled],
  );
  const resetToken = useCallback(() => void run(resetLocalApiToken), [run]);

  return { state, error: error || state?.error || "", busy, setEnabled, setAllowWrite, resetToken };
}
