import { useEffect, useState } from "react";
import type { TuckStyle } from "../../features/appearance/types";

// Longer than the 560ms opening spring (IslandShell.css), so the class outlives the motion it carries.
const UNTUCK_MORPH_MS = 600;

/**
 * The class that shapes a line or hidden tuck (IslandTuckStyle.css). A transition plays with the
 * rule of the state it ends in, and the plain collapsed island animates neither its offset nor
 * its opacity: leaving such a tuck keeps `island--untuck-<style>` on for the length of the
 * opening spring, so the bar grows back into the island (or it fades in) instead of jumping.
 */
export function useTuckMorph(isTucked: boolean, tuckStyle: TuckStyle): string {
  const [untucking, setUntucking] = useState<TuckStyle | null>(null);
  const [previous, setPrevious] = useState({ isTucked, tuckStyle });
  if (previous.isTucked !== isTucked || previous.tuckStyle !== tuckStyle) {
    // Set during render, so the class arrives in the same frame the tuck class leaves.
    setUntucking(previous.isTucked && !isTucked && previous.tuckStyle !== "edge" ? previous.tuckStyle : null);
    setPrevious({ isTucked, tuckStyle });
  }

  useEffect(() => {
    if (!untucking) return;
    const timer = window.setTimeout(() => setUntucking(null), UNTUCK_MORPH_MS);
    return () => window.clearTimeout(timer);
  }, [untucking]);

  if (isTucked) return tuckStyle === "edge" ? "" : `island--tuck-${tuckStyle}`;
  return untucking ? `island--untuck-${untucking}` : "";
}
