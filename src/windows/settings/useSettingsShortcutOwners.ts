import type { IslandSettings } from "../../features/appearance/types";
import type { ClipboardHistorySettings } from "../../features/clipboard/api";
import { APPROVAL_HOTKEYS } from "../../features/agent-status/approvals/api";
import { MUSIC_SHORTCUT_ACTIONS, type MusicShortcuts } from "../../features/media/shortcuts";
import type { TranslationSettings } from "../../features/translation/storage";
import { useTranslation } from "../../i18n";
import { collectShortcutOwners } from "./shortcutConflicts";

/** Each shortcut page supplies the live settings it already uses; labels stay in this window layer. */
export function useSettingsShortcutOwners(settings: IslandSettings, clipboard: ClipboardHistorySettings, translation: TranslationSettings, music: MusicShortcuts) {
  const t = useTranslation();
  return collectShortcutOwners({
    clipboard: { id: "clipboard", label: t.settings.clipboard.shortcut, shortcut: clipboard.shortcut, enabled: clipboard.enabled && clipboard.shortcutEnabled },
    translation: { id: "translation", label: t.settings.shortcuts.openTranslation, shortcut: translation.shortcut, enabled: settings.translationEnabled && translation.shortcutEnabled },
    music: settings.musicEnabled ? MUSIC_SHORTCUT_ACTIONS.map((action) => ({ id: `music-${action}`, label: t.settings.shortcuts.music[action], shortcut: music[action] })) : [],
    // Approval keys must stay free for a future permission card, even when approval is currently off.
    approvals: APPROVAL_HOTKEYS.map((hotkey) => ({ id: `approval-${hotkey.action}`, label: t.settings.shortcuts.approval, shortcut: hotkey.shortcut })),
  });
}
