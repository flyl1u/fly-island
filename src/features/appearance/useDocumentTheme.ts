import { useEffect, useState } from "react";
import { STORAGE_KEY, loadSettings } from "./storage";
import { resolveColorScheme, type ResolvedScheme } from "./theme";
import type { ColorScheme, IslandSettings } from "./types";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemIsDark() {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

/** Writes the scheme on <html> (data-theme), which tokens.css and every window's styles follow. */
export function applyDocumentTheme(settings: Pick<IslandSettings, "colorScheme">): ResolvedScheme {
  const scheme = resolveColorScheme(settings.colorScheme, systemIsDark());
  document.documentElement.dataset.theme = scheme;
  return scheme;
}

/** Whether Windows is in dark mode, following its changes ("system" scheme). */
export function useSystemIsDark() {
  const [dark, setDark] = useState(systemIsDark);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_QUERY);
    const update = () => setDark(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return dark;
}

/** The scheme drawn for a scheme setting, following Windows for "system". */
export function useResolvedScheme(colorScheme: ColorScheme): ResolvedScheme {
  return resolveColorScheme(colorScheme, useSystemIsDark());
}

/** Keeps <html data-theme> in step with the scheme setting and, for "system", with Windows. */
export function useDocumentTheme(colorScheme: ColorScheme): ResolvedScheme {
  const scheme = useResolvedScheme(colorScheme);
  useEffect(() => {
    document.documentElement.dataset.theme = scheme;
  }, [scheme]);
  return scheme;
}

/** The scheme setting for windows that only read the island settings (translation, clipboard). */
export function useStoredColorScheme(): ColorScheme {
  const [colorScheme, setColorScheme] = useState(() => loadSettings().colorScheme);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setColorScheme(loadSettings().colorScheme);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return colorScheme;
}
