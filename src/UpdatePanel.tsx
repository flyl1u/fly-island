import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { Loader2, RefreshCcw } from "lucide-react";
import { useTranslation } from "./i18n";
import "./UpdatePanel.css";

type UpdateStage = "idle" | "checking" | "latest" | "available" | "downloading" | "installing" | "done" | "error";

export function UpdatePanel() {
  const t = useTranslation();
  const [version, setVersion] = useState("");
  const [stage, setStage] = useState<UpdateStage>("idle");
  const [nextVersion, setNextVersion] = useState("");
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState(0);
  const pending = useRef<Update | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const releasePending = useCallback(async () => {
    const update = pending.current;
    pending.current = null;
    if (!update) return;
    try {
      await update.close();
    } catch {
      // The installer takes over the update resource, so closing it can fail.
    }
  }, []);

  useEffect(() => () => {
    void releasePending();
  }, [releasePending]);

  const runCheck = useCallback(async () => {
    if (!isTauri()) {
      setStage("error");
      return;
    }

    await releasePending();
    setNextVersion("");
    setDownloaded(0);
    setTotal(0);
    setStage("checking");

    try {
      const found = await check({ timeout: 20000 });
      pending.current = found;

      if (!found) {
        setStage("latest");
        return;
      }

      setNextVersion(found.version);
      setStage("available");
    } catch (error) {
      console.error("Failed to check for updates", error);
      setStage("error");
    }
  }, [releasePending]);

  const install = useCallback(async () => {
    const update = pending.current;
    if (!update) return;

    setDownloaded(0);
    setTotal(0);
    setStage("downloading");

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setTotal(event.data.contentLength ?? 0);
          return;
        }

        if (event.event === "Progress") {
          setDownloaded((value) => value + event.data.chunkLength);
          return;
        }

        setStage("installing");
      }, { timeout: 600000 });
      setStage("done");
    } catch (error) {
      console.error("Failed to install the update", error);
      setStage("error");
    } finally {
      await releasePending();
    }
  }, [releasePending]);

  const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
  const busy = stage === "checking" || stage === "downloading" || stage === "installing";

  let status = version ? t.settings.project.update.versionLabel(version) : t.settings.project.update.hint;
  let action = t.settings.project.update.check;
  let onAction = runCheck;

  if (stage === "checking") {
    status = t.settings.project.update.checking;
  } else if (stage === "latest") {
    status = t.settings.project.update.upToDate(version);
  } else if (stage === "available") {
    status = t.settings.project.update.available(nextVersion);
    action = t.settings.project.update.download;
    onAction = install;
  } else if (stage === "downloading") {
    status = percent === null
      ? t.settings.project.update.downloadingUnknown
      : t.settings.project.update.downloading(percent);
    action = t.settings.project.update.download;
    onAction = install;
  } else if (stage === "installing") {
    status = t.settings.project.update.installing;
  } else if (stage === "done") {
    status = t.settings.project.update.done;
  } else if (stage === "error") {
    status = t.settings.project.update.error;
  }

  return (
    <div className={`update-panel update-panel--${stage}`}>
      <div className="update-panel__row">
        <span className="update-panel__icon" aria-hidden="true">
          {busy ? (
            <Loader2 size={18} strokeWidth={1.8} />
          ) : (
            <RefreshCcw size={18} strokeWidth={1.8} />
          )}
        </span>
        <span className="update-panel__copy">
          <strong>{t.settings.project.update.title}</strong>
          <span role={stage === "error" ? "alert" : undefined}>{status}</span>
        </span>
        {stage !== "done" && (
          <button
            className="update-panel__action"
            type="button"
            disabled={busy}
            onClick={() => void onAction()}
          >
            {action}
          </button>
        )}
      </div>
      {percent !== null && (stage === "downloading" || stage === "installing") && (
        <div
          className="update-panel__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span className="update-panel__fill" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}
