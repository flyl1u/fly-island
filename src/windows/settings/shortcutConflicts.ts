/** A global shortcut already in use, named by the row that owns it. */
export type ShortcutOwner = { id: string; label: string; shortcut: string };

const MODIFIER_ALIASES: Record<string, string> = {
  control: "ctrl",
  ctrl: "ctrl",
  alt: "alt",
  shift: "shift",
  win: "win",
  meta: "win",
  super: "win",
};

/** Same keys whatever the case, spacing or modifier order ("ctrl + alt+t" is "Alt+Ctrl+T"). */
export function shortcutKey(shortcut: string) {
  const parts = shortcut.split("+").map((part) => part.trim().toLowerCase()).filter(Boolean);
  const key = parts.pop() ?? "";
  const modifiers = [...new Set(parts.map((part) => MODIFIER_ALIASES[part] ?? part))].sort();
  return [...modifiers, key].join("+");
}

/** The label of another row already using `shortcut`, or null when it is free. */
export function findShortcutOwner(shortcut: string, owners: readonly ShortcutOwner[], selfId: string) {
  const wanted = shortcutKey(shortcut);
  return owners.find((owner) => owner.id !== selfId && shortcutKey(owner.shortcut) === wanted)?.label ?? null;
}
