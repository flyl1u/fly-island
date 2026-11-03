export const DEFAULT_CLIPBOARD_SHORTCUT = "Ctrl+X";

export type ShortcutKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

export const MODIFIER_KEY_NAMES = new Set([
  "Alt",
  "AltGraph",
  "Control",
  "Meta",
  "Shift",
]);

export function normalizeShortcutKeyLabel(key: string) {
  if (key.length === 1) {
    return key.toUpperCase();
  }

  switch (key) {
    case " ":
    case "Spacebar":
      return "Space";
    case "Escape":
      return "Esc";
    case "ArrowUp":
      return "Up";
    case "ArrowDown":
      return "Down";
    case "ArrowLeft":
      return "Left";
    case "ArrowRight":
      return "Right";
    default:
      return key;
  }
}

export function buildShortcutFromEvent(event: ShortcutKeyboardEvent) {
  if (MODIFIER_KEY_NAMES.has(event.key)) {
    return null;
  }

  const parts: string[] = [];

  if (event.ctrlKey) {
    parts.push("Ctrl");
  }

  if (event.altKey) {
    parts.push("Alt");
  }

  if (event.shiftKey) {
    parts.push("Shift");
  }

  if (event.metaKey) {
    parts.push("Win");
  }

  if (parts.length === 0) {
    return null;
  }

  parts.push(normalizeShortcutKeyLabel(event.key));
  return parts.join("+");
}

export function normalizeClipboardShortcut(shortcut: string | undefined) {
  const text = shortcut?.trim();

  if (!text) {
    return DEFAULT_CLIPBOARD_SHORTCUT;
  }

  const parts = text
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = new Set<string>();
  let keyLabel = "";

  for (const part of parts) {
    const normalized = part.toLowerCase();

    if (normalized === "ctrl" || normalized === "control") {
      modifiers.add("Ctrl");
    } else if (normalized === "alt" || normalized === "option") {
      modifiers.add("Alt");
    } else if (normalized === "shift") {
      modifiers.add("Shift");
    } else if (
      normalized === "win" ||
      normalized === "windows" ||
      normalized === "meta" ||
      normalized === "cmd" ||
      normalized === "super"
    ) {
      modifiers.add("Win");
    } else if (!keyLabel) {
      keyLabel = normalizeShortcutKeyLabel(part);
    }
  }

  if (!keyLabel || modifiers.size === 0) {
    return DEFAULT_CLIPBOARD_SHORTCUT;
  }

  return ["Ctrl", "Alt", "Shift", "Win"]
    .filter((modifier) => modifiers.has(modifier))
    .concat(keyLabel)
    .join("+");
}

export function matchesClipboardShortcut(
  event: KeyboardEvent,
  shortcut: string | undefined,
) {
  if (isEditableTarget(event.target)) {
    return false;
  }

  return (
    buildShortcutFromEvent(event) === normalizeClipboardShortcut(shortcut)
  );
}

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
