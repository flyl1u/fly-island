import { PageShortcutSection } from "../../features/appearance/PageShortcutSection";
import {
  DEFAULT_PAGE_NEXT_SHORTCUT,
  DEFAULT_PAGE_PREVIOUS_SHORTCUT,
  normalizePageCycleShortcut,
  normalizePageDigitModifiers,
} from "../../features/appearance/pageShortcuts";
import type { IslandSettings } from "../../features/appearance/types";
import { ClipboardShortcutRows } from "../../features/clipboard/ClipboardShortcutRows";
import { useClipboardSettings } from "../../features/clipboard/useClipboardSettings";
import { PluginShortcutSection } from "../../features/plugins/PluginShortcutSection";
import { TranslationShortcutRows } from "../../features/translation/TranslationShortcutRows";
import { useTranslationSettings } from "../../features/translation/useTranslationSettings";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { findShortcutOwner, type ShortcutOwner } from "./shortcutConflicts";
import "./ShortcutsSettingsPage.css";

/** Keys that cannot be changed, listed for reference: one row each, the keys as a keycap. */
function ReferenceSection({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <SettingsGroup title={title}>
      {rows.map(([label, keys]) => (
        <SettingsRow key={label} title={label} control={<kbd className="shortcut-keycap">{keys}</kbd>} />
      ))}
    </SettingsGroup>
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
  const [translationSettings, setTranslationSettings] = useTranslationSettings();
  const hasGlobal = settings.translationEnabled || clipboardSettings.enabled;

  // A global hotkey swallows its keys everywhere, so it may not reuse another global
  // shortcut or the island's page keys.
  const digitModifiers = normalizePageDigitModifiers(settings.pageDigitModifiers);
  const owners: ShortcutOwner[] = [
    ...(settings.translationEnabled ? [
      { id: "window", label: t.settings.shortcuts.openTranslation, shortcut: translationSettings.shortcut },
      { id: "selection", label: t.settings.translation.selectionShortcut, shortcut: translationSettings.selectionShortcut },
    ] : []),
    ...(clipboardSettings.enabled && clipboardSettings.shortcutEnabled
      ? [{ id: "clipboard", label: t.settings.clipboard.shortcut, shortcut: clipboardSettings.shortcut }]
      : []),
    { id: "next", label: t.settings.pageShortcuts.nextPage, shortcut: normalizePageCycleShortcut(settings.pageNextShortcut, DEFAULT_PAGE_NEXT_SHORTCUT) },
    { id: "previous", label: t.settings.pageShortcuts.previousPage, shortcut: normalizePageCycleShortcut(settings.pagePreviousShortcut, DEFAULT_PAGE_PREVIOUS_SHORTCUT) },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: "digit", label: t.settings.pageShortcuts.digitModifiers, shortcut: `${digitModifiers}+${index + 1}`,
    })),
  ];
  const takenBy = (shortcut: string, selfId: string) => findShortcutOwner(shortcut, owners, selfId);

  return (
    <>
      <SettingsGroup
        title={t.settings.shortcuts.globalTitle}
        footer={hasGlobal ? [t.settings.shortcuts.globalHint, settings.translationEnabled ? t.settings.translation.selectionShortcutHint : ""].filter(Boolean).join(" ") : undefined}
      >
        {settings.translationEnabled && (
          <TranslationShortcutRows settings={translationSettings} onSettingsChange={setTranslationSettings} takenBy={takenBy} />
        )}
        {clipboardSettings.enabled && (
          <ClipboardShortcutRows
            clipboardSettings={clipboardSettings}
            onClipboardSettingsChange={updateClipboardSettings}
            takenBy={(shortcut) => takenBy(shortcut, "clipboard")}
          />
        )}
        {!hasGlobal && <SettingsRow title={<span className="shortcut-empty">{t.settings.shortcuts.noGlobal}</span>} />}
      </SettingsGroup>
      <PluginShortcutSection takenBy={takenBy} />
      <PageShortcutSection settings={settings} onSettingsChange={onSettingsChange} takenBy={takenBy} />
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
    <SettingsGroup title={t.settings.categories.shortcuts}>
      <SettingsRow
        title={t.settings.shortcuts.editHint}
        control={<SettingsLinkButton onClick={onOpen}>{t.settings.shortcuts.openPage}</SettingsLinkButton>}
      />
    </SettingsGroup>
  );
}
