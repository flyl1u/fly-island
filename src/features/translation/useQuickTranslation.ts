import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n";
import { hasTranslationSecret, listenTranslationSelection, translateText } from "./api";
import { loadSettings, saveTranslationHandoff } from "./storage";

const PEEK_MS = 8_000;

function oneLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Translates whatever the selection shortcut captured and keeps a one-line result
 * for the collapsed island. The full text is handed to the translation window.
 */
export function useQuickTranslation(enabled: boolean) {
  const t = useTranslation();
  const [peek, setPeek] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPeek(null);
      return;
    }

    let didCancel = false;
    let unlisten: (() => void) | null = null;
    let request = 0;
    let timer = 0;

    const show = (id: number, line: string) => {
      if (didCancel || id !== request || !line) return;
      setPeek(line);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (id === request) setPeek(null);
      }, PEEK_MS);
    };

    void listenTranslationSelection((event) => {
      const text = event.payload.trim();
      const id = ++request;
      window.clearTimeout(timer);
      if (!text) {
        show(id, t.translator.nothingToTranslate);
        return;
      }
      const settings = loadSettings();
      void hasTranslationSecret(settings.provider)
        .then(async (saved) => {
          if (!saved) {
            saveTranslationHandoff(text, "");
            show(id, t.translator.configureSecret);
            return;
          }
          const translated = await translateText(text, settings.direction, {
            provider: settings.provider,
            baseUrl: settings.provider === "custom" ? settings.customBaseUrl.trim() || null : null,
            model: settings.models[settings.provider]?.trim() || null,
          });
          saveTranslationHandoff(text, translated);
          show(id, oneLine(translated));
        })
        .catch((error) => {
          saveTranslationHandoff(text, "");
          show(id, oneLine(String(error)));
        });
    }).then((nextUnlisten) => {
      if (didCancel) nextUnlisten();
      else unlisten = nextUnlisten;
    }).catch((error) => {
      console.error("Failed to listen for selection translation", error);
    });

    return () => {
      didCancel = true;
      unlisten?.();
      window.clearTimeout(timer);
    };
  }, [enabled, t]);

  return peek;
}
