// Numbers for a plugin card's run line: memory split into the runtime's share and the
// plugin's own, CPU that reads "idle" when nothing runs, and the per-process detail.
import type { PluginResources } from "./api";

/** Below this the CPU line says idle: a plugin waiting for messages uses ~0.0 %. */
export const IDLE_CPU_PERCENT = 0.1;

/** Display names of the runtimes baseline.rs measures, by process file name. */
const RUNTIME_NAMES: Record<string, string> = {
  "powershell.exe": "PowerShell",
  "node.exe": "Node.js",
};

export function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export type MemorySplit = {
  total: string;
  /** Present when the runtime's idle size is known: runtime name, its share, the rest. */
  runtime: { name: string; megabytes: string; plugin: string } | null;
};

export function memorySplit(resources: PluginResources): MemorySplit {
  const total = megabytes(resources.memoryBytes);
  const host = resources.processes[0]?.name.toLowerCase() ?? "";
  const name = RUNTIME_NAMES[host];
  if (!name || resources.runtimeBytes === null || resources.runtimeBytes <= 0) return { total, runtime: null };
  // A runtime can be measured a little above a plugin that just started; never show a negative share.
  const runtimeBytes = Math.min(resources.runtimeBytes, resources.memoryBytes);
  return {
    total,
    runtime: { name, megabytes: megabytes(runtimeBytes), plugin: megabytes(resources.memoryBytes - runtimeBytes) },
  };
}

export function isIdleCpu(cpuPercent: number): boolean {
  return cpuPercent < IDLE_CPU_PERCENT;
}
