import { useTranslation } from "../../i18n";
import type { PluginInfo } from "./api";
import { isIdleCpu, megabytes, memorySplit } from "./runStats.ts";

/** How a plugin runs: on demand or not, its memory and CPU, start-up time, why it keeps running. */
export function PluginRunStats({ plugin }: { plugin: PluginInfo }) {
  const t = useTranslation();
  const labels = t.settings.plugins.run;
  const resources = plugin.resources;
  const split = resources ? memorySplit(resources) : null;
  const facts = [
    // The card shows only the plugin's own share; the runtime's fixed share is in the hover detail.
    split ? labels.memory(split.runtime ? split.runtime.plugin : split.total) : null,
    resources ? (isIdleCpu(resources.cpuPercent) ? labels.cpuIdle : labels.cpu(resources.cpuPercent.toFixed(1))) : null,
    plugin.startupMs !== null ? labels.startup(plugin.startupMs) : null,
  ].filter((fact): fact is string => fact !== null);
  // Hover detail: each process of the plugin, then what the numbers mean.
  const detail = resources
    ? [
        ...resources.processes.map((process) => labels.processLine(process.name || "?", megabytes(process.memoryBytes), megabytes(process.workingSetBytes))),
        split?.runtime ? labels.memoryTotal(split.total, split.runtime.name, split.runtime.megabytes) : null,
        split?.runtime ? labels.runtimeHelp(split.runtime.name, split.runtime.megabytes) : null,
        labels.memoryHelp,
      ].filter((line): line is string => line !== null).join("\n")
    : undefined;

  return (
    <>
      {plugin.activation === "onDemand" ? <p className="plugin-card__hint">{labels.onDemand}</p> : null}
      {facts.length > 0 ? <p className="plugin-card__hint" title={detail}>{facts.join(" · ")}</p> : null}
      {plugin.keepAlive ? <p className="plugin-card__hint">{labels.keepAlive(plugin.keepAlive)}</p> : null}
      {resources?.highCpu ? <p className="plugin-card__error">{labels.highCpu}</p> : null}
    </>
  );
}
