import { useCallback, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Keyboard, X } from "lucide-react";
import { ShortcutResetButton } from "../../components/controls/ShortcutResetButton";
import { useLocale, useTranslation } from "../../i18n";
import { buildShortcutFromEvent } from "../clipboard/shortcut";
import { listPlugins, setPluginKeybinding, type PluginsSnapshot } from "./api";
import { pluginShortcutRows, type PluginShortcutRow } from "./pluginShortcuts";
import "../clipboard/ClipboardSettingsSection.css";

/** Registration happens after saving; read the conflicts again once it has. */
const RECHECK_MS = 600;

/**
 * Settings → Shortcuts: the global shortcuts of the plugins that are on. Each
 * command can get a shortcut of the user's choice, be turned off, or go back
 * to the one its manifest declares. `takenBy` refuses keys another row of the
 * page (the island's own shortcuts) uses.
 */
export function PluginShortcutSection({ takenBy }: { takenBy: (shortcut: string, selfId: string) => string | null }) {
  const t = useTranslation();
  const text = t.settings.shortcuts;
  const { locale } = useLocale();
  const [snapshot, setSnapshot] = useState<PluginsSnapshot | null>(null);
  const [recording, setRecording] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(() => {
    listPlugins()
      .then(setSnapshot)
      .catch((error: unknown) => console.error("Failed to list plugins", error));
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  if (!snapshot) return null;
  const rows = pluginShortcutRows(snapshot.plugins);
  const name = (row: PluginShortcutRow) => `${row.title[locale]} · ${row.pluginName[locale]}`;

  const save = (row: PluginShortcutRow, keybinding: string | null) => {
    if (keybinding) {
      const owner = takenBy(keybinding, row.key)
        ?? rows.find((other) => other.key !== row.key && other.shortcut && other.shortcut.toLowerCase() === keybinding.toLowerCase())?.title[locale]
        ?? null;
      if (owner) {
        setErrors((current) => ({ ...current, [row.key]: text.taken(keybinding, owner) }));
        return;
      }
    }
    setErrors((current) => ({ ...current, [row.key]: "" }));
    setPluginKeybinding(row.pluginId, row.commandId, keybinding)
      .then((next) => {
        setSnapshot(next);
        window.setTimeout(refresh, RECHECK_MS);
      })
      .catch((error: unknown) => setErrors((current) => ({ ...current, [row.key]: String(error) })));
  };

  const record = (row: PluginShortcutRow, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (recording !== row.key) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { setRecording(null); return; }
    const next = buildShortcutFromEvent(event.nativeEvent);
    if (!next) return;
    setRecording(null);
    save(row, next);
  };

  return (
    <section className="settings-section">
      <div className="settings-section__header"><span>{text.pluginTitle}</span></div>
      <p className="settings-section__hint">{rows.length === 0 ? text.pluginNone : text.pluginHint}</p>
      {rows.map((row) => {
        const conflicts = snapshot.plugins.find((plugin) => plugin.id === row.pluginId)?.keybindingConflicts ?? [];
        const error = errors[row.key] || (row.shortcut && conflicts.includes(row.shortcut) ? text.pluginInUse : "");
        return (
          <div className="shortcut-row" key={row.key}>
            <div className="shortcut-control">
              <div className="shortcut-control__meta">
                <span>{name(row)}</span>
                <strong>{row.shortcut ?? (row.changed && row.defaultShortcut ? text.pluginOff : text.pluginNotSet)}</strong>
              </div>
              <div className="shortcut-control__actions">
                <ShortcutResetButton
                  label={row.defaultShortcut ? text.reset(row.defaultShortcut) : text.pluginClear}
                  isDefault={!row.changed}
                  onReset={() => save(row, null)}
                />
                {row.shortcut ? (
                  <button className="shortcut-reset-button" type="button" aria-label={`${text.pluginTurnOff}: ${name(row)}`} onClick={() => save(row, "")}>
                    <X size={13} strokeWidth={2.3} aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  className={`shortcut-record-button${recording === row.key ? " shortcut-record-button--recording" : ""}`}
                  type="button"
                  aria-label={`${text.pluginRecord}: ${name(row)}`}
                  onClick={() => setRecording(row.key)}
                  onKeyDown={(event) => record(row, event)}
                  onBlur={() => setRecording((current) => (current === row.key ? null : current))}
                >
                  <Keyboard size={14} strokeWidth={2.3} />
                  <span>{recording === row.key ? text.pluginPressKeys : row.shortcut ?? text.pluginRecord}</span>
                </button>
              </div>
            </div>
            {error ? <p className="shortcut-control__error" role="alert">{error}</p> : null}
          </div>
        );
      })}
    </section>
  );
}
