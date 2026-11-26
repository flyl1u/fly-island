import { useEffect, useState } from "react";

export const EDGE_PET_STORAGE_KEY = "fly-island-edge-pet";
const EDGE_PET_CHANGED_EVENT = "fly-island:edge-pet-changed";

export type EdgePetSettings = {
  enabled: boolean;
};

export const DEFAULT_EDGE_PET_SETTINGS: EdgePetSettings = {
  enabled: false,
};

export function loadEdgePetSettings(): EdgePetSettings {
  try {
    const raw = window.localStorage.getItem(EDGE_PET_STORAGE_KEY);
    if (!raw) return DEFAULT_EDGE_PET_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<EdgePetSettings>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_EDGE_PET_SETTINGS.enabled,
    };
  } catch {
    return DEFAULT_EDGE_PET_SETTINGS;
  }
}

export function saveEdgePetSettings(next: EdgePetSettings): void {
  try {
    window.localStorage.setItem(EDGE_PET_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota or private-mode failures.
  }
  window.dispatchEvent(new CustomEvent(EDGE_PET_CHANGED_EVENT, { detail: next }));
}

export function useEdgePetSettings(): [EdgePetSettings, (next: EdgePetSettings) => void] {
  const [settings, setSettings] = useState<EdgePetSettings>(() => loadEdgePetSettings());

  useEffect(() => {
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<EdgePetSettings>).detail;
      if (detail) setSettings(detail);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === EDGE_PET_STORAGE_KEY) {
        setSettings(loadEdgePetSettings());
      }
    };
    window.addEventListener(EDGE_PET_CHANGED_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EDGE_PET_CHANGED_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = (next: EdgePetSettings) => {
    setSettings(next);
    saveEdgePetSettings(next);
  };

  return [settings, update];
}
