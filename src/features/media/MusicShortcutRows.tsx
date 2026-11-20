import { useEffect, useState } from "react";
import { ShortcutRecordButton } from "../../components/controls/ShortcutRecordButton";
import { ShortcutResetButton } from "../../components/controls/ShortcutResetButton";
import { useTranslation } from "../../i18n";
import { buildShortcutFromEvent } from "../clipboard";
import { getMediaShortcutErrors, listenMediaShortcutStatus, type MediaShortcutErrors } from "./api";
import { MUSIC_SHORTCUT_ACTIONS, type MusicShortcutAction, type MusicShortcuts } from "./shortcuts";
import "../clipboard/ClipboardSettingsSection.css";

export function MusicShortcutRows({ shortcuts, onChange, takenBy }: {
  shortcuts: MusicShortcuts;
  onChange: (shortcuts: MusicShortcuts) => void;
  takenBy: (shortcut: string, action: MusicShortcutAction) => string | null;
}) {
  const t = useTranslation();
  const [errors, setErrors] = useState<MediaShortcutErrors>({});
  const [conflicts, setConflicts] = useState<Partial<Record<MusicShortcutAction, string>>>({});
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    let received = false;
    void listenMediaShortcutStatus((errors) => {
      received = true;
      if (!cancelled) setErrors(errors);
    }).then((unlisten) => {
      if (cancelled) { unlisten(); return; }
      stop = unlisten;
      return getMediaShortcutErrors().then((errors) => { if (!cancelled && !received) setErrors(errors); });
    }).catch((error) => console.error("Failed to read music shortcut status", error));
    return () => { cancelled = true; stop?.(); };
  }, []);
  const apply = (action: MusicShortcutAction, shortcut: string) => {
    const owner = shortcut ? takenBy(shortcut, action) : null;
    setConflicts((current) => ({ ...current, [action]: owner ? t.settings.shortcuts.taken(shortcut, owner) : "" }));
    if (!owner) {
      setErrors((current) => ({ ...current, [action]: undefined }));
      onChange({ ...shortcuts, [action]: shortcut });
    }
  };
  return <>{MUSIC_SHORTCUT_ACTIONS.map((action) => {
    const shortcut = shortcuts[action];
    const error = conflicts[action] || (errors[action] && shortcut ? `${t.settings.shortcuts.registerFailed(shortcut)} ${errors[action]}` : "");
    return <div className="shortcut-row" key={action}>
      <div className="shortcut-control">
        <div className="shortcut-control__meta"><span>{t.settings.shortcuts.music[action]}</span></div>
        <div className="shortcut-control__actions">
          <ShortcutResetButton label={t.settings.shortcuts.clear} isDefault={!shortcut} onReset={() => apply(action, "")} />
          <ShortcutRecordButton
            shortcut={shortcut || t.settings.shortcuts.unassigned}
            pressKeysLabel={t.settings.clipboard.pressKeys}
            toShortcut={buildShortcutFromEvent}
            onRecord={(shortcut) => apply(action, shortcut)}
            onInterrupted={() => setConflicts((current) => ({ ...current, [action]: t.settings.shortcuts.takenElsewhere }))}
          />
        </div>
      </div>
      {error && <p className="shortcut-control__error" role="alert">{error}</p>}
    </div>;
  })}</>;
}
