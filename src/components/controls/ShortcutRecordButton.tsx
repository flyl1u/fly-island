import { useEffect, useRef, useState } from "react";
import { Keyboard } from "lucide-react";

/** The parts of a key event a shortcut is named from. */
export type ShortcutKeys = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

/** How long the window may lose the focus while recording before recording stops. */
const BLUR_GRACE_MS = 250;

/**
 * The button that records a new global shortcut. While it records, keys are read from
 * the whole window, not from the button: clicking into a window that was not active
 * makes WebView2 put the focus back on the element focused before (wry's WM_SETFOCUS
 * handler), which used to take it off the button and end recording with the old keys
 * still showing. A key whose press another program's global hotkey swallowed only
 * arrives as a release, so a release with modifiers held records it too.
 *
 * Escape, a click elsewhere, or the window losing the focus stops recording.
 */
export function ShortcutRecordButton({ shortcut, pressKeysLabel, disabled, toShortcut, onRecord }: {
  shortcut: string;
  pressKeysLabel: string;
  disabled?: boolean;
  /** The shortcut a key event names, or null while only modifiers are held. */
  toShortcut: (keys: ShortcutKeys) => string | null;
  onRecord: (shortcut: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const latest = useRef({ toShortcut, onRecord });
  useEffect(() => {
    latest.current = { toShortcut, onRecord };
  });

  useEffect(() => {
    if (!recording) return;
    const button = buttonRef.current;
    button?.focus();
    // Modifier keys are never swallowed; the last one pressed tells which were held
    // when a swallowed key went down, in case some are released before that key.
    let lastModifiers = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
    const pressedCodes = new Set<string>();
    let blurTimer: number | undefined;
    const finish = (next: string) => {
      setRecording(false);
      latest.current.onRecord(next);
    };
    const swallow = (event: KeyboardEvent) => {
      // Also keeps the island's own keys (Escape collapses it) and WebView shortcuts out.
      event.preventDefault();
      event.stopPropagation();
    };
    const keyDown = (event: KeyboardEvent) => {
      swallow(event);
      const { ctrlKey, altKey, shiftKey, metaKey } = event;
      if (event.key === "Escape" && !ctrlKey && !altKey && !shiftKey && !metaKey) {
        setRecording(false);
        return;
      }
      if (isModifier(event.key)) {
        lastModifiers = { ctrlKey, altKey, shiftKey, metaKey };
        return;
      }
      pressedCodes.add(event.code);
      const next = latest.current.toShortcut(event);
      if (next) finish(next);
    };
    const keyUp = (event: KeyboardEvent) => {
      swallow(event);
      if (isModifier(event.key)) return;
      if (pressedCodes.delete(event.code)) return;
      const held = {
        ctrlKey: event.ctrlKey || lastModifiers.ctrlKey,
        altKey: event.altKey || lastModifiers.altKey,
        shiftKey: event.shiftKey || lastModifiers.shiftKey,
        metaKey: event.metaKey || lastModifiers.metaKey,
      };
      // Shift alone is not enough for a release: it may be left over from typing.
      if (!held.ctrlKey && !held.altKey && !held.metaKey) return;
      const next = latest.current.toShortcut(withModifiers(event, held));
      if (next) finish(next);
    };
    const pointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !button?.contains(event.target)) setRecording(false);
    };
    const blur = () => {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => setRecording(false), BLUR_GRACE_MS);
    };
    const focus = () => window.clearTimeout(blurTimer);
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("keyup", keyUp, true);
    window.addEventListener("pointerdown", pointerDown, true);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    return () => {
      window.clearTimeout(blurTimer);
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("keyup", keyUp, true);
      window.removeEventListener("pointerdown", pointerDown, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
    };
  }, [recording]);

  useEffect(() => {
    if (disabled) setRecording(false);
  }, [disabled]);

  return (
    <button
      ref={buttonRef}
      className={`shortcut-record-button${recording ? " shortcut-record-button--recording" : ""}`}
      type="button"
      disabled={disabled}
      aria-pressed={recording}
      onClick={() => setRecording(true)}
    >
      <Keyboard size={14} strokeWidth={2.3} />
      <span>{recording ? pressKeysLabel : shortcut}</span>
    </button>
  );
}

const MODIFIER_KEYS = new Set(["Alt", "AltGraph", "Control", "Meta", "Shift", "OS"]);

function isModifier(key: string) {
  return MODIFIER_KEYS.has(key);
}

/** The keys of `event` with the `held` modifiers. */
function withModifiers(event: KeyboardEvent, held: Pick<ShortcutKeys, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): ShortcutKeys {
  return { key: event.key, code: event.code, ...held };
}
