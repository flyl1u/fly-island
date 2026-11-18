import { useEffect, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { getClipboardStorageDirectory, pickClipboardStorageDirectory, setClipboardStorageDirectory, type ClipboardStorageInfo } from "./api";
import "./ClipboardStorageRows.css";

/**
 * Settings → Clipboard → Storage: the folder the history and its images live in. Moving
 * happens on the native side (clipboard_history/location.rs), copy first and switch last.
 */
export function ClipboardStorageRows() {
  const t = useTranslation();
  const text = t.settings.clipboard;
  const [info, setInfo] = useState<ClipboardStorageInfo | null>(null);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "moving" | "moved">("idle");
  const [error, setError] = useState("");
  const pickingRef = useRef(false);

  useEffect(() => {
    let didCancel = false;
    void getClipboardStorageDirectory()
      .then((next) => { if (!didCancel) { setInfo(next); setDraft(next.directory); } })
      .catch((failure) => { if (!didCancel) setError(String(failure)); });
    return () => { didCancel = true; };
  }, []);

  const move = async (directory: string) => {
    setState("moving");
    setError("");
    try {
      const next = await setClipboardStorageDirectory(directory);
      setInfo(next);
      setDraft(next.directory);
      setState("moved");
    } catch (failure) {
      setError(String(failure));
      setState("idle");
    }
  };

  const choose = async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      // Picking a folder moves the history there at once, as the todo save folder saves at once.
      const picked = await pickClipboardStorageDirectory(draft, text.storageChoose);
      if (picked !== null) { setDraft(picked); await move(picked); }
    } catch (failure) {
      setError(String(failure));
    } finally {
      pickingRef.current = false;
    }
  };

  const unchanged = info !== null && draft.trim() === info.directory;
  const moving = state === "moving";
  return (
    <SettingsGroup title={text.storageTitle} footer={text.storageHint}>
      <SettingsRow
        title={text.storageFolder}
        control={
          <>
            {state === "moved" && unchanged
              ? <span className="clipboard-storage__done">{text.storageMoved}</span>
              : <SettingsLinkButton disabled={moving || unchanged || !draft.trim()} onClick={() => void move(draft)}>{moving ? text.storageMoving : text.storageMove}</SettingsLinkButton>}
            {info && !info.isDefault && <SettingsLinkButton disabled={moving} onClick={() => void move("")}>{text.storageReset}</SettingsLinkButton>}
          </>
        }
      >
        <div className="clipboard-storage__field">
          <SettingsInput monospace value={draft} disabled={moving} aria-label={text.storageFolder}
            placeholder={info?.defaultDirectory}
            onChange={(event) => { setDraft(event.currentTarget.value); setState("idle"); }}
            onKeyDown={(event) => { if (event.key === "Enter" && !unchanged && draft.trim()) void move(draft); }} />
          <button type="button" className="clipboard-storage__browse" aria-label={text.storageChoose} title={text.storageChoose}
            disabled={moving} onClick={() => void choose()}>
            <FolderOpen size={17} aria-hidden="true" />
          </button>
        </div>
        {error && <p className="clipboard-storage__error" role="alert">{error}</p>}
      </SettingsRow>
    </SettingsGroup>
  );
}
