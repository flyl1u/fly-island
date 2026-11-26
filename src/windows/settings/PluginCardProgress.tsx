import type { PluginInstallProgress } from "../../features/plugins/api";
import { downloadPercent, megabytes } from "../../features/plugins/jobs.ts";
import { useTranslation } from "../../i18n";

/** The stage of a running install or removal, with a bar and percent while downloading. */
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
    </p>
  </div>;
}
