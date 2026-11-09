import { useEffect, useState } from "react";
import { SESSION_FILTERS_STORAGE_KEY, loadSessionFilters, normalizeSessionFilters, saveSessionFilters, type SessionFilter } from "./sessionFilters";

/**
 * The session filter rules, saved on every change and kept in sync between the settings window
 * (where they are edited) and the island (which hides the sessions).
 */
export function useSessionFilters() {
  const [filters, setFilters] = useState<SessionFilter[]>(loadSessionFilters);

  useEffect(() => { saveSessionFilters(filters); }, [filters]);

  useEffect(() => {
    const syncFromOtherWindow = (event: StorageEvent) => {
      if (event.key === SESSION_FILTERS_STORAGE_KEY) setFilters(loadSessionFilters());
    };
    window.addEventListener("storage", syncFromOtherWindow);
    return () => window.removeEventListener("storage", syncFromOtherWindow);
  }, []);

  const update = (next: SessionFilter[]) => setFilters(normalizeSessionFilters(next));
  return [filters, update] as const;
}
