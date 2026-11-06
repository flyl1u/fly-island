import { useEffect, useRef } from "react";
import { acquireIslandCursor, canTrackIslandCursor, listenIslandCursor, releaseIslandCursor, type CursorPoint } from "./api";
import { gazeOffset } from "./patterns";
import { useReducedMotion } from "./useReducedMotion";

const MAX_PUPIL_OFFSET = 2.6;
// No cursor news for this long: the eyes start glancing around on their own.
const WANDER_AFTER_MS = 4000;
const WANDER_EVERY_MS = 2600;
const WANDER_GLANCES = [
  { x: 0, y: 0 }, { x: -2.2, y: 0.4 }, { x: 2.2, y: -0.6 }, { x: 0, y: 1.6 }, { x: 1.4, y: 1.2 }, { x: -1.6, y: -1 },
];

/** A pair of eyes whose pupils follow the cursor, also outside the window, and blink now and then. */
export function PatternEyes({ paused }: { paused: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || paused) return;
    const pupils = Array.from(svg.querySelectorAll<SVGGElement>(".center-eyes-pupil"));
    if (reducedMotion) {
      pupils.forEach((pupil) => { pupil.style.transform = ""; });
      return;
    }
    const whites = Array.from(svg.querySelectorAll<SVGEllipseElement>(".center-eyes-white"));
    let lastPointAt = performance.now();
    let glance = 0;

    const lookAt = ({ x, y }: CursorPoint) => {
      lastPointAt = performance.now();
      svg.dataset.gaze = "follow";
      pupils.forEach((pupil, index) => {
        const box = whites[index].getBoundingClientRect();
        const offset = gazeOffset(x - (box.left + box.width / 2), y - (box.top + box.height / 2), MAX_PUPIL_OFFSET);
        pupil.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
      });
    };
    const onMouseMove = (event: MouseEvent) => lookAt({ x: event.clientX, y: event.clientY });
    window.addEventListener("mousemove", onMouseMove);

    const wander = window.setInterval(() => {
      if (performance.now() - lastPointAt < WANDER_AFTER_MS) return;
      svg.dataset.gaze = "wander";
      glance = (glance + 1 + Math.floor(Math.random() * (WANDER_GLANCES.length - 1))) % WANDER_GLANCES.length;
      const { x, y } = WANDER_GLANCES[glance];
      pupils.forEach((pupil) => { pupil.style.transform = `translate(${x}px, ${y}px)`; });
    }, WANDER_EVERY_MS);

    // The island's webview gets no mousemove once the cursor leaves the island shape, so ask
    // the native side; other windows (a settings preview) make do with their own mousemove.
    let unlisten: (() => void) | null = null;
    let disposed = false;
    const native = canTrackIslandCursor();
    if (native) {
      acquireIslandCursor();
      void listenIslandCursor(lookAt).then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      }).catch(() => undefined);
    }

    return () => {
      disposed = true;
      window.removeEventListener("mousemove", onMouseMove);
      window.clearInterval(wander);
      unlisten?.();
      if (native) releaseIslandCursor();
    };
  }, [paused, reducedMotion]);

  return (
    <svg ref={svgRef} className="center-eyes" viewBox="0 0 40 22" data-gaze="wander">
      {[12, 28].map((cx) => (
        <g key={cx} className="center-eyes-eye">
          <ellipse className="center-eyes-white" cx={cx} cy={11} rx={6.6} ry={8.2} />
          <g className="center-eyes-pupil">
            <circle cx={cx} cy={11.4} r={3.3} className="center-eyes-iris" />
            <circle cx={cx + 1.1} cy={10.1} r={0.95} className="center-eyes-glint" />
          </g>
        </g>
      ))}
    </svg>
  );
}
