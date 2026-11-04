import { useCallback, useEffect, useState } from "react";
import { getPluginMarket, installMarketPlugin, type MarketSnapshot, type PluginsSnapshot } from "./api";

/**
 * The plugin market index, fetched when the page opens and on Refresh, and
 * installing from it. `onInstalled` receives the new list of installed plugins.
 */
export function usePluginMarket(onInstalled: (snapshot: PluginsSnapshot) => void) {
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  // Kept apart so a failed install does not read as the list failing to load.
  const [loadError, setLoadError] = useState("");
  const [installError, setInstallError] = useState<{ id: string; detail: string } | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Clear the old failure first, so a retry shows only "Loading" until it answers.
    setLoadError("");
    setInstallError(null);
    setLoading(true);
    try {
      setMarket(await getPluginMarket());
    } catch (nextError) {
      setLoadError(String(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const install = useCallback(
    async (id: string) => {
      setInstallingId(id);
      setInstallError(null);
      try {
        onInstalled(await installMarketPlugin(id));
        setMarket((current) =>
          current && {
            ...current,
            plugins: current.plugins.map((plugin) =>
              plugin.id === id ? { ...plugin, installedVersion: plugin.version } : plugin,
            ),
          },
        );
      } catch (nextError) {
        setInstallError({ id, detail: String(nextError) });
      } finally {
        setInstallingId(null);
      }
    },
    [onInstalled],
  );

  return { market, loading, loadError, installError, installingId, refresh, install };
}
