import { isTauri } from "@tauri-apps/api/core";
import { getIslandTopAttachment, listenIslandTopAttachment } from "./api.ts";
import "./IslandTopEdge.css";

// Rust decides whether the island touches the top edge, because only it knows the
// monitor bounds and the drop snap. The answer lives on the root element, next to
// `inputModality`, so IslandTopEdge.css can shape the island without threading a
// prop through App. Without Tauri the attribute stays unset and the class-based
// docked / detached look applies.
let nativeAttached = false;
let capsule = false;

function applyTopEdge(attached: boolean) {
  nativeAttached = attached;
  // A capsule stays a floating pill even when dragged flush with the top edge.
  document.documentElement.dataset.islandTopEdge = attached && !capsule ? "attached" : "detached";
}

/** The capsule shape (islandShape.ts) opts out of the flat, attached top. */
export function setIslandTopEdgeCapsule(isCapsule: boolean) {
  capsule = isCapsule;
  if (document.documentElement.dataset.islandTopEdge !== undefined) applyTopEdge(nativeAttached);
}

/** Starts mirroring the native top-edge attachment for the main window's lifetime. */
export function trackIslandTopEdge() {
  if (!isTauri()) return;

  void listenIslandTopAttachment(applyTopEdge)
    .then(() => getIslandTopAttachment())
    .then(applyTopEdge)
    .catch((error) => {
      console.error("Failed to track the island top edge", error);
    });
}
