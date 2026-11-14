export type PanelPreviewMode = "expanded" | "collapsed" | "tucked";

const REQUEST_MAX_AGE_MS = 2_000;
export const PREVIEW_IDLE_MS = 2_500;

/** Old { mode, requestedAt } requests remain valid; malformed or stale data does nothing. */
export function parsePanelPreview(stored: string | null, now = Date.now()): PanelPreviewMode | null {
  if (stored === null) return null;
  try {
    const request = JSON.parse(stored) as { mode?: unknown; requestedAt?: unknown } | null;
    if (!request || typeof request.requestedAt !== "number" || !Number.isFinite(request.requestedAt)) return null;
    const age = now - request.requestedAt;
    return age >= 0 && age < REQUEST_MAX_AGE_MS
      && (request.mode === "expanded" || request.mode === "collapsed" || request.mode === "tucked")
      ? request.mode : null;
  } catch {
    return null;
  }
}
