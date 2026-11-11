import { useCallback, useEffect, useRef, useState } from "react";
import * as islandApi from "./api";
import { clearIslandPosition, loadIslandPosition, saveIslandPosition, type IslandPosition } from "./storage";

/** Tracks where the user dragged the island, persisting it across launches. */
export function useIslandPosition(positionLocked: boolean) {
  const [isPositionDetached, setIsPositionDetached] = useState(() => loadIslandPosition() !== null);
  const islandPositionRef = useRef<IslandPosition | null>(loadIslandPosition());

  const startIslandDrag = useCallback(() => {
    if (positionLocked) return;
    setIsPositionDetached(true);
    void islandApi.startIslandDrag().catch((error) => {
      setIsPositionDetached(isPositionDetached);
      console.error("Failed to start island drag", error);
    });
  }, [isPositionDetached, positionLocked]);

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

  // The island followed the pointer or the active window to another monitor (Settings → Position):
  // the dragged position is gone, or the next interaction sync would send the island back to it.
  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void islandApi.listenIslandPositionCleared(() => {
      islandPositionRef.current = null;
      setIsPositionDetached(false);
      clearIslandPosition();
    })
      .then((nextUnlisten) => {
        if (didCancel) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch((error) => {
        console.error("Failed to listen for the island's position being cleared", error);
      });

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, []);

  return { isPositionDetached, setIsPositionDetached, islandPositionRef, startIslandDrag };
}
