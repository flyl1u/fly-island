import { useState } from "react";
import { cancelPluginInstall, type PluginInstallProgress } from "../../features/plugins/api";
import { downloadPercent, isJobCancellable, megabytes } from "../../features/plugins/jobs.ts";
import { useTranslation } from "../../i18n";

/** Quiet text button; greyed out until the host has answered. */
function CancelInstall({ name, id }: { name: string; id: string }) {
  const t = useTranslation().settings.plugins.market;
  const [asking, setAsking] = useState(false);
  return <button type="button" className="plugin-card__cancel" aria-label={t.cancelNamed(name)} disabled={asking}
    onClick={() => {
      setAsking(true);
      // False means installing has begun; the job then ends as usual and this button goes with it.
      void cancelPluginInstall(id).catch(console.error).finally(() => setAsking(false));
    }}>{t.cancel}</button>;
}

/** The stage of a running install or removal, with a bar, percent and a way to cancel while downloading. */
export function PluginCardProgress({ name, job }: { name: string; job: PluginInstallProgress }) {
  const t = useTranslation().settings.plugins.market;
  if (job.phase === "uninstalling") return <div className="plugin-card__progress" role="status">{t.uninstalling}</div>;
  const downloading = job.phase === "downloading";
  const percent = downloading ? downloadPercent(job) : 100;
  const stage = !downloading ? (job.phase === "verifying" ? t.verifying : t.unpacking)
    : percent === null ? t.connecting : t.downloaded(megabytes(job.downloaded), megabytes(job.total));
  return <div className="plugin-card__progress">
    <div className="plugin-card__meter" role="progressbar" aria-label={t.progressNamed(name)}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={stage}>
      <span style={{ width: `${percent ?? 0}%` }} />
    </div>
    <p className="plugin-card__progress-line">
      <span>{stage}</span>
      {downloading && percent !== null && <span>{percent}%</span>}
      {isJobCancellable(job) && <CancelInstall name={name} id={job.id} />}
    </p>
  </div>;
}
