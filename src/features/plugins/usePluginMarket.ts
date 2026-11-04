import { useCallback, useEffect, useState } from "react";
import { getPluginMarket, installMarketPlugin, type MarketSnapshot, type PluginsSnapshot } from "./api";

/**
 * The plugin market index, fetched when the page opens and on Refresh, and
 * installing from it. `onInstalled` receives the new list of installed plugins.
 */
export function usePluginMarket(onInstalled: (snapshot: PluginsSnapshot) => void) {
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [installingId, setInstallingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setMarket(await getPluginMarket());
      setError("");
    } catch (nextError) {
      setError(String(nextError));
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
        setError("");
      } catch (nextError) {
        setError(String(nextError));
      } finally {
        setInstallingId(null);
      }
    },
    [onInstalled],
  );

  return { market, loading, error, installingId, refresh, install };
}
