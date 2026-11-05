import { useTranslation } from "../../i18n";
import type { PluginInfo } from "./api";

/** How a plugin runs: on demand or not, its memory and CPU, start-up time, why it keeps running. */
export function PluginRunStats({ plugin }: { plugin: PluginInfo }) {
  const t = useTranslation();
  const labels = t.settings.plugins.run;
  const facts = [
    plugin.resources ? labels.memory((plugin.resources.memoryBytes / (1024 * 1024)).toFixed(1)) : null,
    plugin.resources ? labels.cpu(plugin.resources.cpuPercent.toFixed(1)) : null,
    plugin.startupMs !== null ? labels.startup(plugin.startupMs) : null,
  ].filter((fact): fact is string => fact !== null);

  return (
    <>
      {plugin.activation === "onDemand" ? <p className="plugin-card__hint">{labels.onDemand}</p> : null}
      {facts.length > 0 ? <p className="plugin-card__hint">{facts.join(" · ")}</p> : null}
      {plugin.keepAlive ? <p className="plugin-card__hint">{labels.keepAlive(plugin.keepAlive)}</p> : null}
      {plugin.resources?.highCpu ? <p className="plugin-card__error">{labels.highCpu}</p> : null}
    </>
  );
}
