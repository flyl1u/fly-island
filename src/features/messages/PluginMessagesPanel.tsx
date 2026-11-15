import { useState, type ReactNode } from "react";
import { useTranslation } from "../../i18n";
import { runPluginAction } from "../plugins";
import { usePluginNotifications } from "./pluginNotifications";
import { MessageCard } from "./MessageCard";

export function PluginMessagesPanel({ navigation }: { navigation: ReactNode }) {
  const t = useTranslation();
  const items = usePluginNotifications();
  const [error, setError] = useState("");
  return <section className="qq-panel">
    <header className="qq-panel__header">{navigation}</header>
    {error && <p className="qq-panel__error" role="alert">{error}</p>}
    <div className="qq-panel__list message-card-list" role="list">
      {items.map((n) => <MessageCard key={`${n.pluginId}/${n.id}`} source="plugin" icon={n.icon} name={n.title || n.appName} timestamp={n.receivedAt} body={n.body} onOpen={n.action ? () => { setError(""); void runPluginAction(n.pluginId, n.action!).catch((e: unknown) => setError(String(e))); } : undefined} />)}
      {items.length === 0 && <div className="qq-panel__empty" role="status">{t.common.noMessages}</div>}
    </div>
  </section>;
}
