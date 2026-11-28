import { useLayoutEffect, useRef, useState } from "react";

export function ScreenshotResizePreview({ png, width, height, original, label, onWheel }: {
  png: string; width: number; height: number; original: { width: number; height: number }; label: string;
  onWheel: (deltaY: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [space, setSpace] = useState({ width: 1, height: 1 });
  const wheel = useRef(onWheel); wheel.current = onWheel;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setSpace({ width: Math.max(1, element.clientWidth - 48), height: Math.max(1, element.clientHeight - 48) });
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    const resize = (event: WheelEvent) => { if (!event.deltaY) return; event.preventDefault(); wheel.current(event.deltaY); };
    element.addEventListener("wheel", resize, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener("wheel", resize); };
  }, []);
  const fit = Math.min(1, space.width / original.width || 1, space.height / original.height || 1);
  return <div className="screenshot-save-preview" ref={ref} title={label}>
    <img src={`data:image/png;base64,${png}`} alt={label} style={{ width: Math.max(1, width * fit), height: Math.max(1, height * fit) }} />
  </div>;
}
