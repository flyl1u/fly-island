import { useCallback, useEffect, useRef, useState } from "react";
import { pinOcrLines } from "../../features/screenshot/api";
import { translateImageLines, type TranslatedImageLine } from "../../features/screenshot/translation";
import { loadSettings, translateText, type Direction } from "../../features/translation";
import { useTranslation } from "../../i18n";

export function useImageTranslation(label: string) {
  const { screenshot: t } = useTranslation();
  const [lines, setLines] = useState<TranslatedImageLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>(() => loadSettings().direction);
  const generation = useRef(0);
  const active = useRef(false);
  const run = useCallback(async (recognize = false) => {
    if (active.current) return;
    active.current = true;
    const request = ++generation.current;
    const cancelled = () => generation.current !== request;
    setBusy(true);
    setError(null);
    try {
      const source = recognize ? await pinOcrLines(label) : lines;
      if (cancelled()) return;
      if (!source.length) { setError(t.nothingFound); return; }
      setLines(source.map((line) => ({ ...line, translated: "", error: null })));
      const settings = loadSettings();
      await translateImageLines(source, (text) => translateText(text, direction, {
        provider: settings.provider,
        baseUrl: settings.provider === "custom" ? settings.customBaseUrl : null,
        model: settings.models[settings.provider] ?? null,
      }), (index, result) => {
        setLines((current) => current.map((line, at) => at === index ? result : line));
      }, cancelled);
    } catch (cause) {
      if (!cancelled()) setError(t.translateFailed(String(cause)));
    } finally {
      if (!cancelled()) { setBusy(false); active.current = false; }
    }
  }, [direction, label, lines, t]);

  // Initial recognition happens once per window; edits and direction changes require Translate.
  const initialRun = useRef(run);
  const cancel = useCallback(() => { generation.current++; active.current = false; }, []);
  useEffect(() => {
    void initialRun.current(true);
    return cancel;
  }, [label, cancel]);

  const editSource = (index: number, text: string) => setLines((current) => current.map((line, at) =>
    at === index ? { ...line, text, translated: "", error: null } : line));
  return { lines, busy, error, direction, setDirection, run, editSource };
}
