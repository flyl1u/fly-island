import { useEffect, useRef } from "react";

const AUTO_TRANSLATE_DELAY_MS = 500;
const AUTO_TRANSLATE_LIMIT = 5000;

/**
 * Translates after the source has stayed still. A finished source is remembered so the
 * same text is not sent again when the request settles; changing service settings forgets it.
 */
export function useAutoTranslate(
  enabled: boolean,
  input: string,
  settingsKey: string,
  skipSource: { current: string | null },
  submit: () => Promise<void> | void,
) {
  const seenKey = useRef(settingsKey);

  useEffect(() => {
    if (seenKey.current === settingsKey) return;
    seenKey.current = settingsKey;
    skipSource.current = null;
  }, [settingsKey, skipSource]);

  useEffect(() => {
    if (!enabled) return;
    const source = input.trim();
    if (!source || Array.from(source).length > AUTO_TRANSLATE_LIMIT || source === skipSource.current) return;
    const timer = window.setTimeout(() => { void submit(); }, AUTO_TRANSLATE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, input, settingsKey, skipSource, submit]);
}
