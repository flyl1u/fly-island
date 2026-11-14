import { useSyncExternalStore } from "react";
import { getUpdateState, subscribeToUpdate } from "./updaterController";
import { updateDotVersion } from "./updateDot";

/**
 * Whether an update is waiting to be installed (or its install failed). The red dots of the
 * island and of the todo tab follow it, and stay on whatever page is open until it is installed.
 * Byte progress does not re-render the caller: only the version matters here.
 */
export function useUpdatePending(): boolean {
  return useSyncExternalStore(subscribeToUpdate, () => updateDotVersion(getUpdateState()) !== "");
}
