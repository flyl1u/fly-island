import { PageShortcutSection } from "../../features/appearance/PageShortcutSection";
import type { IslandSettings } from "../../features/appearance/types";
import { ClipboardShortcutRows } from "../../features/clipboard/ClipboardShortcutRows";
import { useClipboardSettings } from "../../features/clipboard/useClipboardSettings";
import { TranslationShortcutRows } from "../../features/translation/TranslationShortcutRows";
import { useTranslation } from "../../i18n";
import "./ShortcutsSettingsPage.css";

function ReferenceSection({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section className="settings-section">
      <div className="settings-section__header"><span>{title}</span></div>
      <dl className="shortcut-reference">
        {rows.map(([label, keys]) => (
          <div className="shortcut-reference__row" key={label}>
            <dt>{label}</dt>
            <dd><kbd>{keys}</kbd></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Every keyboard shortcut in one place: the global ones and page switching are edited
 * here, the fixed keys are listed for reference. Feature pages link to this page.
 */
export function ShortcutsSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const [clipboardSettings, updateClipboardSettings] = useClipboardSettings();
  const hasGlobal = settings.translationEnabled || clipboardSettings.enabled;

  return (
    <>
      <section className="settings-section settings-section--global-shortcuts">
        <div className="settings-section__header"><span>{t.settings.shortcuts.globalTitle}</span></div>
        {hasGlobal && <p className="settings-section__hint">{t.settings.shortcuts.globalHint}</p>}
        {settings.translationEnabled && <TranslationShortcutRows />}
        {settings.translationEnabled && <p className="settings-section__hint">{t.settings.translation.selectionShortcutHint}</p>}
        {clipboardSettings.enabled && (
          <ClipboardShortcutRows clipboardSettings={clipboardSettings} onClipboardSettingsChange={updateClipboardSettings} />
        )}
        {!hasGlobal && <p className="settings-section__hint">{t.settings.shortcuts.noGlobal}</p>}
      </section>
      <PageShortcutSection settings={settings} onSettingsChange={onSettingsChange} />
      <ReferenceSection
        title={t.settings.shortcuts.islandTitle}
        rows={[[t.settings.shortcuts.collapse, "Esc"], [t.settings.shortcuts.moveIsland, t.settings.shortcuts.ctrlDrag]]}
      />
      {settings.translationEnabled && (
        <ReferenceSection
          title={t.settings.shortcuts.inputTitle}
          rows={[
            [t.settings.shortcuts.translate, "Enter"],
            [t.settings.shortcuts.newLine, "Shift + Enter"],
            [t.settings.shortcuts.pasteClipboard, "Tab"],
          ]}
        />
      )}
    </>
  );
}

/** Stands where a feature page used to record its shortcut; opens the Shortcuts page. */
export function ShortcutsLinkSection({ onOpen }: { onOpen: () => void }) {
  const t = useTranslation();
  return (
    <section className="settings-section shortcuts-link">
      <div className="settings-section__header"><span>{t.settings.categories.shortcuts}</span></div>
      <div className="shortcuts-link__row">
        <p className="settings-section__hint">{t.settings.shortcuts.editHint}</p>
        <button type="button" className="shortcuts-link__button" onClick={onOpen}>{t.settings.shortcuts.openPage}</button>
      </div>
    </section>
  );
}
