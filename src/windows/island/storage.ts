export type IslandPosition = {
  x: number;
  y: number;
};

export const ISLAND_POSITION_STORAGE_KEY = "focusd-island-position";

export function loadIslandPosition(): IslandPosition | null {
  const stored = window.localStorage.getItem(ISLAND_POSITION_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const position = JSON.parse(stored) as Partial<IslandPosition>;
    if (
      typeof position.x !== "number" ||
      typeof position.y !== "number" ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return null;
    }

    return { x: Math.round(position.x), y: Math.round(position.y) };
  } catch {
    return null;
  }
}
