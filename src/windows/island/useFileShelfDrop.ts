import { useEffect, useRef, useState } from "react";
import { listenFileDrop } from "../../features/file-shelf/api";
import type { FileShelfController } from "../../features/file-shelf/useFileShelf";
import type { IslandMode, IslandPage } from "./types";

type FileShelfDropOptions = {
  enabled: boolean;
  /** False: files are only taken while the shelf page is already open. */
  expandOnDrop: boolean;
  mode: IslandMode;
  page: IslandPage;
  isTucked: boolean;
  isPeeking: boolean;
  shelf: Pick<FileShelfController, "addPaths" | "isDraggingOut">;
  openIslandPage: (page: IslandPage) => void;
  setPage: (page: IslandPage) => void;
  collapseIsland: () => void;
  tuckIsland: () => void;
  minimizeToEdge: () => void;
};

/**
 * Files dragged onto the island open the shelf page as a drop zone and are added when
 * dropped. A drag that leaves without dropping puts the island back the way it was
 * (collapsed, tucked or on its earlier page). Returns whether files are over it.
 */
export function useFileShelfDrop(options: FileShelfDropOptions) {
  const [isDropping, setIsDropping] = useState(false);
  const latestRef = useRef(options);
  // How to undo the page change a drag made, until it drops or leaves.
  const restoreRef = useRef<(() => void) | null>(null);
  // The current drag is not for the shelf (it is closed and may not open for drops).
  const ignoringRef = useRef(false);

  useEffect(() => {
    latestRef.current = options;
  });

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void listenFileDrop((event) => {
      const current = latestRef.current;
      // A shelf item dragged out and back over the island is not a new file.
      if (!current.enabled || current.shelf.isDraggingOut()) return;

      if (event.type === "enter") {
        const isShelfOpen = current.mode === "expanded" && current.page === "shelf";
        ignoringRef.current = !isShelfOpen && !current.expandOnDrop;
        if (ignoringRef.current) return;
        setIsDropping(true);
        if (isShelfOpen) return;
        const previousPage = current.page;
        restoreRef.current = current.isTucked
          ? current.tuckIsland
          : current.isPeeking
            ? current.minimizeToEdge
            : current.mode === "collapsed"
              ? current.collapseIsland
              : () => latestRef.current.setPage(previousPage);
        current.openIslandPage("shelf");
      } else if (ignoringRef.current) {
        ignoringRef.current = false;
      } else if (event.type === "drop") {
        setIsDropping(false);
        restoreRef.current = null;
        void current.shelf.addPaths(event.paths);
      } else {
        setIsDropping(false);
        const restore = restoreRef.current;
        restoreRef.current = null;
        restore?.();
      }
    })
      .then((nextUnlisten) => {
        if (didCancel) nextUnlisten();
        else unlisten = nextUnlisten;
      })
      .catch((error) => {
        console.error("Failed to listen for dropped files", error);
      });

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, []);

  return isDropping;
}
