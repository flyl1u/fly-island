import { useCallback, useEffect, useRef, useState } from "react";
import * as islandApi from "./api";
import { loadIslandPosition, saveIslandPosition, type IslandPosition } from "./storage";

/** Tracks where the user dragged the island, persisting it across launches. */
export function useIslandPosition() {
  const [isPositionDetached, setIsPositionDetached] = useState(() => loadIslandPosition() !== null);
  const islandPositionRef = useRef<IslandPosition | null>(loadIslandPosition());

  const startIslandDrag = useCallback(() => {
    setIsPositionDetached(true);
    void islandApi.startIslandDrag().catch((error) => {
      setIsPositionDetached(isPositionDetached);
      console.error("Failed to start island drag", error);
    });
  }, [isPositionDetached]);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void islandApi.listenIslandPositionChanged(({ payload }) => {
      islandPositionRef.current = payload;
      setIsPositionDetached(true);
      saveIslandPosition(payload);
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for island position changes", error);
      });

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, []);

  return { isPositionDetached, setIsPositionDetached, islandPositionRef, startIslandDrag };
}
