import type { CSSProperties } from "react";
import type { IslandSettings } from "./types";

export function normalizeLocalFontFamily(value: unknown): string {
  if (typeof value !== "string") return "";
  const family = value.trim();
  if (family.length > 256 || [...family].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return "";
  return family;
}

/** Quote the name as one CSS family and keep the usual fallback for missing fonts or glyphs. */
export function localIslandFontStyle(settings: Pick<IslandSettings, "fontFamily" | "localFontFamily">) {
  if (settings.fontFamily !== "local" || !settings.localFontFamily) return undefined;
  return {
    "--font-ui": `${JSON.stringify(settings.localFontFamily)}, var(--font-system)`,
    fontFamily: "var(--font-ui)",
  } as CSSProperties;
}
