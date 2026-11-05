import { useCallback, useEffect, useState } from "react";
import {
  getPluginMarket,
  installMarketPlugin,
  marketPublisher,
  setPluginPublisherTrusted,
  type MarketSnapshot,
  type PluginsSnapshot,
} from "./api";

/**
 * The last index this window loaded, so reopening the page shows it at once
 * while a fresh copy loads in the background.
 */
let lastMarket: MarketSnapshot | null = null;

/**
 * The plugin market index, fetched when the page opens and on Refresh, and
 * installing from it. `onInstalled`, when given, receives the new list of installed plugins.
 */
export function usePluginMarket(onInstalled?: (snapshot: PluginsSnapshot) => void) {
  const [market, setMarket] = useState<MarketSnapshot | null>(lastMarket);
  useEffect(() => {
    lastMarket = market;
  }, [market]);
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

  /** `trust`: trust the plugin's publisher first (the user agreed on the button). */
  const install = useCallback(
    async (id: string, trust = false) => {
      setInstallingId(id);
      setInstallError(null);
      try {
        const plugin = market?.plugins.find((item) => item.id === id);
        if (trust && plugin && market) {
          const publisher = marketPublisher(plugin, market);
          await setPluginPublisherTrusted(publisher, true);
          setMarket((current) => current && { ...current, trustedPublishers: [...current.trustedPublishers, publisher] });
        }
        const installed = await installMarketPlugin(id);
        onInstalled?.(installed);
        setMarket((current) =>
          current && {
            ...current,
            plugins: current.plugins.map((item) => (item.id === id ? { ...item, installedVersion: item.version } : item)),
          },
        );
      } catch (nextError) {
        setInstallError({ id, detail: String(nextError) });
      } finally {
        setInstallingId(null);
      }
    },
    [market, onInstalled],
  );

  return { market, loading, loadError, installError, installingId, refresh, install };
}
