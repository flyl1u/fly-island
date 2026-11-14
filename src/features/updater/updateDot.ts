type UpdateDotState = { stage: string; nextVersion: string };

/**
 * The version a red dot points at, or "" when there is no pending update. A failed install keeps
 * its version, so the dots stay until an update is installed or a check finds none.
 */
export function updateDotVersion(state: UpdateDotState): string {
  return ["available", "downloading", "ready", "error"].includes(state.stage) ? state.nextVersion : "";
}
