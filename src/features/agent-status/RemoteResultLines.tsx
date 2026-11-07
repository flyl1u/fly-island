import { useTranslation } from "../../i18n";
import type { RemoteResult } from "./api";

/** One line per SSH remote computer an action also ran on (remote_setup.rs). */
export function RemoteResultLines({ results }: { results: RemoteResult[] | undefined }) {
  const text = useTranslation().settings.agent;
  return <>{results?.map(({ host, error }) => <span key={host}><br />{text.remoteResult(host, error)}</span>)}</>;
}
