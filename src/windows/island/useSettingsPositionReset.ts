import { useEffect, useRef } from "react";
import { ISLAND_POSITION_RESET_STORAGE_KEY, isFreshPositionReset } from "../settings/storage";

/** Runs `reset` when the settings window's Position > Reset button asks for it. */
export function useSettingsPositionReset(reset: () => void) {
  const resetRef = useRef(reset);

  useEffect(() => {
    resetRef.current = reset;
  }, [reset]);

  useEffect(() => {
    const handleRequest = (event: StorageEvent) => {
      if (event.key === ISLAND_POSITION_RESET_STORAGE_KEY && isFreshPositionReset(event.newValue)) {
        resetRef.current();
      }
    };
    window.addEventListener("storage", handleRequest);
    return () => window.removeEventListener("storage", handleRequest);
  }, []);
}
