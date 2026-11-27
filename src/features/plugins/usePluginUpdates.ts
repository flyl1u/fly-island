import { useState } from "react";
import { getPluginsIndex } from "./api";
import { pluginFailureCode, type PluginFailure } from "./errors.ts";

/** The published versions, asked for only when the user checks: opening a page never requests the index. */
export function usePluginUpdates() {
  const [versions, setVersions] = useState<Readonly<Record<string, string>> | null>(null);
  const [failure, setFailure] = useState<PluginFailure | null>(null);
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    setFailure(null);
    try {
      const entries = await getPluginsIndex();
      setVersions(Object.fromEntries(entries.map((entry) => [entry.id, entry.version])));
    } catch (error) {
      setVersions(null);
      setFailure(pluginFailureCode(error) ?? "plugin_index_unavailable");
    } finally {
      setChecking(false);
    }
  };
  return { versions, failure, checking, check };
}
