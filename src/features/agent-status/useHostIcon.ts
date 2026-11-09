import { useEffect, useState } from "react";
import { getAgentHostIcon } from "./api";

// Every host executable is asked for once per run; the native side caches too.
const icons = new Map<string, Promise<string | null>>();

function loadIcon(exe: string) {
  let icon = icons.get(exe);
  if (!icon) {
    icon = getAgentHostIcon(exe).catch((error: unknown) => {
      console.error("Failed to load a session host icon", error);
      return null;
    });
    icons.set(exe, icon);
  }
  return icon;
}

/** The PNG data URL of the executable's icon, or null while loading or when it has none. */
export function useHostIcon(exe: string | null) {
  const [loaded, setLoaded] = useState<{ exe: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!exe) return;
    let cancelled = false;
    void loadIcon(exe).then((url) => {
      if (!cancelled) setLoaded({ exe, url });
    });
    return () => {
      cancelled = true;
    };
  }, [exe]);

  return exe && loaded?.exe === exe ? loaded.url : null;
}
