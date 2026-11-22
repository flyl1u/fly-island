import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { useLocale, useTranslation } from "../../i18n";
import type { BatteryFlow } from "./display";
import { BATTERY_HISTORY_HOURS, batteryHistoryInRange, nearestBatterySample, type BatteryHistory } from "./history";
import "./BatteryHistoryChart.css";

const WIDTH = 480;
const HEIGHT = 84;
const INSET = 4;

export function BatteryHistoryChart({ history }: { history: BatteryHistory }) {
  const [selection, setSelection] = useState<{ at: number; keyboard: boolean } | null>(null);
  const t = useTranslation().battery;
  const { locale } = useLocale();
  const points = batteryHistoryInRange(history, BATTERY_HISTORY_HOURS, Date.now());
  const first = points[0];
  const latest = points[points.length - 1];
  const duration = first && latest ? latest.at - first.at : 0;
  const percent = new Intl.NumberFormat(locale, { style: "percent" });

  // One reading is a dot, not a curve: say that it is recording until there is a second one.
  if (!first || !latest || duration <= 0) {
    return <section className="battery-history" aria-label={t.historyTitle}>
      <p className="battery-history__empty">{t.historyEmpty}</p>
    </section>;
  }

  const startTime = new Intl.DateTimeFormat(locale, duration >= 18 * 3_600_000
    ? { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { hour: "numeric", minute: "2-digit" }).format(first.at);
  const coordinates = points.map((sample) => ({
    ...sample,
    x: INSET + (sample.at - first.at) / duration * (WIDTH - 2 * INSET),
    y: INSET + (1 - sample.percent / 100) * (HEIGHT - 2 * INSET),
  }));
  const paths: { charging: boolean; points: typeof coordinates }[] = [];
  for (const [index, point] of coordinates.entries()) {
    const next = coordinates[index + 1];
    if (!next || next.at - point.at > history.intervalMs * 3) continue;
    const charging = point.flow === "charging";
    const previous = paths[paths.length - 1];
    if (previous?.charging === charging && previous.points[previous.points.length - 1] === point) previous.points.push(next);
    else paths.push({ charging, points: [point, next] });
  }
  const end = coordinates[coordinates.length - 1];
  const selectedIndex = selection ? points.findIndex(({ at }) => at === selection.at) : -1;
  const selected = coordinates[selectedIndex];
  const pointDate = selected && new Intl.DateTimeFormat(locale, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit",
  }).format(selected.at);
  const flowLabels: Record<BatteryFlow, string> = { charging: t.state.charging, discharging: t.historyDischarging };
  const pointStatus = selected?.flow ? flowLabels[selected.flow] : t.historyNotCharging;
  const pointText = selected && `${pointDate} · ${percent.format(selected.percent / 100)} · ${pointStatus}`;

  const inspectPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * WIDTH;
    const at = first.at + (x - INSET) / (WIDTH - 2 * INSET) * duration;
    const point = points[nearestBatterySample(points, at)];
    if (selection?.at !== point.at || selection.keyboard) setSelection({ at: point.at, keyboard: false });
  };

  const inspectKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && selected) {
      event.stopPropagation();
      setSelection(null);
      return;
    }
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    const next = Math.min(points.length - 1, Math.max(0, (selectedIndex < 0 ? points.length - 1 : selectedIndex) + step));
    setSelection({ at: points[next].at, keyboard: true });
  };

  return <section className="battery-history" aria-label={t.historyTitle}>
    <div className="battery-history__axis" aria-hidden="true">
      {[1, 0.5, 0].map((level) => <span key={level}>{percent.format(level)}</span>)}
    </div>
    <div className="battery-history__inspect" tabIndex={0} role="group" aria-label={t.historyInspect}
      onPointerMove={inspectPointer} onPointerDown={inspectPointer}
      onPointerLeave={() => { if (!selection?.keyboard) setSelection(null); }}
      onPointerCancel={() => setSelection(null)}
      onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setSelection({ at: latest.at, keyboard: true }); }}
      onBlur={() => setSelection(null)} onKeyDown={inspectKeys}>
      <svg className="battery-history__plot" role="img" aria-label={t.historySummary(percent.format(first.percent / 100), percent.format(latest.percent / 100))}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        {[INSET, HEIGHT / 2, HEIGHT - INSET].map((y) => <line key={y} x1="0" x2={WIDTH} y1={y} y2={y} className="battery-history__guide" />)}
        {paths.map(({ charging, points: segment }) => {
          const start = segment[0];
          const stop = segment[segment.length - 1];
          const line = segment.map(({ x, y }) => `${x},${y}`).join(" ");
          const area = `${line} ${stop.x},${HEIGHT - INSET} ${start.x},${HEIGHT - INSET}`;
          return <g key={start.at} data-charging={charging || undefined}>
            <polygon points={area} className="battery-history__area" />
            <polyline points={line} className="battery-history__line" vectorEffect="non-scaling-stroke" />
          </g>;
        })}
        <circle key={end.at} cx={end.x} cy={end.y} r="3" className="battery-history__point" data-charging={end.flow === "charging" || undefined} />
        {selected && <g data-charging={selected.flow === "charging" || undefined} aria-hidden="true">
          <line x1={selected.x} x2={selected.x} y1={INSET} y2={HEIGHT - INSET} className="battery-history__cursor" />
          <circle cx={selected.x} cy={selected.y} r="4" className="battery-history__selected" />
        </g>}
      </svg>
      {selected && <div className="battery-history__detail" data-left={selected.x >= WIDTH / 2 || undefined} aria-hidden="true">
        <time dateTime={new Date(selected.at).toISOString()}>{pointDate}</time>
        <strong>{percent.format(selected.percent / 100)}</strong>
        <span>{pointStatus}</span>
      </div>}
      <span className="battery-history__announcement" aria-live="polite">{selection?.keyboard ? pointText : null}</span>
    </div>
    <div className="battery-history__times">
      <time dateTime={new Date(first.at).toISOString()}>{startTime}</time>
      <time dateTime={new Date(latest.at).toISOString()}>{t.now}</time>
    </div>
  </section>;
}
