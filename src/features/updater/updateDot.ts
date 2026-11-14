type UpdateDotState = { stage: string; nextVersion: string; dismissed: boolean };

/** Same visible stages as the derived update todo; downloading still deserves a page hint. */
export function updateDotVersion(state: UpdateDotState): string {
  return !state.dismissed && ["available", "downloading", "ready"].includes(state.stage) ? state.nextVersion : "";
}

export function hasUnseenUpdate(state: UpdateDotState, seenVersion: string): boolean {
  const version = updateDotVersion(state);
  return version !== "" && version !== seenVersion;
}

/** A missing or damaged saved version means the update has not been viewed yet. */
export function normalizeSeenUpdateVersion(value: unknown): string {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(value) ? value : "";
}
