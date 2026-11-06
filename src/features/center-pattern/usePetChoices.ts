import { useEffect, useState } from "react";
import { listPets } from "./api";
import type { PetList } from "./centerSettings";

/** The pets on disk, read when `enabled` turns on (the center pattern's plugin page is open). */
export function usePetChoices(enabled: boolean): PetList | null {
  const [pets, setPets] = useState<PetList>("loading");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listPets()
      .then((list) => !cancelled && setPets(list))
      .catch((error: unknown) => {
        console.error("Failed to list pets", error);
        if (!cancelled) setPets("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return enabled ? pets : null;
}
