import { useCallback, useEffect, useState } from "react";
import {
  checkPluginUpdates,
  clearPluginData,
  listPlugins,
  openPluginsFolder,
  reloadPlugins,
  revokePluginSensitivePermission,
  runPluginCommand,
  setPluginAutoUpdate,
  setPluginEnabled,
  setPluginPublisherTrusted,
  setPluginNotificationsMuted,
  setPluginPreRelease,
  setPluginMemoryLimit,
  setPluginSetting,
  setPluginsAllowed,
  uninstallPlugin,
  type PluginsSnapshot,
} from "./api";
import type { PromptedPermission } from "./promptedPermissions";

// Status and log lines change in the background; refreshed while the page is open.
const REFRESH_MS = 2000;

/** Installed plugins and their actions, for the settings page. */
export function usePlugins() {
  const [snapshot, setSnapshot] = useState<PluginsSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (action: () => Promise<PluginsSnapshot | void>) => {
    setBusy(true);
    try {
      const next = await action();
      if (next) {
        setSnapshot(next);
      }
      setError("");
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let didCancel = false;
    const refresh = () =>
      void listPlugins()
        .then((next) => !didCancel && setSnapshot(next))
        .catch((nextError) => !didCancel && setError(String(nextError)));
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      didCancel = true;
      window.clearInterval(timer);
    };
  }, []);

  return {
    snapshot,
    error,
    busy,
    setAllowed: useCallback((allowed: boolean) => void run(() => setPluginsAllowed(allowed)), [run]),
    setEnabled: useCallback((id: string, enabled: boolean) => void run(() => setPluginEnabled(id, enabled)), [run]),
    reload: useCallback(() => void run(reloadPlugins), [run]),
    openFolder: useCallback(() => void run(openPluginsFolder), [run]),
    runCommand: useCallback((id: string, command: string) => void run(() => runPluginCommand(id, command)), [run]),
    uninstall: useCallback((id: string) => void run(() => uninstallPlugin(id)), [run]),
    clearData: useCallback((id: string) => void run(() => clearPluginData(id)), [run]),
    setAutoUpdate: useCallback((enabled: boolean) => void run(() => setPluginAutoUpdate(enabled)), [run]),
    untrustPublisher: useCallback((publisher: string) => void run(() => setPluginPublisherTrusted(publisher, false)), [run]),
    checkUpdates: useCallback(() => void run(checkPluginUpdates), [run]),
    revokeSensitive: useCallback(
      (id: string, permission: PromptedPermission) => void run(() => revokePluginSensitivePermission(id, permission)),
      [run],
    ),
    setMemoryLimit: useCallback(
      (id: string, megabytes: number) => void run(() => setPluginMemoryLimit(id, megabytes)),
      [run],
    ),
    setPreRelease: useCallback(
      (id: string, enabled: boolean) => void run(() => setPluginPreRelease(id, enabled)),
      [run],
    ),
    setNotificationsMuted: useCallback(
      (id: string, muted: boolean) => void run(() => setPluginNotificationsMuted(id, muted)),
      [run],
    ),
    setSetting: useCallback(
      (id: string, key: string, value: unknown) => void run(() => setPluginSetting(id, key, value)),
      [run],
    ),
  };
}
