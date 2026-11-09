import { useCallback, useState, type PointerEvent as ReactPointerEvent } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { MediaState } from "./api";
import type { KnownMediaSource } from "./storage";
import "./MusicSourceList.css";

/** The preferred media sources in order, reordered by dragging; sources not playing now can be removed. */
export function MusicSourceList({
  sourcePriority,
  liveSessions,
  onReorderSource,
  onRemoveSource,
}: {
  sourcePriority: KnownMediaSource[];
  liveSessions: MediaState["sessions"];
  onReorderSource: (sourceId: string, targetId: string) => void;
  onRemoveSource: (sourceId: string) => void;
}) {
  const t = useTranslation();
  const [draggedSourceId, setDraggedSourceId] = useState<string | null>(null);
  const [dragOverSourceId, setDragOverSourceId] = useState<string | null>(null);

  const getSourceIdAtPoint = useCallback((clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY);
    const sourceElement = element?.closest("[data-source-id]");
    return sourceElement instanceof HTMLElement
      ? sourceElement.dataset.sourceId ?? null
      : null;
  }, []);

  const startSourceDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, sourceId: string) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraggedSourceId(sourceId);
      setDragOverSourceId(null);
    },
    [],
  );

  const moveSourceDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!draggedSourceId) {
        return;
      }
      event.preventDefault();
      const targetId = getSourceIdAtPoint(event.clientX, event.clientY);
      setDragOverSourceId(
        targetId && targetId !== draggedSourceId ? targetId : null,
      );
    },
    [draggedSourceId, getSourceIdAtPoint],
  );

  const finishSourceDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!draggedSourceId) {
        return;
      }
      event.preventDefault();
      const targetId =
        dragOverSourceId || getSourceIdAtPoint(event.clientX, event.clientY);

      if (targetId && targetId !== draggedSourceId) {
        onReorderSource(draggedSourceId, targetId);
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      setDraggedSourceId(null);
      setDragOverSourceId(null);
    },
    [dragOverSourceId, draggedSourceId, getSourceIdAtPoint, onReorderSource],
  );

  const cancelSourceDrag = useCallback(() => {
    setDraggedSourceId(null);
    setDragOverSourceId(null);
  }, []);

  return (
    <>
      {sourcePriority.length === 0 ? (
        <div className="music-source-empty">{t.music.noSources}</div>
      ) : (
        <div className="music-source-list" role="list">
          {sourcePriority.map((source) => {
            const live = liveSessions.find(
              (session) => session.id === source.id,
            );
            return (
              <div
                key={source.id}
                className={[
                  "music-source-item",
                  draggedSourceId === source.id
                    ? "music-source-item--dragging"
                    : "",
                  dragOverSourceId === source.id
                    ? "music-source-item--drag-over"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="listitem"
                data-source-id={source.id}
              >
                <button
                  className="music-source-drag"
                  type="button"
                  aria-label={t.music.reorderSource}
                  onPointerDown={(event) =>
                    startSourceDrag(event, source.id)
                  }
                  onPointerMove={moveSourceDrag}
                  onPointerUp={finishSourceDrag}
                  onPointerCancel={cancelSourceDrag}
                >
                  <GripVertical size={15} strokeWidth={2.4} />
                </button>
                <span
                  className={[
                    "music-source-dot",
                    live?.playing ? "music-source-dot--playing" : "",
                    live ? "music-source-dot--live" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden="true"
                />
                <span className="music-source-label">
                  {source.label}
                </span>
                {!live && (
                  <button
                    className="music-source-remove"
                    type="button"
                    aria-label={t.music.removeSource}
                    onClick={() => onRemoveSource(source.id)}
                  >
                    <Trash2 size={14} strokeWidth={2.2} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
