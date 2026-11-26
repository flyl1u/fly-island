// The pure part of install / removal progress; usePluginJobs.ts keeps the shared state.
import type { PluginInstallProgress } from "./api";

export type PluginJobs = Readonly<Record<string, PluginInstallProgress>>;

/** Finished or cancelled: the host has dropped the job, so the card goes back to the installed state. */
export function isJobOver(job: Pick<PluginInstallProgress, "phase">) {
  return job.phase === "done" || job.phase === "cancelled";
}

/** Only a download or its check can be cancelled; installing is short and runs to the end. */
export function isJobCancellable(job: Pick<PluginInstallProgress, "phase">) {
  return job.phase === "downloading" || job.phase === "verifying";
}

export function isJobActive(job: PluginInstallProgress | undefined) {
  return job !== undefined && job.phase !== "failed" && !isJobOver(job);
}

export function withJob(jobs: PluginJobs, job: PluginInstallProgress): PluginJobs {
  return { ...jobs, [job.id]: job };
}

export function withoutJob(jobs: PluginJobs, id: string): PluginJobs {
  if (!(id in jobs)) return jobs;
  const next = { ...jobs };
  delete next[id];
  return next;
}

/**
 * Takes what the host reports when the page is (re)opened: jobs it no longer knows are over.
 * A plugin that has had news since the question was asked keeps it, as the answer may be older.
 */
export function restoreJobs(jobs: PluginJobs, listed: readonly PluginInstallProgress[], newer: ReadonlySet<string>): PluginJobs {
  const kept = Object.keys(jobs).filter((id) => !newer.has(id)).reduce(withoutJob, jobs);
  return listed.reduce((next, job) => newer.has(job.id) || isJobOver(job) ? next : withJob(next, job), kept);
}

/** Whole percent of a download, or null while its size is still unknown. */
export function downloadPercent(job: Pick<PluginInstallProgress, "downloaded" | "total">) {
  return job.total > 0 ? Math.min(100, Math.max(0, Math.floor((job.downloaded / job.total) * 100))) : null;
}

export function megabytes(bytes: number) {
  return (Math.max(0, bytes) / (1024 * 1024)).toFixed(1);
}
