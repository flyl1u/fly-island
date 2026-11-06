import { useEffect, useState } from "react";
import { getPetSpritesheet } from "./api";

/**
 * The pet's spritesheet URL: undefined while it loads, null when the pet is gone or its
 * sheet cannot be read (the caller shows something else then). Sheets, and failures, are
 * cached in api.ts; a new `retryToken` (the plugin's settings changed) asks again after a failure.
 */
export function usePetSheet(id: string | null, retryToken?: unknown): string | null | undefined {
  const [sheet, setSheet] = useState<{ id: string; src: string | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPetSpritesheet(id, { retryFailed: true })
      .then((src) => !cancelled && setSheet({ id, src }))
      .catch(() => !cancelled && setSheet({ id, src: null }));
    return () => {
      cancelled = true;
    };
  }, [id, retryToken]);

  if (!id) return null;
  return sheet?.id === id ? sheet.src : undefined;
}
