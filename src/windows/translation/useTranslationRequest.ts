import { useCallback, type KeyboardEvent } from "react";
import { useTranslation } from "../../i18n";
import { copyTranslationResult, translateText } from "../../features/translation/api";
import type { TranslationSettings } from "../../features/translation/storage";

export function useTranslationRequest({
  input,
  settings,
  output,
  requestId,
  inputRef,
  setInput,
  setOutput,
  setError,
  setIsLoading,
  setDidCopy,
}: {
  input: string;
  settings: TranslationSettings;
  output: string;
  requestId: { current: number };
  inputRef: { current: HTMLTextAreaElement | null };
  setInput: (value: string) => void;
  setOutput: (value: string) => void;
  setError: (value: string) => void;
  setIsLoading: (value: boolean) => void;
  setDidCopy: (value: boolean) => void;
}) {
  const t = useTranslation();

  const submit = useCallback(async () => {
    const text = input.trim();
    if (!text) { setError(t.translator.emptySource); return; }
    if (Array.from(text).length > 5000) { setError(t.translator.tooLong); return; }
    const currentId = ++requestId.current;
    setError("");
    setOutput("");
    setIsLoading(true);
    try {
      const { provider } = settings;
      const translated = await translateText(text, settings.direction, {
        provider,
        baseUrl: provider === "custom" ? settings.customBaseUrl.trim() : null,
        model: settings.models[provider]?.trim() || null,
      });
      if (currentId === requestId.current) setOutput(translated);
    } catch (failure) {
      if (currentId === requestId.current) setError(String(failure));
    } finally {
      if (currentId === requestId.current) setIsLoading(false);
    }
  }, [input, requestId, setError, setIsLoading, setOutput, settings, t]);

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const copyResult = async () => {
    if (!output) return;
    try {
      await copyTranslationResult(output);
      setDidCopy(true);
    } catch (failure) { setError(String(failure)); }
  };

  const clearSource = () => {
    requestId.current += 1;
    setInput("");
    setOutput("");
    setError("");
    setDidCopy(false);
    setIsLoading(false);
    inputRef.current?.focus();
  };

  return { submit, handleInputKeyDown, copyResult, clearSource };
}
