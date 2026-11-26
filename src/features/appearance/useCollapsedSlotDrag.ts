import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CollapsedSlot } from "./types";

/** What the editor shows: the island's slots left to right, and the box of slots taken off it. */
export type SlotArrangement = { shown: CollapsedSlot[]; hidden: CollapsedSlot[] };
type Zone = keyof SlotArrangement;
type Press = { slot: CollapsedSlot; pointerId: number; x: number; y: number; dragging: boolean; grabX: number; grabY: number };
/** `scale`: how much the slot picked up was drawn smaller than its layout size. */
export type SlotGhost = { slot: CollapsedSlot; left: number; top: number; width: number; height: number; scale: number };

/** How far (px) the pointer moves before a press becomes a drag. */
const DRAG_THRESHOLD = 4;
const MOTION = { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" } as const;

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const same = (a: SlotArrangement, b: SlotArrangement) => a.shown.join() === b.shown.join() && a.hidden.join() === b.hidden.join();

/**
 * Dragging the collapsed island's slots in Appearance → On the island. The pressed slot stays in
 * place as a faint gap and a copy follows the pointer anywhere; the gap moves to wherever the
 * pointer would drop it: between the island's slots (the slot whose middle the pointer passed
 * gives way, however many at once, in either direction) or into the box below, which takes it off
 * the island. The text never leaves the island. Everything else slides to its new place.
 * The root holds the pointer while dragging, since a slot moving between the island and the box
 * is a new element. Nothing is saved until the drop; a cancelled drag puts everything back.
 */
export function useCollapsedSlotDrag(arrangement: SlotArrangement, commit: (next: SlotArrangement) => void) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const press = useRef<Press | null>(null);
  const draftRef = useRef<SlotArrangement | null>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);
  const [draft, setDraft] = useState<SlotArrangement | null>(null);
  const [ghost, setGhost] = useState<SlotGhost | null>(null);
  const [overHidden, setOverHidden] = useState(false);
  const current = draft ?? arrangement;

  const slots = () => [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-slot]") ?? [])];
  /** Positions before a change, so each slot can slide from there to its new place. */
  const capture = (extra?: [string, DOMRect]) => {
    before.current = new Map(slots().map((element) => [element.dataset.slot!, element.getBoundingClientRect()]));
    if (extra) before.current.set(...extra);
  };

  useLayoutEffect(() => {
    const first = before.current;
    before.current = null;
    if (!first || reducedMotion()) return;
    const held = press.current?.dragging ? press.current.slot : null;
    for (const element of slots()) {
      const slot = element.dataset.slot!;
      const old = first.get(slot);
      if (!old || slot === held) continue;
      element.getAnimations().forEach((animation) => animation.cancel());
      const now = element.getBoundingClientRect();
      const scale = now.width / element.offsetWidth || 1;
      const dx = (old.left - now.left) / scale;
      const dy = (old.top - now.top) / scale;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      element.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }], MOTION);
    }
  }, [current]);

  const end = (save: boolean) => {
    const held = press.current;
    press.current = null;
    if (!held?.dragging) return;
    const next = draftRef.current;
    draftRef.current = null;
    // The dropped slot slides from where its copy was let go.
    const copy = rootRef.current?.querySelector<HTMLElement>(".collapsed-layout__ghost");
    capture(copy ? [held.slot, copy.getBoundingClientRect()] : undefined);
    setDraft(null);
    setGhost(null);
    setOverHidden(false);
    if (save && next && !same(next, arrangement)) commit(next);
  };

  /** Where the pointer would drop the held slot: which zone, and before how many of its slots. */
  const dropAt = (slot: CollapsedSlot, x: number, y: number): [Zone, number] => {
    const root = rootRef.current!;
    const island = root.querySelector<HTMLElement>("[data-zone='shown']")!;
    const box = root.querySelector<HTMLElement>("[data-drop='hidden']");
    const zone: Zone = slot !== "text" && box
      && y > (island.getBoundingClientRect().bottom + box.getBoundingClientRect().top) / 2 ? "hidden" : "shown";
    const container = root.querySelector<HTMLElement>(`[data-zone='${zone}']`)!;
    const rect = container.getBoundingClientRect();
    const local = (x - rect.left) / (rect.width / container.offsetWidth || 1);
    // Layout positions, not the sliding ones: a slot gives way once the pointer passes its middle.
    const index = [...container.querySelectorAll<HTMLElement>("[data-slot]")]
      .filter((element) => element.dataset.slot !== slot && element.offsetLeft + element.offsetWidth / 2 < local).length;
    return [zone, index];
  };

  const rootProps = {
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      const element = (event.target as Element).closest<HTMLElement>("[data-slot]");
      if (event.button !== 0 || !element || press.current) return;
      const rect = element.getBoundingClientRect();
      press.current = { slot: element.dataset.slot as CollapsedSlot, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
        dragging: false, grabX: event.clientX - rect.left, grabY: event.clientY - rect.top };
    },
    onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      const held = press.current;
      const root = rootRef.current;
      if (!held || held.pointerId !== event.pointerId || !root) return;
      if (!held.dragging) {
        if (Math.hypot(event.clientX - held.x, event.clientY - held.y) < DRAG_THRESHOLD) return;
        held.dragging = true;
        try {
          root.setPointerCapture(event.pointerId);
        } catch {
          // A pointer no longer down cannot be captured; the drag still follows its moves.
        }
        draftRef.current = arrangement;
        setDraft(arrangement);
      }
      const source = root.querySelector<HTMLElement>(`[data-slot='${held.slot}']`);
      const box = root.getBoundingClientRect();
      setGhost((previous) => ({
        slot: held.slot,
        left: event.clientX - box.left - held.grabX,
        top: event.clientY - box.top - held.grabY,
        width: previous?.width ?? source?.offsetWidth ?? 0,
        height: previous?.height ?? source?.offsetHeight ?? 0,
        scale: previous?.scale ?? (source?.offsetWidth ? source.getBoundingClientRect().width / source.offsetWidth : 1),
      }));
      const [zone, index] = dropAt(held.slot, event.clientX, event.clientY);
      setOverHidden(zone === "hidden");
      const from = draftRef.current ?? arrangement;
      const next = { shown: from.shown.filter((slot) => slot !== held.slot), hidden: from.hidden.filter((slot) => slot !== held.slot) };
      next[zone].splice(index, 0, held.slot);
      if (same(next, from)) return;
      capture();
      draftRef.current = next;
      setDraft(next);
    },
    onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
      if (press.current?.pointerId === event.pointerId) end(true);
    },
    onPointerCancel() {
      end(false);
    },
    onLostPointerCapture() {
      end(false);
    },
  };

  return { rootRef, current, ghost, overHidden, rootProps, capture };
}
