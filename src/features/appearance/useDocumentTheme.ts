import { useEffect, useState } from "react";
import { STORAGE_KEY, loadSettings } from "./storage";
import { resolveColorScheme, type ResolvedScheme } from "./theme";
import type { ColorScheme, IslandSettings, Material } from "./types";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** What <html> carries: the drawn scheme (data-theme) and the material (data-material). */
export type DocumentTheme = Pick<IslandSettings, "colorScheme" | "material">;

function systemIsDark() {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

function writeTheme(scheme: ResolvedScheme, material: Material) {
  const root = document.documentElement;
  root.dataset.theme = scheme;
  root.dataset.material = material;
}

/**
 * Writes the scheme and material on <html>, which tokens.css and every window's styles follow.
 * main.tsx calls it before the first render, so no window paints the wrong scheme first.
 */
export function applyDocumentTheme(settings: DocumentTheme): ResolvedScheme {
  const scheme = resolveColorScheme(settings.colorScheme, systemIsDark());
  writeTheme(scheme, settings.material);
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

/** Keeps <html data-theme data-material> in step with the settings and, for "system", with Windows. */
export function useDocumentTheme({ colorScheme, material }: DocumentTheme): ResolvedScheme {
  const scheme = useResolvedScheme(colorScheme);
  useEffect(() => writeTheme(scheme, material), [scheme, material]);
  return scheme;
}

function readStoredTheme(): DocumentTheme {
  const { colorScheme, material } = loadSettings();
  return { colorScheme, material };
}

/** The scheme and material for windows that only read the island settings (translation, clipboard). */
export function useStoredTheme(): DocumentTheme {
  const [theme, setTheme] = useState(readStoredTheme);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = readStoredTheme();
      setTheme((current) =>
        current.colorScheme === next.colorScheme && current.material === next.material ? current : next);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return theme;
}
