import { useEffect, useState } from "react";
import { usePlugins, type PluginNotification } from "../plugins";
import type { MessagePreview } from "./messagePreview";

export type OwnedNotification = PluginNotification & { pluginId: string };
export function usePluginNotifications(): OwnedNotification[] {
  const snapshot = usePlugins();
  return Object.entries(snapshot.live).flatMap(([id, live]) => snapshot.registry.installed[id]?.enabled && live.status === "running" ? live.notifications.map((n) => ({ ...n, pluginId: id })) : []).sort((a, b) => b.receivedAt - a.receivedAt);
}
export function usePluginPreview(enabled: boolean): MessagePreview | null {
  const newest = usePluginNotifications()[0];
  const timestamp = newest?.receivedAt ?? 0;
  const [expired, setExpired] = useState(0);
  useEffect(() => {
    if (timestamp <= 0) return;
    const timer = window.setTimeout(() => setExpired(timestamp), Math.max(0, timestamp + 8000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [timestamp]);
  return enabled && newest && timestamp > expired && timestamp > Date.now() - 8000 ? { source: "plugin", title: newest.title || newest.appName, body: newest.body, receivedAt: timestamp } : null;
}
