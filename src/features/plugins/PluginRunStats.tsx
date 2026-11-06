import { useTranslation } from "../../i18n";
import type { PluginInfo } from "./api";
import { memorySplit } from "./runStats.ts";

/** How a plugin runs: on demand or not, its own memory, why it keeps running. */
export function PluginRunStats({ plugin }: { plugin: PluginInfo }) {
  const t = useTranslation();
  const labels = t.settings.plugins.run;
  const resources = plugin.resources;
  const split = resources ? memorySplit(resources) : null;
  const facts = [
    // Only the plugin's own share; the runtime's fixed share would read as the plugin's.
    split ? labels.memory(split.runtime ? split.runtime.plugin : split.total) : null,
  ].filter((fact): fact is string => fact !== null);

  return (
    <>
      {plugin.activation === "onDemand" ? <p className="plugin-card__hint">{labels.onDemand}</p> : null}
      {facts.length > 0 ? <p className="plugin-card__hint">{facts.join(" · ")}</p> : null}
      {plugin.keepAlive ? <p className="plugin-card__hint">{labels.keepAlive(plugin.keepAlive)}</p> : null}
      {resources?.highCpu ? <p className="plugin-card__error">{labels.highCpu}</p> : null}
    </>
  );
}
