import { useLayoutEffect, useRef } from "react";
import "./MediaWaveform.css";

const POINTS = Array.from({ length: 86 }, (_, index) => {
  const x = index * 506 / 85;
  return { x, envelope: Math.sin(Math.PI * x / 506) ** 2 };
});

function wavePath(phase: number, layer: number, level: number) {
  const drift = phase * 5.6;
  const breath = 0.9 + 0.12 * Math.sin(phase * 6.7) + 0.06 * Math.sin(phase * 10.3);
  return POINTS.map(({ x, envelope }, index) => {
    const ripple = Math.sin(x / 25 - drift + layer * 0.27);
    const swell = Math.sin(x / 59 - drift * 0.64 - layer * 0.22);
    const y = 56 + envelope * breath * level * (ripple * (24 + layer * 1.7) + swell * 8);
    return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export function MediaWaveform({ playing, audioPeak }: { playing: boolean; audioPeak: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const phaseRef = useRef(0);
  const peakRef = useRef(audioPeak);
  peakRef.current = audioPeak;

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const paths = svg.querySelectorAll<SVGPathElement>(".media-waveform__line");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let frame = 0;
    let previousTime = 0;
    let previousDraw = 0;
    let level = 0.35;
    const draw = () => {
      const peak = Number.isFinite(peakRef.current) ? Math.max(0, Math.min(1, peakRef.current)) : 0;
      const target = 0.35 + Math.log1p(peak * 150) / Math.log1p(150) * 0.65;
      level += (target - level) * 0.25;
      paths.forEach((path, layer) => path.setAttribute("d", wavePath(phaseRef.current, layer, level)));
    };
    const animate = (time: number) => {
      if (previousTime) phaseRef.current += Math.min(time - previousTime, 50) / 1_000;
      previousTime = time;
      if (time - previousDraw >= 30) {
        draw();
        previousDraw = time;
      }
      frame = window.requestAnimationFrame(animate);
    };
    const syncAnimation = () => {
      window.cancelAnimationFrame(frame);
      previousTime = 0;
      previousDraw = 0;
      draw();
      if (playing && visible && !document.hidden && !reducedMotion.matches) {
        frame = window.requestAnimationFrame(animate);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncAnimation();
    });
    syncAnimation();
    observer.observe(svg);
    document.addEventListener("visibilitychange", syncAnimation);
    reducedMotion.addEventListener("change", syncAnimation);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncAnimation);
      reducedMotion.removeEventListener("change", syncAnimation);
    };
  }, [playing]);

  return (
    <div className={`media-waveform${playing ? "" : " media-waveform--paused"}`} aria-hidden="true">
      <svg ref={svgRef} viewBox="0 0 506 112" preserveAspectRatio="none" focusable="false">
        <path className="media-waveform__baseline" d="M0 56H506" />
        <g className="media-waveform__lines">
          {Array.from({ length: 7 }, (_, layer) => (
            <path
              key={layer}
              className={`media-waveform__line${layer === 3 ? " media-waveform__line--main" : ""}`}
              d={wavePath(0, layer, 0.35)}
            />
          ))}
        </g>
        <circle className="media-waveform__endpoint" cx="506" cy="56" r="1.7" />
      </svg>
    </div>
  );
}
