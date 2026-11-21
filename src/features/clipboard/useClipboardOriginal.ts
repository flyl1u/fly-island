import { useEffect, useState } from "react";
import { readClipboardImage } from "./api";

/** Reads the full image only while a preview is open; its caller supplies the thumbnail. */
export function useClipboardOriginal(id: string) {
  const [result, setResult] = useState<string | false | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readClipboardImage(id).then((url) => {
      if (!cancelled) setResult(url);
    }).catch(() => { if (!cancelled) setResult(false); });
    return () => { cancelled = true; };
  }, [id]);
  return { original: typeof result === "string" ? result : null, failed: result === false };
}
